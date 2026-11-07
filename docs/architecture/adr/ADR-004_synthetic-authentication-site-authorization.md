# ADR-004 — Synthetic Demo Authentication and Site-Scoped Authorization

**Status:** PROPOSED — OWNER REVIEW REQUIRED

**Date:** 2026-11-07

**Baseline:** main `f20348ea960fcfea2641e0b83b86759924b11a4e`

**Decision owner:** FWI Owner
**Approval:** Not granted; SEC-D01–D06 remain OPEN.

## 1. Context, evidence, and scope

FWI is an independent, synthetic-data-only prototype, not an official BGN system.
This ADR does not authorize implementation, deployment, real data, or government
integration. OP-08, FI-02, and NI-03 remain HELD/DISABLED.

Sources are AGENTS.md, `docs/ai/CONTEXT.md`,
`docs/ai/FWI-SEC-01_DECISION_PACKET_v0_1.md`, `docs/product/PRD-v0.1.md`,
`docs/architecture/FWI-ARCH-001_System_Data_Architecture_v0.2.md`, accepted
ADR-001/002/003, Owner-supplied R2 review, and the R3 draft in the conversation.
The external FWI-02/03/04 source documents are not independently validated by
this ADR; repository consistency does not establish full methodological acceptance.

Current-code evidence at the baseline:

| File | Observed behavior |
|---|---|
| `src/fwi/api/routes/demo.py` | Four event/measurement routes have no authentication. |
| `src/fwi/application/demo.py` | Application-owned transactions create data and audit atomically; actor is `synthetic-demo-actor`. |
| `src/fwi/infrastructure/database/models.py` | No principal/membership/session model; audit actor has a fixed-value constraint. |
| `frontend/src/backend/write.ts` | `credentials: omit`; 401/403 currently become UNKNOWN; sessionStorage journal has no actor binding or replay operation. |
| `frontend/vite.config.ts` | Removes Cookie and Authorization; development route/Origin checks are not authentication. |
| `frontend/e2e/persistent-capture.spec.mjs` | W-20–W-25 cover write integrity, not authentication or site authorization. |

ADR-001/002/003 remain unchanged. Stable event identity, separate measurements,
Decimal precision, missing versus measured zero, and provenance remain unchanged.
No new methodology, taxonomy, idempotency, or canonical measurement policy is set.

## 2. SEC-D01–D06 Owner Decision Register

Every recommendation below is PROPOSED, not an accepted choice.

| ID | Explicit Owner options | Recommendation for review | Status |
|---|---|---|---|
| SEC-D01: identity boundary | Local synthetic verifier with opaque cookie session; opaque bearer in React memory; external OIDC | Local synthetic verifier and backend session for browser demo; defer OIDC until justified | OPEN |
| SEC-D02: membership/permissions | Explicit site grants; additional organization grants; fixed or configurable role mapping; segregation of duties | Explicit site/action permissions; no implied global grant or universal SPPG role | OPEN |
| SEC-D03: authorization/response | Concealed 404 versus 403 for foreign objects; site selection/history policy | 401 invalid session; identical 404 for absent/foreign UUID; generic 403 for forbidden action/context | OPEN |
| SEC-D04: credentials/session | Transport/profile, verifier, idle/absolute/renewal expiry, concurrency, revocation and journal protection | Server-stored opaque session, HttpOnly cookie, revalidation, durable protected quarantine | OPEN |
| SEC-D05: administration/audit | Seed-only milestone; authorized membership/permission administration; admin scope/approval rules | Seed demo is partial; audited administration is a separate full FR-001 gate | OPEN |
| SEC-D06: organization visibility | Site-only initial slice; explicit organization-wide grants | Site-only initially; broader access requires explicit grant and tests | OPEN |

Selecting an option does not approve physical schema, dependencies, TTLs, role
lists, API names, migration, or production access. Unresolved parameters are in §13.

## 3. Browser transport alternatives

