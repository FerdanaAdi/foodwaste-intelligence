import os
import unittest
from unittest.mock import patch

from sqlalchemy.orm import Session, sessionmaker

from fwi.infrastructure.database.session import (
    DATABASE_URL_ENV,
    create_session_factory,
    database_url_from_environment,
    session_scope,
)

POSTGRES_URL = "postgresql+psycopg://fwi:fwi@localhost:5432/fwi_test"


class RecordingSession:
    """Test double that records transaction-relevant calls."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def commit(self) -> None:
        self.calls.append("commit")

    def rollback(self) -> None:
        self.calls.append("rollback")

    def close(self) -> None:
        self.calls.append("close")


class DatabaseUrlTests(unittest.TestCase):
    def test_unset_environment_means_not_configured(self):
        with patch.dict(os.environ) as environment:
            environment.pop(DATABASE_URL_ENV, None)
            self.assertIsNone(database_url_from_environment())

    def test_configured_url_is_returned(self):
        with patch.dict(os.environ, {DATABASE_URL_ENV: POSTGRES_URL}):
            self.assertEqual(database_url_from_environment(), POSTGRES_URL)


class SessionFactoryTests(unittest.TestCase):
    def test_rejects_non_postgresql_url(self):
        with self.assertRaises(ValueError):
            create_session_factory("sqlite:///fwi.db")

    def test_session_lifecycle_needs_no_live_postgresql(self):
        # Creating/closing a session executes no SQL, so this works
        # without a running PostgreSQL server.
        factory = create_session_factory(POSTGRES_URL)
        self.assertIsInstance(factory, sessionmaker)
        session = factory()
        try:
            self.assertIsInstance(session, Session)
        finally:
            session.close()


class SessionScopeTests(unittest.TestCase):
    def test_scope_closes_without_implicit_commit(self):
        session = RecordingSession()
        with session_scope(lambda: session):
            session.calls.append("used")
        self.assertEqual(session.calls, ["used", "close"])

    def test_scope_closes_on_error_without_commit_or_rollback(self):
        session = RecordingSession()
        with self.assertRaises(RuntimeError):
            with session_scope(lambda: session):
                raise RuntimeError("use case failed")
        self.assertEqual(session.calls, ["close"])


if __name__ == "__main__":
    unittest.main()
