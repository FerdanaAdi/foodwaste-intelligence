"""No database/browser required: fail-closed CI harness boundary checks."""
import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('browser_e2e_harness', Path(__file__).resolve().parents[1] / 'scripts/browser_e2e_harness.py')
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)


def test_browser_harness_refuses_non_ci_execution(monkeypatch):
    monkeypatch.delenv('GITHUB_ACTIONS', raising=False)
    with pytest.raises(RuntimeError):
        harness.guard_environment()


def test_cleanup_refuses_another_execution_before_database_access(monkeypatch):
    monkeypatch.setattr(harness, 'TOKEN', 'this-run')
    with pytest.raises(RuntimeError, match='another execution'):
        harness.clean(None, {'run_token': 'other-run', 'schema': 'fwi_demo_test_' + '0' * 32})


def test_manifest_path_cannot_escape_owned_directory():
    with pytest.raises(RuntimeError, match='outside repository'):
        harness.manifest_path('../../unrelated')
