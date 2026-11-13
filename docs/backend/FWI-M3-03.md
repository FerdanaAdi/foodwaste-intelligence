# M3-03 — synthetic site membership administration

Owner authorization (2026-11-13): explicit site-only administrative authority, separate from writer/reader; list, grant, change role, revoke, reactivate. No self-change, delegation, global access, account/password or master administration. Gate A and methodology unchanged; not full FR-001 acceptance.

## Concrete contract (implementation scope)
- Additive `auth_0007` after `int_p1_0006`: independent admin grants, explicit site eligibility roster, append-only membership change snapshots linked to atomic audit. Existing membership roles and historical actors unchanged. Downgrade refuses unconditionally; non-disposable downgrade risk remains OPEN.
- Controlled seed binds existing approved PERSONAS to their exact seeded site and grants one explicitly chosen existing principal administrative authority only on its own seeded site. No public/bootstrap endpoint or automatic regrant. No organization-wide inference.
- GET `/auth/memberships?site_id=UUID`: authorized site roster/memberships only. POST `/auth/memberships`: site_id, principal_id, action (grant/change_role/revoke/reactivate), role when applicable, required reason and expected_role/expected_active. No arbitrary user lookup. For grants, role changes and reactivation, ineligible/missing/foreign targets share concealed404; revocation may remove an existing same-site membership without a grant-eligibility entry; unauthorized site/action403; invalid/expired/revoked session401. All responses no-store and identity-bound.
- Before mutation: lock sorted actor+target principals, actor session, explicit site admin grant, roster and target membership. Existing protected writes lock the same target principal before authorization and retain locks through commit/rollback. Thus revocation/demotion committed first defeats a waiting write; an already-authorized write may finish first. No retroactive cancellation guarantee. No lock-order claim based on a recheck alone.
- Self-management denied, even for inactive operational membership. Admin grants are not editable through this API. Reader/writer role cannot convey administration. Strict HTTPS/Origin/CSRF and current session-binding apply.
- State preconditions reject stale commands409; this is not idempotency. Browser writes dispatch once. An ambiguous outcome leaves a tab-scoped principal/site/target lock across refresh/logout; GET cannot unlock. No cross-device/tab exactly-once guarantee or server reconciliation invented.
- UI provides roster selection, role/status, reason and explicit actions; no manual UUID grants; client permissions never replace backend enforcement.

## Verification and review
Independent targeted security review remains PENDING before merge. This is implementer-run evidence, not independent or Owner UAT acceptance.

## Security acceptance / review packet
| Guarantee | Evidence |
|---|---|
| Ordinary reader/writer cannot administer; direct service access=None denied | `tests/test_membership_admin_postgresql.py` negative API/service cases |
| Site A admin cannot inspect/manage Site B, missing/foreign principal concealed identically | same suite, foreign/self/spoof tests |
| Administration independent of reader/writer; no self-change or delegation | bootstrap, standalone admin and permission-response tests |
| Grant only exact seeded site roster; duplicate/stale state rejected | grant and state-precondition tests; no organization-wide inference |
| Session revoked/expired/idle, bad CSRF/Origin denied | API negatives plus existing Gate A regressions |
| Revoke/demote before authorization defeats waiting domain write | actual PostgreSQL wait_event/row lock observed with deterministic barriers |
| Already-authorized write commits before subsequent revocation | reverse-order deterministic PostgreSQL test |
| Membership, authenticated actor audit and old/new snapshot atomic | successful snapshots and injected snapshot-flush failure rollback |
| No GET unlock or replay after ambiguous admin POST | frontend tests and actual browser interception after confirmed DB/audit commit |
| Existing data/audit unchanged by additive upgrade | fresh, demo_0005 and int_p1_0006 upgrade tests + metadata comparison |

Review specifically: sorted multi-principal lock order versus Gate A single-principal operations; seed/roster provenance; no implicit admin rights on operational role changes; consistent 401/403/concealed404; audit rollback; session-bound stale response; UNKNOWN lock limitations. No security decision is delegated to client permissions.

## Limitations / forward fix
- Only existing approved synthetic PERSONAS are eligible on their exact original site. No public principal search, account/password creation, organization-wide grants, custom roles/permission editor or admin delegation/revocation interface.
- Bootstrap is a trusted explicit Python use case (`seed_membership_administration(factory, username, site_id)`), never startup/HTTP/self-registration. Call it only after independent database/schema guard verification. It does not reactivate operational access or reset passwords.
- State preconditions are optimistic checks, not request identity, idempotency, a version token or protection against all ABA histories. There is no server operation-identity reconciliation for UNKNOWN admin outcomes. Journal storage can be cleared by a user; no cross-tab/device exactly-once claim. A 401/403 or session transition may conservatively keep an ambiguous local lock.
- Every domain request rechecks current memberships under locks; existing sessions are not granted durable cached privileges. UI permission hints may require session refresh after an admin change; backend remains authoritative.
- New migration refuses downgrade even on empty tables. No downgrade was run. Historical auth_0002 empty-security rollback regression is pinned to auth_0002, not the new head; its five downgrade tests are explicitly NOT RUN by this task. Existing P1/P2 non-disposable downgrade hazard FWI-09A-F01 remains OPEN; do not infer a global protective fix from auth_0007.
- Complete FR-001/field/production acceptance, custom role/permission administration and broader identity governance are not claimed. No changes to ADR-004, methodology, UAT or HELD KPIs.
 No push/PR/merge/deploy/UAT authorization. OP-08/FI-02/NI-03 HELD.

