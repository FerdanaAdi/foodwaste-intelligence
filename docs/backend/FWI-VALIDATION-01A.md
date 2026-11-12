# FWI-VALIDATION-01A — validation, review and correction history core

Status: IMPLEMENTED LOCALLY / INDEPENDENT REVIEW PENDING. Pure synthetic core,
not complete FR-006 or a permissioned/persistent review workflow.
Branch `codex/fwi-validation-01a`, worktree `D:/Projects/fwi-validation-01a`,
baseline `e3d4cac3a8bd3eb640d421b5c3f27351d11115dc`.

## Exact new and modified files

| Path | Change |
|---|---|
| `src/fwi/domain/measurements.py` | Extend the existing frozen ValidationRecord additively; no second validation contract |
| `src/fwi/domain/review.py` | TargetRef, ReviewerDecision, CorrectionRecord and strict immutable metadata/snapshot helpers |
| `src/fwi/application/review_history.py` | Target registry, append-only public history operations and proposal guards |
| `tests/test_review_history.py` | 81 deterministic synthetic tests, including actual API snapshot compatibility |
| `docs/backend/FWI-VALIDATION-01A.md` | This contract/evidence/limitations/review handoff |
| `docs/ai/HANDOFF.md` | Isolated task summary; historical baseline content preserved |

No source edits in main or another worktree. No auth/API/ORM/migration/dependency,
PRD/domain-contract/accepted-ADR, KPI, export, evidence, master-data or DQ feature changes.
No staging, commit, push, PR, merge, deployment, reset, clean or stash.

## Source and methodology alignment

Read AGENTS, PRD FR-006/J-02/AC-05/AC-09/DR-13, the existing domain contract,
actual event/measurement/audit models and relevant accepted ADR-001/002 sections.
The existing `validate_demo_measurement` checker is reused, not replaced by a new
DQ engine. No FWI-03 formula, mass conversion or threshold was introduced.

**SOURCE_UNAVAILABLE:** full FWI-02 v1.0 and FWI-03 v1.3 were not found in the
scoped repository inventory. No claim of reading those sources, running their
unavailable 30 desk cases, or validating the full methodology. The domain contract
remains PROVISIONAL. OP-08/FI-02/NI-03 stay HELD.

PROVISIONAL implementation labels, not canonical vocabulary:

- Validation labels: `unvalidated`, `needs_review`, `flagged`, matching the
  existing repository demo vocabulary in frontend/src/domain/types.ts and the
  domain prototype. Unknown/approved/blocked labels are rejected by this history
  boundary; no final status transition model is claimed.
- Reviewer decision: only `request_correction`, a technical label for PRD J-02's
  existing correction-request action. Other reviewer decisions remain OPEN-04.
  This label records a request; it neither grants a role nor executes a correction.
- Local rule ID `repo-demo-mass-v0.1` names only the existing repository demo
  checker. It is not an official/canonical FWI-03 rule. Unknown rule IDs are
  rejected until a supported registry/source contract exists.

## Interfaces and invariants

`ReviewHistory(events, measurements)` takes flat snapshots from trusted caller
selection, not a DB connection. Registry keys use `TargetRef('event'|'measurement',
identity)`. Existing backend UUIDs and prototype string identities are supported;
no new canonical ID format is imposed. Duplicate source IDs/orphan measurements
are rejected. Existence means membership in this supplied registry; the future
application must verify actual database existence and site scope.

- `original(target)` returns a detached, read-only source snapshot.
- `targets`, `history` and `history_for(target)` expose immutable tuples/views.
  History keeps explicit append order, not a latest-wins or canonical selection.
- `add_validation(ValidationRecord)` requires stable ID, explicit target type/ID,
  actor, aware validation timestamp, source, reason and supporting provenance.
  measurement_id is the same measurement identity as target_id, never a second
  observation. For event validation measurement_id must be None.
- Legacy four-positional-argument ValidationRecord construction still works.
  Such an old value cannot enter the richer history without explicit metadata;
  no MeasurementRecord or legacy validation behavior was silently rewritten.
- Optional rule_id/outcome are either both absent or identify the supported local
  measurement rule plus a boolean. The declared outcome is checked against the
  actual original snapshot using the existing checker. NaN/Infinity/negative/
  inconsistent mass cannot be recorded as passing that rule. Failed results must
  retain the checker's specific failure reason within the record reason.
- `add_review(ReviewerDecision)` records actor, time, rationale, source and
  provenance separately from a validation result. Optional validation links must
  reference an existing validation of the same target.
- `propose_correction(...)` captures original_values and an immutable proposed
  field delta, plus actor/time/reason/source/provenance and optional same-target
  reviewer-decision link. It never applies values, creates an event or deletes
  source/history. Each proposal compares with the registered original snapshot;
  proposals do not silently compose into a corrected source revision.
- History identifiers are unique across these entry kinds in one history
  instance. Failed operations do not append partial entries. No overwrite/delete
  API, approval action, effective-status reducer or automatic blocked inference.

Frozen values and private in-process storage provide API-level immutability,
not a tamper-proof, durable or concurrency-safe audit database. Process exit loses
this pure instance; persistence and authorization are separate integration work.

## Correction surface and data fidelity

