# FWI-SEC-01 — Demo Authentication & Site-Scoped Authorization Decision Packet

**Status:** PROPOSED — NOT APPROVED / NO CODE AUTHORIZED · **Date:** 2026-11-07

**Target:** Synthetic MVP P0, not production identity or real MBG/SPPG access. **Decision owner:** FWI Owner; security/domain independent review required before ADR or schema migration. **Git baseline:** `main` merge commit `1fa344a9498ecded139a7e350a8e999b0feced79` after PR #15. Any change in baseline requires reconfirmation before implementation.

## 1. Research → product traceability

- **Research/architecture basis:** FWI-02 v1.0 separation of event/measurement, FWI-04 MVP v0.1, PRD v0.1 `FR-001`, `NFR-01`, `AC-01`, `OPEN-02` (roles/RACI), `OPEN-08` (auth provider), and `DR-01`/`DR-02` (event/measurement identity). Repository `FWI-ARCH-001 v0.2` proposes User/Role/UserRoleScope and a permission check. Final source amendments, if any, must be consulted; this packet does not invent national roles.
- **Current implementation:** demo FastAPI `src/fwi/api/routes/demo.py` explicitly says no authentication; UI `/backend-demo/capture` and backend event/measurement POST/GET are synthetic prototype flows. PostgreSQL demo tables include Organizations/Sites and events, but not a verified user identity/membership authority. Vite Origin/allowlist is **not** authorization. Never expose as a secure production service.
- **Operational problem:** authenticated persona A must not view or mutate organization/site B records by guessing IDs, constructing URLs, or bypassing client UI. Conversely, legitimate site-scoped users need a reproducible synthetic login and traceable actor identity. The absence of this protection blocks full P0 site-scoped dashboard, evidence, and export.
- **User needs:** choose among authorized sites, see allowed functions only, understand denied access without object information leak, and have access/changes auditably attributed.

## 2. Decision questions (Owner approval required)

| ID | Decision | Evidence/acceptance consequence |
|---|---|---|
| SEC-D01 | What is the P0 identity/authentication boundary: local synthetic demo only, or external IdP? | Defines session/token strategy, libraries, deployment limits and test harness. Do not silently convert demo personas into real people. |
| SEC-D02 | What are minimal roles, membership cardinality, and site vs organization authority? | PRD roles are functional suggestions; duties, cross-site auditor, and segregation of duties remain `OPEN-02`. |
| SEC-D03 | What is effective authorization for direct-object reads/writes, site switching and history? | Deny-by-default, authorization in FastAPI/service query, no cross-site IDOR, response policy 403 vs 404 and audit. |
| SEC-D04 | What are synthetic credential/session lifecycle and secure storage constraints? | Test credentials must not be production secrets; expiry, revocation, storage, CSRF where cookies used, and test isolation required. |
| SEC-D05 | Who is permitted to administer memberships and how are changes audited? | P0 audit requirements; no self-approval/privilege escalation silently. |
| SEC-D06 | Does FWI need org-level visibility beyond site-level in P0? | Controlled query scope for ledger, measurement, evidence, dashboard and export. No implicit global site access. |

## 3. Options considered — all provisional

| Option | Benefits | Risks / costs | Suitability |
|---|---|---|---|
| **A. Backend-issued short-lived opaque demo session, validated on every request, plus stored synthetic membership** | UI can demonstrate login and denied cross-site access, no externally managed provider; server owns authorization; revocation/session audit possible. | Requires synthetic login verifier, session/CSRF protection if cookie-based, secure token handling, additional state/tests. Must never be described as real production auth. | **RECOMMENDED FOR P0 DESIGN REVIEW**, conditional on SEC-D01–D06 decisions. |
| **B. Backend-validated short-lived bearer tokens for synthetic identities** | Easier headless API tests and explicit credentials; no cookie CSRF on token requests. | Secret storage/XSS/token theft, revocation and lifecycle; a mere static persona header is NOT authentication. | Alternative if deterministic test API usability outweighs session UX; token issuance must authenticate something. |
| **C. External OIDC provider** | Standards-based identities and sophisticated claims handling. | External service, consent/accounts, dependency/maintenance, cost and scope expansion. | DEFER until justified and Owner approves connection/dependency. |
| **D. Client-controlled `X-FWI-Demo-User` with no verification** | Fast UI-only simulation. | Trivially spoofed, fails genuine backend auth claim. | **REJECT** as P0 authorization/security solution; acceptable only as visibly labeled mock fixture outside protected API. |

