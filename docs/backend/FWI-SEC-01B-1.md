# FWI-SEC-01B-1 — approved scope and backend contract

Owner decision provenance: explicit OWNER DECISION — FWI-SEC-01 / Gate A in this
conversation, 2026-11-07. Branch `codex/fwi-sec-01b-1`, main baseline
`e3d4cac3a8bd3eb640d421b5c3f27351d11115dc`. ADR-004 itself is unchanged.

## Approved decisions

D01 local synthetic Argon2id verifier, opaque backend cookie sessions; no OIDC.
D02 explicit site/action grants with technical writer/reader roles. D03 generic
401, forbidden action/context 403, identical missing/foreign-object 404.
D04 HTTPS only, Secure/HttpOnly/SameSite=Strict, pre-auth/authenticated CSRF,
logout/revocation; idle 30 minutes, absolute 8 hours, pre-auth TTL 5 minutes.
D05 seeded Gate A only; administration/full FR-001 is Gate B. D06 site-only.
Owner authorizes pinned argon2-cffi, auth schema/migration and isolated test-schema
migrations only; no dev DB, trust-store changes, commit/push/PR or deployment.

## Concrete backend design (recorded before implementation)

- Pin argon2-cffi 25.1.0 (official PyPI/docs verified). Explicit Argon2id RFC 9106
  low-memory profile: 64 MiB, time cost 3, parallelism 4, salt 16/hash 32 bytes.
  Synthetic passwords supplied to explicit seed function, never printed/stored raw.
- Principal UUID + username/hash/enabled; Membership UUID/principal/site/role/active;
  AuthSession UUID/principal/hashed 256-bit opaque secret/CSRF verifier/timestamps/
  revoked; PreAuth hashed cookie/CSRF verifier/expiry/consumed; LoginThrottle key/
  window/failures; WriteIntent UUID/principal/site/kind/event/result/state/time.
  Audit gains nullable principal FK and reason; legacy actor values remain unchanged.
- Technical writer permissions: event.create/read, measurement.create/read.
  Reader: event.read, measurement.read. No membership/organization inheritance.
- POST login uses a five-failure/account/15-minute bucket and 30-failure/source/
  15-minute bucket, persisted with row locking. Direct peer IP only; ignore spoofed
  forwarding headers. Unknown accounts receive generic failure and dummy Argon2 work.
- GET `/auth/preauth`: same-origin bootstrap cookie+CSRF. POST `/auth/login`:
  username/password/pre-auth cookie+X-CSRF-Token. GET `/auth/session`: validated
  actor/site permissions and fresh CSRF token. POST `/auth/logout`: authenticated
  CSRF, revoke atomically. Only exact `https://127.0.0.1:5173` Origin is trusted.
  Bootstrap/context GET without Origin requires exact-origin Referer and
  Sec-Fetch-Site=same-origin. Missing evidence/null/unknown origin fails closed.
- Cookie names `__Host-fwi-session`, `__Host-fwi-preauth`, Secure/HttpOnly/Strict,
  Path=/, no Domain; browser-session cookies. Enforce HTTPS in backend, never trust
  arbitrary forwarded proto/host. API tests use HTTPS TestClient; actual browser
  certificate/trust setup is NOT authorized and remains a separate integration gate.
- Concurrent independent sessions are allowed; logout revokes the current session,
  principal disable invalidates all its sessions. No periodic secret rotation or
  refresh token; absolute expiry requires fresh login. CSRF is session-bound and
  stable for multi-tab compatibility (derived from the secret, stored only hashed).
  Authenticated requests count as idle activity; failed authorization rolls back
  that extension. Quarantined evidence has no automatic purge in this slice.
- POST `/auth/intents`: register private operation intent before domain dispatch;
  GET `/auth/intents`: actor-only recovery, scope revalidated, no payload/secrets.
  Domain POST requires X-FWI-Intent; locks/consumes one matching registered intent
  with domain result/audit in the same transaction. A second POST is rejected,
  never automatically replayed. Registration creates no domain event and is not
  an idempotency/retry API. Unconfirmed registered intents are never auto-deleted;
  retention/purge and administrator recovery are deferred, fail closed.
- Existing four `/demo/v0.1` routes are protected, no unauthenticated compatibility
  route/feature flag. Authentication happens before domain validation disclosure.
  Client-supplied actor ignored/rejected. Session middleware never logs secrets.
