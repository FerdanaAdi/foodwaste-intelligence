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


@pytest.fixture
def dated_events(database):
    client = TestClient(create_app())
    # All occurred_at values intentionally differ from the filtered operation dates.
    first = new_event(client, stage_code='preparation', operation_date='2026-11-04')
    middle = new_event(client, stage_code='preparation', operation_date='2026-11-05')
    last = new_event(client, stage_code='serving', operation_date='2026-11-06')
    undated = new_event(client, stage_code='preparation')
    measure(client, middle['event_id'], gross='0.40', tare='0.40', net='0', observation_status='measured_zero')
    measure(client, middle['event_id'], gross=None, tare=None, net=None, observation_status='missing')
    measure(client, last['event_id'], observation_status='estimated', measurement_method='synthetic_estimate')
    measure(client, undated['event_id'])
    return client, {name: event['event_id'] for name, event in [('first', first), ('middle', middle), ('last', last), ('undated', undated)]}


@pytest.mark.parametrize('filters,names', [
    ({'operation_date_from': '2026-11-05'}, {'middle', 'last'}),
    ({'operation_date_to': '2026-11-05'}, {'first', 'middle'}),
    ({'operation_date_from': '2026-11-05', 'operation_date_to': '2026-11-05'}, {'middle'}),
    ({'stage_code': 'preparation'}, {'first', 'middle', 'undated'}),
    ({'stage_code': 'preparation', 'operation_date_from': '2026-11-04', 'operation_date_to': '2026-11-05'}, {'first', 'middle'}),
    ({'stage_code': 'serving', 'operation_date_to': '2026-11-05'}, set()),
    ({}, {'first', 'middle', 'last', 'undated'}),
])
def test_dq_filters_match_inclusive_ledger_scope(dated_events, filters, names):
    client, events = dated_events
    query = {'site_id': str(SITE_ID), **filters}
    response = client.get('/demo/v0.1/data-quality', params=query)
    assert response.status_code == 200, response.text
    body = response.json()
    ids = {row['event_id'] for row in body['records']}
    assert ids == {events[name] for name in names}
    assert body['summary']['event_count'] == len(body['records']) == len(names)
    assert body['summary']['measurement_count'] == sum(len(row['measurement_ids']) for row in body['records'])
    assert ids == {row['event_id'] for row in client.get('/demo/v0.1/events', params=query).json()['events']}
    for event_id in ids:
        detail = client.get(f'/demo/v0.1/events/{event_id}').json()
        assert detail['event_id'] == event_id
    assert client.get(f"/demo/v0.1/events/{events['undated']}").json()['operation_date'] is None


@pytest.mark.parametrize('filters', [
    {'operation_date_from': '2026-02-30'}, {'operation_date_to': '2026-13-01'},
    {'operation_date_from': '20261105'}, {'operation_date_to': '2026-W45-1'},
    {'operation_date_from': ''}, {'operation_date_from': '2026-11-06', 'operation_date_to': '2026-11-04'},
    {'occurred_from': '2026-11-04T00:00:00Z'}, {'stage': 'preparation'},
])
def test_dq_rejects_invalid_dates_ranges_and_unsupported_parameters(database, filters):
    client = TestClient(create_app())
    response = client.get('/demo/v0.1/data-quality', params={'site_id': str(SITE_ID), **filters})
    assert response.status_code == 422


def test_filtered_dq_preserves_statuses_identity_and_read_only_data(dated_events, database):
    from sqlalchemy import select
    from fwi.infrastructure.database.models import WasteEvent, Measurement, AuditEvent
    def snapshot():
        with database() as session:
            return {model.__tablename__: list(session.execute(select(model.__table__).order_by(*model.__table__.primary_key.columns)).mappings())
                    for model in (WasteEvent, Measurement, AuditEvent)}
    client, events = dated_events
    before = snapshot()
    query = {'site_id': str(SITE_ID), 'stage_code': 'preparation',
             'operation_date_from': '2026-11-05', 'operation_date_to': '2026-11-05'}
    body = client.get('/demo/v0.1/data-quality', params=query).json()
    assert body['summary']['event_count'] == 1
    assert body['summary']['measurement_count'] == 2
    assert body['summary']['observation_counts']['missing'] == 1
    assert body['summary']['observation_counts']['measured_zero'] == 1
    assert body['summary']['observation_counts']['not_measured'] == 0
    assert body['records'][0]['event_id'] == events['middle']
    assert len(set(body['records'][0]['measurement_ids'])) == 2
    estimated = client.get('/demo/v0.1/data-quality', params={'site_id': str(SITE_ID), 'stage_code': 'serving'}).json()
    assert estimated['summary']['estimated_count'] == 1
    assert snapshot() == before  # GET neither mutates source records nor appends business audit.


def test_filtered_dq_reader_access_and_cross_site_concealment(dated_events):
    client, _ = dated_events
    filters = {'site_id': str(SITE_ID), 'stage_code': 'preparation', 'operation_date_from': '2026-11-05'}
    reader = TestClient(create_app())
    login_client(reader, 'site_a_reader', PASSWORDS['site_a_reader'])
    assert reader.get('/demo/v0.1/data-quality', params=filters).json() == client.get('/demo/v0.1/data-quality', params=filters).json()
    other = TestClient(create_app())
    login_client(other, 'site_b_writer', PASSWORDS['site_b_writer'])
    denied = other.get('/demo/v0.1/data-quality', params=filters)
    assert denied.status_code == 404
    assert 'records' not in denied.json()
