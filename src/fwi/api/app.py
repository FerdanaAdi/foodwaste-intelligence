"""FWI FastAPI application factory.

The database is optional at startup: when ``FWI_DATABASE_URL`` is not set
the application still starts (synthetic/offline development) and
``GET /health`` reports the database as not configured.
"""

from __future__ import annotations

from fastapi import FastAPI

from fwi import __version__
from fwi.api.routes import demo, health
from fwi.infrastructure.database.session import (
    create_session_factory,
    database_url_from_environment,
)

APP_TITLE = "FoodWaste Intelligence (FWI) Backend"


def create_app() -> FastAPI:
    """Build the FWI FastAPI application.

    Creating the engine never opens a connection, so importing this module
    or starting the app does not require a live PostgreSQL server.
    """
    app = FastAPI(title=APP_TITLE, version=__version__)

    database_url = database_url_from_environment()
    app.state.database_url = database_url
    app.state.session_factory = (
        create_session_factory(database_url) if database_url else None
    )

    app.include_router(health.router)
    app.include_router(demo.router)
    return app


app = create_app()