| Concern | Opaque HttpOnly cookie | Opaque bearer in React memory | External OIDC |
|---|---|---|---|
| XSS/exposure | JS cannot read HttpOnly secret; XSS can still act through active session | XSS can read/exfiltrate bearer | Depends on application token/session storage; not an XSS cure |
| CSRF | Automatically attached cookie requires CSRF defenses | Authorization header not attached automatically; reduced conventional CSRF exposure | Depends on application transport; protocol defenses also required |
| Refresh | Cookie can survive reload; revalidate server-side | Memory is lost; login or additional recovery mechanism required | Depends on provider/application session |
| Logout | Revoke server session and expire cookie | Revoke server session and clear memory | Local logout and provider logout semantics must be defined |
| Cost | Session store, CSRF, cookie/proxy testing | Issuance, revocation, exposure and Authorization forwarding | Provider, claims validation, dependencies, account/cost/security review |

Recommend opaque backend session with HttpOnly cookie for the synthetic browser
slice. Bearer memory remains a legitimate alternative, not automatically safer.
OIDC may reduce local credential responsibility but adds external dependencies;
it does not replace site membership enforcement.

## 4. Proposed session, HTTPS, and CSRF contract

### 4.1 Backend lifecycle and fixation defense

Generate cryptographically random opaque session secrets. Store a verifier/hash
and stable principal reference server-side, with issuance, last activity, absolute
expiry and revocation state. Never encode authority in client-controlled fields.

Keep these policies separate:

- Idle timeout: inactivity limit; activity qualifying for extension is undecided.
- Absolute expiry: maximum lifetime, not extended by activity or rotation.
- Revalidation: session, principal and current membership checked per operation.
- Renewal: secret rotation and any overlap policy, separately decided.
- Revocation: logout, principal disablement or authorized administrator action.

No TTL is accepted. Thirty minutes is only an earlier proposal. Credential
hashing library/parameters, login throttling, reset, concurrency limits and
retention require review. Successful login creates a fresh secret, invalidates
pre-auth state, and does not adopt an identifier supplied by the client. Privilege
changes require an explicit rotation/revocation policy; old secrets must not
silently retain authority.

### 4.2 Exact proposed HTTPS/local testing profile

For the initial browser test profile, propose exactly this trusted browser origin:
`https://127.0.0.1:5173`. Vite forwards approved paths to the loopback-only backend
at `http://127.0.0.1:8000`; that backend address is not an allowed browser Origin.
No wildcard, suffix matching, `null`, `localhost` alias, alternate port, sibling
origin or public bind is implicitly trusted. Scheme/host/port must match exactly.
Tests needing another address require an explicit reviewed profile. Host/trusted
proxy handling must not derive the allowlist from an arbitrary request Host header.

Use a locally trusted development certificate with the correct IP SAN; do not
disable certificate checks. Both Windows and Linux browser profiles must actually
test HTTPS. Certificate/tool setup is a separate authorized implementation task.
Existing HTTP-only tests remain historical evidence and cannot prove this profile.
There is no automatic HTTP fallback. Whether to permit a separate HTTP-only
synthetic profile remains OPEN; it cannot satisfy the Secure-cookie gate.

Proposed authenticated cookie: `__Host-fwi-session`, `Secure`, `HttpOnly`,
`Path=/`, no Domain, and `SameSite=Strict`. Lax is an Owner option if a required
navigation/identity flow needs it. Cookie persistence/Max-Age is undecided and
never overrides server expiry. Session/context responses use `Cache-Control:
no-store`. Backend direct calls must enforce the same security contract.

Host-only cookies and the `__Host-` prefix do not isolate cookies across ports on
the same host. Another local service on that host may receive applicable cookies
or interfere with cookie state; Secure/HttpOnly/SameSite do not create a port
boundary. Treat other local services as a risk and test actual browser cookie
delivery and proxy forwarding across approved and unapproved ports. The exact
Origin allowlist remains required; it does not change cookie port semantics.

### 4.3 Pre-auth bootstrap and CSRF

Proposed sequence, with endpoint names still undecided:

1. Before login, same-origin frontend GETs a dedicated pre-auth bootstrap endpoint.
   It returns a random CSRF token and sets a separate opaque pre-auth cookie
   (`Secure`, `HttpOnly`, host-only, `SameSite=Strict`, `Path=/`). Server-side state
   binds token to pre-auth cookie; bootstrap grants no principal or permissions.
