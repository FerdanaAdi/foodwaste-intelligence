"""Real UUID-owned PostgreSQL downgrade safety, no development/Owner DB access."""
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from threading import Event
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import event, text
import pytest

from test_security_remediation import empty_auth_schema, schema_connection, config_for, shape, observe_lock
from fwi.infrastructure.database.migration_safety import disposable_downgrade_permit


def plain_config(connection):
    config = config_for(connection)
    del config.attributes['fwi_disposable_downgrade']
    return config


def seeds(engine, schema):
    organization, site = uuid4(), uuid4()
    with schema_connection(engine, schema) as connection:
        connection.execute(text("INSERT INTO organizations(organization_id,name,recorded_at) VALUES(:o,'synthetic safety org',now())"), {'o':organization})
        connection.execute(text("INSERT INTO sites(site_id,organization_id,name,recorded_at) VALUES(:s,:o,'synthetic safety site',now())"), {'s':site,'o':organization})
    return organization, site


def insert_receipt(connection, identifiers):
    organization, site = identifiers
    connection.execute(text("INSERT INTO p1_receipts(receipt_id,organization_id,site_id,source_ref,received_at,recorded_at) VALUES(:r,:o,:s,'synthetic protected receipt',now(),now())"),
                       {'r':uuid4(),'o':organization,'s':site})


def test_ordinary_downgrade_refuses_before_any_ddl(empty_auth_schema, monkeypatch):
    engine, schema = empty_auth_schema
    before = shape(engine,schema)
    ddl = []
    def observe(conn,cursor,statement,parameters,context,executemany):
        if statement.lstrip().upper().startswith(('DROP ','ALTER ','CREATE ','TRUNCATE ')):ddl.append(statement)
    event.listen(engine,'before_cursor_execute',observe)
    monkeypatch.setenv('FWI_ALLOW_DOWNGRADE','1')  # environment strings cannot grant a permit
    try:
        with pytest.raises(RuntimeError,match='ordinary downgrade prohibited'):
            with schema_connection(engine,schema) as connection:
                command.downgrade(plain_config(connection),'auth_0002')
    finally:event.remove(engine,'before_cursor_execute',observe)
    assert ddl == [] and shape(engine,schema) == before


def test_disposable_permit_rechecks_oid_search_path_and_exact_connection(empty_auth_schema):
    engine, schema = empty_auth_schema
    with schema_connection(engine,schema) as connection:
        oid = engine._fwi_created_schema_oid
        with pytest.raises(RuntimeError,match='OID/owner'):
            disposable_downgrade_permit(connection,schema,oid+1)
        with pytest.raises(RuntimeError,match='UUID'):
            disposable_downgrade_permit(connection,'public',oid)
        permit = disposable_downgrade_permit(connection,schema,oid)
        config = plain_config(connection);config.attributes['fwi_disposable_downgrade'] = permit
        connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
        with pytest.raises(RuntimeError,match='identity/search_path'):
            command.downgrade(config,'auth_0002')
    with schema_connection(engine,schema) as different:
        config = plain_config(different);config.attributes['fwi_disposable_downgrade'] = permit
        with pytest.raises(RuntimeError,match='ordinary downgrade prohibited'):
            command.downgrade(config,'auth_0002')


