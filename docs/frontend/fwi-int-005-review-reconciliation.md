# FWI-INT-005 — Final verification and review reconciliation

Status: **PARTIAL — browser writer gate remains BLOCKED**.
Reviewed implementation HEAD: `aa2d33c8c3978c5b4385ec4e9e3f28bcc7314f2c`.
Independent review: **Antigravity APPROVE WITH CONDITIONS, as reported by Owner**.
GitHub PR #15 returned no published review/comment records during this verification;
the full external review report was not available to quote. The corrections below
address the three specific reporting errors identified by Owner against actual code.
This reconciliation changes documentation/tests only, not the reviewed implementation.

## 1. Correct mass-basis contract

The repository's six provisional codes are exactly:

`raw`, `after_preparation`, `cooked`, `ready_to_eat`, `as_served`, `other_documented`.

Evidence: `frontend/src/backend/contract.ts`, `frontend/src/domain/types.ts`,
`src/fwi/domain/measurements.py`, and `docs/domain/waste-event-measurement-v0.1.md`.
Do not substitute a different six-item list, map `as_served` to `served`, or treat
`plate_leftover` as a mass basis. These are working repository codes, not a newly
validated final controlled vocabulary from FWI-03.

## 2. Owner decision mapping

The D-01–D-06 identifiers below trace to the six numbered approval items in the
FWI-INT-005 blueprint in this task conversation, subsequently approved by Owner.
They are not a new approval request or a redefinition of research decisions.

| Decision | Correct concern |
|---|---|
| D-01 | Separate backend capture with explicit API demo event/status subset; no legacy fixture migration |
| D-02 | Two scoped POSTs on the local proxy, with origin/path/method boundaries |
| D-03 | Authorized synthetic organization/site context and write target; tests use fwi_demo_test |
| D-04 | Input UX: manual gross/tare/net decimal strings, explicit timezone, mandatory method/provenance |
| D-05 | Two application-owned transactions: event may remain saved when measurement fails |
| D-06 | Unknown POST outcome policy: no automatic retry; supervised reconciliation/journal limits; no exactly-once claim |

In particular D-03/D-04 are context and UX; D-05/D-06 are transaction and ambiguous
outcome behavior. Reviewer labels must not exchange these concerns. The approval
does not authorize production use, new schema, or a new idempotency mechanism.

## 3. sameInstant and microseconds

`frontend/src/backend/write.ts` deliberately separates two comparisons:

1. `seconds(value)` strips the fractional part and compares the timestamp seconds
   with `Date.parse`, accounting for explicit offsets.
2. `fraction(value)` extracts the original fractional digits and pads to six places.
   Equality requires this separate fraction comparison to match as well.

Therefore the claim that microseconds are discarded solely because Date has
millisecond resolution does not describe the complete implementation. Within the
accepted runtime input contract (at most six fractional digits), a difference such
as `.123456` versus `.123457` is detected. Equivalent offset representations with
the same fraction are accepted, as are `.1234` and `.123400`.
Targeted regression exercises the public create-event response association path for
these three cases. No production code change to sameInstant was needed.

## 4. Scope of independent-review evidence

The review and this reconciliation establish consistency only with the repository
contracts, accepted demo decisions and source files actually inspected. Original
FWI-01/02/03/04 documents remain unavailable locally. Neither an approval verdict nor
passing code tests proves full FWI-03 v1.3/FWI-04 v0.1 methodological conformance,
all source desk scenarios, metrological validation, field validation, or production
readiness. OP-08/FI-02/NI-03 remain HELD. Scientific vocabulary, precision/rounding,
correction/reconciliation and idempotency remain outside this change.

## 5. Actual final browser attempt

Official Windows Computer Use could initially identify Chrome and the loopback URL,
open a test tab, and navigate to `/backend-demo/capture`. After starting the services,
Computer Use stopped on reload because the Windows browser URL could not be
determined confidently enough to enforce policy. No further UI input, retry via
another driver, or bypass was attempted.

| Scenario | Final browser status |
|---|---|
| Create event / add measurement / read-after-write | NOT RUN |
| Same UUID, refresh, Decimal, null/zero, error recovery, network | NOT RUN |
| W-20/W-21 lost acknowledgement after commit and no replay | NOT RUN |
| W-22–W-25 writer browser checks | NOT RUN |

Prior automated tests remain evidence for their own scope, not browser PASS.
The earlier CI at aa2d33c was SUCCESS for frontend/backend. Existing automated
evidence was 98 Vitest, 73 backend tests plus 6 subtests, including 14 PostgreSQL
cases, proxy PASS, typecheck/build/kit PASS. This turn adds only three fractional-
second regression cases and runs targeted validation; latest CI is recorded on PR #15.

## 6. Database identity, audit and cleanup

Before any possible browser POST, the host verified `fwi_test / fwi_demo_test` on
PostgreSQL 18.6. The existing fixture checked role/database/PG18 and a UUID4 schema
name before creation/migration, and uses exact-created OID/current-owner checks
before cleanup. Test schema:
`fwi_demo_test_77e07a5eee6d41738cb9f49068d20054`.

The only fixture writes were synthetic organization/site setup and their two audit
records. No event/measurement POST occurred; fault injection was not armed. The
browser block means no new browser read/write or non-mutation proof can be claimed.
The harness stopped FastAPI, disposed connections and completed guarded cleanup;
Vite was stopped. Final SQL confirmed the exact schema absent and no test listeners
on 8000/5173. No fwi_demo_dev access was performed in this final attempt.
Original GOV untracked file and frontend QA worktree were preserved.

## 7. Owner merge review gate

PR #15 remains draft and is **not ready for Owner merge approval** while writer
browser E2E is missing. Reconciled reporting errors do not substitute for that
condition. Resume with officially permitted Chrome access and a fresh guarded test
schema; perform the scoped writer and W-20/W-21 scenarios, inspect data/audit and
network, then clean only that execution's schema. No new D/W approval is required.
