"""Real PostgreSQL 18 tests in an isolated random synthetic schema.

Set FWI_TEST_DATABASE_URL explicitly; FWI_REQUIRE_POSTGRES=1 makes absence fail.
No SQLite substitute. No production database is authorized for this test.
"""

import os
from pathlib import Path
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from datetime import datetime, timezone
from decimal import Decimal

from fwi.api.app import create_app
from fwi.application import demo
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID, seed_demo
from fwi.infrastructure.database.models import AuditEvent, Base, Measurement, WasteEvent
from fwi.infrastructure.database.session import create_engine_for_url, create_session_factory
from test_demo_validation import measurement_payload


def verify_test_target(connection, schema):
    """Fail closed before any schema DDL, including cleanup."""
    suffix = schema.removeprefix('fwi_demo_test_')
    if (not schema.startswith('fwi_demo_test_') or len(suffix) != 32
            or UUID(hex=suffix).version != 4 or UUID(hex=suffix).hex != suffix):
        raise RuntimeError('test schema must have the required prefix and UUID4 suffix')
    identity = connection.execute(text(
        "SELECT current_user AS role, current_database() AS database, "
        "current_setting('server_version_num')::integer AS version"
    )).mappings().one()
    if (identity['role'] != 'fwi_test' or identity['database'] != 'fwi_demo_test'
            or not 180000 <= identity['version'] < 190000):
        raise RuntimeError('refusing schema DDL: requires fwi_test / fwi_demo_test / PostgreSQL 18')


def drop_created_schema(connection, schema, created_oid):
    verify_test_target(connection, schema)
    current_oid = connection.scalar(text(
        "SELECT oid FROM pg_namespace WHERE nspname = :schema "
        "AND nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)"
    ), {'schema': schema})
    if created_oid is None or current_oid != created_oid:
        raise RuntimeError('refusing cleanup: schema is not the one created by this fixture')
    connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))


@pytest.fixture
def database(monkeypatch):
    url = os.getenv('FWI_TEST_DATABASE_URL')
    if not url:
        if os.getenv('FWI_REQUIRE_POSTGRES') == '1':
            pytest.fail('FWI_TEST_DATABASE_URL required for PostgreSQL verification')
        pytest.skip('real PostgreSQL 18 not configured; persistence NOT verified')
    engine = create_engine_for_url(url)
    schema = 'fwi_demo_test_' + uuid4().hex
    factory = None
    created_oid = None
    try:
        with engine.begin() as connection:
            verify_test_target(connection, schema)
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            schema_oid = connection.scalar(text('SELECT oid FROM pg_namespace WHERE nspname = :schema'), {'schema': schema})
        created_oid = schema_oid  # only after CREATE transaction committed successfully
        scoped_url = make_url(url).update_query_dict({'options': f'-csearch_path={schema}'})
        # Never log credentials; this URL is passed in memory only.
        scoped = scoped_url.render_as_string(hide_password=False)
        factory = create_session_factory(scoped)
        with factory.kw['bind'].begin() as connection:
            config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
            config.attributes['connection'] = connection
            command.upgrade(config, 'head')
        seed_demo(factory)
        with factory.kw['bind'].connect() as connection:
            assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
        monkeypatch.setenv('FWI_DATABASE_URL', scoped)
        yield factory
    finally:
        try:
            if factory is not None:
                factory.kw['bind'].dispose()
            if created_oid is not None:
                with engine.begin() as connection:
                    drop_created_schema(connection, schema, created_oid)
        finally:
            engine.dispose()


def new_event(client):
    response = client.post('/demo/v0.1/events', json=dict(
        organization_id=str(ORGANIZATION_ID), site_id=str(SITE_ID),
        event_type='at_risk_surplus', occurred_at='2026-11-04T07:00:00+08:00'))
    assert response.status_code == 201, response.text
    return response.json()['event_id']


def counts(factory):
    with factory() as session:
        return tuple(session.scalar(select(func.count()).select_from(model))
                     for model in (WasteEvent, Measurement, AuditEvent))