**Provisional recommendation:** Option A, subject to Owner/security approval and a follow-on ADR. This is **not** an accepted technology or permission to migrate schemas. Do not hardcode real credentials or identifiers of actual students/SPPG personnel.

## 4. Required architecture invariants if approved

1. Backend establishes authenticated actor identity independently of user-supplied `site_id`, `organization_id`, event IDs or display name. Default unauthenticated requests are rejected.
2. Actor's effective membership and role/site scope are resolved server-side on every protected operation (including direct-object GET, measurement POST and future evidence/export). Authorization must be enforced in data-access/service layer, not only React menus or Vite proxy.
3. For create, assert supplied site belongs to authorized organization and actor has that site. For read/write by event UUID, resolve event's site/organization and verify rights before returning content; avoid revealing foreign-site object existence.
4. Role/membership changes have actor/reason/time audit; synthetic identities are traceable; remeasurement cannot silently alter event identity or read history of another site.
5. Transaction/audit integrity, exact Decimal, missing!=zero, event/measurement separation and protected UNKNOWN handling remain unchanged. No KPI activation or material transfer/disposition inference.
6. Demo-only operation is visibly marked; no real-person data, external identity provider, production deployment or government integrations without separate authorization.

## 5. Acceptance criteria and negative tests

- **AC-01:** a member of Site A can access Site A event/measurement records but cannot read or write Site B records by changing route, UUID, body site field or direct API invocation. Apply to current GET/POST, then evidence/dashboard/export as implemented.
- **Authentication:** missing/invalid/expired/revoked session cannot access protected routes; privilege-less actor cannot change membership; no UI-only fake gate.
- **Membership:** change/removal takes effect within a documented scope; actor with no site sees no records; permitted multi-site selection requires explicit server authorization, not client filtering.
- **Security:** test direct-object attempts, IDOR, site spoofing, escalation, cookie CSRF if selected, browser refresh/logout session lifecycle, deny responses without foreign-site data leakage.
- **Data integrity:** one event UUID stable, measurement history append-only, audit attribution, NULL/zero and decimal unchanged; existing W-20–W-25 and PostgreSQL test suite regressions remain PASS.
- **Repository safety:** synthetic fixtures only and isolated PostgreSQL 18; no schema migration or new dependency without scoped task approval; diff, tests and security reviewer linked to SHA.

## 6. Staged implementation sketch (NOT AUTHORIZED)

1. **FWI-SEC-01A (decision/ADR only):** Owner selects SEC-D01–D06; review identity threat model and accepted design. No application edits.
2. **FWI-SEC-01B (backend authorization, after ADR):** create isolated branch/worktree, actor/session boundary, membership model and event/measurement authorization tests. Preserve existing demo API or explicitly version a successor API; no backwards compatibility assumptions.
3. **FWI-SEC-01C (frontend and E2E, after backend):** login/site selector and allowed/denied journey, Linux Chromium E2E, regression of W-20–W-25; avoid returning to DemoStore silently.
4. **FWI-SEC-01D (downstream dependencies):** apply access policies consistently to evidence, review, persistent dashboard, export when those FRs are built.

## 7. Owner decision register (all PENDING)

| Decision | Status |
|---|---|
| SEC-D01 P0 identity/auth boundary | OPEN — Option A proposed |
| SEC-D02 roles and membership | OPEN — functional roles illustrative only |
| SEC-D03 direct-object/site policy | OPEN — deny-by-default requirement established, response details to decide |
| SEC-D04 credential/session policies | OPEN |
| SEC-D05 admin/audit segregation | OPEN |
| SEC-D06 org vs site access hierarchy | OPEN |

**Ready-for-implementation gate:** approved ADR/Owner decision + explicit task ID, exact paths, regression suite, test fixture boundary and reviewer. **Do not implement, commit, deploy or merge based only on this packet.**
