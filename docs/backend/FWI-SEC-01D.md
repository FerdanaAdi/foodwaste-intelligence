# FWI-SEC-01D — HTTPS browser and reviewed UX integration

Status: **LOCAL VERIFICATION / INDEPENDENT DELTA REVIEW REQUIRED**.
Branch `codex/fwi-sec-01b-1`; baseline HEAD unchanged:
`e3d4cac3a8bd3eb640d421b5c3f27351d11115dc`.
No Gate A or complete FR-001 approval is claimed.

## Authority and review provenance

Owner's submitted SEC-01D task permits temporary test-only loopback TLS creation,
authenticated browser testing and integration of four reviewed UX candidates.
Owner separately approved stopping exactly the old Vite PID 19276 (5173) and
Python PID 19000 (8000) in this conversation. No database was stopped or modified
by stopping those services. Trusted origins were not expanded to avoid conflict.

Owner reports Antigravity SEC-01C READY FOR NEXT INTEGRATION and UX-01 APPROVE FOR
INTEGRATION, with no outstanding BLOCKER/HIGH/MEDIUM findings. Those are supplied
review provenance; no independent review of this new D delta has yet occurred.
All prior S1/C dirty changes and user-owned files remain preserved.

## TLS profile and safety

Existing Git OpenSSL generated one RSA-2048 self-signed certificate, one-day
validity, IP SAN 127.0.0.1. Certificate/key were created under a fresh
`%TEMP%/fwi-sec01d-<UUID>` directory with inherited ACLs disabled and access granted
only to the current Windows user. No key content was printed or stored in Git.
There was no installation, CA registration, OS/browser trust-store change,
public binding, development-database access or security-contract bypass.

Process-only environment:

```text
FWI_TLS_CERTFILE=<private temporary directory>/loopback.crt
FWI_TLS_KEYFILE=<private temporary directory>/loopback.key
FWI_BACKEND_CA_FILE=<same certificate>
NODE_EXTRA_CA_CERTS=<same certificate, for test Node processes only>
FWI_LOCAL_SYNTHETIC_DEMO=1
FWI_TEST_TEMPORARY_TLS=1
FWI_BROWSER_RUN_TOKEN=<fresh execution UUID>
FWI_TEST_DATABASE_URL=postgresql+psycopg://fwi_test@127.0.0.1:5432/fwi_demo_test
```

This opt-in local Playwright profile alone sets `ignoreHTTPSErrors` for the
temporary self-signed certificate, including web-server readiness. It remains
HTTPS on the exact approved browser origin `https://127.0.0.1:5173` and backend
`https://127.0.0.1:8000`. Vite's backend connection still verifies the supplied CA
with `secure: true` and `rejectUnauthorized: true`. This proves encrypted socket
integration under a **test-only certificate exception**, not production TLS or
Windows trust validation. It is not an application HTTP fallback.

Real installed Windows Chrome is selected by Playwright's local `channel: chrome`;
the Playwright project name remains `chromium`. No browser dependency was installed.
Workers=1, retries=0. Per-fixture passwords are random and memory/environment-only.
Password entry avoids locator.fill credential call logs; artifacts exclude auth
verifiers. Raw Playwright traces remain OFF: safe credential/session redaction is
not established. Failure screenshots and explicit redacted HTTP/DB evidence are
available instead; no safe-trace PASS is claimed.

## Proven defects and minimal fixes

1. HTTPS Chrome initially received proxy 403 before any backend auth request.
   Node HTTP/1 tests had not covered HTTP/2 `:authority`. The Vite guard now accepts
   only exact `127.0.0.1:5173` authorities, via Host and/or :authority, rejects
   absence and rejects disagreement/foreign values. Origin/CSRF/TLS checks remain.
   Unit boundary checks and real HTTPS browser execution cover this fix.
2. Initial Vite optimization/navigation could clear freshly filled login fields
   before submission. The browser helper waits for initial network idle before
   filling; it never repeats credentials or domain POSTs automatically. No privacy
   invalidation was removed from the application.
3. A failed early W-23 teardown retained an idle TLS connection, keeping the
   backend thread alive beyond the cleanup deadline. Harness graceful shutdown is
   now bounded at three seconds, parent teardown waits up to twenty seconds, and
   stop/cleanup is attempted in finally even if final snapshot attachment fails.
   Cleanup still refuses if the backend thread is alive. The one leftover owned
   schema was subsequently removed using its exact manifest/token/OID/owner guard.
   Windows asyncio Proactor connection-reset/graceful-shutdown warnings persist;
   no exception filter or application-security weakening hides them.

## UX integration provenance and limits

Before copying, all four destination paths were checked absent. The four source
files in `D:/Projects/fwi-ux-01` were read and copied byte-for-byte, with SHA-256
equality checks, without modifying/deleting anything in that worktree:

- `frontend/src/components/states/DisplayStates.tsx`
- `frontend/src/components/measurement/MeasurementDisplay.tsx`
- `frontend/tests/display-states.test.tsx`
- `frontend/tests/measurement-values.test.tsx`

