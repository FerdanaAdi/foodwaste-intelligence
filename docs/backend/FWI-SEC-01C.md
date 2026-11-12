# FWI-SEC-01C — authenticated frontend and private intent integration

Status: **IMPLEMENTED LOCALLY / INDEPENDENT REVIEW REQUIRED**. No Gate A or
full FR-001 acceptance. Branch `codex/fwi-sec-01b-1`, unchanged baseline HEAD
`e3d4cac3a8bd3eb640d421b5c3f27351d11115dc`. All S1 and C work is uncommitted.

## Authority and boundaries

Owner's Authentication Context Binding decision supplied in this conversation
on 2026-11-07 authorizes additive non-secret response binding and frontend/tests.
It does not authorize certificates, trust-store changes, dependencies, schema
changes, commit/push/PR or deployment. Existing S1 migration/dependency work is
preserved; C introduces no migration or dependency. ADR-004 is unchanged.
Synthetic-only; independent of BGN; OP-08/FI-02/NI-03 remain HELD.
Owner reports Antigravity S1 READY FOR NEXT INTEGRATION; that is supplied
provenance, not independent verification of this new frontend/context delta.

## Additive backend contract

- `GET /auth/session` adds `auth_context_id`, the existing session UUID, alongside
  `principal_id`, CSRF and explicit site permissions. Two sessions for the same
  principal have different context UUIDs. UUIDs are metadata, never credentials.
- Protected responses bind `X-FWI-Principal` and `X-FWI-Auth-Context` to the actual
  request's authorizing transaction context. Final endpoint authorization replaces
  preliminary dependency context; no separate post-response session lookup occurs.
- Login binds newly issued session metadata; logout binds the revoked session.
  401 has no context headers. Existing generic 401/403/concealed 404 and
  `Cache-Control: no-store` remain. Metadata does not bypass server authorization.
- Backend files: `src/fwi/application/security.py`, `src/fwi/api/routes/auth.py`,
  `src/fwi/api/routes/demo.py`, `src/fwi/api/app.py`. Regression:
  `tests/test_auth_context.py` (actual PostgreSQL, two sessions, fake UUID cookie,
  cross-actor recovery, concealed foreign UUID and logout).

## Frontend state and privacy contract

`checking -> anonymous/blocked -> ready` requires validated cookie-backed
`/auth/session` metadata. CSRF, granted sites and principal/session context stay
in memory. Login first obtains pre-auth CSRF; no credential persistence or retry.
An unsupported origin or absent BroadcastChannel fails closed.

Each protected asynchronous operation captures principal, session UUID, selected
site and generation. Metadata is checked before accepting a body and the captured
context is checked again after parsing. Context/site changes cancel requests and
reset keyed private UI; late responses are ignored even if abort is ignored.
401/403 or missing/mismatched context close private state. Logout closes it before
dispatch; ambiguous logout remains blocked and requires GET verification.

BroadcastChannel carries only transition/settled signals. Blur, hidden/pagehide
close private views; focus/pageshow revalidate external cookie/permission changes.
Draft credential fields clear on generation changes. There is **no absolute
cross-tab guarantee**: external cookie changes without browser lifecycle events
are detected at the next protected response/revalidation, not instantaneously.
Frontend controls are defense in depth; backend authorization is authoritative.

## UNKNOWN recovery

Register an authorized private server intent before the single domain POST.
Registration is separate from domain dispatch and not idempotency. A context
change before registration acknowledgement prevents subsequent domain dispatch.
Ambiguous domain/registration responses never trigger automatic replay.

Recovery is authenticated GET, scoped by server principal/membership and active
site. `registered` with no result remains **UNCONFIRMED**, blocks new capture and
is never deleted or inferred failed. `committed` supplies only an authorized GET
link. Browser sessionStorage contains an opaque non-authorizing marker only, no
actor/site/event/payload or credentials. A legacy unbound JSON journal is neither
displayed nor deleted: the route remains closed for authorized reconciliation.

Limitation: a definitively rejected/undispatched operation can leave a registered
intent. After reload this conservatively blocks capture; a future authorized
resolution policy is needed. No unsafe unlock, intent deletion or POST retry is
introduced. Same-actor sessions may recover that actor's authorized server intent;
their in-flight UI contexts remain distinct. Other actors cannot recover it.

## Exact frontend and harness scope

- Runtime: `frontend/src/backend/auth.ts`, `client.ts`, `write.ts`;
  `frontend/src/components/layout/BackendAuthBoundary.tsx`, `AppLayout.tsx`;
  `frontend/src/App.tsx`, `frontend/src/pages/BackendCapturePage.tsx`.
- Proxy/unit configuration: `frontend/vite.config.ts`, `frontend/vitest.config.ts`.
- Tests: `frontend/tests/backend-auth-fixture.ts`, `backend-auth.test.tsx`,
  `backend-capture.test.tsx`, `backend-detail.test.tsx`, `backend-write.test.ts`,
  `backend-proxy.test.mjs`, `app.test.tsx`.
- Prepared, not browser-executed: `frontend/playwright.config.mjs`,
  `frontend/e2e/persistent-capture.spec.mjs`, `scripts/browser_e2e_harness.py`;
  fail-before-DB TLS guard test in `tests/test_browser_harness_guards.py`.
- Documentation: this file, `docs/ai/HANDOFF.md`, `docs/backend/development.md`,
  historical-flow warning in `docs/backend/synthetic-demo-walkthrough.md`.

## HTTPS and browser gate

