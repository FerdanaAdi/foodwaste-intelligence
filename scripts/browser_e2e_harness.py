"""CI-only PostgreSQL/ASGI fixture control; no production or development targets."""
import hashlib
import json
import os
import sys
import threading
import time
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
import uvicorn
from fwi.api.app import create_app
from fwi.infrastructure.database.demo_seed import seed_demo
from fwi.infrastructure.database.models import Base
from fwi.infrastructure.database.session import create_engine_for_url, create_session_factory
from test_demo_postgresql import verify_test_target, drop_created_schema

EVIDENCE = ROOT / 'frontend/browser-evidence'
MANIFESTS = EVIDENCE / 'manifests'
TOKEN = os.environ.get('FWI_BROWSER_RUN_TOKEN')


def guard_environment():
    if os.environ.get('GITHUB_ACTIONS') != 'true' or not TOKEN or sys.platform != 'linux':
        raise RuntimeError('browser harness requires the authorized Linux CI job')


def emit(value):
    print(json.dumps(value, default=str), flush=True)


def persist(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2, default=str), encoding='utf-8')
    temporary.replace(path)


def manifest_path(schema):
    path = (MANIFESTS / (schema + '.json')).resolve()
    if path.parent != MANIFESTS.resolve():
        raise RuntimeError('manifest outside repository evidence directory')
    return path


def clean(engine, record):
    if record['run_token'] != TOKEN:
        raise RuntimeError('manifest belongs to another execution')
    schema = record['schema']
    with engine.begin() as connection:
        verify_test_target(connection, schema)
        oid = connection.scalar(text('SELECT oid FROM pg_namespace WHERE nspname=:s'), {'s': schema})
        if oid is not None:
            # Existing guard re-verifies exact OID, current owner, UUID, role, DB, PG18.
            drop_created_schema(connection, schema, record['oid'])
    with engine.connect() as connection:
        verify_test_target(connection, schema)
        if connection.scalar(text('SELECT oid FROM pg_namespace WHERE nspname=:s'), {'s': schema}) is not None:
            raise RuntimeError('owned schema remains after cleanup')
    record['cleanup_verified'] = True
    persist(manifest_path(schema), record)


def cleanup_all():
    engine = create_engine_for_url(os.environ['FWI_TEST_DATABASE_URL'])
    cleaned = []
    try:
        for path in sorted(MANIFESTS.glob('fwi_demo_test_*.json')):
            record = json.loads(path.read_text(encoding='utf-8'))
            if path.resolve() != manifest_path(record['schema']):
                raise RuntimeError('manifest name mismatch')
            clean(engine, record)
            cleaned.append(record['schema'])
        result = {'run_token': TOKEN, 'owned_schemas_checked': cleaned, 'remaining_owned_schemas': [], 'cleanup_verified': True}
        persist(EVIDENCE / 'cleanup.json', result)
        emit(result)
    finally:
        engine.dispose()


def serve():
    engine = create_engine_for_url(os.environ['FWI_TEST_DATABASE_URL'])
    schema = 'fwi_demo_test_' + uuid4().hex
    record = {'schema': schema, 'oid': None, 'run_token': TOKEN, 'cleanup_verified': False}
    factory = app = server = thread = None
    posts = []
    try:
        with engine.begin() as connection:
            verify_test_target(connection, schema)
            persist(manifest_path(schema), record)
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            record['oid'] = connection.scalar(text('SELECT oid FROM pg_namespace WHERE nspname=:s'), {'s': schema})
            if not connection.scalar(text('SELECT nspowner = (SELECT oid FROM pg_roles WHERE rolname=current_user) FROM pg_namespace WHERE nspname=:s'), {'s': schema}):
                raise RuntimeError('created schema owner mismatch')
            record['owner'] = 'fwi_test'
            # Save the OID before COMMIT so the always-cleanup can recover a killed process.
            persist(manifest_path(schema), record)
        scoped = make_url(os.environ['FWI_TEST_DATABASE_URL']).update_query_dict({'options': '-csearch_path=' + schema})
        factory = create_session_factory(scoped.render_as_string(hide_password=False))
        with factory.kw['bind'].begin() as connection:
            verify_test_target(connection, schema)
            if connection.scalar(text('SELECT current_schema()')) != schema:
                raise RuntimeError('backend schema differs from owned fixture')
            config = Config(str(ROOT / 'alembic.ini'))
            config.attributes['connection'] = connection
            command.upgrade(config, 'head')
            revision = connection.scalar(text('SELECT version_num FROM alembic_version'))
            if revision != 'demo_0001':
                raise RuntimeError('unexpected migration baseline')
            identity = dict(connection.execute(text('SELECT current_user AS role,current_database() AS database,version() AS version')).mappings().one())
        seed_demo(factory)
        os.environ['FWI_DATABASE_URL'] = scoped.render_as_string(hide_password=False)
        app = create_app()

        async def observed_app(scope, receive, send):
            status = None
            async def observed_send(message):
                nonlocal status
                if message['type'] == 'http.response.start':
                    status = message['status']
                await send(message)
            try:
                await app(scope, receive, observed_send)
            finally:
                if scope['type'] == 'http' and scope['method'] == 'POST':
                    posts.append({'path': scope['path'], 'status': status})

        server = uvicorn.Server(uvicorn.Config(observed_app, host='127.0.0.1', port=8000, log_level='warning', access_log=False))
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        deadline = time.monotonic() + 15
        while not server.started:
            if not thread.is_alive() or time.monotonic() > deadline:
                raise RuntimeError('test backend did not start')
            time.sleep(.05)
        emit({'ready': True, **record, 'identity': identity, 'revision': revision})
        for line in sys.stdin:
            request = json.loads(line)
            if request['command'] == 'snapshot':
                with factory() as session:
                    data = {t.name: [dict(r) for r in session.execute(select(t).order_by(*t.primary_key.columns)).mappings()] for t in Base.metadata.sorted_tables}
                emit({'data': data, 'counts': {k: len(v) for k, v in data.items()},
                      'sha256': hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest(), 'posts': list(posts)})
            elif request['command'] == 'stop':
                break
            else:
                raise RuntimeError('unsupported harness command')
    finally:
        if server:
            server.should_exit = True
        if thread:
            thread.join(15)
            if thread.is_alive():
                raise RuntimeError('backend alive; refusing schema cleanup')
        if app and app.state.session_factory:
            app.state.session_factory.kw['bind'].dispose()
        if factory:
            factory.kw['bind'].dispose()
        try:
            if record['oid'] is not None:
                clean(engine, record)
        finally:
            engine.dispose()
        emit({'closed': True, **record})


if __name__ == '__main__':
    try:
        guard_environment()
        if len(sys.argv) == 2 and sys.argv[1] == 'cleanup':
            cleanup_all()
        elif len(sys.argv) == 2 and sys.argv[1] == 'serve':
            serve()
        else:
            raise RuntimeError('unsupported harness mode')
    except Exception as error:
        # Never print connection URLs, environment, SQL parameters, or credentials.
        emit({'harness_error': type(error).__name__})
        sys.exit(1)
