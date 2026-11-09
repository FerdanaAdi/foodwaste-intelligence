"""Real PostgreSQL tests for evidence metadata persistence/API (FR-005, AC-10).

Metadata-only: no file bytes, no storage_ref exposure, no download links
(ADR-005 OPEN). Foreign/absent targets stay indistinguishable (EVD-002).
"""

from auth_support import PASSWORDS, TestClient, login_client
from fwi.api.app import create_app
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from test_demo_postgresql import database  # noqa: F401  (shared real-PostgreSQL fixture)


def new_event(client, **overrides):
    payload = dict(organization_id=str(ORGANIZATION_ID), site_id=str(SITE_ID), event_type='at_risk_surplus',
                   occurred_at='2026-11-04T07:00:00+08:00')
    payload.update(overrides)
    response = client.post('/demo/v0.1/events', json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def evidence_payload(event_id, **overrides):
    payload = dict(target_kind='event', target_id=event_id, kind='reference',
                   source='synthetic_note', title='Catatan kebersihan bin sintetis',
                   verification='unverified', availability='unknown',
                   recorded_at='2026-11-04T07:10:00+08:00')
    payload.update(overrides)
    return payload


def test_evidence_metadata_persists_and_reads_back_without_storage_fields(database):
    client = TestClient(create_app())
    event = new_event(client)
    created = client.post('/demo/v0.1/evidence', json=evidence_payload(event['event_id']))
    assert created.status_code == 201, created.text
    body = created.json()
    assert body['availability'] == 'unknown'  # unknown stays unknown (EVD-004)
    assert 'storage_ref' not in body  # structurally absent (EVD-003)
    listed = client.get('/demo/v0.1/evidence',
                        params={'target_kind': 'event', 'target_id': event['event_id']}).json()
    assert [row['evidence_id'] for row in listed] == [body['evidence_id']]
    assert all('storage_ref' not in row for row in listed)
    assert all('download_url' not in row for row in listed)  # no fabricated links


def test_evidence_on_measurement_target_scopes_to_event_site(database):
    client = TestClient(create_app())
    event = new_event(client)
    measurement = client.post(f"/demo/v0.1/events/{event['event_id']}/measurements", json=dict(
        gross='2.40', tare='0.40', net='2.00', original_unit='kg', mass_basis='cooked',
        measurement_method='scale_reading', provenance='synthetic_fixture',
        observation_status='observed', measured_at='2026-11-04T07:05:00+08:00')).json()
    created = client.post('/demo/v0.1/evidence', json=evidence_payload(
        measurement['measurement_id'], target_kind='measurement', kind='attachment'))
    assert created.status_code == 201, created.text
    assert created.json()['target_kind'] == 'measurement'


def test_cross_site_evidence_is_concealed_not_leaked(database):
    client = TestClient(create_app())
    event = new_event(client)
    absent = client.post('/demo/v0.1/evidence', json=evidence_payload(
        '33333333-3333-4333-8333-333333333399'))  # absent-but-plausible UUID
    assert absent.status_code == 404
    created = client.post('/demo/v0.1/evidence', json=evidence_payload(event['event_id']))
    assert created.status_code == 201  # owner writer can attach
    forged = TestClient(create_app())
    login_client(forged, 'site_b_writer', PASSWORDS['site_b_writer'])
    leaked = forged.post('/demo/v0.1/evidence', json=evidence_payload(event['event_id']))
    assert leaked.status_code == 404  # foreign target concealed, no metadata disclosed
    listed = forged.get('/demo/v0.1/evidence',
                        params={'target_kind': 'event', 'target_id': event['event_id']})
    assert listed.status_code == 404  # indistinguishable from absent


def test_reader_cannot_create_evidence_but_can_read(database):
    client = TestClient(create_app())
    event = new_event(client)
    client.post('/demo/v0.1/evidence', json=evidence_payload(event['event_id']))
    reader = TestClient(create_app())
    login_client(reader, 'site_a_reader', PASSWORDS['site_a_reader'])
    denied = reader.post('/demo/v0.1/evidence', json=evidence_payload(event['event_id']))
    assert denied.status_code == 403
    visible = reader.get('/demo/v0.1/evidence',
                         params={'target_kind': 'event', 'target_id': event['event_id']})
    assert visible.status_code == 200
    assert len(visible.json()) == 1


def test_evidence_rejects_unknown_filters_and_unsupported_target(database):
    client = TestClient(create_app())
    assert client.get('/demo/v0.1/evidence',
                      params={'target_kind': 'event', 'target_id': str(SITE_ID), 'extra': 'x'}).status_code == 422
    assert client.get('/demo/v0.1/evidence',
                      params={'target_kind': 'site', 'target_id': str(SITE_ID)}).status_code == 422
    event = new_event(client)
    bad = client.post('/demo/v0.1/evidence', json=evidence_payload(event['event_id'], target_kind='site'))
    assert bad.status_code == 422