Initial PROVISIONAL technical surface: event proposals change occurred_at only.
Event taxonomy, scope reassignment and identity corrections are deferred rather
than inventing a policy. Measurement proposals support existing gross/tare/net,
original_unit, mass_basis, method, provenance, observation_status and measured_at.
Fields must exist in the original snapshot. Identity, event FK, site/org scope,
recorded_at audit time and validation_status rewriting are rejected.

Snapshots/proposals retain exact strings or Decimal values, original units and
basis, and distinguish observed/estimated/missing/not_measured/measured_zero.
They are detached flat immutable mappings; floats, nested mutable values and
mass bool/int coercion are rejected. No numeric coercion or rounding is applied
to the original snapshot. ISO timestamp strings remain unchanged; aware datetime
objects are retained. Invalid/naive source or history/proposal timestamps fail.

Historical invalid mass text can be held for review and linked to a failed local
checker result; it is not admitted as valid domain data. A proposed measurement
must have complete existing demo mass/status context and pass the existing checker
on the original+delta candidate. Missing-to-zero without explicit gross/tare/net
is rejected, never imputed. Even a consistent candidate remains a proposal, not
scientific validation, reviewer approval or a changed effective source record.

## Requirement traceability

| Requirement | Core evidence | Acceptance boundary |
|---|---|---|
| FR-006 / DR-13 | Explicit validation, separate reviewer request, correction provenance and frozen original history | No persistent audit/reviewer workflow, dedup warning UI or authenticated API |
| AC-05 | Existing checker reused; four invalid mass cases retain outcome False + specific reason; contradictory passing claims rejected | Only repo demo checks, not full FWI-03 methodology or approved final rule registry |
| AC-09 | Two reviewer requests/two proposals retain prior entries, original values, actor, timestamp, rationale and links | Proposal traceability only; actual correction application/supersession policy remains OPEN-05 |
| AC-03 / AC-06 | One event with two measurement identities; no aggregation; missing remains None while measured-zero is explicit | No KPI/summary or canonical measurement choice |

## Actual verification — implementer, 2026-11-08

Existing Python 3.14 dependency environment reused read-only; no installation.
PYTHONPATH explicitly selected this worktree/src and fwi.__file__ was asserted
inside that path, avoiding the dirty main editable source. Python -B prevents
bytecode writes. DB URLs removed from the child environment.

- Final focused command: `python -B -m pytest tests/test_review_history.py -q`:
  **81 PASS**, 0 FAIL/SKIP; final API compatibility and specific failure-reason
  cases included.
- Combined selection: `pytest -q --ignore=tests/test_demo_postgresql.py`, actually
  executed via pytest.main under a mock.patch of psycopg.connect that raises on
  any attempted DB connection: **147 PASS + 6 subtests PASS**, 0 FAIL/SKIP.
- `python -B -I scripts/verify_kit.py`: PASS.
- `python -B -m pip check`: PASS, no broken requirements.
- `git diff --check`, new-file syntax/whitespace and scope checks: PASS.
- PostgreSQL integration, migrations, API/browser and security tests: NOT RUN;
  no persistence/security implementation was added here and no DB was accessed.
- Existing Starlette/httpx deprecation warning remains; no dependency update.

Tests cover every requested category: existing/invalid target, repeated history,
reason/actor/time/source links, immutable originals/proposals, repeated measurements,
missing/zero and estimated, long decimals under low context precision, units/basis,
naive/malformed time, fabricated status/decision/rule, duplicate history identity,
no flagged/needs_review promotion, source/failure truth, forbidden identity/scope/
audit edits, referential links and actual API UUID/Decimal snapshot compatibility.

## OPEN decisions and integration prerequisites

- SOURCE_UNAVAILABLE methodology sources; final validation/outcome/decision
  vocabularies and versioned rule registry (OPEN-04).
- Actual correction application, review approval/rejection, version/supersession,
  effective status, conflicting proposals, canonical measurement, backdated review
  and selected-reporting semantics (OPEN-05). No such transitions are implemented.
- Reviewer separation-of-duties and authorized actions (OPEN-02); actor IDs here
  are supplied metadata, not verified identities or permission grants.
- Owner-approved history persistence/schema/migration/retention contract. Enforce
  unique IDs, target/reference FKs, source revision integrity and transaction-level
  atomic history+audit on the accepted PostgreSQL stack. Original input lexemes
  already lost upstream cannot be reconstructed from NUMERIC/Decimal.
- Authenticated server derives actor, site membership and action permission,
  loads scoped existing target snapshots, then calls this core. No implicit
  organization-wide access or unauthenticated compatibility endpoint. Membership/
  revocation vs review/correction concurrency and audit attribution need integration
  tests under the approved security contract after Gate A.

Independent review is PENDING. Review the additive ValidationRecord compatibility,
provisional vocabulary, same-target references, specific failed-rule reasons,
proposal-only behavior and immutable original values. Full FR-006/AC-09 acceptance
is NOT claimed. Other concurrent worktrees were not edited.

## Exact Git status at handoff

Index empty; baseline HEAD unchanged.

```text
 M docs/ai/HANDOFF.md
 M src/fwi/domain/measurements.py
?? docs/backend/FWI-VALIDATION-01A.md
?? src/fwi/application/review_history.py
?? src/fwi/domain/review.py
?? tests/test_review_history.py
```
