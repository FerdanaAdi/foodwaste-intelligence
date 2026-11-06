# FWI-INT-005 — Synthetic persistent backend capture

Implementation applied and verified on a feature branch; **REVIEW REQUIRED / browser E2E BLOCKED**.
Independent code review: **Antigravity APPROVE WITH CONDITIONS, as reported by Owner for aa2d33c**.
No published GitHub review record was returned during verification. See
[review reconciliation](fwi-int-005-review-reconciliation.md) for corrected mass bases,
D-01–D-06 mapping, microsecond evidence and the latest browser gate. This document
does not authorize merge/deployment or claim full FWI-03/FWI-04 validation.

Scope: isolated `/backend-demo/capture`, separate from QuickCapture and DemoStore. Based on merged main `8f64e62243076693c2c15e477fc531f8b5ed946f`, D-01–D-06 and W-20–W-25 Owner approval. No production authorization, authentication, government access, schema or methodology change. Original FWI-03/FWI-04 texts were not directly reviewed in the code sandbox.

## Setup and isolation

The existing backend demo API supports POST `/demo/v0.1/events` and POST `/demo/v0.1/events/{uuid}/measurements`. The dev proxy forwards only those two methods/paths and the two existing GET readers. Vite and FastAPI remain bound to local `127.0.0.1` only. Proxy strips `cookie`, `authorization`, and `proxy-authorization`, rejects a supplied foreign Origin and requires JSON content type. Native local clients without Origin remain allowed; this is **not** authentication. Vite CORS is disabled so its middleware cannot auto-approve an OPTIONS preflight ahead of the route guard. Do not deploy to any public network.

Org UUID `11111111-1111-4111-8111-111111111111` and Site UUID `22222222-2222-4222-8222-222222222222` refer to `src/fwi/infrastructure/database/demo_seed.py`. The seed must be explicitly present in the authorized **synthetic test database only** before capture. No auto-seed or data writes on startup. For testing, use pre-existing PostgreSQL 18 `fwi_test/fwi_demo_test` isolated UUID/OID/role guarded schema fixture. **Never** write to `fwi_demo_dev` or live systems.

## Capture and failure behavior

1. Create event using backend demo provisional `at_risk_surplus` or `actual_loss_discard` and aware `occurred_at`. The server generates a UUID and recorded time; the UI stores its UUID in the URL `?event=...` on validated 201.
2. Add multiple separate measurements to that event. Mass fields are strings or null; no Number/parseFloat, rounding, auto-net, default tare, aggregation, canonical measurement, review status, or conversion. Backend `Decimal` is authoritative for gross-tare-net. `measured_zero` requires legitimate gross=tare and net zero; missing/not_measured require all mass null. Method, provenance and aware measured_at are explicit.
3. Event creation+audit is one transaction; each measurement+audit is another transaction. Measurement failure **does not** delete/recreate its event. 422 is a rejected operation that may be corrected; unknown/5xx/network/timeout/malformed 201 is **not** safe to retry automatically.
4. A pending sessionStorage journal is written **before** each POST and cleared only on valid success or confirmed rejection. On refresh, any pending journal is treated as UNKNOWN and **blocks new POST**. For known events the read-only backend detail/history can aid human reconciliation, but matching record content does not prove which request created it. For event creation whose UUID was lost there is no request-ID lookup; an authorized operator must inspect DB out-of-band. Unlock requires explicit human confirmation and offers **no exactly-once guarantee**. Journal is local to this browser/tab family and not a durable cross-client deduplication solution.
5. After a successful POST, a subsequent GET failure is displayed as a **read failure**, without downgrading the confirmed POST. Deep-link and refresh make GET requests only. Two GETs are not an atomic snapshot.

## Patch reconciliation and fixes

The supplied ZIP was compared with actual main before application. Existing shell and routing
were changed minimally rather than replaced wholesale. No legacy QuickCapture/domain/fixture,
backend application source, dependency, schema or migration was changed.
Fixes include fail-closed journal-storage handling before POST, a retained lock when journal
cleanup fails after a confirmed save, clearing stale event context on route changes, associating
201 responses with all submitted mass/status/basis/method/provenance/time values, and the
Vite OPTIONS/CORS boundary defect exposed by the real proxy test. Decimal response comparison
uses string/BigInt normalization, never binary floating-point mass arithmetic; equivalent aware
timestamp offsets are accepted without losing input fractional-second comparison.

## Actual test evidence

On Windows: `npm run typecheck` PASS; `npm test` 98 PASS; `npm run test:proxy` 1 PASS;
`npm run build` PASS. Backend `FWI_REQUIRE_POSTGRES=1` with the private pgpass test URL:
`python -m pytest -q` 73 PASS, 6 subtests PASS, 0 skipped, including 14 PostgreSQL cases;
`python -I scripts/verify_kit.py` PASS. Existing deprecation warnings remain.

| Acceptance | Automated evidence | Real browser write E2E |
|---|---|---|
| W-20 unknown event POST | Client/UI one-POST and refresh/remount lock; real PostgreSQL commit followed by test-only 503 | BLOCKED / NOT RUN |
| W-21 unknown measurement POST | Known-event lock; real PostgreSQL commit followed by test-only 503 | BLOCKED / NOT RUN |
| W-22 correction after 422 | UI retains event and resubmits measurement to same UUID only | BLOCKED / NOT RUN |
| W-23 known UUID refresh | UI mount/deep-link reads only; no POST replay | BLOCKED / NOT RUN |
| W-24 decimal/null/zero | Wire/parser/UI tests plus existing real PostgreSQL precision/status constraints | BLOCKED / NOT RUN |
| W-25 write boundary | Real-loopback Vite allowlist, cross-origin/content-type rejection, methods and credential stripping | BLOCKED / NOT RUN |

The browser gate could initially read the current Chrome URL, but Computer Use then stopped
on opening a test tab because it could not determine the Windows browser URL with enough
confidence to enforce policy. No alternative browser automation was attempted. The previous
004B reader PASS is not evidence for this new writer. A fresh guarded schema and services
were started, but no browser event/measurement POST occurred before the stop. The schema
was cleaned using the existing identity/OID/ownership guard; test listeners were stopped.
Read-only snapshots of all five development business tables before/after matched (all empty).
The original untracked GOV file hash and frontend QA worktree were preserved.

## Browser resume plan

Once official browser access can identify and permit the Windows loopback URL, the implementer
must create a fresh guarded test schema and run the writer through Chrome, including W-20/W-21
test-only loss of acknowledgement after a real commit, refresh locks, W-22 correction, W-23
GET-only reload, W-24 exact string/null/zero and W-25 boundary inspection. Compare database/audit
counts after each attempt to prove no automatic duplicate. Clear any unknown lock only after
independent reconciliation; never interpret identical mass payloads as request identity.
Cleanup only the exact owned test schema. Browser permission cannot be bypassed with another driver.

## Reproducible tests

Tests: `frontend/tests/backend-write.test.ts`, `frontend/tests/backend-capture.test.tsx`,
`frontend/tests/backend-proxy.test.mjs`, plus `tests/test_demo_postgresql.py`. Run the
commands above using existing dependencies. No new dependency installation is required.

Preexisting backend auth, correction/supersession, scientific precision and vocabulary, idempotency-key strategy, production security, real SPPG operations, FWI-03 reconciliation and held OP-08/FI-02/NI-03 remain **OPEN/HELD**.
