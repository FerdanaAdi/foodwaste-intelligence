"""No database/browser required: fail-closed CI harness boundary checks."""
import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('browser_e2e_harness', Path(__file__).resolve().parents[1] / 'scripts/browser_e2e_harness.py')
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)


def test_browser_harness_refuses_non_ci_execution(monkeypatch):
    monkeypatch.delenv('GITHUB_ACTIONS', raising=False)
    monkeypatch.delenv('FWI_LOCAL_SYNTHETIC_DEMO', raising=False)
    with pytest.raises(RuntimeError):
        harness.guard_environment()


def test_local_demo_requires_run_token_and_exact_safe_url(monkeypatch):
    monkeypatch.delenv('GITHUB_ACTIONS', raising=False)
    monkeypatch.setenv('FWI_LOCAL_SYNTHETIC_DEMO', '1')
    safe = 'postgresql+psycopg://fwi_test@127.0.0.1:5432/fwi_demo_test'
    monkeypatch.setenv('FWI_TEST_DATABASE_URL', safe)
    monkeypatch.setattr(harness, 'TOKEN', None)
    with pytest.raises(RuntimeError):
        harness.guard_environment()
    monkeypatch.setattr(harness, 'TOKEN', 'local-test-run')
    harness.guard_environment()
    for unsafe in (safe.replace('fwi_demo_test', 'fwi_demo_dev'),
                   safe.replace('fwi_test@', 'fwi_dev@'),
                   safe.replace('127.0.0.1', 'remote.example'),
                   safe.replace('5432', '5433'),
                   safe.replace('fwi_test@', 'fwi_test:synthetic@'),
                   safe + '?options=-csearch_path=public'):
        monkeypatch.setenv('FWI_TEST_DATABASE_URL', unsafe)
        with pytest.raises(RuntimeError):
            harness.guard_environment()


def test_cleanup_refuses_another_execution_before_database_access(monkeypatch):
    monkeypatch.setattr(harness, 'TOKEN', 'this-run')
    with pytest.raises(RuntimeError, match='another execution'):
        harness.clean(None, {'run_token': 'other-run', 'schema': 'fwi_demo_test_' + '0' * 32})


def test_manifest_path_cannot_escape_owned_directory():
    with pytest.raises(RuntimeError, match='outside repository'):
        harness.manifest_path('../../unrelated')


def test_evidence_replace_retries_only_transient_file_permission_error(monkeypatch, tmp_path):
    replace = Path.replace
    calls = []
    def transient(source, target):
        calls.append(target)
        if len(calls) == 1:
            raise PermissionError('synthetic transient file lock')
        return replace(source, target)
    monkeypatch.setattr(Path, 'replace', transient)
    monkeypatch.setattr(harness.time, 'sleep', lambda _: None)
    target = tmp_path / 'evidence.json'
    harness.persist(target, {'cleanup_verified': True})
    assert len(calls) == 2
    assert target.read_text().find('true') != -1


def test_evidence_replace_fails_closed_after_bounded_attempts(monkeypatch, tmp_path):
    calls = []
    def denied(source, target):
        calls.append(target)
        raise PermissionError('synthetic permanent file lock')
    monkeypatch.setattr(Path, 'replace', denied)
    monkeypatch.setattr(harness.time, 'sleep', lambda _: None)
    with pytest.raises(PermissionError):
        harness.persist(tmp_path / 'evidence.json', {})
    assert len(calls) == 5


def test_bulk_cleanup_selects_only_current_run_manifests(monkeypatch, tmp_path):
    monkeypatch.setattr(harness, 'MANIFESTS', tmp_path)
    monkeypatch.setattr(harness, 'TOKEN', 'current-run')
    monkeypatch.setenv('FWI_TEST_DATABASE_URL', 'synthetic-test-placeholder')
    engine = type('Engine', (), {'dispose': lambda self: None})()
    monkeypatch.setattr(harness, 'create_engine_for_url', lambda _: engine)
    cleaned = []
    monkeypatch.setattr(harness, 'clean', lambda _, record: cleaned.append(record['schema']))
    monkeypatch.setattr(harness, 'persist', lambda *_: None)
    monkeypatch.setattr(harness, 'emit', lambda *_: None)
    for suffix, token in [('a', 'current-run'), ('b', 'other-run')]:
        schema = 'fwi_demo_test_' + suffix
        (tmp_path / (schema + '.json')).write_text(json.dumps({'schema': schema, 'run_token': token}))
    harness.cleanup_all()
    assert cleaned == ['fwi_demo_test_a']
