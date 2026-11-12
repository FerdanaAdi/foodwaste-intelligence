"""SQLAlchemy engine/session boundary (ADR-001 §12–13, ADR-002).

Rules kept by this module:

- reading configuration or creating the engine/session factory never
  opens a database connection;
- the database URL comes only from the environment — no committed
  credentials, no default URL that would silently point somewhere;
- only PostgreSQL URLs are accepted (SQLite is not the canonical FWI
  database);
- ``session_scope`` performs no commit and no rollback: transaction
  decisions are owned by the application/use-case layer. Closing the
  session releases the connection, which is SQLAlchemy's safety net
  for any still-open transaction.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Callable

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

DATABASE_URL_ENV = "FWI_DATABASE_URL"


def database_url_from_environment() -> str | None:
    """Return the configured database URL, or ``None`` when not set."""
    return os.environ.get(DATABASE_URL_ENV) or None


def create_engine_for_url(database_url: str) -> Engine:
    """Create a SQLAlchemy engine for a PostgreSQL URL.

    ``create_engine`` does not connect; the first connection happens when
    a session actually executes statements.
    """
    if not database_url.startswith("postgresql"):
        raise ValueError(
            "FWI only accepts PostgreSQL database URLs (ADR-002); "
            f"got: {database_url.split(':', 1)[0]}:..."
        )
    return create_engine(database_url, pool_pre_ping=True, isolation_level='READ COMMITTED')


def create_session_factory(database_url: str) -> sessionmaker[Session]:
    """Create a session factory bound to one engine per process."""
    engine = create_engine_for_url(database_url)
    return sessionmaker(bind=engine)


@contextmanager
def session_scope(
    session_factory: Callable[[], Session],
) -> Iterator[Session]:
    """Yield one session and guarantee cleanup.

    Deliberately does NOT commit or rollback — the caller (application
    layer) owns the transaction boundary (ADR-001 §12).
    """
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