Minimal post-copy adaptations: remove redundant aria-busy; explicitly pass unit
to all three MassValue fields; allow the backend's distinct estimated display
status and explicit null label in the primitive. Backend detail uses MassValue,
loading, empty and read-error states, preserving all original string values,
unit, provisional mass basis, method, provenance and timestamps. It does not
convert backend records into DemoStore MeasurementValues or invent validation
status/original text. Backend estimated remains the backend status; no taxonomy
or estimation-status mapping was added. Missing/null never becomes zero.

UNKNOWN capture uses the reviewed presentation without its optional retry callback;
there is no automatic replay or new unlock action. Existing server-owned recovery
remains authoritative. Registered/no-result stays UNCONFIRMED. When a subsequent
authorized GET confirms an intent committed, the browser offers its confirmed GET
link, not indefinite UNKNOWN and not a repeated POST. Test assertions were adapted
to that approved contract and to accessible mass labels, not relaxed mass equality.

## Exact D-delta files (earlier S1/C files are separate)

| Path | Change |
|---|---|
| `frontend/playwright.config.mjs` | Explicit local temporary-certificate opt-in |
| `frontend/e2e/persistent-capture.spec.mjs` | Authenticated W-20–W-25, negative browser cases, evidence and cleanup |
| `scripts/browser_e2e_harness.py` | Bounded TLS teardown; sanitized HTTP/operation/intent evidence; guarded revocation |
| `frontend/vite.config.ts` | Exact HTTP/2 authority compatibility |
| `frontend/tests/backend-proxy.test.mjs` | Authority absence/disagreement regression |
| `frontend/src/components/states/DisplayStates.tsx` | Reviewed candidate plus aria cleanup |
| `frontend/src/components/measurement/MeasurementDisplay.tsx` | Reviewed candidate plus explicit unit/backend display primitive |
| `frontend/tests/display-states.test.tsx` | Reviewed candidate tests |
| `frontend/tests/measurement-values.test.tsx` | Reviewed candidate tests |
| `frontend/src/pages/BackendEventDetailPage.tsx` | Safe reusable presentation without semantic adaptation |
| `frontend/src/pages/BackendCapturePage.tsx` | UNKNOWN presentation without retry callback |
| `frontend/tests/backend-detail.test.tsx` | Exact decimal/null/unit assertions through accessible labels |
| `docs/backend/FWI-SEC-01D.md` | This evidence and review handoff |
| `docs/ai/HANDOFF.md` | Current task result and remaining gates |

No D changes to backend auth policy, model/schema/migration, dependencies,
ADR-004, domain contracts, PRD, methodology or held KPI states.

## Verification commands and results

- `.venv/Scripts/python.exe -B -m pytest -q -x`, with `FWI_REQUIRE_POSTGRES=1`
  and the password-free test URL above: **113 PASS + 6 subtests PASS**, 0 FAIL/SKIP.
- Frontend `npm run typecheck`: PASS; `npm test`: **150 PASS**, 0 FAIL/SKIP;
  `npm run build`: PASS. Includes 32 reviewed UX tests, existing domain/demo
  tests and authentication-context privacy tests.
- `npm run test:proxy` with temporary cert/CA: **3 PASS**, 0 FAIL/SKIP, including
  actual HTTPS proxy forwarding with backend certificate verification enabled.
- `python -I scripts/verify_kit.py`: PASS; `python -m pip check`: PASS.
- Browser command: `npm run test:e2e:ci` under the explicit local TLS/test target
  environment above. Individual W-20–W-25 + SEC-C run: **7 PASS**; additional
  SEC-D1–D3 run: **3 PASS**. Consolidated final run/evidence recorded below.

### Consolidated final evidence

Final run began `2026-11-07T15:51:31.364Z`: **10 PASS**, 0 FAIL/SKIP/flaky,
102.96 seconds, one worker and zero retries. Windows installed Chrome, not a
Linux CI or simulated TestClient result. Evidence is local, ignored test output:
`frontend/browser-evidence/results.json`, `sec01d-summary.json`,
`sec01d-final-run.log`, and `frontend/playwright-report/index.html`.
The JSON report embeds sanitized identity, final PostgreSQL and guarded cleanup
attachments (base64 JSON). No credentials/verifiers are in those allowlisted DB
attachments. W-20/W-21 additionally attach verified commit/no-replay evidence.

