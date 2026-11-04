import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from fwi import __version__
from fwi.api.app import APP_TITLE, create_app
from fwi.infrastructure.database.session import DATABASE_URL_ENV

POSTGRES_URL = "postgresql+psycopg://fwi:fwi@localhost:5432/fwi_test"


def client_for(**env: str) -> TestClient:
    environment = {DATABASE_URL_ENV: env.get(DATABASE_URL_ENV, "")}
    with patch.dict(os.environ, environment, clear=False):
        if not env.get(DATABASE_URL_ENV):
            os.environ.pop(DATABASE_URL_ENV, None)
        app = create_app()
    return TestClient(app)


class AppInitializationTests(unittest.TestCase):
    def test_create_app_returns_fastapi_with_metadata(self):
        app = create_app()
        self.assertIsInstance(app, FastAPI)
        self.assertEqual(app.title, APP_TITLE)
        self.assertEqual(app.version, __version__)

    def test_startup_without_database_url(self):
        app = create_app()
        self.assertIsNone(app.state.database_url)
        self.assertIsNone(app.state.session_factory)

    def test_startup_with_database_url_needs_no_live_postgresql(self):
        with patch.dict(os.environ, {DATABASE_URL_ENV: POSTGRES_URL}):
            app = create_app()
        self.assertIsNotNone(app.state.session_factory)


class HealthEndpointTests(unittest.TestCase):
    def test_health_contract_without_database(self):
        response = client_for().get("/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["service"], "foodwaste-intelligence")
        self.assertEqual(body["version"], __version__)
        self.assertFalse(body["database"]["configured"])
        # The endpoint never touches the database, so it must not claim
        # PostgreSQL health either way.
        self.assertEqual(body["database"]["connectivity"], "not_checked")

    def test_health_reports_configured_database_without_connectivity_claim(self):
        response = client_for(**{DATABASE_URL_ENV: POSTGRES_URL}).get("/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["database"]["configured"])
        self.assertEqual(body["database"]["connectivity"], "not_checked")


if __name__ == "__main__":
    unittest.main()