2. Bootstrap accepts only the configured origin context: reject foreign/null
   Origin; where Origin is absent on same-origin GET, require validated same-origin
   Referer plus Fetch Metadata. No permissive missing-header fallback. Test clients
   explicitly supply the approved context. Cross-origin CORS is not enabled.
3. Login POST requires exact Origin and a valid pre-auth token in a custom header,
   plus the bound cookie. Reject missing/wrong token or origin before authentication
   side effects. Login failure remains generic; protect against login CSRF too.
4. Successful login consumes pre-auth state, rotates to a fresh authenticated
   session and fresh session-bound CSRF token. Bound token is returned only through
   a no-store same-origin response, held in memory, never in the journal.
5. After refresh, a protected same-origin context GET can return a valid CSRF token
   after session revalidation. All mutating operations, including logout and access
   administration, require exact Origin and session-bound CSRF header.

Legitimate requests may omit Origin, Referer or Fetch Metadata because of browser
behavior, privacy settings or intermediaries. Test compatibility with supported
browser/proxy profiles, including each missing-header combination. If the evidence
required by the sequence above is unavailable, fail closed with a clear recovery
message; do not accept `Origin: null`, unknown origins or add a permissive fallback.
An incompatible legitimate profile requires design review, not a relaxed check.

Pre-auth/token expiry, bootstrap rate limits, concurrent tabs and token rotation
details remain OPEN. Pre-auth GET may create ephemeral security state, but cannot
write event, measurement or business audit data. GET must not rotate/revoke an
authenticated session as a side effect of an unsolicited navigation.

SameSite is defense in depth, not the sole CSRF control. No secrets in URLs,
source control, journal, logs, traces or screenshots; sanitize Cookie, Set-Cookie,
Authorization, credentials and CSRF values. Public CI fixture credentials are
synthetic and isolated, never reusable development/production credentials.

## 5. Authorization, actor identity and atomic audit

Resolve actor from a verified session, not body/site/organization/display-name
fields or client identity headers. Membership maps stable principal to explicit
scope and permitted actions. Role names and local RACI remain OPEN-02.

Application/data-access enforcement must validate organization/site relationship,
create permission on the target site, and the actual event's scope for event GET,
measurement GET and POST. Deny by default. No membership means no records; one
site or organization membership never implies global access. UI visibility is a
usability aid only.

Proposed response contract:

| Condition | Response without existence leakage |
|---|---|
| Missing/invalid/expired/revoked session or disabled principal | Generic 401 before object disclosure |
| Valid session, forbidden action | Generic 403 |
| Missing or out-of-scope event UUID | Same 404 status/body; no foreign scope details |
| Forbidden supplied site/org context on create | Generic 403, no confirmation of site existence |
| Security storage unavailable | Fail closed, generic 503 |

Scope checks must precede detail-bearing validation/conflict responses. Exact
timing equivalence is not claimed. API policy must be tested through direct calls,
not just Vite. Existing unprotected routes cannot remain an alternate data path.

Audit successful mutations with stable actor, scope, action, target, time and
reason/change details. Event/measurement plus audit, and membership/permission
change plus audit, must commit or roll back together. No hidden commit. Store
only a non-secret session correlation reference when justified. Security denials
use separately defined minimized security events, not false business success.
Bootstrap admin, self-escalation, last-admin protection and SoD require Owner choice.

### 5.1 Revocation versus concurrent writes

A check followed by a later write has a race; rechecking alone does not solve it.
Propose a transactional serialization point shared by protected mutations and
session/principal/membership/permission revocations. One candidate is locking
the relevant existing authority rows through commit, with revocation acquiring
conflicting locks in a consistent order. Other proven serialization/version
protocols remain options. Missing grants deny; permission-map changes and deletion
must participate in the same protocol. A request-local cached snapshot is insufficient.

Required guarantee: if revocation commits before the mutation acquires its valid
authorization serialization point, that mutation cannot commit. If the mutation
wins the ordering, it may commit with its audit before revocation completes;
revocation does not retroactively cancel that committed operation. Return success
for revocation only after its transaction commits. Do not promise instant
cancellation of all already-running requests.

