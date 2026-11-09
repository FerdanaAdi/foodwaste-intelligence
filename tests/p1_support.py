"""Intent and payload helpers for provisional P1 candidate tests."""
from fastapi.testclient import TestClient as RawClient


def register_p1_intent(client, site_id, event_id=None):
    intent = RawClient.post(client, '/auth/intents', json={
        'site_id': str(site_id), 'kind': 'p1', 'event_id': str(event_id) if event_id else None})
    assert intent.status_code == 201, intent.text
    return intent.json()['intent_id']


def p1_post(client, url, payload, site_id, event_id=None):
    """Single-use write intent plus one domain POST; no retry is performed."""
    intent_id = register_p1_intent(client, site_id, event_id)
    return client.post(url, json=payload, headers={'X-FWI-Intent': intent_id})
