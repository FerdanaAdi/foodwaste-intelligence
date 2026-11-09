"""Real PostgreSQL tests for master reference persistence/API (FR-002 read scope).

OD-ZC02-1..6 mapping decisions and Gate B write policy stay OPEN: no write
route and no invented vocabulary values; fixtures insert through the trusted
persistence adapter only.
"""

import datetime as dt

import pytest

from auth_support import PASSWORDS, TestClient, login_client
from fwi.api.app import create_app
from fwi.application import master
from test_demo_postgresql import database  # noqa: F401  (shared real-PostgreSQL fixture)


SYNTHETIC_STAGE = dict(namespace='stage', code='synthetic_stage_example', version=1,
                       status='active', label='Contoh tahap sintetis (provisional)',
                       definition='Fixture uji; bukan vocabulary resmi',
                       changed_by='synthetic-fixture')


def test_reference_versions_persist_and_history_is_ordered(database):
    first = master.insert_reference(database, dict(SYNTHETIC_STAGE, changed_at=dt.datetime.now(dt.timezone.utc)))
    second = master.insert_reference(database, dict(SYNTHETIC_STAGE, version=2, status='inactive',
        label='Contoh tahap sintetis v2', supersedes_version=1,
        changed_at=dt.datetime.now(dt.timezone.utc)))
    assert first['version'] == 1 and second['supersedes_version'] == 1
    client = TestClient(create_app())
    history = client.get('/demo/v0.1/master/references/history',
                         params={'namespace': 'stage', 'code': 'synthetic_stage_example'})
    assert history.status_code == 200
    versions = history.json()['versions']
    assert [v['version'] for v in versions] == [1, 2]  # full append-only history retained
    assert versions[0]['status'] == 'active' and versions[1]['status'] == 'inactive'


def test_inactive_latest_version_hides_code_and_never_resurrects_older(database):
    """FIX 1 regression: v1 active -> v2 inactive must not resurface as v1."""
    master.insert_reference(database, dict(SYNTHETIC_STAGE, changed_at=dt.datetime.now(dt.timezone.utc)))
    master.insert_reference(database, dict(SYNTHETIC_STAGE, version=2, status='inactive',
        label='Contoh tahap sintetis v2', supersedes_version=1,
        changed_at=dt.datetime.now(dt.timezone.utc)))
    client = TestClient(create_app())
    active_only = client.get('/demo/v0.1/master/references', params={'namespace': 'stage'}).json()
    assert active_only == []  # latest (v2) inactive -> code hidden, no v1 fallback
    including = client.get('/demo/v0.1/master/references',
                           params={'namespace': 'stage', 'include_inactive': 'true'}).json()
    assert [row['version'] for row in including] == [2]  # latest overall, not v1
    history = client.get('/demo/v0.1/master/references/history',
                         params={'namespace': 'stage', 'code': 'synthetic_stage_example'}).json()
    assert [v['version'] for v in history['versions']] == [1, 2]  # history still shows both


def test_active_latest_version_remains_listed(database):
    master.insert_reference(database, dict(SYNTHETIC_STAGE, changed_at=dt.datetime.now(dt.timezone.utc)))
    master.insert_reference(database, dict(SYNTHETIC_STAGE, version=2, status='active',
        label='Contoh tahap sintetis v2', supersedes_version=1,
        changed_at=dt.datetime.now(dt.timezone.utc)))
    client = TestClient(create_app())
    listing = client.get('/demo/v0.1/master/references', params={'namespace': 'stage'}).json()
    assert [row['version'] for row in listing] == [2]


def test_master_registry_is_structurally_global_shared(database):
    """DEC-P0-ACCESS-01: shared global classification is structural — the
    persisted reference schema has no site/organization scope columns, so no
    private site data can exist in this registry by construction."""
    from fwi.infrastructure.database.models import MasterReference
    columns = {column.name for column in MasterReference.__table__.columns}
    assert not (columns & {'site_id', 'organization_id'}), 'master rows must stay scope-free'
    client = TestClient(create_app())
    master.insert_reference(database, dict(SYNTHETIC_STAGE, changed_at=dt.datetime.now(dt.timezone.utc)))
    # Any authenticated principal may read the shared catalog (DEC-P0-ACCESS-01).
    other = TestClient(create_app())
    login_client(other, 'site_b_writer', PASSWORDS['site_b_writer'])
    assert other.get('/demo/v0.1/master/references').status_code == 200


def test_master_writes_are_not_authorized_for_anyone(database):
    """DEC-P0-ACCESS-01: create/update/delete stay disabled; no mutation route."""
    client = TestClient(create_app())
    assert client.post('/demo/v0.1/master/namespaces').status_code == 405  # route does not exist
    response = client.post('/demo/v0.1/master/references',
                           json={'namespace': 'stage', 'code': 'x', 'version': 1,
                                 'status': 'active', 'label': 'x'})
    assert response.status_code == 405


def test_duplicate_version_identity_is_rejected_by_database(database):
    master.insert_reference(database, dict(SYNTHETIC_STAGE, changed_at=dt.datetime.now(dt.timezone.utc)))
    with pytest.raises(Exception):
        # Same (namespace, code, version) violates the unique constraint.
        master.insert_reference(database, dict(SYNTHETIC_STAGE, changed_at=dt.datetime.now(dt.timezone.utc)))


def test_unknown_reference_history_is_not_found(database):
    client = TestClient(create_app())
    response = client.get('/demo/v0.1/master/references/history',
                          params={'namespace': 'stage', 'code': 'missing'})
    assert response.status_code == 404


def test_master_namespaces_list_provisional_examples_only(database):
    client = TestClient(create_app())
    body = client.get('/demo/v0.1/master/namespaces').json()
    names = {row['namespace'] for row in body}
    assert {'food_item', 'material_category', 'unit', 'stage', 'reason', 'method'} <= names
    assert all('kpi' != row['namespace'] for row in body)  # reserved namespace absent
    assert all(row['code_count'] == 0 for row in body)  # registries start empty


def test_master_requires_authenticated_session(database):
    from fwi.application import security
    app = create_app()
    client = TestClient(app)
    client.cookies.pop(security.SESSION_COOKIE, None)
    assert client.get('/demo/v0.1/master/namespaces').status_code in (401, 403)