Transaction-level PostgreSQL tests must coordinate two independent connections
with barriers, not rely on sleeps: (a) revoke wins and write/audit are absent;
(b) write wins and write/audit commit before revocation; (c) logout/session revoke,
principal disable and membership/permission removal follow the same rule;
(d) rollback/lock timeout/deadlock leave no partial write/audit and no automatic
POST replay; (e) actual configured isolation level satisfies the ordering.
Lock granularity/order, isolation level, timeout and response mapping remain OPEN
implementation decisions requiring a concrete concurrency proof.

## 6. Initial demo versus complete FR-001 acceptance

**Gate A — initial authenticated synthetic slice:** seeded principals/memberships,
protected existing event/measurement API, site isolation, session/CSRF lifecycle,
actor audit, privacy-safe UNKNOWN behavior and W-20–W-25 regression. Passing this
gate is partial FR-001; no membership administration completeness claim.

**Gate B — complete FR-001 P0 acceptance:** Gate A plus Owner-approved membership
administration and role/permission management, authorized grant/change/revoke,
effective revocation under concurrency, scope/SoD rules, and atomic actor/time/
reason/change audit with negative escalation tests. Seed scripts do not satisfy
this gate. UI/API administration form and acceptance evidence require review.

Passing Gate B does not certify all PRD P0 modules, NFR-04 backup/evidence concerns,
or methodological acceptance. Evidence/export/dashboard policies follow their
modules; no new module implementation is authorized here.

## 7. Privacy-safe UNKNOWN quarantine and reconciliation

UNKNOWN means outcome unconfirmed, never a retry queue. Refresh converts pending
to UNKNOWN; logout or actor switch must neither erase reconciliation evidence nor
show prior actor's event IDs, operation/scope details or payload to the next actor.
The existing plaintext sessionStorage journal is not sufficient for shared-browser
privacy. A principal-prefixed storage key alone is not access control.

Required proposed contract:

Pre-dispatch quarantine registration is a separate security operation. It does
not create a WasteEvent or Measurement, execute the domain POST, or provide
idempotency. Any registration HTTP request is counted separately from domain
requests: W-20/W-21 still require exactly one forwarded domain POST for the tested
operation, with committed domain record/audit proof and no automatic replay.

- Keep durable evidence bound to the original principal before dispatch: random
  operation reference, operation kind, target reference when known, timestamps and
  outcome state. No credential, session secret or full request payload is needed.
- Recommend protected backend journal/quarantine storage; an authenticated recovery
  query authorizes the original principal and current scope. Its physical schema,
  pre-dispatch registration protocol and retention are OPEN. Registration is not an
  idempotency mechanism and must never execute/replay the domain operation.
- Do not dispatch the domain POST if required durable evidence cannot be preserved.
  If logout races registration, preserve evidence already registered; a lost
  registration acknowledgement must not trigger domain dispatch or automatic retry.
- Browser storage contains only a non-authorizing opaque marker, with no event,
  site, actor, operation or mass/provenance fields. Clear private UI, payload and
  caches on logout/switch; isolate responses by actor/auth generation. Marker
  possession cannot retrieve evidence or confer access. Harden history/URL handling
  and protected response caching to avoid exposing prior event UUIDs on reuse.
- A new actor sees no prior journal listing. Reauthentication by the original actor
  can recover authorized evidence; lost membership does not grant object access.
  Recovery by an administrator needs a separately approved permission/audit policy.
- Refresh must first revalidate identity, then recover only that actor's evidence.
  Multi-tab logout/switch invalidates stale UI; late actor-A responses cannot be
  applied to actor-B state. Same-origin XSS remains a residual risk.
- Known event IDs can use authorized GET for reconciliation. UNKNOWN create without
  a returned UUID cannot be declared resolved by similarity matching or timestamp.
  Do not infer committed/not-committed from absence in an unauthorized result.

If backend quarantine is not selected, Owner must approve an equally protective
alternative with recoverable evidence and tests before Gate A can pass. Do not
silently retain plaintext private metadata or delete UNKNOWN to simplify logout.
Journal design does not close OPEN-05 or promise exactly-once/cross-client deduplication.

