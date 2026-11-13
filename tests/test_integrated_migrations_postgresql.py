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


@pytest.mark.parametrize('upgrade_p0', [False, True, 'int_p1_0006'])
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
                command.upgrade(config, 'int_p1_0006' if upgrade_p0 == 'int_p1_0006' else 'demo_0005')
            seed_demo(factory)
            from fwi.api.schemas_demo import MeasurementInput
            from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID
            from test_demo_validation import measurement_payload
            # Historical fixture uses reflected historical columns, not today's ORM.
            from sqlalchemy import MetaData, Table
            from datetime import date, datetime, timezone
            stamp=datetime.now(timezone.utc);event_id=uuid4()
            with factory.kw['bind'].begin() as c:
                meta=MetaData()
                events=Table('waste_events',meta,autoload_with=c)
                measurements=Table('measurements',meta,autoload_with=c)
                audits=Table('audit_events',meta,autoload_with=c)
                c.execute(events.insert().values(event_id=event_id,organization_id=ORGANIZATION_ID,site_id=SITE_ID,
                    event_type='at_risk_surplus',occurred_at=datetime.fromisoformat('2026-11-09T08:00:00+08:00'),
                    operation_date=date(2026,11,9),stage_code='synthetic_upgrade',recorded_at=stamp))
                c.execute(audits.insert().values(audit_id=uuid4(),entity_type='waste_events',entity_id=event_id,
                    event_id=event_id,action='created',actor='synthetic-demo-actor',recorded_at=stamp))
                for changes in [{},dict(gross='0.4',tare='0.4',net='0',observation_status='measured_zero')]:
                    measurement_id=uuid4()
                    c.execute(measurements.insert().values(measurement_id=measurement_id,event_id=event_id,
                        recorded_at=stamp,**MeasurementInput(**measurement_payload(**changes)).model_dump()))
                    c.execute(audits.insert().values(audit_id=uuid4(),entity_type='measurements',entity_id=measurement_id,
                        event_id=event_id,measurement_id=measurement_id,action='created',actor='synthetic-demo-actor',recorded_at=stamp))
            if upgrade_p0 == 'int_p1_0006':
                from auth_support import PASSWORDS
                from fwi.infrastructure.database.security_seed import seed_security
                seed_security(factory, PASSWORDS)
            with factory.kw['bind'].connect() as c:
                tables = [n for n in inspect(c).get_table_names() if n != 'alembic_version']
                old_columns = {n:[col['name'] for col in inspect(c).get_columns(n)] for n in tables}
                before = {n: list(c.execute(text(f'SELECT * FROM "{n}"')).mappings()) for n in tables}
                assert len(before['audit_events']) == (12 if upgrade_p0 == 'int_p1_0006' else 5)
                assert len(before['waste_events']) == 1 and len(before['measurements']) == 2
        with factory.kw['bind'].begin() as c:
            verify_test_target(c, schema)
            config.attributes['connection'] = c
            command.upgrade(config, 'head')
            assert list(c.scalars(text('SELECT version_num FROM alembic_version'))) == ['p0_0008']
            assert compare_metadata(MigrationContext.configure(c), Base.metadata) == []
            assert 'evidence_references' in inspect(c).get_table_names()
            assert 'p1_receipts' in inspect(c).get_table_names()
            if upgrade_p0:
                assert {n: [{key:row[key] for key in old_columns[n]} for row in c.execute(text(f'SELECT * FROM "{n}"')).mappings()] for n in tables} == before
                assert c.scalar(text('SELECT count(*) FROM waste_events WHERE regulatory_scope_status IS NOT NULL OR edibility_status IS NOT NULL OR classification_source IS NOT NULL'))==0
    finally:
        if factory is not None:
            factory.kw['bind'].dispose()
        try:
            if oid is not None:
                with engine.begin() as c:
                    drop_created_schema(c, schema, oid)
        finally:
            engine.dispose()
