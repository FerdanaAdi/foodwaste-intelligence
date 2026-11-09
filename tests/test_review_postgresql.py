"""Real PostgreSQL tests for review decisions and correction proposals (FR-006).

Proposal-only (ENG-AC-012/013): a proposal never mutates the original record,
no approve/effectuate endpoint exists, unauthorized writers are concealed.
"""

from auth_support import PASSWORDS, TestClient, login_client
from fwi.api.app import create_app
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from test_demo_postgresql import database  # noqa: F401  (shared real-PostgreSQL fixture)


def new_event(client):
    response = client.post('/demo/v0.1/events', json=dict(
        organization_id=str(ORGANIZATION_ID), site_id=str(SITE_ID), event_type='at_risk_surplus',
        occurred_at='2026-11-04T07:00:00+08:00'))
    assert response.status_code == 201, response.text
    return response.json()


def new_measurement(client, event_id, net='2.00', gross='2.40'):
    response = client.post(f'/demo/v0.1/events/{event_id}/measurements', json=dict(
        gross=gross, tare='0.40', net=net, original_unit='kg', mass_basis='cooked',
        measurement_method='scale_reading', provenance='synthetic_fixture',
        observation_status='observed', measured_at='2026-11-04T07:05:00+08:00'))
    assert response.status_code == 201, response.text
    return response.json()


def review_payload(target_kind, target_id, **overrides):
    payload = dict(target_kind=target_kind, target_id=target_id,
                   reason='Operator salah ketik desimal pada pencatatan pertama',
                   source='synthetic_reviewer', provenance='synthetic_fixture')
    payload.update(overrides)
    return payload


def test_proposal_is_stored_and_original_measurement_unchanged(database):
    client = TestClient(create_app())
    event = new_event(client)
    measurement = new_measurement(client, event['event_id'])
    submitted = client.post('/demo/v0.1/reviews', json=review_payload(
        'measurement', measurement['measurement_id'],
        proposed_values={'gross': '2.30', 'tare': '0.40', 'net': '1.90'}))
    assert submitted.status_code == 201, submitted.text
    body = submitted.json()
    assert body['decision'] == 'request_correction'
    assert body['correction_proposal']['state'] == 'proposed'
    assert body['correction_proposal']['original_values']['gross'] == '2.40'
    assert body['correction_proposal']['proposed_values']['gross'] == '2.30'
    # The original record is untouched (ENG-AC-012).
    after = client.get(f"/demo/v0.1/events/{event['event_id']}/measurements").json()
    assert [row['gross'] for row in after] == ['2.40']
    history = client.get('/demo/v0.1/reviews', params={
        'target_kind': 'measurement', 'target_id': measurement['measurement_id']}).json()
    assert len(history['decisions']) == 1 and len(history['proposals']) == 1


def test_disallowed_and_identity_fields_are_rejected(database):
    client = TestClient(create_app())
    event = new_event(client)
    for bad in ({'event_id': '33333333-3333-4333-8333-333333333331'}, {'site_id': str(SITE_ID)},
                {'observation_status': 'measured_zero', 'gross': '0.00', 'tare': '0.00', 'net': '0.00'}):
        response = client.post('/demo/v0.1/reviews', json=review_payload(
            'event', event['event_id'], proposed_values=bad))
        assert response.status_code == 422, bad
    # occurred_at is the only allowed event change; a valid proposal succeeds.
    ok = client.post('/demo/v0.1/reviews', json=review_payload(
        'event', event['event_id'], proposed_values={'occurred_at': '2026-11-04T07:30:00+08:00'}))
    assert ok.status_code == 201, ok.text


def test_invalid_measurement_proposal_fails_domain_validation(database):
    client = TestClient(create_app())
    event = new_event(client)
    measurement = new_measurement(client, event['event_id'])
    # gross < tare in the merged candidate is rejected before persistence.
    response = client.post('/demo/v0.1/reviews', json=review_payload(
        'measurement', measurement['measurement_id'],
        proposed_values={'gross': '0.10', 'tare': '0.40', 'net': '2.00'}))
    assert response.status_code == 422
    history = client.get('/demo/v0.1/reviews', params={
        'target_kind': 'measurement', 'target_id': measurement['measurement_id']}).json()
    assert history['decisions'] == [] and history['proposals'] == []  # nothing partially stored


def test_review_writer_permission_and_concealment(database):
    client = TestClient(create_app())
    event = new_event(client)
    reader = TestClient(create_app())
    login_client(reader, 'site_a_reader', PASSWORDS['site_a_reader'])
    denied = reader.post('/demo/v0.1/reviews', json=review_payload('event', event['event_id']))
    assert denied.status_code == 403  # reader cannot submit (ENG-AC-013 denies unprivileged writes)
    forged = TestClient(create_app())
    login_client(forged, 'site_b_writer', PASSWORDS['site_b_writer'])
    concealed = forged.post('/demo/v0.1/reviews', json=review_payload('event', event['event_id']))
    assert concealed.status_code == 404
    concealed_read = forged.get('/demo/v0.1/reviews', params={
        'target_kind': 'event', 'target_id': event['event_id']})
    assert concealed_read.status_code == 404
    visible = client.get('/demo/v0.1/reviews', params={
        'target_kind': 'event', 'target_id': event['event_id']})
    assert visible.status_code == 200


def test_no_approval_or_effectuation_path_exists(database):
    # Any other decision vocabulary is rejected at the schema level; there is
    # deliberately no endpoint to transition a proposal out of 'proposed'.
    client = TestClient(create_app())
    event = new_event(client)
    response = client.post('/demo/v0.1/reviews', json=dict(
        review_payload('event', event['event_id']), decision='approve'))
    assert response.status_code == 422  # extra='forbid' + fixed decision value
    assert client.get('/demo/v0.1/reviews', params={
        'target_kind': 'event', 'target_id': event['event_id'],
        'include': 'all'}).status_code == 422
