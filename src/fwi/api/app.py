"""FWI FastAPI application factory.

The database is optional at startup: when ``FWI_DATABASE_URL`` is not set
the application still starts (synthetic/offline development) and
``GET /health`` reports the database as not configured.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError

from fwi import __version__
from fwi.api.routes import auth, demo, health, p1, p2, completion
from fwi.application import security
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
    app.include_router(auth.router)
    app.include_router(demo.router)
    app.include_router(completion.router)
    app.include_router(p1.router)
    app.include_router(p2.router)
    @app.exception_handler(RequestValidationError)
    async def invalid_input(request: Request, error):
        # Pydantic's default input echo can include credentials. Never return it.
        errors = [{'loc': list(e['loc']), 'type': e['type'], 'msg': 'invalid input'} for e in error.errors()]
        return JSONResponse({'detail': errors}, status_code=422, headers={'Cache-Control': 'no-store'})
    @app.exception_handler(security.Denied)
    async def denied(request: Request, error):
        messages = {400: 'invalid request', 401: 'authentication required', 403: 'forbidden',
                    404: 'not found', 409: 'operation not available', 429: 'login temporarily unavailable',
                    503: 'service unavailable'}
        return JSONResponse({'detail': messages[error.status]}, status_code=error.status,
                            headers={'Cache-Control': 'no-store'})

    @app.exception_handler(SQLAlchemyError)
    async def database_failure(request: Request, error):
        return JSONResponse({'detail': 'service unavailable'}, status_code=503,
                            headers={'Cache-Control': 'no-store'})

    @app.middleware('http')
    async def private_response(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith(('/auth/', '/demo/', '/p1/', '/p2/')):
            response.headers['Cache-Control'] = 'no-store'
            identity = getattr(request.state, 'auth_context', None)
            if identity and response.status_code != 401:
                response.headers['X-FWI-Principal'] = identity[0]
                response.headers['X-FWI-Auth-Context'] = identity[1]
        return response
    return app


app = create_app()