- READ COMMITTED: acquire principal FOR UPDATE, then session, membership, intent
  in consistent order, retain locks through domain/audit commit. Revocation,
  membership removal/role change and principal disable also lock principal first.
  This deliberately serializes one actor's writes. Recheck alone is insufficient.
  Revocation winning this order prevents writes; write winning may commit before
  revocation, which then prevents subsequent writes. Bound lock timeout at 5s,
  generic failure, no automatic retry. PostgreSQL barrier tests prove both orders.
- New migration is additive except replacement of fixed actor CHECK; historical
  audit remains legacy. Downgrade refuses if authenticated audit/principal/session/
  intent evidence exists, otherwise restores original CHECK and removes empty auth
  tables. Prefer forward fix; never run production/dev downgrade.

## Gates and remaining integration

Target tests: IDOR/site spoofing, missing/foreign parity, reader/no-membership deny,
CSRF/bootstrap/fixation, throttle, expiry/revocation, atomic audit/intent rollback,
barrier-coordinated concurrent revoke/write, private intent recovery after relogin.
Keep original domain/measurement regression semantics, not unauthenticated access.
Existing browser harness/React require authenticated HTTPS adaptation next; never
restore public POSTs to make W-20–W-25 pass. Gate A and full FR-001 are NOT claimed.
Cross-tab browser privacy and real HTTPS testing remain NOT RUN until integrated.

References: https://argon2-cffi.readthedocs.io/en/stable/parameters.html and
https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html.

## Historical S1 execution evidence — implementer, 2026-11-07

- `.venv/Scripts/python.exe -B -m pytest -q -x` with
  `FWI_REQUIRE_POSTGRES=1` and the password-free local test URL: **102 PASS,
  6 subtests PASS, 0 FAIL/SKIP**. New security module: 22 tests, including four
  deterministic revoke/write orderings and safe reversible migration tests.
- Final targeted run after source-throttle tightening:
  `pytest tests/test_security_postgresql.py -q -k 'throttles or no_unauthenticated or migration'`:
  **3 PASS, 19 deselected**. Blocked sources cannot create unlimited account buckets.
- `pip check`, `python -I scripts/verify_kit.py`, and `git diff --check`: PASS.
  Original persistence tests now log in via real HTTPS TestClient and register
  intents explicitly; no test-only HTTP authentication bypass was added.
- Actual role/database/server verified as `fwi_test/fwi_demo_test/PostgreSQL 18.6`.
  Migrations and downgrade tests only ran inside guard-verified UUID test schemas;
  fixtures dropped only their own schema/OID. No development database was used.
- Real TLS/browser, authenticated W-20–W-25, cross-tab UI/privacy, frontend tests,
  load testing, and independent security review: NOT RUN / PENDING in this slice.
  The existing HTTP-only browser harness deliberately fails closed at its old
  revision guard; it needs HTTPS/session/intent adaptation, not a bypass. Its
  snapshot now excludes auth tables to avoid exporting verifiers to artifacts.
- No Gate A, full FR-001, production security, commit/push/PR/deployment claim.
  Existing Starlette/httpx and Alembic deprecation warnings remain follow-up.

Next: FWI-SEC-01C authenticated HTTPS browser/capture integration, with separately
authorized certificate setup (or an already-approved certificate), deliberate
proxy handling, private recovery across logout/refresh/actor switch/tabs, and
W-20–W-25 plus browser negative tests. Do not expose the old unauthenticated flow.

## S1 remediation after REQUEST CHANGES — ready for independent re-review

Authority: Owner's pasted remediation request in this conversation. Existing S1
working tree on `codex/fwi-sec-01b-1`, HEAD remains `e3d4cac3a8bd3eb640d421b5c3f27351d11115dc`.
Both HIGH findings matched local code; no divergent implementation was found.

HIGH-01 root cause: the route used `request.client.host` after Uvicorn could have
rewritten it from XFF. Rejecting only forwarded proto/host did not protect source
identity. Approved local startup now uses `local_server_config`: fixed loopback
binding, `proxy_headers=False`, `forwarded_allow_ips=''`, raw peer capture and
forwarding-header removal before app handling. A private ASGI mark binds the peer
to this ingress; login uses that verified value. A bare default Uvicorn app cannot
authenticate, even with spoofed loopback XFF. This is not a reverse-proxy profile.
Use the documented config factory, without another proxy-trusting wrapper. TLS
must reach the boundary; HTTP plus a claimed forwarded HTTPS scheme remains denied.

