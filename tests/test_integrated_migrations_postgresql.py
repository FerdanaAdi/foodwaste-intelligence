"""Fresh/upgrade verification confined to a guarded schema owned by this run."""
import os
from pathlib import Path
from uuid import uuid4
import pytest
from alembic import command
from alembic.config import Config
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url
from fwi.infrastructure.database.session import create_engine_for_url, create_session_factory
from fwi.infrastructure.database.models import Base
from fwi.infrastructure.database.demo_seed import seed_demo
from test_demo_postgresql import verify_test_target, drop_created_schema


@pytest.mark.parametrize('upgrade_p0', [False, True])
def test_integrated_fresh_and_existing_p0_preserve_history(upgrade_p0):
    url = os.environ.get('FWI_TEST_DATABASE_URL')
    if not url:
        if os.environ.get('FWI_REQUIRE_POSTGRES') == '1':
            pytest.fail('explicit PostgreSQL test target required')
        pytest.skip('PostgreSQL unavailable')
    engine = create_engine_for_url(url)
    schema = 'fwi_demo_test_' + uuid4().hex
    oid = None
    factory = None
    try:
        with engine.begin() as c:
            verify_test_target(c, schema)
            c.execute(text(f'CREATE SCHEMA "{schema}"'))
            created = c.scalar(text('SELECT oid FROM pg_namespace WHERE nspname=:s'), {'s': schema})
        oid = created
        scoped = make_url(url).update_query_dict({'options': '-csearch_path=' + schema})
        factory = create_session_factory(scoped.render_as_string(hide_password=False))
        config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
        if upgrade_p0:
            with factory.kw['bind'].begin() as c:
                config.attributes['connection'] = c
                command.upgrade(config, 'demo_0005')
            seed_demo(factory)
            from uuid import UUID
            from fwi.application import demo
            from fwi.api.schemas_demo import EventInput, MeasurementInput
            from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
            from test_demo_validation import measurement_payload
            event = demo.create_event(factory, EventInput(
                organization_id=ORGANIZATION_ID, site_id=SITE_ID,
                event_type='at_risk_surplus', occurred_at='2026-11-09T08:00:00+08:00',
                operation_date='2026-11-09', stage_code='synthetic_upgrade').model_dump())
            for changes in [{}, dict(gross='0.4', tare='0.4', net='0', observation_status='measured_zero')]:
                demo.add_measurement(factory, UUID(str(event['event_id'])),
                    MeasurementInput(**measurement_payload(**changes)).model_dump())
            with factory.kw['bind'].connect() as c:
                tables = [n for n in inspect(c).get_table_names() if n != 'alembic_version']
                before = {n: list(c.execute(text(f'SELECT * FROM "{n}"')).mappings()) for n in tables}
                assert len(before['audit_events']) == 5
                assert len(before['waste_events']) == 1 and len(before['measurements']) == 2
        with factory.kw['bind'].begin() as c:
            verify_test_target(c, schema)
            config.attributes['connection'] = c
            command.upgrade(config, 'head')
            assert list(c.scalars(text('SELECT version_num FROM alembic_version'))) == ['int_p1_0006']
            assert compare_metadata(MigrationContext.configure(c), Base.metadata) == []
            assert 'evidence_references' in inspect(c).get_table_names()
            assert 'p1_receipts' in inspect(c).get_table_names()
            if upgrade_p0:
                assert {n: list(c.execute(text(f'SELECT * FROM "{n}"')).mappings()) for n in tables} == before
    finally:
        if factory is not None:
            factory.kw['bind'].dispose()
        try:
            if oid is not None:
                with engine.begin() as c:
                    drop_created_schema(c, schema, oid)
        finally:
            engine.dispose()