| Scenario | Result | Synthetic event UUID | Measurements / domain POSTs |
|---|---|---|---|
| W-20 | PASS | `65be22c8-d222-4f77-9107-48af6a3b8eb3` | 0 / 1 |
| W-21 | PASS | `e7343a7d-35f5-4667-bc01-ed3dd33d81b5` | 1 / 2 |
| W-22 | PASS | `d8ffcfb4-41a9-4ddf-9ede-143c438d1e8c` | 1 / 3 (includes one rejected attempt) |
| W-23 | PASS | `904f02e0-b54f-4961-8a4c-f41096ae035d` | 1 / 2 |
| W-24 | PASS | `f3a727a2-ba42-4cf0-92c8-32cd89d04010` | 5 / 6 |
| W-25 | PASS | None | 0 / 0 |
| SEC-C | PASS | `079a21ed-6807-44de-b61c-8c00cc87a6b3` | 0 / 1 |
| SEC-D1 | PASS | None | 0 / 0 |
| SEC-D2 | PASS | None; security registration only | 0 / 0 |
| SEC-D3 | PASS | `cb4f6ad1-494f-4396-bc9b-99057dbe6bf8` | 1 / 2 |

All ten final fixture cleanup attestations are true. Subsequent independent
read-only connection check within this implementer run confirmed
`fwi_test / fwi_demo_test / PostgreSQL 18.6` and zero remaining test schemas.
The temporary certificate/key and their exact newly created directory were
removed after all browser/proxy tests. No listener remained on 5173 or 8000.
Public certificate SHA-256 fingerprint for test provenance:
`3E:61:88:17:BF:4D:2D:AD:F5:7D:5E:B7:10:CB:97:31:26:40:52:78:D0:12:56:76:D1:1E:D3:EF:AE:C5:52:6A`.

### Browser scenario coverage

| Scenario | Guarantee checked |
|---|---|
| W-20 | Exactly one event POST; DB record + created audit verified after 201, then delivered acknowledgement changed to 503; UNKNOWN; refresh authorized recovery, no replay/duplicate |
| W-21 | Same for measurement on the original event UUID, no new event |
| W-22 | Gross/tare/net rejection, explicit corrected measurement, no duplicate created audit |
| W-23 | Mobile read-after-write, direct detail navigation and refresh, stable UUID/exact long Decimal; domain/audit snapshot unchanged by reads |
| W-24 | Five distinct measurements/statuses on one event, exact Decimal, null vs zero, as_served/method/provenance; DemoStore remains separate |
| W-25 | Foreign Origin, non-JSON and unapproved methods/routes denied before domain write |
| SEC-C | Incorrect CSRF denied, logout/actor B cannot see A's result; concealed foreign UUID; expired session closed |
| SEC-D1 | Secure/HttpOnly/Strict cookie attributes, missing CSRF, service-protocol revocation denies subsequent browser recovery/write |
| SEC-D2 | Registered/no-domain-dispatch intent survives refresh as private UNCONFIRMED, capture disabled, B recovery empty, intent not deleted and zero domain POSTs |
| SEC-D3 | Same principal new login has distinct session UUID; second tab switches actor; delayed real A GET cannot display A measurement; foreign/missing parity and no A intent disclosure; registrations precede the two domain POSTs |

Tests assert database records/audit and authorized response data, not just status
labels. Domain/audit snapshots exclude auth verifier tables, whose session idle
activity may legitimately update on GET. Redacted intent summaries are explicitly
allowlisted; no cookie/hash/CSRF/password fields are exported.

## Review handoff / remaining Gate A risks

Independent D-delta review is **PENDING**. Review HTTP/2 authority conflict handling,
test-only TLS opt-in, credential-safe artifacts, cleanup ownership and the updated
UNKNOWN test semantics. Existing S1/C independent verdicts do not approve this delta.
Windows Proactor connection-reset warnings and bounded teardown must be assessed;
cleanup results matter, not suppression of warnings. Safe raw trace recording is
not implemented. The self-signed exception is not production/browser-trust validation.
Registered rejected/undispatched intent resolution/retention remains conservative
and deferred; no idempotency mechanism is invented. Tests exercise selected
deterministic tab/session transitions, not an absolute cross-tab guarantee.
Full FR-001 membership administration remains Gate B. Gate A requires independent
acceptance of the combined backend/frontend/browser security evidence; implementer
does not self-approve it. Synthetic-only; no government integration or public API.
Browser expiry/revocation is induced through the guarded fixture; no eight-hour
browser soak test or exhaustive tab scheduling/stress test was run. Browser W-24
uses as_served, not all six provisional mass bases. Other mass-basis regression
remains in unit/backend tests; this is not full methodology/field validation.

No staging, commit, push, PR, merge or deployment. Other worktrees and user files
are untouched; the two explicitly stopped old services are not automatically
restarted. Temporary TLS cleanup and final Git status are recorded below.

## Full Git status at handoff

Includes preserved earlier S1/C work. Index empty; HEAD unchanged.

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
 M frontend/src/pages/BackendEventDetailPage.tsx
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
?? docs/backend/FWI-SEC-01D.md
?? frontend/src/backend/auth.ts
?? frontend/src/components/layout/BackendAuthBoundary.tsx
?? frontend/src/components/measurement/MeasurementDisplay.tsx
?? frontend/src/components/states/DisplayStates.tsx
?? frontend/tests/backend-auth-fixture.ts
?? frontend/tests/backend-auth.test.tsx
?? frontend/tests/display-states.test.tsx
?? frontend/tests/measurement-values.test.tsx
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
