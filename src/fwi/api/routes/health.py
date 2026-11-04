"""Health endpoint.

The response is honest about the database: connectivity is never claimed
because this endpoint does not touch the database at all (ADR-001 keeps
import and startup connection-free).
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class DatabaseHealth(BaseModel):
    configured: bool
    connectivity: Literal["not_checked"]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    database: DatabaseHealth


@router.get("/health", response_model=HealthResponse)
def read_health(request: Request) -> HealthResponse:
    """Liveness of the API process only; not a PostgreSQL health probe."""
    return HealthResponse(
        status="ok",
        service="foodwaste-intelligence",
        version=request.app.version,
        database=DatabaseHealth(
            configured=request.app.state.session_factory is not None,
            connectivity="not_checked",
        ),
    )