@pytest.mark.parametrize('history',['p1','p2','audit'])
def test_even_explicit_disposable_permit_cannot_erase_p1_p2_history(empty_auth_schema,history):
    engine,schema = empty_auth_schema
    identifiers = seeds(engine,schema)
    with schema_connection(engine,schema) as connection:
        if history=='p1':insert_receipt(connection,identifiers)
        elif history=='p2':
            connection.execute(text("INSERT INTO p2_kpi_registry(kpi_code,formula_version,description,design_status,data_readiness_gate,source_doc_revision,effective_at,change_reason,recorded_at) VALUES('OP-08','synthetic-held','synthetic held','held','blocked','synthetic source','2026-11-13','test',now())"))
        else:
            connection.execute(text("INSERT INTO audit_events(audit_id,entity_type,entity_id,action,actor,recorded_at) VALUES(:i,'p1_receipts',:i,'fixture','synthetic-demo-actor',now())"),{'i':uuid4()})
    before = shape(engine,schema)
    with pytest.raises(RuntimeError,match='P1/P2 .*history exists|P1/P2 data/history exists'):
        with schema_connection(engine,schema) as connection:
            command.downgrade(config_for(connection),'auth_0002')
    assert shape(engine,schema)==before
    with schema_connection(engine,schema) as connection:
        assert connection.scalar(text('SELECT count(*) FROM audit_events')) == (2 if history=='audit' else 1)
        assert connection.scalar(text('SELECT count(*) FROM p1_receipts')) == (1 if history=='p1' else 0)
        assert connection.scalar(text('SELECT count(*) FROM p2_kpi_registry')) == (1 if history=='p2' else 0)


def test_writer_committed_before_guard_inspection_wins_and_downgrade_refuses(empty_auth_schema):
    engine,schema=empty_auth_schema;identifiers=seeds(engine,schema);pids=Queue();before=shape(engine,schema)
    def downgrade():
        with schema_connection(engine,schema) as connection:
            pids.put(connection.scalar(text('SELECT pg_backend_pid()')))
            command.downgrade(config_for(connection),'auth_0002')
    with ThreadPoolExecutor(1) as pool:
        with schema_connection(engine,schema) as connection:
            insert_receipt(connection,identifiers)
            future=pool.submit(downgrade)
            observe_lock(engine,pids.get(timeout=4))
        with pytest.raises(RuntimeError,match='P1/P2 data/history exists'):future.result(timeout=8)
    assert shape(engine,schema)==before
    with schema_connection(engine,schema) as connection:
        assert connection.scalar(text('SELECT count(*) FROM p1_receipts'))==1


def test_guard_locks_writer_until_failed_downgrade_rolls_back_all_ddl(empty_auth_schema):
    engine,schema=empty_auth_schema;identifiers=seeds(engine,schema);before=shape(engine,schema)
    locked,release=Event(),Event();pids=Queue();witnessed=[]
    def observe(conn,cursor,statement,parameters,context,executemany):
        if statement.startswith('LOCK TABLE "'+schema+'".'):
            locked.set();assert release.wait(8)
        if statement.strip().startswith('DROP TABLE IF EXISTS p1_receipts'):
            assert cursor.connection.execute("SELECT to_regclass('p1_receipts')").fetchone()[0] is None
            witnessed.append(True);raise RuntimeError('synthetic after actual P1 DROP')
    event.listen(engine,'after_cursor_execute',observe)
    def downgrade():
        with schema_connection(engine,schema) as connection:command.downgrade(config_for(connection),'auth_0002')
    def write():
        with schema_connection(engine,schema) as connection:
            pids.put(connection.scalar(text('SELECT pg_backend_pid()')))
            insert_receipt(connection,identifiers)
    try:
        with ThreadPoolExecutor(1) as downgrades,ThreadPoolExecutor(1) as writers:
            first=downgrades.submit(downgrade)
            try:
                assert locked.wait(4)
                second=writers.submit(write)
                observe_lock(engine,pids.get(timeout=4))
            finally:release.set()
            with pytest.raises(RuntimeError,match='after actual P1 DROP'):first.result(timeout=8)
            second.result(timeout=8)
    finally:
        release.set();event.remove(engine,'after_cursor_execute',observe)
    assert witnessed==[True] and shape(engine,schema)==before
    with schema_connection(engine,schema) as connection:
        assert connection.scalar(text('SELECT count(*) FROM p1_receipts'))==1
        assert connection.scalar(text('SELECT actor FROM audit_events'))=='synthetic-demo-actor'
