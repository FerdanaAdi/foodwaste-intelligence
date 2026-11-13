"""Real protected HTTP and deterministic PostgreSQL transaction tests, synthetic only."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from queue import Queue
from threading import Event, current_thread
from time import monotonic
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError

from auth_support import PASSWORDS, login_client
from test_demo_postgresql import database, counts  # guarded, migrated fixture
from test_demo_validation import measurement_payload
from fwi.api.app import create_app
from fwi.application import demo, security
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from fwi.infrastructure.database.security_seed import SITE_B
from fwi.infrastructure.ingress import local_server_config
from fwi.infrastructure.database.models import (
    AuditEvent, AuthSession, LoginThrottle, Membership, PreAuth, Principal,
    WasteEvent, WriteIntent,
)


@pytest.fixture
def clients(database):
    app = create_app()
    opened = []
    def make(name=None):
        config = local_server_config(app)
        config.load()
        client = TestClient(config.loaded_app, base_url=security.ORIGIN,
                            headers={'Origin': security.ORIGIN}, client=('127.0.0.1', 50000))
        opened.append(client)
        if name:
            login_client(client, name)
        return client
    yield make
    for client in opened:
        client.close()
    app.state.session_factory.kw['bind'].dispose()


def event_payload(site=SITE_ID):
    return dict(organization_id=str(ORGANIZATION_ID), site_id=str(site),
                event_type='at_risk_surplus', occurred_at='2026-11-07T12:00:00+08:00')


def register(client, site=SITE_ID, event_id=None):
    response = client.post('/auth/intents', json={'site_id': str(site),
        'kind': 'measurement' if event_id else 'event', 'event_id': event_id})
    assert response.status_code == 201
    return response.json()['intent_id']


def create_event(client, site=SITE_ID):
    reference = register(client, site)
    response = client.post('/demo/v0.1/events', json=event_payload(site), headers={'X-FWI-Intent': reference})
    assert response.status_code == 201
    return response.json()['event_id'], reference


def credentials(client, name='site_a_writer', password='synthetic-invalid-credential'):
    preauth = client.get('/auth/preauth')
    assert preauth.status_code == 200
    return client.post('/auth/login', json={'username': name, 'password': password},
                       headers={'X-CSRF-Token': preauth.json()['csrf_token']})


def test_no_unauthenticated_alternate_route_and_https_enforcement(clients, database):
    client = clients()
    for path in ('/demo/v0.1/events/' + str(uuid4()), '/demo/v0.1/events/' + str(uuid4()) + '/measurements'):
        assert client.get(path).status_code == 401
    assert client.post('/demo/v0.1/events', json=event_payload()).status_code == 401
    assert client.post('/demo/v0.1/events/' + str(uuid4()) + '/measurements', json=measurement_payload()).status_code == 401
    assert client.post('/auth/intents', json={'site_id': str(SITE_ID), 'kind': 'event'}).status_code == 401
    assert client.get('http://127.0.0.1:5173/auth/preauth').status_code == 403
    assert client.get('http://127.0.0.1:5173/auth/preauth', headers={'X-Forwarded-Proto': 'https'}).status_code == 403
    assert client.get('/auth/intents').status_code == 401
    assert counts(database)[0:2] == (0, 0)


def test_cookie_hash_fixation_and_private_response(clients, database):
    client = clients()
    preauth = client.get('/auth/preauth')
    old_secret = client.cookies.get(security.PREAUTH_COOKIE)
    response = client.post('/auth/login', json={'username': 'site_a_writer', 'password': PASSWORDS['site_a_writer']},
                           headers={'X-CSRF-Token': preauth.json()['csrf_token']})
    assert response.status_code == 200
    header = response.headers.get_list('set-cookie')[0]
    assert all(part in header for part in ('Secure', 'HttpOnly', 'SameSite=strict', 'Path=/'))
    assert 'Domain=' not in header
    secret = client.cookies.get(security.SESSION_COOKIE)
    assert secret != old_secret
    with database() as session:
        principal = session.scalar(select(Principal).where(Principal.username == 'site_a_writer'))
        assert principal.password_hash.startswith('$argon2id$v=19$m=65536,t=3,p=4$')
        record = session.scalar(select(AuthSession).where(AuthSession.principal_id == principal.principal_id))
        assert record.secret_hash == security.digest(secret) and record.secret_hash != secret
    client.headers['X-CSRF-Token'] = response.json()['csrf_token']
    assert client.get('/auth/session').headers['cache-control'] == 'no-store'
    # Consumed pre-auth token cannot log in again or fix the authenticated secret.
    client.cookies.set(security.PREAUTH_COOKIE, old_secret)
    assert client.post('/auth/login', json={'username': 'site_a_writer', 'password': PASSWORDS['site_a_writer']},
                       headers={'X-CSRF-Token': preauth.json()['csrf_token']}).status_code == 403


@pytest.mark.parametrize('origin', ['null', 'https://unknown.invalid', 'https://localhost:5173', 'https://127.0.0.1:15173'])
def test_origin_allowlist_rejects_unknown_and_null(clients, origin):
    client = clients('site_a_writer')
    assert client.get('/auth/preauth', headers={'Origin': origin}).status_code == 403
    assert client.get('/auth/session', headers={'Origin': origin}).status_code == 403
    assert client.post('/auth/logout', headers={'Origin': origin}).status_code == 403


def test_missing_headers_fail_closed_with_explicit_get_compatibility(clients):
    client = clients()
    del client.headers['Origin']
    assert client.get('/auth/preauth').status_code == 403
    assert client.get('/auth/preauth', headers={'Referer': security.ORIGIN + '/'}).status_code == 403
    assert client.get('/auth/preauth', headers={'Sec-Fetch-Site': 'same-origin'}).status_code == 403
    assert client.get('/auth/preauth', headers={'Referer': security.ORIGIN + '/', 'Sec-Fetch-Site': 'same-origin'}).status_code == 200
    assert client.post('/auth/login', json={'username': 'site_a_writer', 'password': 'not-a-credential'}).status_code == 403


def test_csrf_and_expired_preauth_and_secret_validation_echo(clients, database):
    client = clients()
    preauth = client.get('/auth/preauth')
    body = {'username': 'site_a_writer', 'password': PASSWORDS['site_a_writer']}
    assert client.post('/auth/login', json=body).status_code == 403
    with database() as session, session.begin():
        session.scalar(select(PreAuth)).expires_at = security.now() - timedelta(seconds=1)
    assert client.post('/auth/login', json=body, headers={'X-CSRF-Token': preauth.json()['csrf_token']}).status_code == 403
    secret_input = 'synthetic-marker-never-echo-' * 100
    invalid = client.post('/auth/login', json={**body, 'password': secret_input})
    assert invalid.status_code == 422 and secret_input not in invalid.text
    login_client(client)
    before = counts(database)
    assert client.post('/auth/logout', headers={'X-CSRF-Token': 'wrong'}).status_code == 403
    assert client.post('/auth/intents', json={'site_id': str(SITE_ID), 'kind': 'event'},
                       headers={'X-CSRF-Token': 'wrong'}).status_code == 403
    assert counts(database) == before


def test_reader_idor_site_context_and_no_membership(clients, database):
    writer = clients('site_a_writer')
    event_id, _ = create_event(writer)
    b = clients('site_b_writer')
    foreign_id, _ = create_event(b, SITE_B)
    reader = clients('site_a_reader')
    assert reader.get('/demo/v0.1/events/' + event_id).status_code == 200
    assert reader.get('/demo/v0.1/events/' + event_id + '/measurements').status_code == 200
    assert reader.post('/demo/v0.1/events', json=event_payload()).status_code == 403
    assert reader.post('/demo/v0.1/events/' + event_id + '/measurements', json=measurement_payload()).status_code == 403
    before = counts(database)
    for suffix in ('', '/measurements'):
        absent = writer.get('/demo/v0.1/events/' + str(uuid4()) + suffix)
        foreign = writer.get('/demo/v0.1/events/' + foreign_id + suffix)
        assert absent.status_code == foreign.status_code == 404
        assert absent.json() == foreign.json() == {'detail': 'not found'}
    assert writer.post('/demo/v0.1/events/' + foreign_id + '/measurements', json=measurement_payload()).status_code == 404
    assert writer.post('/demo/v0.1/events', json=event_payload(SITE_B)).status_code == 403
    assert writer.post('/demo/v0.1/events', json={**event_payload(), 'organization_id': str(uuid4())}).status_code == 403
    # Gate B exists, but an operational writer has no administrative authority.
    with database() as session:
        target = session.scalar(select(Principal.principal_id).where(Principal.username == 'site_a_reader'))
    assert writer.post('/auth/memberships', json=dict(site_id=str(SITE_ID), principal_id=str(target),
        action='revoke', role=None, reason='synthetic denied administration',
        expected_role='reader', expected_active=True)).status_code == 403
    with database() as session, session.begin():
        principal = session.scalar(select(Principal).where(Principal.username == 'site_a_writer'))
        member = session.scalar(select(Membership).where(Membership.principal_id == principal.principal_id))
        member.active = False
    assert writer.get('/demo/v0.1/events/' + event_id).status_code == 404
    assert writer.post('/auth/intents', json={'site_id': str(SITE_ID), 'kind': 'event'}).status_code == 403
    assert counts(database) == before


@pytest.mark.parametrize('expiry', ['idle', 'absolute', 'revoked', 'disabled'])
def test_session_expiry_revocation_and_disable(clients, database, expiry):
    client = clients('site_a_writer')
    with database() as session, session.begin():
        record = session.scalar(select(AuthSession))
        if expiry == 'idle':
            record.last_seen_at = security.now() - timedelta(minutes=31)
        elif expiry == 'absolute':
            record.expires_at = security.now() - timedelta(seconds=1)
        elif expiry == 'revoked':
            record.revoked = True
        else:
            session.get(Principal, record.principal_id).enabled = False
    assert client.get('/auth/session').status_code == 401
    assert client.post('/demo/v0.1/events', json=event_payload()).status_code == 401


def test_account_and_source_throttles_persist(clients, database):
    client = clients()
    for _ in range(5):
        assert credentials(client).status_code == 401
    assert credentials(client, password=PASSWORDS['site_a_writer']).status_code == 429
    # Independent source protection is not defeated by changing account name.
    with database() as session, session.begin():
        bucket = session.get(LoginThrottle, security.digest('source:127.0.0.1'))
        bucket.failures = 30
    assert credentials(client, name='site_b_writer', password=PASSWORDS['site_b_writer']).status_code == 429
    with database() as session:
        buckets_before = session.scalar(select(func.count()).select_from(LoginThrottle))
    assert credentials(client, name='synthetic_unknown_account').status_code == 429
    with database() as session:
        assert session.scalar(select(func.count()).select_from(LoginThrottle)) == buckets_before


def test_private_intent_registration_recovery_logout_and_no_replay(clients, database):
    a = clients('site_a_writer')
    before = counts(database)
    reference = register(a)
    assert counts(database) == before  # security registration creates no domain/audit business record
    response = a.post('/demo/v0.1/events', json=event_payload(), headers={'X-FWI-Intent': reference})
    assert response.status_code == 201
    event_id = response.json()['event_id']
    after = counts(database)
    assert a.post('/demo/v0.1/events', json=event_payload(), headers={'X-FWI-Intent': reference}).status_code == 409
    assert counts(database) == after
    with database() as session:
        audit = session.scalar(select(AuditEvent).where(AuditEvent.event_id == UUID(event_id)))
        assert audit.actor == str(audit.actor_principal_id) and audit.actor_principal_id is not None
    stolen = a.cookies.get(security.SESSION_COOKIE)
    assert a.post('/auth/logout').status_code == 200
    attacker = clients()
    attacker.cookies.set(security.SESSION_COOKIE, stolen)
    assert attacker.get('/auth/session').status_code == 401
    b = clients('site_b_writer')
    assert b.get('/auth/intents').json() == []
    assert b.post('/demo/v0.1/events', json=event_payload(SITE_B), headers={'X-FWI-Intent': reference}).status_code == 409
    login_client(a)
    recovery = a.get('/auth/intents').json()
    assert len(recovery) == 1 and recovery[0]['event_id'] == event_id
    assert recovery[0]['state'] == 'committed' and recovery[0]['result_id'] == event_id
    assert 'csrf' not in str(recovery) and 'password' not in str(recovery)


def test_audit_failure_rolls_back_intent_and_data(clients, database, monkeypatch):
    client = clients('site_a_writer')
    reference = register(client)
    before = counts(database)
    original = demo.audit
    def fail(session, record, actor=None):
        original(session, record, actor)
        raise SQLAlchemyError('synthetic rollback after audit flush')
    monkeypatch.setattr(demo, 'audit', fail)
    response = client.post('/demo/v0.1/events', json=event_payload(), headers={'X-FWI-Intent': reference})
    assert response.status_code == 503 and counts(database) == before
    with database() as session:
        assert session.get(WriteIntent, UUID(reference)).state == 'registered'


def test_logout_failure_rolls_back_revocation_and_audit(clients, database, monkeypatch):
    client = clients('site_a_writer')
    before = counts(database)
    def fail(*args):
        raise SQLAlchemyError('synthetic security audit failure')
    monkeypatch.setattr(security, 'security_audit', fail)
    assert client.post('/auth/logout').status_code == 503
    assert client.get('/auth/session').status_code == 200
    assert counts(database) == before


def wait_for_postgres_lock(database, pid):
    deadline = monotonic() + 4
    with database() as session:
        while monotonic() < deadline:
            if session.scalar(text('SELECT cardinality(pg_blocking_pids(:pid)) > 0'), {'pid': pid}):
                return
            Event().wait(.01)  # poll observed DB lock, never infer ordering from elapsed sleep
    raise AssertionError('worker never reached the expected PostgreSQL lock')


@pytest.mark.parametrize('revocation', ['session', 'membership', 'principal'])
def test_revocation_wins_serialization_no_domain_commit(clients, database, monkeypatch, revocation):
    client = clients('site_a_writer')
    reference = register(client)
    secret = client.cookies.get(security.SESSION_COOKIE)
    csrf = client.headers['X-CSRF-Token']
    with database() as session:
        record = session.scalar(select(AuthSession))
        principal_id, session_id = record.principal_id, record.session_id
        assert session.scalar(text('SHOW transaction_isolation')) == 'read committed'
    held, release = Event(), Event()
    pids = Queue()
    settings, audit = security.transaction_settings, security.security_audit
    def tracked_settings(session):
        settings(session)
        if 'writer' in current_thread().name:
            pids.put(session.scalar(text('SELECT pg_backend_pid()')))
    def pause_audit(*args):
        audit(*args)
        held.set()
        assert release.wait(8)
    monkeypatch.setattr(security, 'transaction_settings', tracked_settings)
    monkeypatch.setattr(security, 'security_audit', pause_audit)
    def revoke():
        if revocation == 'session':
            security.revoke_session(database, principal_id, session_id)
        elif revocation == 'membership':
            security.revoke_membership(database, principal_id, SITE_ID)
        else:
            security.disable_principal(database, principal_id)
    def write():
        with security.protected(database, secret, csrf, write=True) as access:
            values = {**event_payload(), 'organization_id': ORGANIZATION_ID, 'site_id': SITE_ID,
                      'occurred_at': security.now()}
            demo.create_event(database, values, access=access, intent=reference)
    with ThreadPoolExecutor(1, thread_name_prefix='revoker') as revokers, ThreadPoolExecutor(1, thread_name_prefix='writer') as writers:
        first = revokers.submit(revoke)
        try:
            assert held.wait(4)
            second = writers.submit(write)
            wait_for_postgres_lock(database, pids.get(timeout=4))
        finally:
            release.set()
        first.result(timeout=8)
        with pytest.raises(security.Denied) as denied:
            second.result(timeout=8)
        assert denied.value.status == (403 if revocation == 'membership' else 401)
    with database() as session:
        assert session.scalar(select(func.count()).select_from(WasteEvent)) == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.entity_type == 'waste_events')) == 0
        assert session.get(WriteIntent, UUID(reference)).state == 'registered'


def test_write_wins_then_revocation_blocks_following_operation(clients, database, monkeypatch):
    client = clients('site_a_writer')
    reference = register(client)
    secret = client.cookies.get(security.SESSION_COOKIE)
    csrf = client.headers['X-CSRF-Token']
    pids = Queue()
    original = security.transaction_settings
    def tracked(session):
        original(session)
        if 'revoker' in current_thread().name:
            pids.put(session.scalar(text('SELECT pg_backend_pid()')))
    monkeypatch.setattr(security, 'transaction_settings', tracked)
    with ThreadPoolExecutor(1, thread_name_prefix='revoker') as pool:
        with security.protected(database, secret, csrf, write=True) as access:
            future = pool.submit(security.revoke_session, database, access.principal.principal_id,
                                 access.login_session.session_id)
            wait_for_postgres_lock(database, pids.get(timeout=4))
            result = demo.create_event(database, {**event_payload(), 'organization_id': ORGANIZATION_ID,
                'site_id': SITE_ID, 'occurred_at': security.now()}, access=access, intent=reference)
        future.result(timeout=8)
    assert client.get('/auth/session').status_code == 401
    with database() as session:
        assert session.get(WasteEvent, result['event_id']) is not None
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.event_id == result['event_id'])) == 1


def test_migration_preserves_legacy_audit_and_reverses_only_without_security_evidence(database):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    from fwi.infrastructure.database.session import create_engine_for_url
    from test_demo_postgresql import drop_created_schema, verify_test_target
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    with pytest.raises(RuntimeError, match='security evidence'):
        with database.kw['bind'].begin() as connection:
            config.attributes['connection'] = connection
            command.downgrade(config, 'demo_0001')
    # New isolated legacy schema; no security evidence is deleted for this test.
    import os
    engine = create_engine_for_url(os.environ['FWI_TEST_DATABASE_URL'])
    schema, oid = 'fwi_demo_test_' + uuid4().hex, None
    try:
        with engine.begin() as connection:
            verify_test_target(connection, schema)
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            candidate = connection.scalar(text('SELECT oid FROM pg_namespace WHERE nspname=:s'), {'s': schema})
        oid = candidate
        with engine.begin() as connection:
            verify_test_target(connection, schema)
            connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            config.attributes['connection'] = connection
            command.upgrade(config, 'demo_0001')
            audit_id = uuid4()
            connection.execute(text("INSERT INTO audit_events(audit_id,entity_type,entity_id,action,actor,recorded_at) VALUES(:id,'fixture',:id,'created','synthetic-demo-actor',now())"), {'id': audit_id})
            # This historical test covers auth_0002's empty-security rollback only.
            # Gate B history is forward-only; do not traverse auth_0007 here.
            command.upgrade(config, 'auth_0002')
            assert connection.scalar(text('SELECT actor FROM audit_events WHERE audit_id=:id'), {'id': audit_id}) == 'synthetic-demo-actor'
            command.downgrade(config, 'demo_0001')
            assert connection.scalar(text('SELECT audit_id FROM audit_events')) == audit_id
    finally:
        if oid is not None:
            with engine.begin() as connection:
                drop_created_schema(connection, schema, oid)
        engine.dispose()
