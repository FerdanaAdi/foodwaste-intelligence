"""PostgreSQL regression for the list-only grounded context (T3 Stage 2A).

Uses the guarded, per-test synthetic schema fixture from test_demo_postgresql, which
refuses any target that is not fwi_test / fwi_demo_test / PostgreSQL 18. Sessions come
from the real login route and are resolved by security.protected; no FakeSession and no
authorization bypass is used. Alert rows are synthetic P2 rows inserted into the isolated
schema. Requires FWI_TEST_DATABASE_URL; without it the fixture fails or skips.
"""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from auth_support import TestClient, login_client
from test_demo_postgresql import database  # noqa: F401  (shared isolated schema fixture)
from fwi.api.app import create_app
from fwi.application import copilot, security
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from fwi.infrastructure.database.models_p1 import P2Recommendation
from fwi.infrastructure.database.security_seed import SITE_B

ORG = ORGANIZATION_ID
SITE_A = SITE_ID
ALERT_ID = uuid.UUID('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
TARGET = uuid.UUID('dddddddd-dddd-4ddd-8ddd-ddddddddddd1')
RECORDED = datetime(2026, 11, 5, 7, 0, tzinfo=timezone.utc)
HIDDEN_FIELDS = ('ack_actor', 'ack_at', 'ack_reason', 'organization_id')


def insert_alert(factory):
    with factory() as session, session.begin():
        session.add(P2Recommendation(
            recommendation_id=ALERT_ID, organization_id=ORG, site_id=SITE_A,
            rule_code='event_coverage_insufficient', rule_version='p2-rules-provisional-v0',
            target_type='waste_event', target_ref=TARGET,
            detected_issue='Event has no usable observation.', coverage='partial',
            recommended_action='Review the observations recorded for this event.',
            state='open', recorded_at=RECORDED))


def recommendation_rows(factory):
    with factory() as session:
        rows = session.scalars(select(P2Recommendation)).all()
        return sorted((r.recommendation_id, r.state, r.ack_at, r.ack_actor, r.ack_reason,
                       r.detected_issue, r.recommended_action) for r in rows)


def grounded(factory, client, site_id, recommendation_id):
    """Resolve the real session cookie through security.protected, then call the helper."""
    secret = client.cookies.get(security.SESSION_COOKIE)
    with security.protected(factory, secret) as access:
        return copilot.grounded_context(factory, site_id, recommendation_id, access=access)


def test_authorized_site_a_reads_its_stored_alert_with_undereferenced_pointer(database):
    insert_alert(database)
    app = create_app()
    try:
        with TestClient(app) as client:  # site_a_writer session from the real login route
            result = grounded(database, client, SITE_A, ALERT_ID)
    finally:
        app.state.session_factory.kw['bind'].dispose()
    assert result['status'] == copilot.ENVELOPE_STATUS
    assert len(result['evidence']) == 1
    evidence = result['evidence'][0]
    assert evidence['citation'] == {'type': 'p2_recommendation', 'id': str(ALERT_ID),
                                    'rule_version': 'p2-rules-provisional-v0'}
    assert evidence['fields']['coverage'] == 'partial'
    assert evidence['fields']['state'] == 'open'
    assert result['target_reference'] == {'target_type': 'waste_event', 'target_ref': str(TARGET),
                                          'dereferenced': False}
    assert result['inference'] == {'status': 'provider_not_configured', 'generated_answer': None}
    for hidden in HIDDEN_FIELDS:
        assert hidden not in evidence['fields']


def test_site_b_principal_cannot_read_site_a_and_gets_a_concealed_404(database):
    insert_alert(database)
    app = create_app()
    try:
        with TestClient(app) as client_b:
            login_client(client_b, 'site_b_writer')  # membership exists only for Site B
            with pytest.raises(security.Denied) as denied:
                grounded(database, client_b, SITE_A, ALERT_ID)
    finally:
        app.state.session_factory.kw['bind'].dispose()
    assert denied.value.status == 404  # concealed: no existence or content leak


def test_unknown_id_for_an_authorized_site_is_insufficient_without_a_global_claim(database):
    insert_alert(database)
    unknown = uuid.uuid4()
    app = create_app()
    try:
        with TestClient(app) as client:
            result = grounded(database, client, SITE_A, unknown)
    finally:
        app.state.session_factory.kw['bind'].dispose()
    assert result['status'] == copilot.INSUFFICIENT_STATUS
    assert result['evidence'] == [] and result['target_reference'] is None
    assert 'does not exist' not in result['reason']


def test_missing_access_fails_closed_and_reads_leave_recommendations_unchanged(database):
    insert_alert(database)
    before = recommendation_rows(database)
    with pytest.raises(security.Denied) as denied:
        copilot.grounded_context(database, SITE_A, ALERT_ID, access=None)
    assert denied.value.status == 401
    app = create_app()
    try:
        with TestClient(app) as client:
            grounded(database, client, SITE_A, ALERT_ID)
    finally:
        app.state.session_factory.kw['bind'].dispose()
    # Session last_seen activity is an auth bookkeeping write, not a domain write; only
    # recommendation rows are compared here.
    assert recommendation_rows(database) == before
    assert before[0][1] == 'open'