Only browser origin `https://127.0.0.1:5173`, backend TLS loopback port 8000.
Existing Owner-authorized files must be supplied via `FWI_TLS_CERTFILE`,
`FWI_TLS_KEYFILE`, `FWI_BACKEND_CA_FILE`. The certificate must cover IP 127.0.0.1;
browser trust must already be approved/configured. No creation/install, OS trust
change, `ignoreHTTPSErrors` or verification bypass is part of this task.

Vite verifies backend CA and forwards only approved auth/demo paths, methods and
FWI cookies. Unrelated credentials/forwarding headers are stripped. Protected
cleartext/missing-TLS traffic fails closed. In-memory screens can still run without
TLS; they do not prove authenticated integration. Host-only cookies do not isolate
ports on 127.0.0.1; other local services remain a security-review concern.

The prepared browser harness refuses fixture creation without existing TLS and
private per-run synthetic credentials. It retains role/database/PG18/schema UUID/
OID/owner guards and finally cleanup on fwi_test/fwi_demo_test only. Retries=0,
workers=1; domain POST counts exclude security registration/login operations.
Auth traces are disabled because raw traces can expose Cookie/CSRF/credentials;
an approved sanitizer is needed before recording them. Screenshots and redacted
business/audit evidence remain prepared. No browser pass is claimed.

## Verification evidence — implementer, 2026-11-07

- Required PostgreSQL environment: `FWI_REQUIRE_POSTGRES=1`,
  `FWI_TEST_DATABASE_URL=postgresql+psycopg://fwi_test@127.0.0.1:5432/fwi_demo_test`;
  private pgpass, never printed. `.venv/Scripts/python.exe -B -m pytest -q -x`:
  **113 PASS + 6 subtests PASS**, 0 FAIL/SKIP. Includes two new context tests and
  missing-TLS harness guard; earlier S1-only 110-test evidence remains historical.
- `npm run typecheck`: PASS. Final `npm test`: **118 PASS**, 0 FAIL/SKIP;
  targeted `npm test -- tests/backend-auth.test.tsx`: **15 PASS**, including
  late A/B, same-principal new session, logout in flight, cross-tab, delayed intent,
  missing/mismatched metadata, denied permissions and site switch privacy.
- `npm run test:proxy`: **2 PASS, 1 SKIP**, 0 FAIL. The skipped positive TLS W-25
  test is BLOCKED by absent approved TLS files; unit fail-closed checks are not
  end-to-end proxy forwarding evidence.
- `npm run build`: PASS after final runtime refinements.
- `python -I scripts/verify_kit.py`, `python -m pip check`, `git diff --check`:
  PASS. JavaScript E2E/config syntax checks PASS. Read-only PostgreSQL check:
  fwi_test/fwi_demo_test/PostgreSQL 18.6; zero remaining `fwi_demo_test_` schemas.
- Real authenticated Chrome/Chromium, TLS socket and W-20–W-25 browser rerun:
  **BLOCKED / NOT RUN**. Unit W-20–W-25 regression is not a browser result.
- Existing Starlette/httpx and Alembic deprecation warnings remain; no dependency
  updates authorized. PostgreSQL concurrency evidence belongs to backend tests,
  not browser lifecycle/network simulation.

## Independent review and next task

Review this complete dirty S1+C tree, particularly context binding, abort/generation
checks, tab lifecycle privacy, opaque storage and conservative recovery. Frontend
tests use explicit fetch/BroadcastChannel fixtures; they cannot prove real-browser
cookie/TLS, multi-process tab timing or deployment behavior. Gate A/full FR-001
remain unclaimed. Next: obtain existing approved TLS configuration (or separate
certificate permission), execute authenticated browser W-20–W-25 and security
scenarios on guarded isolated schemas, independently review evidence. No development
database use, public endpoint, real SPPG data, methodology or held-KPI changes.

## Full working-tree status at handoff

Includes preserved earlier S1 changes; no files staged, no commit/push.

```text
 M docs/ai/HANDOFF.md
 M docs/backend/development.md
 M docs/backend/synthetic-demo-walkthrough.md
 M frontend/e2e/persistent-capture.spec.mjs
 M frontend/playwright.config.mjs
 M frontend/src/App.tsx
 M frontend/src/backend/client.ts
 M frontend/src/backend/write.ts
 M frontend/src/components/layout/AppLayout.tsx
 M frontend/src/pages/BackendCapturePage.tsx
 M frontend/tests/app.test.tsx
 M frontend/tests/backend-capture.test.tsx
 M frontend/tests/backend-detail.test.tsx
 M frontend/tests/backend-proxy.test.mjs
 M frontend/tests/backend-write.test.ts
 M frontend/vite.config.ts
 M frontend/vitest.config.ts
 M pyproject.toml
 M scripts/browser_e2e_harness.py
 M src/fwi/api/app.py
 M src/fwi/api/routes/demo.py
 M src/fwi/application/demo.py
 M src/fwi/infrastructure/database/models.py
 M src/fwi/infrastructure/database/session.py
 M tests/test_browser_harness_guards.py
 M tests/test_demo_postgresql.py
?? FWI-GOV-001_Codex_Task.md
?? docs/backend/FWI-SEC-01B-1.md
?? docs/backend/FWI-SEC-01C.md
?? frontend/src/backend/auth.ts
?? frontend/src/components/layout/BackendAuthBoundary.tsx
?? frontend/tests/backend-auth-fixture.ts
?? frontend/tests/backend-auth.test.tsx
?? migrations/versions/auth_0002.py
?? src/fwi/api/routes/auth.py
?? src/fwi/application/security.py
?? src/fwi/infrastructure/database/security_seed.py
?? src/fwi/infrastructure/ingress.py
?? tests/auth_support.py
?? tests/test_auth_context.py
?? tests/test_security_postgresql.py
?? tests/test_security_remediation.py
```
