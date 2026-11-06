# FWI-INT-005 — Linux Chromium CI integrity gate

Owner-authorized CI addendum. This is a separate Linux GitHub Actions Chromium
environment, not Windows Chrome and not a workaround for local Computer Use policy.
PR #15 stays Draft; no merge, deployment, methodology or application change is authorized.

## Execution and data boundary

- One `chromium-browser-integrity` job and one Chromium project, `workers: 1`,
  `retries: 0`, no automatic POST retries. `route.fetch` explicitly uses maxRetries=0
  and maxRedirects=0. Schema isolation is per test, not merely per worker.
- PostgreSQL 18 service: fwi_test/fwi_demo_test only. The disposable CI service uses
  trust authentication on the isolated runner, so no password is needed or recorded.
  No Windows PostgreSQL configuration or development database is accessed.
- CI-only Python harness refuses non-Linux/non-Actions execution. It reuses
  verify_test_target/drop_created_schema from repository tests. A random UUID4
  fwi_demo_test_ schema is checked before DDL, with recorded OID/current-role owner.
  Backend URL search_path points exactly to that schema and is checked before serving.
  Existing demo_0001 migration and explicit synthetic org/site seed only; no new migration.
- Manifests record schema/OID/owner/run token, never a URL/password. The OID is saved
  before CREATE's transaction commits, allowing recovery from process interruption.
- Each test shuts down its server and cleans in finally. An Actions `if: always()`
  step independently cleans only manifests belonging to the exact run token and
  verifies every owned schema is absent. Path, UUID, role/database/version/OID/owner
  checks fail closed; unrelated schemas are never cleanup targets.

## W-20/W-21 commit proof

Only these tests intercept the acknowledgement. They forward exactly one browser
POST via the actual Vite proxy to the unchanged FastAPI/PostgreSQL implementation,
require HTTP 201, inspect the corresponding committed row and exactly one matching
creation audit in PostgreSQL, and verify the server observed one POST on that path.
Only after this proof does the route return a synthetic 503 acknowledgement to Chromium.
UNKNOWN must lock submission and survive refresh. Tests compare complete row hashes,
record/audit counts, browser interception counts and server POST counts after refresh.
No PASS can result merely from mocking an HTTP failure or ignoring commit evidence.

## Other scenarios

W-22 sends an inconsistent mass (real 422), corrects it on the same UUID, and checks
no partial row/audit or new event. W-23 verifies read-after-write, direct refresh,
stable UUID and no GET mutation. W-24 creates five distinct statuses on one event,
checks exact long decimal/null/zero in PostgreSQL and rendered React, plus DemoStore
isolation. W-25 probes denied methods, foreign Origin and content type with the browser
request context and proves no write was forwarded. Boundary probes are not accepted
event/measurement POSTs and never replay one.

## Evidence and commands

Use existing `npm ci`, then `npx playwright install --with-deps chromium` and
`npm run test:e2e:ci` only in the authorized Linux CI job. Local `--list` and syntax
checks enumerate tests without launching a browser. No local browser-driver fallback.

The job always uploads HTML/JSON reports, database/identity/commit/POST-count evidence,
guarded cleanup results, and failure-only screenshots/retained traces with 7-day
retention. Only synthetic fixture content is included. No database credentials or
connection URLs are attached. `frontend/browser-evidence/cleanup.json` records the
final no-leftovers check. Failure screenshot/trace files exist only when a test fails.

## Verification status and residual review

**Linux Chromium Browser E2E PASS**, verified on 2026-11-06 in
[Actions run 42220461409](https://github.com/FerdanaAdi/foodwaste-intelligence/actions/runs/42220461409)
for PR head `c8c0df0ede3c092c345db3d5d92530a9d948f381` (Actions tests the PR merge ref).
All six W-20–W-25 tests passed: 0 failed, 0 skipped, 0 flaky, each retry=0; one worker.
Identity attachments confirm PostgreSQL 18.6 / fwi_test / fwi_demo_test for every test.
Windows Chrome writer E2E remains NOT RUN/BLOCKED; this result makes no Windows claim.

| Evidence | Verified result |
|---|---|
| W-20 event | UUID `303d40c3-d2f1-4752-ba49-06f65887e6fa`; exactly one POST/201, one event, zero measurements, three audits including org/site seed |
| W-21 measurement | Event `c8a534e0-a9fd-4e78-8faa-afaa696c497f`, measurement `a61b264e-ff46-4adb-b06f-0d88b302d0a4`; one measurement POST/201, one event, one measurement, four audits |
| Lost acknowledgement | Each committed row has exactly one matching creation audit before 503; UNKNOWN + refresh adds no POST/row/audit; complete database hashes remain equal |
| W-22 | POST statuses 201/422/201; one event/one measurement/four audits after correction |
| W-23 | UUID survives refresh; detail GETs preserve full database hash and POST count |
| W-24 | Event `704577f1-2fc4-4451-8e92-b35e28855251`; five distinct measurements, eight audits; exact Decimal/null/zero and distinct statuses, DemoStore separation |
| W-25 | Denied boundary probes forward zero POSTs; zero events/measurements and only two seed audits |
| Cleanup | Six per-test manifests verified absent individually and again in always-cleanup; cleanup_verified=true, remaining_owned_schemas=[] |
| Regression | 101 Vitest, one real proxy test, typecheck/build PASS; 76 backend tests + six subtests PASS, no skips, including 14 PostgreSQL cases; repository verification PASS |

W-20 pre/post hash: `610abb6ac75678f8b9e758275f69a3cae2049e5e1e7949457d73f417c207ae0b`.
W-21 pre/post hash: `38cd89f82c8998d3532e8e236bff0018903a063781c226fb2a66089f33b84efa`.
The downloaded JSON attachments were checked against counts, POST logs, saved UUIDs,
identity and cleanup manifests; these are database reads, not mocked persistence.
Artifact `chromium-integrity-42220461409-1` contains the reports and attachments (7 days).

The first run, [42219459042](https://github.com/FerdanaAdi/foodwaste-intelligence/actions/runs/42219459042),
had two passes/four failures because exact select-label selectors included option text.
Its failure screenshots/traces and six-schema successful cleanup were uploaded.
Only those test selectors were corrected; no application fix or automatic retry occurred.
The passing run used fresh schemas. No local development database or QA worktree was accessed for writes.

The prior independent review was reported by Owner for aa2d33c. This new test/CI
delta still needs independent review and Owner evidence approval. The application
still has no exactly-once/auth guarantee; the session journal is not cross-client
deduplication. Held KPIs remain disabled. Original FWI-01/02/03/04 sources remain
unavailable; test PASS is not full methodological or production validation.

Dependency audit during this task reported existing Vitest/tinypool/@vitest/mocker
advisories (2 critical, 1 moderate). The lock diff adds only pinned @playwright/test
1.65.0 and its two Playwright packages; existing affected versions were not changed.
No forced major dependency upgrade was applied; this requires separate dependency review.