401/403 may be classified as definitive rejection only after backend and browser
contracts prove pre-mutation refusal. Ambiguous responses remain UNKNOWN.
Reauthentication, refresh, actor switching and recovery never replay POST.
Lost logout acknowledgement locks the local UI; server revocation is not claimed
until confirmed. In-flight domain writes remain subject to §5.1 and quarantine.

## 8. Required API/proxy changes — design only

Candidate capabilities are pre-auth bootstrap, login, session/context, logout,
authorized quarantine recovery, and later membership administration. Names and
versioning remain OPEN. Existing routes need protected actor context and service
authorization; audit actor cannot stay a universal constant.

Frontend must use deliberate same-origin credential handling and CSRF headers.
Vite must explicitly allow selected security paths, forward approved Cookie/
Set-Cookie/CSRF behavior only to the fixed backend, support the selected HTTPS
profile and preserve route/method restrictions. Do not broadly forward identity
headers or Proxy-Authorization. No wildcard credentialed CORS. Backend independently
enforces Origin/CSRF and authorization. DemoStore stays separate and visibly labeled.

## 9. Security acceptance-test matrix

All new security tests below are NOT RUN; this documentation is not test evidence.

| ID | Required scenarios/evidence | Traceability |
|---|---|---|
| SEC-TEST-01 | Missing/invalid/idle-expired/absolute-expired/revoked sessions; fixation; storage outage; rotation/logout; no unauthorized domain mutation | NFR-01/04, D01/04 |
| SEC-TEST-02 | HTTPS/certificate/cookie attributes; pre-auth bootstrap binding; login/logout CSRF; foreign/null/alias/missing context; secret/artifact checks; stolen secret rejected after revoke | NFR-04, D04 |
| SEC-TEST-03 | Cross-site event/history/measurement IDOR; absent/foreign UUID response parity; no content or write leakage | FR-001, AC-01, D03/06 |
| SEC-TEST-04 | Forged site/org/actor headers/body; direct backend bypass; no membership; explicit multi-site grants | NFR-01, D02/03 |
| SEC-TEST-05 | UNKNOWN survives refresh/logout safely; original-actor recovery; shared browser/actor switch/multi-tab/stale response; no replay or evidence erasure | NFR-01/03, OPEN-05 |
| SEC-TEST-06 | Unauthorized access administration/self-escalation/cross-org admin; atomic grant/revoke audit; deterministic transaction races in §5.1 | FR-001, NFR-03, OPEN-02 |
| SEC-TEST-07 | Authenticated W-20–W-25 with database and audit assertions, zero automatic POST retries | NFR-03/04, OPEN-05 |

W-20/W-21: forward exactly one POST, prove backend 201 and committed record/audit,
then replace browser acknowledgement with test-only 503. UNKNOWN, refresh and
reauthentication cause no replay. Do not mark PASS without POST counts and DB proof.
W-22: invalid mass has no successful audit; explicit correction stays on the same
event. W-23: read/refresh preserve UUID without POST. W-24: exact Decimal strings,
null/zero, five statuses and provenance remain distinct. W-25: preserve HTTP
boundary tests and add CSRF/direct-backend negatives.

Use PostgreSQL 18 with synthetic `fwi_test/fwi_demo_test`, unique isolated schema
and existing role/database/version/schema/OID/owner guards before creation/cleanup.
Use multiple synthetic principals and two sites. Cleanup only execution-owned
schemas, even on failure. Browser POST tests use retries 0; Linux Chromium results
do not prove Windows Chrome results. Never write fixtures to development DB.

## 10. Requirement/acceptance traceability

| Requirement | Design and gate |
|---|---|
| FR-001 | §§5–6, administration SEC-TEST-06; Gate A partial, Gate B full FR-001 |
| NFR-01 / AC-01 | §§5,7; SEC-TEST-03/04/05; site/object isolation |
| NFR-03 | §§5.1,7; atomic audit, concurrent revocation, durable UNKNOWN evidence |
| NFR-04 | §4 HTTPS/CSRF/secrets; SEC-TEST-01/02; backup/evidence security remain separate |
| OPEN-02 | D02/D05, administration and configurable roles/SoD remain OPEN |
| OPEN-05 | §7 and W-20–W-25; no new idempotency/supersession/selection policy |
| OPEN-08 | D01/D04 require Owner choice; accepted technology ADRs are unchanged |
| W-20–W-25 | §9; authenticated browser and PostgreSQL proof required |

