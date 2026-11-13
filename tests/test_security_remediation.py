"""S1 remediation: real configured ingress and isolated PostgreSQL DDL races."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path
from queue import Queue
from threading import Event, current_thread
from uuid import uuid4
import os

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import event, select, text
from sqlalchemy.exc import DBAPIError
from uvicorn import Config as UvicornConfig

from auth_support import PASSWORDS, login_client
from test_demo_postgresql import database, verify_test_target, drop_created_schema
from test_security_postgresql import event_payload, wait_for_postgres_lock
from fwi.api.app import create_app
from fwi.application import security
from fwi.infrastructure.database.models import AuthSession, LoginThrottle
from fwi.infrastructure.database.security_seed import SITE_B
from fwi.infrastructure.database.session import create_engine_for_url
from fwi.infrastructure.ingress import local_server_config

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def runtime_client(app, peer='127.0.0.1'):
    config = local_server_config(app)
    assert config.proxy_headers is False and config.forwarded_allow_ips == ''
    assert config.host == '127.0.0.1' and config.access_log is False
    config.load()  # Exercise Uvicorn's actual loaded ASGI middleware stack.
    with TestClient(config.loaded_app, base_url=security.ORIGIN,
                    headers={'Origin': security.ORIGIN}, client=(peer, 50000)) as client:
        yield client


def attempt(client, username, password, spoof):
    client.headers['X-Forwarded-For'] = spoof
    preauth = client.get('/auth/preauth')
    assert preauth.status_code == 200
    return client.post('/auth/login', json={'username': username, 'password': password},
                       headers={'X-CSRF-Token': preauth.json()['csrf_token']})


def test_runtime_spoofed_xff_uses_one_socket_source_and_separate_real_peer(database):
    app = create_app()
    try:
        with runtime_client(app) as client:
            for index in range(30):
                response = attempt(client, f'unknown_{index}', 'synthetic-wrong-password', f'198.51.100.{index + 1}')
                assert response.status_code == 401
            assert attempt(client, 'site_a_writer', PASSWORDS['site_a_writer'], '127.0.0.2').status_code == 429
        with database() as session:
            assert session.get(LoginThrottle, security.digest('source:127.0.0.1')).failures == 30
            for index in range(30):
                assert session.get(LoginThrottle, security.digest(f'source:198.51.100.{index + 1}')) is None
        with runtime_client(app, '127.0.0.2') as genuine_other_peer:
            assert attempt(genuine_other_peer, 'site_a_writer', PASSWORDS['site_a_writer'], '198.51.100.99').status_code == 200
        with database() as session:
            assert session.get(LoginThrottle, security.digest('source:127.0.0.2')).failures == 0
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_runtime_account_limit_survives_changing_forwarding_headers(database):
    app = create_app()
    try:
        with runtime_client(app) as client:
            for index in range(5):
                assert attempt(client, 'site_a_writer', 'synthetic-wrong-password', f'127.0.0.{index + 2}').status_code == 401
            assert attempt(client, 'site_a_writer', PASSWORDS['site_a_writer'], '198.51.100.5').status_code == 429
            # A forwarding claim cannot turn HTTP into HTTPS either.
            assert client.get('http://127.0.0.1:5173/auth/preauth',
                              headers={'X-Forwarded-Proto': 'https'}).status_code == 403
        with runtime_client(app, '198.51.100.1') as public_peer:
            assert public_peer.get('/auth/preauth').status_code == 403
    finally:
        app.state.session_factory.kw['bind'].dispose()


def test_bare_default_uvicorn_entrypoint_fails_closed_without_trusted_ingress():
    app = create_app()
    config = UvicornConfig(app, proxy_headers=True, forwarded_allow_ips='127.0.0.1', access_log=False)
    config.load()
    with TestClient(config.loaded_app, base_url=security.ORIGIN,
                    headers={'Origin': security.ORIGIN}, client=('127.0.0.1', 50000)) as client:
        assert client.get('/auth/preauth').status_code == 403
        assert client.get('/auth/preauth', headers={'X-Forwarded-For': '127.0.0.2'}).status_code == 403


def test_denied_403_404_and_validation_do_not_extend_idle_activity(database):
    app = create_app()
    try:
        with runtime_client(app) as client:
            login_client(client)
            previous = security.now() - timedelta(minutes=20)
            secret = client.cookies.get(security.SESSION_COOKIE)
            with database() as session, session.begin():
                record = session.scalar(select(AuthSession).where(AuthSession.secret_hash == security.digest(secret)))
                record.last_seen_at = previous
            assert client.post('/demo/v0.1/events', json=event_payload(SITE_B)).status_code == 403
            assert client.get('/demo/v0.1/events/' + str(uuid4())).status_code == 404
            assert client.post('/demo/v0.1/events', json={}).status_code == 422
            with database() as session:
                record = session.scalar(select(AuthSession).where(AuthSession.secret_hash == security.digest(secret)))
                assert record.last_seen_at == previous
            assert client.get('/auth/session').status_code == 200
            with database() as session:
                record = session.scalar(select(AuthSession).where(AuthSession.secret_hash == security.digest(secret)))
                assert record.last_seen_at > previous
    finally:
        app.state.session_factory.kw['bind'].dispose()


def verify_owned_schema(connection, engine, schema):
    verify_test_target(connection, schema)
    identity = connection.execute(text(
        "SELECT oid, nspowner = (SELECT oid FROM pg_roles WHERE rolname=current_user) AS owned "
        "FROM pg_namespace WHERE nspname=:schema"), {'schema': schema}).mappings().one()
    assert identity['owned'] and identity['oid'] == engine._fwi_created_schema_oid
    connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
    assert connection.scalar(text('SHOW search_path')) == schema
    assert connection.scalar(text('SELECT current_schema()')) == schema


@contextmanager
def schema_connection(engine, schema):
    with engine.begin() as connection:
        verify_owned_schema(connection, engine, schema)
        yield connection


def config_for(connection):
    config = Config(str(ROOT / 'alembic.ini'))
    config.attributes['connection'] = connection
    return config


@pytest.fixture
def empty_auth_schema():
    url = os.getenv('FWI_TEST_DATABASE_URL')
    if not url:
        if os.getenv('FWI_REQUIRE_POSTGRES') == '1':
            pytest.fail('real PostgreSQL required')
        pytest.skip('PostgreSQL not configured')
    engine = create_engine_for_url(url)
    schema, oid = 'fwi_demo_test_' + uuid4().hex, None
    try:
        with engine.begin() as connection:
            verify_test_target(connection, schema)
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            created_oid = connection.scalar(text('SELECT oid FROM pg_namespace WHERE nspname=:s'), {'s': schema})
        oid = created_oid
        engine._fwi_created_schema_oid = oid
        with schema_connection(engine, schema) as connection:
            config = config_for(connection)
            command.upgrade(config, 'demo_0001')
            audit_id = uuid4()
            connection.execute(text("INSERT INTO audit_events(audit_id,entity_type,entity_id,action,actor,recorded_at) VALUES(:id,'fixture',:id,'created','synthetic-demo-actor',now())"), {'id': audit_id})
            # Historical rollback tests must stop before forward-only auth_0007.
            # This merge revision preserves both existing P0/P1 branches.
            command.upgrade(config, 'int_p1_0006')
            assert connection.scalar(text('SELECT version_num FROM alembic_version')) == 'int_p1_0006'
        yield engine, schema
    finally:
        if oid is not None:
            with engine.begin() as connection:
                drop_created_schema(connection, schema, oid)
            with engine.connect() as connection:
                verify_test_target(connection, schema)
                assert connection.scalar(text('SELECT oid FROM pg_namespace WHERE nspname=:s'), {'s': schema}) is None
        engine.dispose()


INSERT_PREAUTH = text("INSERT INTO auth_preauth(secret_hash,csrf_hash,expires_at,consumed) VALUES(:secret,:csrf,now()+interval '5 minutes',false)")
PARAMS = {'secret': '0' * 64, 'csrf': '1' * 64}  # synthetic verifiers, not credentials


def shape(engine, schema):
    with schema_connection(engine, schema) as connection:
        columns = connection.execute(text('SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=:s ORDER BY 1,2'), {'s': schema}).all()
        constraints = connection.execute(text('SELECT conname FROM pg_constraint WHERE connamespace=(SELECT oid FROM pg_namespace WHERE nspname=:s) ORDER BY 1'), {'s': schema}).all()
        return columns, constraints, connection.scalar(text('SELECT version_num FROM alembic_version')),


def observe_lock(engine, pid):
    # Same observed PostgreSQL blocking condition as the protected-write tests.
    def factory():
        from sqlalchemy.orm import Session
        return Session(engine)
    wait_for_postgres_lock(factory, pid)


def test_downgrade_locks_before_checks_and_concurrent_insert_cannot_commit(empty_auth_schema):
    engine, schema = empty_auth_schema
    locked, release = Event(), Event()
    writer_pid = Queue()
    def after_lock(conn, cursor, statement, parameters, context, executemany):
        if current_thread().name.startswith('downgrade') and statement.startswith('LOCK TABLE auth_principals'):
            locked.set()
            assert release.wait(8)
    event.listen(engine, 'after_cursor_execute', after_lock)
    def downgrade():
        with schema_connection(engine, schema) as connection:
            command.downgrade(config_for(connection), 'demo_0001')
    def insert():
        with schema_connection(engine, schema) as connection:
            writer_pid.put(connection.scalar(text('SELECT pg_backend_pid()')))
            connection.execute(INSERT_PREAUTH, PARAMS)
    try:
        with ThreadPoolExecutor(1, thread_name_prefix='downgrade') as d, ThreadPoolExecutor(1, thread_name_prefix='writer') as w:
            first = d.submit(downgrade)
            try:
                assert locked.wait(4)
                second = w.submit(insert)
                observe_lock(engine, writer_pid.get(timeout=4))
            finally:
                release.set()
            first.result(timeout=8)
            with pytest.raises(DBAPIError):
                second.result(timeout=8)
        with schema_connection(engine, schema) as connection:
            assert connection.scalar(text("SELECT to_regclass('auth_preauth')")) is None
            assert connection.scalar(text('SELECT version_num FROM alembic_version')) == 'demo_0001'
            assert connection.scalar(text('SELECT actor FROM audit_events')) == 'synthetic-demo-actor'
    finally:
        release.set()
        event.remove(engine, 'after_cursor_execute', after_lock)


def test_concurrent_writer_wins_downgrade_refuses_committed_evidence(empty_auth_schema):
    engine, schema = empty_auth_schema
    pids = Queue()
    before = shape(engine, schema)
    def downgrade():
        with schema_connection(engine, schema) as connection:
            pids.put(connection.scalar(text('SELECT pg_backend_pid()')))
            command.downgrade(config_for(connection), 'demo_0001')
    with ThreadPoolExecutor(1) as pool:
        with schema_connection(engine, schema) as connection:
            connection.execute(INSERT_PREAUTH, PARAMS)
            future = pool.submit(downgrade)
            observe_lock(engine, pids.get(timeout=4))
        with pytest.raises(RuntimeError, match='security evidence'):
            future.result(timeout=8)
    assert shape(engine, schema) == before
    with schema_connection(engine, schema) as connection:
        assert connection.scalar(text('SELECT count(*) FROM auth_preauth')) == 1


def test_downgrade_lock_timeout_has_no_partial_effects(empty_auth_schema):
    engine, schema = empty_auth_schema
    before, pids = shape(engine, schema), Queue()
    def downgrade():
        with schema_connection(engine, schema) as connection:
            connection.execute(text("SET LOCAL lock_timeout='1s'"))
            pids.put(connection.scalar(text('SELECT pg_backend_pid()')))
            command.downgrade(config_for(connection), 'demo_0001')
    with ThreadPoolExecutor(1) as pool:
        connection = engine.connect()
        transaction = connection.begin()
        try:
            verify_owned_schema(connection, engine, schema)
            connection.execute(INSERT_PREAUTH, PARAMS)
            future = pool.submit(downgrade)
            observe_lock(engine, pids.get(timeout=4))
            with pytest.raises(DBAPIError) as error:
                future.result(timeout=5)
            assert error.value.orig.sqlstate == '55P03'
        finally:
            transaction.rollback()
            connection.close()
    assert shape(engine, schema) == before


def test_downgrade_failure_after_real_drop_rolls_back_entire_schema(empty_auth_schema):
    engine, schema = empty_auth_schema
    before, witnessed = shape(engine, schema), []
    def after_drop(conn, cursor, statement, parameters, context, executemany):
        if statement.strip().startswith('DROP TABLE auth_write_intents'):
            assert cursor.connection.execute("SELECT to_regclass('auth_write_intents')").fetchone()[0] is None
            witnessed.append(True)
            raise RuntimeError('synthetic failure after actual PostgreSQL DROP')
    event.listen(engine, 'after_cursor_execute', after_drop)
    try:
        with pytest.raises(RuntimeError, match='after actual PostgreSQL DROP'):
            with schema_connection(engine, schema) as connection:
                command.downgrade(config_for(connection), 'demo_0001')
    finally:
        event.remove(engine, 'after_cursor_execute', after_drop)
    assert witnessed == [True]
    assert shape(engine, schema) == before
    with schema_connection(engine, schema) as connection:
        assert connection.scalar(text('SELECT actor FROM audit_events')) == 'synthetic-demo-actor'


@pytest.mark.parametrize('with_security_evidence', [False, True])
def test_auth_0007_downgrade_refuses_without_schema_or_data_changes(empty_auth_schema, with_security_evidence):
    engine, schema = empty_auth_schema
    with schema_connection(engine, schema) as connection:
        command.upgrade(config_for(connection), 'head')
        assert connection.scalar(text('SELECT version_num FROM alembic_version')) == 'auth_0007'
        if with_security_evidence:
            connection.execute(INSERT_PREAUTH, PARAMS)

    def snapshot():
        with schema_connection(engine, schema) as connection:
            names = connection.scalars(text(
                'SELECT table_name FROM information_schema.tables '
                "WHERE table_schema=:s AND table_type='BASE TABLE' ORDER BY table_name"), {'s': schema}).all()
            # Internal in-memory comparison only, never emit verifiers or data to logs.
            data = {name: connection.execute(text(f'SELECT * FROM "{name}"')).all() for name in names}
            return data, shape(engine, schema)

    before = snapshot()
    ddl = []
    def observe_ddl(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith(('DROP ', 'ALTER ', 'CREATE ', 'TRUNCATE ')):
            ddl.append(statement.split()[0])
    event.listen(engine, 'before_cursor_execute', observe_ddl)
    try:
        with pytest.raises(RuntimeError, match='membership security evidence/history must not be downgraded'):
            with schema_connection(engine, schema) as connection:
                command.downgrade(config_for(connection), 'int_p1_0006')
    finally:
        event.remove(engine, 'before_cursor_execute', observe_ddl)
    assert ddl == []
    assert snapshot() == before
