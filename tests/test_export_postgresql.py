"""Real PostgreSQL tests for authorized CSV export delivery (FR-008, AC-11).

Server-side scope per request (ENG-AC-016), CSV hardening end-to-end
(ENG-AC-017), exact decimal preservation (ENG-AC-018), XLSX absent.
"""

import csv
import io

import pytest

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


def new_measurement(client, event_id, **overrides):
    payload = dict(gross='2.40', tare='0.40', net='2.00', original_unit='kg', mass_basis='cooked',
                   measurement_method='scale_reading', provenance='synthetic_fixture',
                   observation_status='observed', measured_at='2026-11-04T07:05:00+08:00')
    payload.update(overrides)
    response = client.post(f'/demo/v0.1/events/{event_id}/measurements', json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def rows(payload: bytes):
    return list(csv.DictReader(io.StringIO(payload.decode('utf-8-sig'), newline='')))


def test_export_delivers_exact_source_rows_for_permitted_site(database):
    client = TestClient(create_app())
    event = new_event(client, stage_code='preparation', operation_date='2026-11-04')
    new_measurement(client, event['event_id'], gross='2.40', tare='0.40', net='2.00')
    new_measurement(client, event['event_id'], gross='2.30', tare='0.40', net='1.90')
    response = client.get('/demo/v0.1/export', params={'site_id': str(SITE_ID), 'dataset': 'events'})
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/csv')
    assert response.headers['cache-control'] == 'no-store'
    event_rows = rows(response.content)
    assert len(event_rows) == 1 and event_rows[0]['event_id'] == event['event_id']
    assert event_rows[0]['export_label'] == 'SYNTHETIC/DEMO'
    measurements = client.get('/demo/v0.1/export',
                              params={'site_id': str(SITE_ID), 'dataset': 'measurements'})
    measurement_rows = rows(measurements.content)
    assert len(measurement_rows) == 2  # repeated measurements kept as separate rows
    assert sorted(row['net'] for row in measurement_rows) == ['1.90', '2.00']  # exact decimals
    assert int(response.headers['x-fwi-export-measurements']) == 2


def test_export_filters_match_ledger_semantics_and_reject_unknown(database):
    client = TestClient(create_app())
    matched = new_event(client, stage_code='preparation', event_type='actual_loss_discard')
    new_event(client, stage_code='serving', occurred_at='2026-11-05T08:00:00+08:00')
    response = client.get('/demo/v0.1/export', params={'site_id': str(SITE_ID),
        'dataset': 'events', 'stage_code': 'preparation', 'event_type': 'actual_loss_discard'})
    assert [row['event_id'] for row in rows(response.content)] == [matched['event_id']]
    assert client.get('/demo/v0.1/export', params={'site_id': str(SITE_ID), 'dataset': 'events',
                                                   'menu': 'x'}).status_code == 422
    assert client.get('/demo/v0.1/export', params={'site_id': str(SITE_ID),
                                                   'dataset': 'xlsx'}).status_code == 422
    assert client.get('/demo/v0.1/export', params={'site_id': str(SITE_ID),
                                                   'operation_date_from': '2026-13-99'}).status_code == 422


def test_reader_with_event_read_is_authorized_to_export(database):
    """DEC-P0-ACCESS-04: export needs authenticated event.read on the site."""
    client = TestClient(create_app())
    new_event(client)
    reader = TestClient(create_app())
    login_client(reader, 'site_a_reader', PASSWORDS['site_a_reader'])
    allowed = reader.get('/demo/v0.1/export', params={'site_id': str(SITE_ID), 'dataset': 'events'})
    assert allowed.status_code == 200  # reader role carries event.read -> export allowed
    assert rows(allowed.content)[0]['export_label'] == 'SYNTHETIC/DEMO'


def test_forged_cross_site_export_is_concealed(database):
    client = TestClient(create_app())
    new_event(client)
    forged = TestClient(create_app())
    login_client(forged, 'site_b_writer', PASSWORDS['site_b_writer'])
    site_b = forged.get('/auth/session').json()['sites'][0]['site_id']
    leaked = forged.get('/demo/v0.1/export', params={'site_id': str(SITE_ID), 'dataset': 'events'})
    assert leaked.status_code == 404  # no site A rows, indistinguishable from absent
    own = forged.get('/demo/v0.1/export', params={'site_id': site_b, 'dataset': 'events'})
    assert own.status_code == 200 and rows(own.content) == []


def test_csv_hardening_survives_delivery_with_dangerous_cell(database):
    client = TestClient(create_app())
    event = new_event(client, stage_code='=HYPERLINK("http://evil.example","x")')
    response = client.get('/demo/v0.1/export', params={'site_id': str(SITE_ID), 'dataset': 'events'})
    exported = rows(response.content)
    assert exported[0]['event_id'] == event['event_id']
    # Serializer hardening applies: dangerous cell is neutralized, not executable.
    assert exported[0]['stage_code'].startswith("'")


@pytest.mark.parametrize('dataset,media,extension', [
    ('events', 'text/csv', 'csv'),
    ('measurements', 'text/csv', 'csv'),
    ('metadata', 'application/json', 'json'),
])
def test_export_content_type_filename_and_identity_agree(database, dataset, media, extension):
    client = TestClient(create_app())
    event = new_event(client)
    new_measurement(client, event['event_id'])
    response = client.get('/demo/v0.1/export', params={'site_id': str(SITE_ID), 'dataset': dataset})
    assert response.status_code == 200
    assert response.headers['content-type'].startswith(media)
    assert response.headers['content-disposition'] == f'attachment; filename="fwi-{dataset}-site-{SITE_ID}.{extension}"'
    assert response.headers['cache-control'] == 'no-store'
    session = client.get('/auth/session').json()
    assert response.headers['x-fwi-principal'] == session['principal_id']
    assert response.headers['x-fwi-auth-context'] == session['auth_context_id']
    assert response.headers['x-fwi-export-scope-site'] == str(SITE_ID)
    if dataset == 'metadata':
        assert isinstance(response.json(), dict)
    else:
        assert len(rows(response.content)) == 1


@pytest.mark.parametrize('dataset', ['events', 'measurements', 'metadata'])
def test_stage_export_retains_exact_scope_and_repeated_observations(database, dataset):
    client = TestClient(create_app())
    matched = new_event(client, stage_code='preparation', operation_date='2026-11-05')
    other_stage = new_event(client, stage_code='serving', operation_date='2026-11-05')
    other_date = new_event(client, stage_code='preparation', operation_date='2026-11-04')
    zero = new_measurement(client, matched['event_id'], gross='0.40', tare='0.40', net='0', observation_status='measured_zero')
    missing = new_measurement(client, matched['event_id'], gross=None, tare=None, net=None, observation_status='missing')
    query = {'site_id': str(SITE_ID), 'dataset': dataset, 'stage_code': 'preparation',
             'event_type': 'at_risk_surplus', 'operation_date_from': '2026-11-05', 'operation_date_to': '2026-11-05'}
    response = client.get('/demo/v0.1/export', params=query)
    assert response.status_code == 200
    assert response.headers['x-fwi-export-scope-site'] == str(SITE_ID)
    assert response.headers['x-fwi-export-events'] == '1'
    assert response.headers['x-fwi-export-measurements'] == '2'
    if dataset == 'metadata':
        metadata = response.json()
        assert metadata['counts'] == {'events': 1, 'measurements': 2}
        assert metadata['scope_site_ids'] == [str(SITE_ID)]
        assert metadata['held_kpis'] == ['OP-08', 'FI-02', 'NI-03']
        assert response.headers['content-type'].startswith('application/json')
        assert response.headers['content-disposition'].endswith('.json"')
    else:
        exported = rows(response.content)
        assert {row['event_id'] for row in exported} == {matched['event_id']}
        assert response.headers['content-type'].startswith('text/csv')
        assert response.headers['content-disposition'].endswith('.csv"')
        if dataset == 'events':
            assert len(exported) == 1 and exported[0]['stage_code'] == 'preparation'
        else:
            assert len(exported) == 2
            by_id = {row['measurement_id']: row for row in exported}
            assert by_id[zero['measurement_id']]['net'] == '0'
            assert by_id[zero['measurement_id']]['observation_status'] == 'measured_zero'
            assert by_id[missing['measurement_id']]['net'] == r'\N'
            assert by_id[missing['measurement_id']]['observation_status'] == 'missing'
    # Omitting stage broadens only within the already authorized date/site scope.
    unfiltered = client.get('/demo/v0.1/export', params={key: value for key, value in query.items() if key != 'stage_code'})
    assert unfiltered.status_code == 200 and unfiltered.headers['x-fwi-export-events'] == '2'
    foreign = TestClient(create_app())
    login_client(foreign, 'site_b_writer', PASSWORDS['site_b_writer'])
    denied = foreign.get('/demo/v0.1/export', params=query)
    assert denied.status_code == 404 and matched['event_id'] not in denied.text
