"""Real HTTPS session login for regression tests; no production auth bypass."""
import secrets
from fastapi.testclient import TestClient as RawClient
from sqlalchemy import select
from fwi.application import security
from fwi.infrastructure.database.security_seed import PERSONAS, seed_security
from fwi.infrastructure.database.models import WasteEvent
from fwi.infrastructure.ingress import local_server_config

PASSWORDS = {name: secrets.token_urlsafe(32) for name in PERSONAS}


def login_client(client, username='site_a_writer', password=None):
    preauth = client.get('/auth/preauth')
    assert preauth.status_code == 200
    client.headers['X-CSRF-Token'] = preauth.json()['csrf_token']
    response = RawClient.post(client, '/auth/login', json={
        'username': username, 'password': password or PASSWORDS[username]})
    assert response.status_code == 200
    client.headers['X-CSRF-Token'] = response.json()['csrf_token']
    return response


class TestClient(RawClient):
    __test__ = False

    def __init__(self, app, **kwargs):
        kwargs.setdefault('base_url', security.ORIGIN)
        kwargs.setdefault('headers', {'Origin': security.ORIGIN})
        kwargs.setdefault('client', ('127.0.0.1', 50000))
        config = local_server_config(app)
        config.load()
        super().__init__(config.loaded_app, **kwargs)
        self.session_factory = app.state.session_factory
        seed_security(app.state.session_factory, PASSWORDS)
        login_client(self)

    def post(self, url, **kwargs):
        # Register an independent security operation before this one domain POST.
        # No replay or retry is performed; test rejection remains a rejection.
        if url.startswith('/demo/v0.1/events'):
            payload = kwargs.get('json', {})
            identifier = url.removeprefix('/demo/v0.1/events/').split('/')[0]
            body = {'site_id': payload.get('site_id'), 'kind': 'event'}
            if url.endswith('/measurements'):
                from uuid import UUID
                with self.session_factory() as session:
                    event = session.get(WasteEvent, UUID(identifier))
                    body = {'site_id': str(event.site_id) if event else '22222222-2222-4222-8222-222222222222',
                            'kind': 'measurement', 'event_id': identifier}
            intent = RawClient.post(self, '/auth/intents', json=body)
            if intent.status_code == 201:
                kwargs['headers'] = {**kwargs.get('headers', {}), 'X-FWI-Intent': intent.json()['intent_id']}
        return super().post(url, **kwargs)
