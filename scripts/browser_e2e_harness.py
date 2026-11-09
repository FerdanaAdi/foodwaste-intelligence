"""Explicit local/CI PostgreSQL fixture control; no development targets."""
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
from fwi.infrastructure.ingress import local_server_config
from fwi.api.app import create_app
from fwi.infrastructure.database.demo_seed import seed_demo
from fwi.infrastructure.database.security_seed import seed_security, PERSONAS
from fwi.infrastructure.database.models import AuthSession, WriteIntent
from fwi.application.security import now, revoke_session
from datetime import timedelta
from sqlalchemy import update
from fwi.infrastructure.database.models import Base
from fwi.infrastructure.database.session import create_engine_for_url, create_session_factory
from test_demo_postgresql import verify_test_target, drop_created_schema

EVIDENCE = ROOT / 'frontend/browser-evidence'
MANIFESTS = EVIDENCE / 'manifests'
TOKEN = os.environ.get('FWI_BROWSER_RUN_TOKEN')


def guard_environment():
    ci = os.environ.get('GITHUB_ACTIONS') == 'true' and sys.platform == 'linux'
    local = os.environ.get('FWI_LOCAL_SYNTHETIC_DEMO') == '1'
    if not TOKEN or not (ci or local):
        raise RuntimeError('requires authorized Linux CI or explicit local synthetic demo opt-in')
    if local:
        url = make_url(os.environ['FWI_TEST_DATABASE_URL'])
        if (url.host != '127.0.0.1' or url.port != 5432 or url.username != 'fwi_test'
                or url.database != 'fwi_demo_test' or url.password is not None or url.query):
            raise RuntimeError('local demo requires password-free loopback fwi_test/fwi_demo_test URL; use pgpass')


def emit(value):
    print(json.dumps(value, default=str), flush=True)


def persist(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2, default=str), encoding='utf-8')
    # Windows may briefly deny replacement while another process scans the file.
    # Retry only evidence-file I/O, never a database operation or domain POST.
    for attempt in range(5):
        try:
            temporary.replace(path)
            break
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(.05 * (2 ** attempt))


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
            if record.get('run_token') != TOKEN:
                continue  # Never clean schemas/evidence belonging to another run.
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
    tls = {key: os.environ.get(key) for key in ('FWI_TLS_CERTFILE', 'FWI_TLS_KEYFILE', 'FWI_BACKEND_CA_FILE')}
    if not all(value and Path(value).is_file() for value in tls.values()):
        raise RuntimeError('approved existing TLS files required before creating a browser fixture')
    passwords = {name: os.environ.get('FWI_BROWSER_' + name.upper(), '') for name in PERSONAS}
    if any(len(value) < 16 for value in passwords.values()):
        raise RuntimeError('private per-run synthetic credentials required')
    engine = create_engine_for_url(os.environ['FWI_TEST_DATABASE_URL'])
    schema = 'fwi_demo_test_' + uuid4().hex
    record = {'schema': schema, 'oid': None, 'run_token': TOKEN, 'cleanup_verified': False}
    factory = app = server = thread = None
    posts = []
    auth_http = []
    operations = []
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
            if revision != 'int_p1_0006':
                raise RuntimeError('unexpected migration baseline')
            identity = dict(connection.execute(text('SELECT current_user AS role,current_database() AS database,version() AS version')).mappings().one())
        seed_demo(factory)
        seed_security(factory, passwords)
        # Explicit owned-browser-fixture seed; never application startup.
        from fwi.infrastructure.database.p2_seed import seed_kpi_registry
        seed_kpi_registry(factory)
        os.environ['FWI_DATABASE_URL'] = scoped.render_as_string(hide_password=False)
        app = create_app()

        async def observed_app(scope, receive, send):
            status = None
            if scope['type'] == 'http' and scope['path'].startswith('/auth/'):
                headers = dict(scope['headers'])
                auth_http.append({'path': scope['path'], 'scheme': scope['scheme'],
                    'origin_allowed': headers.get(b'origin') == b'https://127.0.0.1:5173',
                    'referer_allowed': headers.get(b'referer', b'').startswith(b'https://127.0.0.1:5173/'),
                    'fetch_site': headers.get(b'sec-fetch-site', b'').decode('ascii', errors='replace')})
            async def observed_send(message):
                nonlocal status
                if message['type'] == 'http.response.start':
                    status = message['status']
                await send(message)
            try:
                await app(scope, receive, observed_send)
            finally:
                if scope['type'] == 'http' and scope['method'] == 'POST':
                    operations.append({'path': scope['path'], 'status': status})
                if scope['type'] == 'http' and scope['method'] == 'POST' and scope['path'].startswith('/demo/v0.1/'):
                    posts.append({'path': scope['path'], 'status': status})

        server_config = local_server_config(observed_app, port=8000,
            ssl_certfile=tls['FWI_TLS_CERTFILE'], ssl_keyfile=tls['FWI_TLS_KEYFILE'])
        # Bound test teardown even if an HTTP client retains a TLS connection.
        # Cleanup still refuses while the server thread remains alive.
        server_config.timeout_graceful_shutdown = 3
        server = uvicorn.Server(server_config)
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
                    # Never export credential/session/CSRF verifiers to browser artifacts.
                    data = {t.name: [dict(r) for r in session.execute(select(t).order_by(*t.primary_key.columns)).mappings()] for t in Base.metadata.sorted_tables if not t.name.startswith('auth_')}
                    # Explicit allowlist: no session cookie/verifier, password or CSRF material.
                    intents = [dict(r) for r in session.execute(select(WriteIntent.intent_id,
                        WriteIntent.principal_id, WriteIntent.site_id, WriteIntent.kind,
                        WriteIntent.state, WriteIntent.event_id, WriteIntent.result_id)).mappings()]
                emit({'data': data, 'counts': {k: len(v) for k, v in data.items()},
                      'sha256': hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest(), 'posts': list(posts),
                      'auth_http': list(auth_http), 'operations': list(operations), 'intents': intents})
            elif request['command'] == 'stop':
                break
            elif request['command'] in ('expire_sessions', 'revoke_sessions'):
                with factory() as session, session.begin():
                    verify_test_target(session.connection(), schema)
                    if session.scalar(text('SELECT current_schema()')) != schema:
                        raise RuntimeError('fixture scope mismatch')
                    owned_oid = session.scalar(text('SELECT oid FROM pg_namespace WHERE nspname=:s '
                        'AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)'), {'s': schema})
                    if owned_oid != record['oid']:
                        raise RuntimeError('fixture OID/owner mismatch')
                    if request['command'] == 'expire_sessions':
                        session.execute(update(AuthSession).values(expires_at=now() - timedelta(seconds=1)))
                    else:
                        sessions = list(session.execute(select(AuthSession.principal_id, AuthSession.session_id)))
                if request['command'] == 'revoke_sessions':
                    for principal_id, session_id in sessions:
                        revoke_session(factory, principal_id, session_id)
                emit({'expired': request['command'] == 'expire_sessions', 'revoked': request['command'] == 'revoke_sessions'})
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
        frames = []
        frame = error.__traceback__
        while frame:
            frames.append({'file': Path(frame.tb_frame.f_code.co_filename).name,
                           'line': frame.tb_lineno})
            frame = frame.tb_next
        emit({'harness_error': type(error).__name__, 'frames': frames})
        sys.exit(1)
