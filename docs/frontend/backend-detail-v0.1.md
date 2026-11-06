# FWI-INT-003 — Isolated backend detail

PROVISIONAL / synthetic-only. Base: main `98bbbbd`. Implements FR-003/004
read visibility and applicable AC-02/03/05/06/08/15/16; not full P0 acceptance.
Original FWI-02/03/04 documents are unavailable locally. The repo domain contract
and approved ADR-001/002/003 govern this limited implementation.

## Usage and data source

Start the existing FastAPI app on `127.0.0.1:8000` with a privately supplied
`FWI_DATABASE_URL` pointing to the verified synthetic database. From `frontend`,
run `npm run dev`, open `/backend-demo`, and enter an existing backend event UUID.
Direct links use `/backend-demo/events/<uuid>` and survive page refresh.
An empty migrated database has no event to read: no seed runs at startup.
Do not write development fixtures without separate target confirmation and owner approval.

The development proxy binds loopback and forwards only GET event/detail-history
paths to fixed `http://127.0.0.1:8000`. Non-GET is rejected before forwarding;
cookie/authorization headers are removed. This is a development convenience,
not backend access control. Vite preview/production hosting is not configured as
an API proxy; a production build is not deployment authorization.

The existing ledger/capture/review/export routes still use DemoStore. The new page
never reads or writes that store. API errors never fall back to in-memory records.
Two independent GETs are explicitly not an atomic snapshot. Event failure hides
history; history failure leaves event visible with an error, not an empty list.
Reload/route changes cancel requests and ignore stale results. The 10-second
timeout is a reversible UI resource limit, not a methodological threshold.

## Contract boundaries

- DTOs and runtime parsers are independent of frontend domain types. UUIDs,
  event association, unique measurement IDs, required fields, explicit timezone
  and calendar validity, supported provisional codes, decimal strings and nulls
  are checked. Invalid responses fail as a whole per resource.
- Mass values are never converted through Number/parseFloat, calculated,
  rounded, aggregated, or selected as canonical. Server domain validation remains
  authoritative for gross/tare/net consistency; the response parser is not a
  second scientific calculation engine.
- All five observation statuses are rendered as received, including estimated.
  Measured-zero gross/tare/net follows the current backend demo contract.
  No estimated-to-weighed mapping or synthesized validation status is added.
- Six mass bases remain unchanged, including `as_served`. Backend event types
  are never mapped to frontend stream types. Vocabulary remains provisional.
- Timestamps are displayed verbatim with their response offset. These offsets
  identify instants; PostgreSQL does not preserve the original input timezone label.
- Unsupported original input text, precision/instrument metadata, validation and
  review are disclosed as unavailable, not reconstructed. No schema/API changes.
- Held KPIs OP-08/FI-02/NI-03 remain disabled. No auth, real data, evidence,
  government integration, transfer, disposition, or rescue is introduced.

## Reproducible verification

Frontend: `npm run typecheck`, `npm test`, `npm run test:proxy`, `npm run build`.
Vitest/RTL covers every status, exact long decimal/nulls, UUID identity on refresh,
invalid UUID, HTTP 404/503, network/JSON/contract failure, partial history failure,
timeout and stale requests, plus navigation back to uncontaminated DemoStore.
The proxy test uses ephemeral loopback HTTP servers and overrides the target only
inside the test; it checks GET-only forwarding and header stripping.

Backend: with private pgpass and
`FWI_TEST_DATABASE_URL=postgresql+psycopg://fwi_test@127.0.0.1:5432/fwi_demo_test`
and `FWI_REQUIRE_POSTGRES=1`, run `.venv/Scripts/python -m pytest -q`, then
`.venv/Scripts/python -I scripts/verify_kit.py`.
The new PostgreSQL test consumes `frontend/tests/fixtures/backend-detail.json`,
creates one event and five measurements via the existing API, and verifies repeated
GETs preserve identities, values and all rows in all five business tables, including
audit. Setup and cleanup use the existing role/database/PG18/UUID/OID-guarded fixture.
Development data is not written. No new migration is introduced.

Actual local results: 78 Vitest tests passed; proxy HTTP test passed; typecheck and
production build passed; backend 71 passed, 6 subtests passed, 0 skipped; kit PASS.
The PostgreSQL subset is 12 tests (11 existing + 1 read-only contract test).
Existing backend deprecation warnings remain. Automated layers cover React, proxy,
and real PostgreSQL/API separately; a full interactive browser-to-PostgreSQL smoke
session is not claimed by these results.

## Review handoff / open decisions

Antigravity: inspect `frontend/src/backend/`, the new page, proxy boundary, shared
fixture and read-only PostgreSQL assertion. Confirm no semantic coercion, source
fallback, hidden writes, mass aggregation, or unsupported approval badges.
Event taxonomy, observation/estimation dimensionality, scientific precision,
net-only measurement policy, reconciliation/correction, auth and deployment remain
open. They do not require decisions for this isolated reader. Human PR approval
is required before merge; no deployment or real-world validation is claimed.
