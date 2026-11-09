"""Real PostgreSQL tests for authorized CSV export delivery (FR-008, AC-11).

Server-side scope per request (ENG-AC-016), CSV hardening end-to-end
(ENG-AC-017), exact decimal preservation (ENG-AC-018), XLSX absent.
"""

import csv
import io

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
