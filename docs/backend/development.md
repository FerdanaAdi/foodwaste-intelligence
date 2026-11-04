# FWI Backend — Local Development (FWI-BE-001)

Status: **PROPOSED** packaging/dependency baseline (ADR-001 §16 leaves the
dependency tool unlocked). Exact pins of direct dependencies live in
`pyproject.toml`; no separate requirements files. Adopting a real lockfile
is a future owner decision.

## Prerequisites

- Python **3.14.x** (ADR-001). Windows: `winget install Python.Python.3.14`.
- PostgreSQL 18.x (ADR-002) — **optional for FWI-BE-001**: no tables,
  migrations, or connections exist yet.

## Setup

```bash
py -3.14 -m venv .venv
# Windows (Git Bash)
.venv/Scripts/python -m pip install -e ".[dev]"
# Linux/macOS
.venv/bin/python -m pip install -e ".[dev]"
```

## Run locally

```bash
.venv/Scripts/python -m uvicorn fwi.api.app:app --reload
# http://127.0.0.1:8000/health
```

No database URL is required to start. To configure PostgreSQL:

```bash
export FWI_DATABASE_URL="postgresql+psycopg://USER:PASSWORD@localhost:5432/fwi"
```

Rules: the URL comes only from the environment (never committed), only
`postgresql*` schemes are accepted, and importing the app or creating the
engine never opens a connection. `/health` reports
`database.connectivity: "not_checked"` because this endpoint never touches
the database.

## Tests

```bash
.venv/Scripts/python -m pytest
```

Domain and API tests run without a live PostgreSQL (ADR-001 §15).