## 11. Migration and rollback implications

Future implementation may need principal, credential/session, membership/permission
and protected quarantine storage, plus actor audit changes. No physical schema or
migration is approved here. Preserve historic `synthetic-demo-actor` as legacy
attribution; do not relabel it as a new user. Preserve event/measurement IDs.

Review constraints, backfill, retention and application compatibility before any
migration. Rollback must not restore unauthenticated access or delete audit/UNKNOWN
evidence. If old code cannot enforce the security contract, disable protected
writes and forward-fix; destructive downgrade needs separate approval. Revoke
affected sessions and retain authorized reconciliation access.

## 12. Proposed implementation slices and dependencies

| Slice | Deliverable | Gate/dependency |
|---|---|---|
| S0 | Owner decisions, unresolved parameter resolutions, independent design review | Approved scope before code/schema task |
| S1 | Backend session/CSRF, site authorization, actor audit, quarantine foundation and seeded memberships | S0; real PostgreSQL negative/atomicity/concurrency tests |
| S2 | HTTPS browser/proxy/session lifecycle and private recovery, W-20–W-25 | S1; Gate A only, explicitly partial FR-001 |
| S3 | Authorized membership/role administration, audited changes/revocation | Approved D02/D05/D06; SEC-TEST-06; Gate B |
| S4 | Independent acceptance review with SHA-linked evidence and residual risks | Relevant tests PASS; human approval |

## 13. Unresolved Owner parameters and review checklist

OPEN parameters: verifier versus OIDC; credential issuance/reset/hash dependency
and rate limits; exact HTTPS profile approval and any HTTP exception; cookie
name/SameSite/persistence; CSRF/pre-auth TTL, renewal and multi-tab behavior;
idle/absolute/rotation/grace TTL; qualifying activity; session concurrency and
retention; role/permission matrix and organization visibility; bootstrap admin,
SoD/self-revocation/last-admin policy; final 401/403/404 and denied-event logging;
revocation serialization/locking/isolation/timeout policy; private journal storage,
registration/recovery/retention and admin reconciliation rights; endpoint/version
names; schema/backfill/rollback; Gate A versus Gate B acceptance scope.

Review checklist:

- [ ] SEC-D01–D06 selections/parameters are explicitly recorded; proposals are not accepted by implication.
- [ ] HTTPS and pre-auth/login/session CSRF are tested through proxy and direct backend.
- [ ] Object/site isolation and role/admin negative tests satisfy AC-01.
- [ ] Concurrent revoke/write ordering is proven with real independent transactions.
- [ ] Logout/refresh/shared browser preserve protected UNKNOWN evidence without replay.
- [ ] Atomic audit, stable event identity, Decimal/null/zero and W-20–W-25 remain intact.
- [ ] Gate A is not presented as full FR-001 or all P0/methodology acceptance.
- [ ] Migration/dependency scope and residual risks receive independent human review.

Residual risks: active-session XSS; stolen cookies before revocation; shared-device
history/cache; CSRF/proxy misconfiguration; login abuse; journal recovery/retention
trade-offs; lock contention and deadlocks; lost acknowledgements requiring manual
reconciliation. No production-security or exactly-once guarantee is made.

## 14. Guidance and evidence limits

Design references: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
and [FastAPI Security Scopes](https://fastapi.tiangolo.com/advanced/security/oauth2-scopes/).
These inform recommendations; they do not approve FWI parameters or replace
object-level policy. R3-FINAL refines only pre-auth/HTTPS/origins (§4), private
UNKNOWN quarantine (§7), concurrency (§5.1), and milestone acceptance (§6), with
their corresponding tests/traceability. No implementation or new test PASS is claimed.

**Implementation authorization: not granted. All SEC-D01–D06 remain OPEN.**
