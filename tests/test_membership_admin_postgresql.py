"""Gate B: real PostgreSQL, protected HTTPS contracts and deterministic row-lock tests."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from queue import Queue
from threading import Event, current_thread
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from auth_support import login_client
from test_demo_postgresql import database
from test_security_postgresql import clients, event_payload, register, wait_for_postgres_lock
from fwi.application import demo, security, membership_admin as admin
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from fwi.infrastructure.database.security_seed import seed_membership_administration, SITE_B
from fwi.infrastructure.database.models import (
    AuditEvent, AuthSession, Membership, MembershipAdmin, MembershipChange,
    MembershipEligibility, Principal, WasteEvent, WriteIntent,
)


def ids(database):
    with database() as session:
        return {p.username: p.principal_id for p in session.scalars(select(Principal))}


def command(target, action='change_role', role='writer', expected_role='reader', expected_active=True, **extra):
    return dict(site_id=str(SITE_ID), principal_id=str(target), action=action, role=role,
                expected_role=expected_role, expected_active=expected_active, reason='synthetic Owner-approved test', **extra)


def bootstrap(database, username='site_a_writer'):
    seed_membership_administration(database, username, SITE_ID)


def test_bootstrap_is_explicit_idempotent_exact_site_roster(database, clients):
    client = clients('site_a_writer')
    assert client.get('/auth/memberships', params={'site_id': str(SITE_ID)}).status_code == 403
    with pytest.raises(ValueError):
        seed_membership_administration(database, 'site_a_writer', SITE_B)
    bootstrap(database)
    with database() as session:
        before = session.scalar(select(func.count()).select_from(AuditEvent))
    bootstrap(database)
    with database() as session:
        assert session.scalar(select(func.count()).select_from(MembershipAdmin)) == 1
        assert session.scalar(select(func.count()).select_from(MembershipEligibility)) == 2
        assert session.scalar(select(func.count()).select_from(AuditEvent)) == before
    permissions = client.get('/auth/session').json()['sites']
    assert 'membership.manage' in permissions[0]['permissions']
    rows = client.get('/auth/memberships', params={'site_id': str(SITE_ID)})
    assert rows.status_code == 200 and rows.headers['cache-control'] == 'no-store'
    assert {r['username'] for r in rows.json()} == {'site_a_writer', 'site_a_reader'}
    assert all(set(row) == {'principal_id','username','role','active','eligible','enabled'} for row in rows.json())


@pytest.mark.parametrize('actor', ['site_a_reader', 'site_b_writer', None])
def test_unprivileged_direct_api_and_service_fail_closed(database, clients, actor):
    bootstrap(database)
    client = clients(actor)
    expected = 403 if actor else 401
    assert client.get('/auth/memberships', params={'site_id': str(SITE_ID)}).status_code == expected
    result = client.post('/auth/memberships', json=command(ids(database)['site_a_reader']))
    assert result.status_code == expected
    with pytest.raises(security.Denied) as denied:
        admin.change_membership(None, SITE_ID, uuid4(), 'revoke', None, 'test', 'reader', True)
    assert denied.value.status == 403


def test_foreign_site_missing_foreign_target_and_self_are_denied(database, clients):
    bootstrap(database)
    client = clients('site_a_writer'); people = ids(database)
    assert client.get('/auth/memberships', params={'site_id': str(SITE_B)}).status_code == 403
    forbidden = command(people['site_b_writer']); forbidden['site_id'] = str(SITE_B)
    assert client.post('/auth/memberships', json=forbidden).status_code == 403
    foreign = client.post('/auth/memberships', json=command(people['site_b_writer']))
    missing = client.post('/auth/memberships', json=command(uuid4()))
    assert foreign.status_code == missing.status_code == 404 and foreign.json() == missing.json()
    assert client.post('/auth/memberships', json=command(people['site_a_writer'], role='reader', expected_role='writer')).status_code == 403
    spoof = command(people['site_a_reader']); spoof['admin'] = True
    assert client.post('/auth/memberships', json=spoof).status_code == 422
    spoof = command(people['site_a_reader']); spoof['role'] = 'admin'
    assert client.post('/auth/memberships', json=spoof).status_code == 422


def test_role_revoke_reactivate_and_atomic_audit_snapshots(database, clients):
    bootstrap(database)
    client = clients('site_a_writer'); people = ids(database); target = people['site_a_reader']
    commands = [command(target), command(target,'revoke',None,'writer',True),
                command(target,'reactivate',None,'writer',False)]
    for payload in commands:
        response = client.post('/auth/memberships', json=payload)
        assert response.status_code == 200, response.text
        with database() as session:
            audit = session.get(AuditEvent, UUID(response.json()['audit_id']))
            delta = session.get(MembershipChange, audit.audit_id)
            assert audit.actor_principal_id == people['site_a_writer'] and audit.actor == str(people['site_a_writer'])
            assert audit.action == payload['action'] and audit.reason == payload['reason']
            assert delta.principal_id == target and delta.site_id == SITE_ID
            assert delta.old_role == payload['expected_role'] and delta.old_active == payload['expected_active']
            assert delta.new_role == response.json()['role'] and delta.new_active == response.json()['active']
            assert delta.recorded_at == audit.recorded_at and delta.reason == payload['reason']
    assert client.post('/auth/memberships', json=commands[-1]).status_code == 409
    # Changing an operational role never delegates administration.
    reader = clients('site_a_reader')
    assert reader.get('/auth/memberships', params={'site_id': str(SITE_ID)}).status_code == 403
    assert 'membership.manage' not in reader.get('/auth/session').json()['sites'][0]['permissions']


def test_grant_requires_seeded_roster_and_state_precondition(database, clients):
    bootstrap(database); target = ids(database)['site_a_reader']; client = clients('site_a_writer')
    with database() as session, session.begin():
        member = session.scalar(select(Membership).where(Membership.principal_id == target))
        session.delete(member)  # only owned disposable fixture; grant begins from no membership
    response = client.post('/auth/memberships', json=command(target,'grant','reader',None,None))
    assert response.status_code == 200
    assert client.post('/auth/memberships', json=command(target,'grant','reader',None,None)).status_code == 409
    with database() as session, session.begin():
        session.delete(session.get(MembershipEligibility, (target,SITE_ID)))
    assert client.post('/auth/memberships', json=command(target)).status_code == 404


@pytest.mark.parametrize('problem', ['csrf', 'origin', 'revoked', 'expired', 'idle'])
def test_invalid_security_contexts_do_not_mutate(database, clients, problem):
    bootstrap(database); client = clients('site_a_writer'); people = ids(database)
    if problem == 'csrf': client.headers['X-CSRF-Token'] = 'invalid'
    elif problem == 'origin': client.headers['Origin'] = 'https://example.invalid'
    else:
        with database() as session, session.begin():
            record = session.scalar(select(AuthSession).where(AuthSession.principal_id == people['site_a_writer']))
            if problem == 'revoked': record.revoked = True
            elif problem == 'expired': record.expires_at = security.now() - timedelta(seconds=1)
            else: record.last_seen_at = security.now() - timedelta(minutes=31)
    assert client.post('/auth/memberships', json=command(people['site_a_reader'])).status_code == (403 if problem in ('csrf','origin') else 401)
    with database() as session:
        assert session.scalar(select(func.count()).select_from(MembershipChange)) == 0
        assert session.scalar(select(Membership.role).where(Membership.principal_id == people['site_a_reader'])) == 'reader'


def test_audit_snapshot_failure_rolls_back_membership_and_audit(database, clients, monkeypatch):
    bootstrap(database); client = clients('site_a_writer'); target = ids(database)['site_a_reader']
    from sqlalchemy.orm import Session
    original = Session.flush
    def fail_snapshot(session, *args, **kwargs):
        if any(isinstance(row, MembershipChange) for row in session.new):
            raise SQLAlchemyError('synthetic audit snapshot failure')
        return original(session, *args, **kwargs)
    with database() as session:
        before = session.scalar(select(func.count()).select_from(AuditEvent))
    monkeypatch.setattr(Session, 'flush', fail_snapshot)
    assert client.post('/auth/memberships', json=command(target)).status_code == 503
    with database() as session:
        assert session.scalar(select(func.count()).select_from(AuditEvent)) == before
        assert session.scalar(select(func.count()).select_from(MembershipChange)) == 0
        assert session.scalar(select(Membership.role).where(Membership.principal_id == target)) == 'reader'


@pytest.mark.parametrize('action', ['revoke','change_role'])
def test_admin_revocation_or_demotion_wins_before_write_authorization(database, clients, monkeypatch, action):
    bootstrap(database,'site_a_reader'); administrator = clients('site_a_reader'); writer = clients('site_a_writer')
    target = ids(database)['site_a_writer']; intent = register(writer)
    admin_secret = administrator.cookies.get(security.SESSION_COOKIE); admin_csrf = administrator.headers['X-CSRF-Token']
    writer_secret = writer.cookies.get(security.SESSION_COOKIE); writer_csrf = writer.headers['X-CSRF-Token']
    held, release = Event(), Event(); pids = Queue(); original = security.transaction_settings
    def track(session):
        original(session)
        if 'writer' in current_thread().name: pids.put(session.scalar(text('SELECT pg_backend_pid()')))
    monkeypatch.setattr(security, 'transaction_settings', track)
    def revoke():
        with security.protected(database,admin_secret,admin_csrf,write=True,lock_principal_ids=(target,)) as access:
            admin.change_membership(access,SITE_ID,target,action,'reader' if action=='change_role' else None,'concurrent test','writer',True)
            held.set(); assert release.wait(8)
    def write():
        with security.protected(database,writer_secret,writer_csrf,write=True) as access:
            return demo.create_event(database,dict(organization_id=ORGANIZATION_ID,site_id=SITE_ID,
                event_type='at_risk_surplus',occurred_at=security.now()),access=access,intent=intent)
    with ThreadPoolExecutor(1) as admins, ThreadPoolExecutor(1,thread_name_prefix='writer') as writers:
        first = admins.submit(revoke)
        try:
            assert held.wait(4)
            second = writers.submit(write)
            wait_for_postgres_lock(database,pids.get(timeout=4))
        finally: release.set()
        first.result(timeout=8)
        with pytest.raises(security.Denied) as denied: second.result(timeout=8)
        assert denied.value.status == 403
    with database() as session:
        assert session.scalar(select(func.count()).select_from(WasteEvent)) == 0
        assert session.scalar(select(func.count()).select_from(MembershipChange)) == 1
        assert session.get(WriteIntent,UUID(intent)).state == 'registered'


def test_write_already_authorized_finishes_then_admin_revokes(database, clients, monkeypatch):
    bootstrap(database,'site_a_reader'); administrator = clients('site_a_reader'); writer = clients('site_a_writer')
    target = ids(database)['site_a_writer']; intent = register(writer); pids = Queue(); original = security.transaction_settings
    def track(session):
        original(session)
        if 'admin-command' in current_thread().name: pids.put(session.scalar(text('SELECT pg_backend_pid()')))
    monkeypatch.setattr(security, 'transaction_settings', track)
    def revoke():
        with security.protected(database,administrator.cookies.get(security.SESSION_COOKIE),administrator.headers['X-CSRF-Token'],
                write=True,lock_principal_ids=(target,)) as access:
            return admin.change_membership(access,SITE_ID,target,'revoke',None,'after write','writer',True)
    with ThreadPoolExecutor(1,thread_name_prefix='admin-command') as pool:
        with security.protected(database,writer.cookies.get(security.SESSION_COOKIE),writer.headers['X-CSRF-Token'],write=True) as access:
            future = pool.submit(revoke)
            wait_for_postgres_lock(database,pids.get(timeout=4))
            result = demo.create_event(database,dict(organization_id=ORGANIZATION_ID,site_id=SITE_ID,
                event_type='at_risk_surplus',occurred_at=security.now()),access=access,intent=intent)
        future.result(timeout=8)
    assert writer.post('/auth/intents',json={'site_id':str(SITE_ID),'kind':'event'}).status_code == 403
    with database() as session:
        assert session.get(WasteEvent,result['event_id']) is not None
        assert session.scalar(select(func.count()).select_from(MembershipChange)) == 1


def test_admin_authority_is_independent_of_operational_membership(database, clients):
    bootstrap(database)
    people = ids(database)
    with database() as session, session.begin():
        own = session.scalar(select(Membership).where(Membership.principal_id == people['site_a_writer']))
        own.active = False  # trusted fixture only; no public self-management
    client = clients('site_a_writer')
    assert client.get('/auth/session').json()['sites'] == [dict(site_id=str(SITE_ID), permissions=['membership.manage'])]
    assert client.get('/auth/memberships',params={'site_id':str(SITE_ID)}).status_code == 200
    assert client.post('/auth/intents',json={'site_id':str(SITE_ID),'kind':'event'}).status_code == 403
    assert client.post('/auth/memberships',json=command(people['site_a_reader'])).status_code == 200


def test_service_requires_target_lock_and_strict_preconditions(database, clients):
    bootstrap(database); client = clients('site_a_writer'); target = ids(database)['site_a_reader']
    with security.protected(database,client.cookies.get(security.SESSION_COOKIE),
            client.headers['X-CSRF-Token'],write=True) as access:
        with pytest.raises(security.Denied) as denied:
            admin.change_membership(access,SITE_ID,target,'revoke',None,'test','reader',True)
        assert denied.value.status == 403
    body = command(target); body['expected_active'] = 'true'
    assert client.post('/auth/memberships',json=body).status_code == 422
    body = command(target); body['reason'] = '   '
    assert client.post('/auth/memberships',json=body).status_code == 400


def test_admin_can_remove_existing_site_access_without_grant_eligibility(database, clients):
    bootstrap(database); target = ids(database)['site_a_reader']; client = clients('site_a_writer')
    with database() as session, session.begin():
        session.delete(session.get(MembershipEligibility,(target,SITE_ID)))
    assert client.post('/auth/memberships',json=command(target)).status_code == 404
    assert client.post('/auth/memberships',json=command(target,'revoke',None,'reader',True)).status_code == 200
    assert client.post('/auth/memberships',json=command(target,'reactivate',None,'reader',False)).status_code == 404