HIGH-02 root cause: emptiness checks held no exclusion against concurrent inserts.
Downgrade now requires a non-autocommit transaction and takes ACCESS EXCLUSIVE
locks on principal/session/membership/intent/pre-auth/throttle/audit tables, in one
fixed order, before checking anything. Locks, checks, DDL and Alembic version
update share the same transaction. A writer that commits first makes downgrade
refuse; a writer arriving after the locks cannot commit unseen evidence. Lock
timeout or later exceptions roll back schema changes; no retries or exception
suppression were introduced. Prefer forward fix when security evidence exists.

MEDIUM: the preliminary authentication dependency now uses `activity=False`.
Only the final authorized operation transaction extends idle activity. 403/404
and validation rejection preserve the previous timestamp, matching the existing
approved contract; no timeout-policy change was needed.

Files changed for remediation (earlier S1 changes are preserved):

| Path | Reason |
|---|---|
| `src/fwi/infrastructure/ingress.py` (new) | Explicit Uvicorn/raw-peer trust boundary |
| `src/fwi/application/security.py` | Require verified ingress; validation-only activity mode |
| `src/fwi/api/routes/auth.py` | Verified login source and non-refreshing preliminary check |
| `migrations/versions/auth_0002.py` | Transactional locking before downgrade checks |
| `scripts/browser_e2e_harness.py` | Use the same approved server configuration |
| `tests/auth_support.py` | Existing regressions use real loaded ingress stack |
| `tests/test_security_postgresql.py` | Match genuine loopback source and reject HTTP spoofing |
| `tests/test_security_remediation.py` (new) | Runtime spoofing, idle semantics and real DDL race regressions |
| `docs/backend/development.md` | Distinguish health-only bootstrap from protected startup |
| `docs/backend/FWI-SEC-01B-1.md` | Root causes, boundaries and fresh evidence |
| `docs/ai/HANDOFF.md` | Independent re-review handoff |

Fresh implementer-run evidence (not independent approval):

- `FWI_TEST_DATABASE_URL=postgresql+psycopg://fwi_test@127.0.0.1:5432/fwi_demo_test`,
  private pgpass credentials; `FWI_REQUIRE_POSTGRES=1`.
- `.venv/Scripts/python.exe -B -m pytest tests/test_security_remediation.py -q -x`:
  **8 PASS**, 0 FAIL/SKIP. Tests use actual Uvicorn Config.load middleware plus
  HTTPS ASGI TestClient scopes, not real socket TLS/browser certificate evidence.
  Thirty spoofed XFF attempts count against one peer, a distinct actual peer is
  handled separately, account throttling remains effective, and misconfigured
  default startup fails closed.
- `.venv/Scripts/python.exe -B -m pytest -q -x`: **110 PASS + 6 subtests PASS**,
  0 FAIL/SKIP. PostgreSQL tests observe `pg_blocking_pids` with independent
  transactions. Both writer/downgrade orderings, empty downgrade, evidence refusal,
  real lock timeout and rollback after actual DROP are covered. The post-DROP
  failure is deliberately injected after PostgreSQL executes DDL; schema/constraints/
  revision and legacy audit are then verified restored.
- `pip check`, `python -I scripts/verify_kit.py`, `git diff --check`: PASS.
- Real TLS/browser, authenticated W-20–W-25, cross-tab UI/privacy, frontend unit/
  browser reruns and deadlock-specific fault injection remain NOT RUN in this
  remediation. No certificate/dependency installation or trust-store change occurred.
- `npm run typecheck` (frontend): PASS. Read-only database verification after tests
  confirmed `fwi_test/fwi_demo_test/PostgreSQL 18.6` and zero remaining test schemas.

Antigravity independent re-review is PENDING. Neither S1 nor Gate A is approved
by this implementer. Existing Starlette/httpx and Alembic deprecations remain;
no public exposure, real data, development DB migration, methodology/KPI change,
commit/push/PR/merge or deployment is authorized by this remediation.
