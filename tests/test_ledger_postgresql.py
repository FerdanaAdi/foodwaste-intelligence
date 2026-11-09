"""Real PostgreSQL tests for the authorized event ledger and measurement fidelity.

FR-003/FR-004 acceptance: deterministic site-scoped listing without join
multiplication, supported filters only, lexeme/conditional-field provenance.
"""

import os
import pytest
from uuid import uuid4

from auth_support import PASSWORDS, TestClient, login_client
from fwi.api.app import create_app
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from test_demo_postgresql import database  # noqa: F401  (shared real-PostgreSQL fixture)


def ledger(client, site_id, **params):
    return client.get('/demo/v0.1/events', params={'site_id': str(site_id), **params})


def new_event(client, **overrides):
    payload = dict(organization_id=str(ORGANIZATION_ID), site_id=str(SITE_ID), event_type='at_risk_surplus',
                   occurred_at='2026-11-04T07:00:00+08:00')
    payload.update(overrides)
    response = client.post('/demo/v0.1/events', json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_ledger_deterministic_order_and_pagination(database):
    app = create_app()
    client = TestClient(app)
    first = new_event(client, occurred_at='2026-11-04T07:00:00+08:00')
    tie_a = new_event(client, occurred_at='2026-11-04T08:00:00+08:00')
    tie_b = new_event(client, occurred_at='2026-11-04T08:00:00+08:00')
    page1 = ledger(client, SITE_ID, page_size=2)
    assert page1.status_code == 200
    body = page1.json()
    assert body['total'] == 3 and body['page'] == 1 and body['page_size'] == 2
    tie_order = sorted([tie_a['event_id'], tie_b['event_id']])
    assert [e['event_id'] for e in body['events']] == tie_order
    page2 = ledger(client, SITE_ID, page=2, page_size=2)
    assert [e['event_id'] for e in page2.json()['events']] == [first['event_id']]
    # Repeating the same page gives the same immutable tie-breaker order.
    assert ledger(client, SITE_ID, page_size=2).json()['events'] == body['events']


def test_event_with_two_measurements_appears_once(database):
    app = create_app()
    client = TestClient(app)
    event = new_event(client)
    for gross, lexeme in (('2.40', '2.00'), ('2.30', '1.90')):
        response = client.post(f"/demo/v0.1/events/{event['event_id']}/measurements", json=dict(
            gross=gross, tare='0.40', net=lexeme,
            original_unit='kg', mass_basis='cooked', measurement_method='scale_reading',
            provenance='synthetic_fixture', observation_status='observed',
            measured_at='2026-11-04T07:05:00+08:00'))
        assert response.status_code == 201, response.text
    body = ledger(client, SITE_ID).json()
    assert body['total'] == 1 and len(body['events']) == 1  # no join multiplication


def test_ledger_site_isolation_and_cross_site_denial(database):
    app = create_app()
    client = TestClient(app)
    new_event(client)  # site A record
    other = TestClient(app)
    login_client(other, 'site_b_writer', PASSWORDS['site_b_writer'])
    site_b = other.get('/auth/session').json()['sites'][0]['site_id']
    assert ledger(client, SITE_ID).json()['total'] == 1
    assert ledger(other, site_b).json()['total'] == 0  # no leakage of site A rows
    reader = TestClient(app)
    login_client(reader, 'site_a_reader', PASSWORDS['site_a_reader'])
    assert ledger(reader, SITE_ID).status_code == 200


def test_ledger_filters_supported_semantics(database):
    app = create_app()
    client = TestClient(app)
    discard = new_event(client, event_type='actual_loss_discard', stage_code='preparation',
                        operation_date='2026-11-04', occurred_at='2026-11-04T09:00:00+08:00')
    surplus = new_event(client, event_type='at_risk_surplus', stage_code='serving',
                        operation_date='2026-11-05', occurred_at='2026-11-05T09:00:00+08:00')
    assert [e['event_id'] for e in ledger(client, SITE_ID, event_type='actual_loss_discard').json()['events']] == [discard['event_id']]
    assert [e['event_id'] for e in ledger(client, SITE_ID, stage_code='serving').json()['events']] == [surplus['event_id']]
    ranged = ledger(client, SITE_ID, operation_date_from='2026-11-04', operation_date_to='2026-11-04').json()
    assert [e['event_id'] for e in ranged['events']] == [discard['event_id']]
    assert ranged['total'] == 1


def test_ledger_rejects_unsupported_and_malformed_filters(database):
    app = create_app()
    client = TestClient(app)
    assert ledger(client, SITE_ID, menu='dish').status_code == 422
    assert ledger(client, SITE_ID, operation_date_from='04-11-2026').status_code == 422
    assert ledger(client, SITE_ID, event_type='other_stream').status_code == 422
    assert ledger(client, SITE_ID, page='0').status_code == 422
    assert client.get('/demo/v0.1/events', params={'site_id': 'not-a-uuid'}).status_code == 422


def test_measurement_source_fidelity_persists_exactly(database):
    app = create_app()
    client = TestClient(app)
    event = new_event(client)
    response = client.post(f"/demo/v0.1/events/{event['event_id']}/measurements", json=dict(
        gross='2.40', tare='0.40', net='2.00', original_unit='kg', mass_basis='as_served',
        measurement_method='scale_reading', provenance='synthetic_fixture',
        observation_status='observed', original_value_lexeme='2.40',
        instrument_ref='SCALE-SYN-01', sample_context='full_bin',
        measured_at='2026-11-04T07:05:00+08:00'))
    assert response.status_code == 201, response.text
    stored = client.get(f"/demo/v0.1/events/{event['event_id']}/measurements").json()[0]
    assert stored['original_value_lexeme'] == '2.40'
    assert stored['instrument_ref'] == 'SCALE-SYN-01'
    assert stored['sample_context'] == 'full_bin'
    assert stored['net'] == '2.00'  # exact decimal text, not float formatting


def test_event_stage_and_operation_date_persist_separately(database):
    app = create_app()
    client = TestClient(app)
    event = new_event(client, stage_code='preparation', process_step='batch_completion',
                      operation_date='2026-11-03', occurred_at='2026-11-04T01:00:00+08:00')
    detail = client.get(f"/demo/v0.1/events/{event['event_id']}").json()
    assert detail['operation_date'] == '2026-11-03'  # distinct from occurred_at date
    assert detail['stage_code'] == 'preparation' and detail['process_step'] == 'batch_completion'
