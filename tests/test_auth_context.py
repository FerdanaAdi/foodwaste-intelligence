"""Non-secret response binding comes from each actual authorized session."""
from uuid import UUID
from sqlalchemy import select
from auth_support import login_client
from test_demo_postgresql import database
from test_security_postgresql import clients, create_event
from fwi.application import security
from fwi.infrastructure.database.models import AuthSession


def test_session_context_is_session_specific_and_never_an_authentication_token(clients, database):
    a = clients('site_a_writer')
    b = clients('site_a_writer')
    first, second = a.get('/auth/session'), b.get('/auth/session')
    x, y = first.json(), second.json()
    assert x['principal_id'] == y['principal_id']
    assert x['auth_context_id'] != y['auth_context_id']
    for client, response in ((a, first), (b, second)):
        body = response.json()
        assert response.headers['X-FWI-Principal'] == body['principal_id']
        assert response.headers['X-FWI-Auth-Context'] == body['auth_context_id']
        with database() as session:
            issued = session.scalar(select(AuthSession).where(
                AuthSession.secret_hash == security.digest(client.cookies.get(security.SESSION_COOKIE))))
            assert UUID(body['auth_context_id']) == issued.session_id
            assert body['auth_context_id'] not in (client.cookies.get(security.SESSION_COOKIE), issued.secret_hash, issued.csrf_hash)
    fake = clients()
    fake.cookies.set(security.SESSION_COOKIE, x['auth_context_id'])
    denied = fake.get('/auth/session')
    assert denied.status_code == 401 and 'X-FWI-Auth-Context' not in denied.headers


def test_protected_headers_follow_each_request_and_private_actor_recovery(clients):
    a = clients('site_a_writer')
    b = clients('site_b_writer')
    owner = a.get('/auth/session').json()
    other = b.get('/auth/session').json()
    event_id, _ = create_event(a)
    for path in (f'/demo/v0.1/events/{event_id}', f'/demo/v0.1/events/{event_id}/measurements', '/auth/intents'):
        response = a.get(path)
        assert response.status_code == 200
        assert response.headers['X-FWI-Auth-Context'] == owner['auth_context_id']
        assert response.headers['Cache-Control'] == 'no-store'
    recovery = b.get('/auth/intents')
    assert recovery.json() == []
    assert recovery.headers['X-FWI-Auth-Context'] == other['auth_context_id']
    foreign = b.get(f'/demo/v0.1/events/{event_id}')
    absent = b.get('/demo/v0.1/events/33333333-3333-4333-8333-333333333333')
    assert foreign.status_code == absent.status_code == 404
    assert foreign.json() == absent.json() == {'detail': 'not found'}
    assert foreign.headers['X-FWI-Auth-Context'] == other['auth_context_id']
    logout = a.post('/auth/logout')
    assert logout.headers['X-FWI-Auth-Context'] == owner['auth_context_id']
    assert a.get('/auth/session').status_code == 401