def test_persistence_across_restart_and_remeasurement(database):
    app = create_app()
    with TestClient(app) as client:
        event_id = new_event(client)
        first = client.post(f'/demo/v0.1/events/{event_id}/measurements', json=measurement_payload())
        second = client.post(f'/demo/v0.1/events/{event_id}/measurements', json=measurement_payload(gross='3.4', net='3'))
        assert first.status_code == second.status_code == 201
        assert first.json()['measurement_id'] != second.json()['measurement_id']
    app.state.session_factory.kw['bind'].dispose()
    restarted = create_app()  # fresh engine and application, same PostgreSQL data
    try:
        with TestClient(restarted) as client:
            assert client.get(f'/demo/v0.1/events/{event_id}').json()['event_id'] == event_id
            records = client.get(f'/demo/v0.1/events/{event_id}/measurements').json()
            assert [r['net'] for r in records] == ['2.0', '3']
            assert {r['event_id'] for r in records} == {event_id}
            assert all(r['provenance'] == 'synthetic fixture' for r in records)
            assert counts(database) == (1, 2, 5)  # org/site/event/two measurements audited
    finally:
        restarted.state.session_factory.kw['bind'].dispose()


def test_missing_zero_and_estimate_persist(database):
    app = create_app()
    try:
        with TestClient(app) as client:
            event_id = new_event(client)
            for status, values in [('missing', dict(gross=None, tare=None, net=None)),
                                   ('measured_zero', dict(gross='0.4', tare='0.4', net='0')),
                                   ('estimated', {})]:
                response = client.post(f'/demo/v0.1/events/{event_id}/measurements', json=measurement_payload(observation_status=status, **values))
                assert response.status_code == 201, response.text
            records = client.get(f'/demo/v0.1/events/{event_id}/measurements').json()
            assert records[0]['net'] is None
            assert records[1]['net'] == '0'
            assert records[2]['observation_status'] == 'estimated'
    finally:
        app.state.session_factory.kw['bind'].dispose()


@pytest.mark.parametrize('operation', ['event', 'measurement'])
def test_audit_failure_rolls_back_data_and_audit(database, operation):
    app = create_app()
    original = demo.audit
    try:
        with TestClient(app) as client:
            event_id = new_event(client)
            before = counts(database)
            def fail_after_audit(session, record):
                original(session, record)  # both data AND audit have reached PostgreSQL
                raise SQLAlchemyError('synthetic failure after audit flush')
            with patch.object(demo, 'audit', fail_after_audit):
                if operation == 'event':
                    response = client.post('/demo/v0.1/events', json=dict(organization_id=str(ORGANIZATION_ID), site_id=str(SITE_ID), event_type='actual_loss_discard', occurred_at='2026-11-04T07:00:00Z'))
                else:
                    response = client.post(f'/demo/v0.1/events/{event_id}/measurements', json=measurement_payload())
                assert response.status_code == 503
            assert counts(database) == before
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_invalid_mass_and_orphan_event_are_rejected_without_writes(database):
    app = create_app()
    try:
        with TestClient(app) as client:
            event_id = new_event(client)
            before = counts(database)
            for invalid in ['-1', 'NaN', 'Infinity', '0.1']:
                assert client.post(f'/demo/v0.1/events/{event_id}/measurements', json=measurement_payload(gross=invalid)).status_code == 422
            assert client.post(f'/demo/v0.1/events/{uuid4()}/measurements', json=measurement_payload()).status_code == 404
            assert counts(database) == before
    finally:
        app.state.session_factory.kw['bind'].dispose()


@pytest.mark.parametrize('changes', [dict(gross=Decimal('-1')), dict(gross=Decimal('NaN')),
    dict(net=Decimal('Infinity')), dict(tare=Decimal('4')), dict(net=Decimal('5'))])
def test_database_constraints_reject_invalid_mass(database, changes):
    event = demo.create_event(database, dict(organization_id=ORGANIZATION_ID, site_id=SITE_ID,
        event_type='at_risk_surplus', occurred_at=datetime.now(timezone.utc)))
    before = counts(database)
    values = measurement_payload()
    values.update(event_id=event['event_id'], recorded_at=datetime.now(timezone.utc), measured_at=datetime.now(timezone.utc))
    values.update(changes)
    with pytest.raises(IntegrityError):
        with database() as session, session.begin():
            session.add(Measurement(**values))
            session.flush()
    assert counts(database) == before


def test_long_decimal_round_trip_has_no_quantization(database):
    event = demo.create_event(database, dict(organization_id=ORGANIZATION_ID, site_id=SITE_ID,
        event_type='actual_loss_discard', occurred_at=datetime.now(timezone.utc)))
    value = Decimal('0.123456789012345678901234567890123456789')
    values = measurement_payload(gross=value, tare=Decimal('0'), net=value,
                                 measured_at=datetime.now(timezone.utc))
    demo.add_measurement(database, event['event_id'], values)
    assert demo.read_measurements(database, event['event_id'])[0]['net'] == value
