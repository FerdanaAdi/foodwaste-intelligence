"""Security negative tests for the WP-01..WP-06 surface (FR-001/AC-01).

Revocation, CSRF, cross-site concealment and unauthenticated access against
the new ledger/DQ/master/evidence/review/export routes. Reuse of the shared
security stack is regression-tested here so later routes cannot silently
bypass it.
"""

from auth_support import PASSWORDS, TestClient, login_client
from fwi.api.app import create_app
from fwi.application import security
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from test_demo_postgresql import database  # noqa: F401  (shared real-PostgreSQL fixture)


def new_event(client):
    response = client.post('/demo/v0.1/events', json=dict(
        organization_id=str(ORGANIZATION_ID), site_id=str(SITE_ID), event_type='at_risk_surplus',
        occurred_at='2026-11-04T07:00:00+08:00'))
    assert response.status_code == 201, response.text
    return response.json()


def site_b_client(app):
    client = TestClient(app)
    login_client(client, 'site_b_writer', PASSWORDS['site_b_writer'])
    return client


def test_revoked_session_is_denied_on_every_new_read_route(database):
    app = create_app()
    client = TestClient(app)
    event = new_event(client)
    logout = client.post('/auth/logout')
    assert logout.status_code == 200
    for path, params in (
        ('/demo/v0.1/events', {'site_id': str(SITE_ID)}),
        ('/demo/v0.1/data-quality', {'site_id': str(SITE_ID)}),
        ('/demo/v0.1/export', {'site_id': str(SITE_ID)}),
        ('/demo/v0.1/master/namespaces', {}),
        ('/demo/v0.1/reviews', {'target_kind': 'event', 'target_id': event['event_id']}),
    ):
        response = client.get(path, params=params)
        assert response.status_code == 401, (path, response.status_code)


def test_missing_csrf_is_rejected_on_new_write_routes(database):
    app = create_app()
    client = TestClient(app)
    event = new_event(client)
    csrf = client.headers.pop('X-CSRF-Token', None)
    assert csrf, 'fixture must hold a CSRF token to drop'
    payload = {'target_kind': 'event', 'target_id': event['event_id'],
               'kind': 'reference', 'source': 's', 'title': 't',
               'recorded_at': '2026-11-04T07:10:00+08:00'}
    assert client.post('/demo/v0.1/evidence', json=payload).status_code == 403
    review = {'target_kind': 'event', 'target_id': event['event_id'],
              'reason': 'r', 'source': 's', 'provenance': 'p'}
    assert client.post('/demo/v0.1/reviews', json=review).status_code == 403
    client.headers['X-CSRF-Token'] = csrf  # restore; nothing was written
    assert client.get('/demo/v0.1/evidence', params={
        'target_kind': 'event', 'target_id': event['event_id']}).status_code == 200
    assert client.get('/demo/v0.1/reviews', params={
        'target_kind': 'event', 'target_id': event['event_id']}).json()['decisions'] == []


def test_foreign_site_is_concealed_on_new_scoped_reads(database):
    app = create_app()
    owner = TestClient(app)
    new_event(owner)
    forged = site_b_client(app)
    site_b = forged.get('/auth/session').json()['sites'][0]['site_id']
    for path in ('/demo/v0.1/events', '/demo/v0.1/data-quality', '/demo/v0.1/export'):
        response = forged.get(path, params={'site_id': str(SITE_ID)})
        assert response.status_code == 404, (path, response.status_code)
    # The owner still sees exactly their own rows on each surface.
    assert owner.get('/demo/v0.1/events', params={'site_id': str(SITE_ID)}).json()['total'] == 1
    assert owner.get('/demo/v0.1/export', params={'site_id': str(SITE_ID)}).status_code == 200
    del site_b


def test_unauthenticated_requests_never_reach_private_data(database):
    app = create_app()
    client = TestClient(app)
    client.cookies.pop(security.SESSION_COOKIE, None)
    for path in ('/demo/v0.1/events', '/demo/v0.1/master/namespaces', '/demo/v0.1/export'):
        response = client.get(path, params={'site_id': str(SITE_ID)})
        assert response.status_code == 401, (path, response.status_code)
