# FWI Backend — Local Development (FWI-BE-001)

> Current security branch: protected browser capture now requires the authenticated
> HTTPS contract in [FWI-SEC-01C.md](FWI-SEC-01C.md). Only existing Owner-authorized
> `FWI_TLS_CERTFILE`, `FWI_TLS_KEYFILE`, `FWI_BACKEND_CA_FILE` may configure Vite
> (`https://127.0.0.1:5173`) and local backend TLS (`https://127.0.0.1:8000`).
> Missing TLS fails closed; HTTP health-only instructions below do not authorize
> protected browser access. No certificate creation or trust-store change here.

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

## Health-only bootstrap

```bash
.venv/Scripts/python -m uvicorn fwi.api.app:app --host 127.0.0.1 --no-proxy-headers --reload
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

## Protected synthetic authentication ingress (S1)

The bare app command above is for `/health` only; protected routes fail closed
without the trusted ingress boundary. Use `local_server_config` from
`fwi.infrastructure.ingress` with `create_app()` when starting a protected server.
It fixes host to `127.0.0.1`, disables Uvicorn proxy-header interpretation, captures
the direct socket peer and strips client forwarding headers before the app.
Supply an already-authorized `ssl_certfile` and `ssl_keyfile` to that config and
run `uvicorn.Server(config).run()`. Do not wrap it in another trusted-proxy layer.
Without TLS, protected endpoints still reject requests. No production proxy
profile, certificate installation or trust-store change is authorized here.
See `FWI-SEC-01B-1.md` for isolated database and remaining browser integration gates.

## Tests

```bash
.venv/Scripts/python -m pytest
```

Domain and API tests run without a live PostgreSQL (ADR-001 §15).