## Exact scoped files (local packaging)
- Auth/application/models/seed: `src/fwi/api/routes/auth.py`, `src/fwi/application/security.py`, `src/fwi/application/membership_admin.py`, `src/fwi/infrastructure/database/models.py`, `src/fwi/infrastructure/database/security_seed.py`.
- New additive migration: `migrations/versions/auth_0007.py`.
- UI/client/navigation/proxy: `frontend/src/backend/auth.ts`, `frontend/src/backend/memberships.ts`, `frontend/src/pages/BackendMembershipPage.tsx`, `frontend/src/App.tsx`, `frontend/src/components/layout/AppLayout.tsx`, `frontend/vite.config.ts`.
- Regression/fixture: `tests/test_membership_admin_postgresql.py`, `tests/test_security_postgresql.py`, `tests/test_integrated_migrations_postgresql.py`, `frontend/tests/backend-memberships.test.tsx`, `frontend/tests/backend-proxy.test.mjs`, `frontend/e2e/membership-admin.spec.mjs`, `frontend/e2e/backend-fixture.mjs`, `frontend/e2e/persistent-capture.spec.mjs`, `scripts/browser_e2e_harness.py`.
- Documentation: this file and `docs/ai/HANDOFF.md`.

No domain/mass/KPI/API business route, accepted ADR/PRD, dependency or lockfile changes. Existing business APIs keep Gate A semantics; only the new administration boundary and session permission disclosure are extended.

## Actual implementer verification (2026-11-13)
- `PYTHONPATH=src PYTHONDONTWRITEBYTECODE=1 FWI_REQUIRE_POSTGRES=1 python -B -m pytest -q -p no:cacheprovider -k "not downgrade and not migration_preserves_legacy_audit_and_reverses_only_without_security_evidence"`: **510 PASS + 6 subtests**, 5 downgrade tests explicitly deselected/NOT RUN, 157 Starlette/Alembic warnings. PostgreSQL18.6; fwi_test/fwi_demo_test; owned UUID schemas. Includes19 Gate B tests, actual lock waits in both orderings, fault-injected audit rollback, fresh/P0/current-main upgrades and metadata equality. No downgrade command executed.
- `npm --prefix frontend test -- --maxWorkers=2`: **407 PASS**,28 test files,0 skipped (12 new Gate B frontend tests). Final suite ran separately from PostgreSQL/browser; same worker count, timeouts and retries. Typecheck separately passed during implementation; final `npm --prefix frontend run build` reruns tsc then Vite and PASS. Existing548.65kB bundle warning remains.
- Real TLS proxy `npm run test:proxy`: **4 PASS,0 SKIP**. Full Windows installed Chrome HTTPS `npm --prefix frontend run test:e2e:ci`: **21 PASS,0 FAIL/SKIP/flaky**,1 worker/retries0. Includes original19 Gate A/P0 journeys and2 new admin journeys; temporary local test TLS profile only, Vite verifies backend CA, no OS trust-store changes. Full browser21 evidence retained independently of final focused run.
- Final focused `npm --prefix frontend run test:e2e:ci -- membership-admin.spec.mjs`: **2 PASS,0 FAIL/SKIP/flaky**, fresh2 owned schemas cleaned, TLS removed and pre-existing schema identities unchanged; this follows the last narrow change allowing revoke of existing site access without new grant eligibility.
- `python -I scripts/verify_kit.py`, `pip check`, AST/JS syntax/import-origin checks and `git diff --check`: PASS. Imports from this worktree, not another checkout. No dependency installation.
- Evidence outside Git: `C:/Users/Ferdana/.codex/visualizations/2026/11/03/01a19f89-4e72-7322-8dcd-dbf34844a92a/FWI_M3_03_20261113/`. Schema names/OIDs/owners of the2 pre-existing schemas match the prior M3-02 inventory fingerprint; fixtures clean only their own UUID schemas. Browser records include exact role/database/version, run token, owned schema OIDs, cleanup and no remaining owned schemas. No UAT services/credentials/data were used.

### Failed attempts retained, not relabeled as PASS
- Initial Gate B backend10 PASS/6 FAIL: strict Pydantic UUID mode rejected ordinary JSON UUID strings422. Replaced with standard UUID parsing and strict boolean state precondition; final tests pass. One TypeScript optional audit-ID type error corrected.
- Initial full backend505 PASS/1 FAIL: historical assertion expected no administration endpoint404. Replaced with a valid command proving ordinary writer is denied403; all original IDOR/read/write/nonmutation checks retained. Final full backend510 PASS.
- First proxy recorder failed because the new auth query path was not forwarded (SPA200 was not backend proof). Corrected exact proxy pattern and retained exact recorder method/count assertions; real proxy4 PASS.
- Initial browser19 PASS/2 FAIL: unintentional Windows text decoding changed two old arrow selectors. Restored original UTF-8 text and verified minimal diff; full21 then PASS without weakening assertions. An initial inventory comparison overlapped this task's own PostgreSQL test fixture lifecycle; final serial inventory check proves the2 pre-existing names/OIDs/owners unchanged and all owned browser schemas removed.
- A concurrent run of full two-worker Vitest during PostgreSQL/Chrome load had403 PASS/3 FAIL (two5s timeouts plus a following render assertion). Preserved logs. Final identical two-worker configuration run without other heavy suites:407 PASS in47.19s versus220.60s under contention. No global timeout increase, retry, skip or assertion removal. This is evidence of resource sensitivity, not a claim that all possible flakiness has been eliminated.
- Existing React act/jsdom navigation diagnostics, Windows connection reset/bounded-shutdown and bundle warnings remain visible in logs. Linux GitHub CI and independent security review NOT RUN/PENDING. No production, field, full-FR-001 or Owner UAT acceptance claimed.
