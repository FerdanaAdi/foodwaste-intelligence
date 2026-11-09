"""Real PostgreSQL tests for the authorized live data-quality summary (FR-007)."""

import pytest

from auth_support import PASSWORDS, TestClient, login_client
from fwi.api.app import create_app
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
from test_demo_postgresql import database  # noqa: F401  (shared real-PostgreSQL fixture)


def dq(client, site_id):
    return client.get('/demo/v0.1/data-quality', params={'site_id': str(site_id)})


def new_event(client, **overrides):
    payload = dict(organization_id=str(ORGANIZATION_ID), site_id=str(SITE_ID), event_type='at_risk_surplus',
                   occurred_at='2026-11-04T07:00:00+08:00')
    payload.update(overrides)
    response = client.post('/demo/v0.1/events', json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def measure(client, event_id, **overrides):
    payload = dict(gross='2.40', tare='0.40', net='2.00', original_unit='kg', mass_basis='cooked',
                   measurement_method='scale_reading', provenance='synthetic_fixture',
                   observation_status='observed', measured_at='2026-11-04T07:05:00+08:00')
    payload.update(overrides)
    response = client.post(f'/demo/v0.1/events/{event_id}/measurements', json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_one_event_two_measurements_counts_1_and_2(database):
    client = TestClient(create_app())
    event = new_event(client)
    measure(client, event['event_id'])
    measure(client, event['event_id'], gross='2.30', net='1.90')
    body = dq(client, SITE_ID).json()
    summary = body['summary']
    assert summary['event_count'] == 1
    assert summary['measurement_count'] == 2
    assert summary['observation_counts']['observed'] == 2
    assert summary['unmeasured_event_count'] == 0
    # Drill-down keeps event identity singular with both measurement ids.
    assert len(body['records']) == 1
    assert len(body['records'][0]['measurement_ids']) == 2


def test_measured_zero_missing_and_estimated_stay_distinct(database):
    client = TestClient(create_app())
    measured_zero = new_event(client)
    measure(client, measured_zero['event_id'], gross='0.00', tare='0.00', net='0.00',
            observation_status='measured_zero')
    unmeasured = new_event(client, occurred_at='2026-11-04T08:00:00+08:00')  # no measurement
    estimated = new_event(client, occurred_at='2026-11-04T09:00:00+08:00')
    measure(client, estimated['event_id'], gross='1.00', tare='0.00', net='1.00',
            observation_status='estimated', measurement_method='volume_estimate')
    summary = dq(client, SITE_ID).json()['summary']
    assert summary['observation_counts']['measured_zero'] == 1
    assert summary['observation_counts']['missing'] + summary['observation_counts']['not_measured'] == 0
    assert summary['unmeasured_event_count'] == 1  # event without measurement is not zero
    assert summary['estimated_count'] == 1


def test_dq_site_isolation_and_permission(database):
    client = TestClient(create_app())
    new_event(client)
    other = TestClient(create_app())
    login_client(other, 'site_b_writer', PASSWORDS['site_b_writer'])
    site_b = other.get('/auth/session').json()['sites'][0]['site_id']
    assert dq(client, SITE_ID).json()['summary']['event_count'] == 1
    assert dq(other, site_b).json()['summary']['event_count'] == 0
    forged = client.get('/demo/v0.1/data-quality', params={'site_id': site_b})
    assert forged.status_code in (403, 404)  # no cross-site leakage


def test_dq_rejects_unsupported_filters(database):
    client = TestClient(create_app())
    assert client.get('/demo/v0.1/data-quality', params={'site_id': str(SITE_ID), 'stage': 'preparation'}).status_code == 422
    assert client.get('/demo/v0.1/data-quality', params={'site_id': 'nope'}).status_code == 422


def test_dq_reconciles_with_ledger_records(database):
    client = TestClient(create_app())
    first = new_event(client)
    second = new_event(client, occurred_at='2026-11-04T10:00:00+08:00')
    body = dq(client, SITE_ID).json()
    ledger = client.get('/demo/v0.1/events', params={'site_id': str(SITE_ID)}).json()
    assert {r['event_id'] for r in body['records']} == {e['event_id'] for e in ledger['events']}
    assert {first['event_id'], second['event_id']} <= {r['event_id'] for r in body['records']}
