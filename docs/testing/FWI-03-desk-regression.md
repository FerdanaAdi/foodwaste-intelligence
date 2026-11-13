# FWI-03 v1.3 desk-regression traceability and data safety

## Source and interpretation

Source: `C:/Users/Ferdana/Downloads/FWI-03_Consolidated_Methodology_v1_3.docx`, section13, exact original IDs T01–T30. Source SHA-256: `5394dbcb7fd914a6635013cf7eb4eb7d2c293ffcab79561a10333b8176a6fa5a`. Read-only source extraction; no research edits.

This maps source desk cases to **actual product capability**, not just to the existence of tests or equivalent standalone arithmetic. The source's illustrative formula results are not authorization to activate a product KPI. `PASS GUARD` means only the source's rejection/no-numeric-result case is covered by an existing accepted domain contract. `PARTIAL`, `BLOCKED` and `NOT IMPLEMENTED` are not PASS. Candidate test names such as `test_t01_repeated_measurements...` use unrelated P1-candidate IDs; they must never be confused with FWI-03 T01 receiving rejection.

| Source ID | Case / source input | Source expected result | Current product coverage | Test evidence / remaining gap |
|---|---|---|---|---|
| T01 | Receiving rejection:4/100 | 4.00%; reject/return is not automatically waste | NOT IMPLEMENTED | Receiving rejection numerator/denominator calculator absent; receipt identity tests do not prove this ratio. |
| T02 | Storage spoilage:3/120 | 2.50%; lot/inventory trace | NOT IMPLEMENTED | Observed stock and movement exist; inventory-period denominator policy remains provisional. |
| T03 | Preparation edible loss:0.6/12 | 5.00%; same item/process | NOT IMPLEMENTED | No approved edible-loss numerator/denominator API; KPI preview stays blocked. |
| T04 | Inedible trim:1.4/3.5 | 40.00%; trim denominator only | NOT IMPLEMENTED | Separate fractions/denominator not implemented by this slice. |
| T05 | Yield:75kg cooked/30kg raw | 2.50; same recipe/batch | BLOCKED | Current same-basis-only contract deliberately blocks cross-basis yield; test_p1_domain.py::test_yield_blocked_without_pairs_or_comparable_basis. No claim of numeric source-case support. |
| T06 | 10kg cooked waste /Y2.5 | 4kg raw-equivalent; actual stays10kg cooked | BLOCKED | No authorized raw-equivalent conversion. mass-basis preservation alone is not this conversion test. |
| T07 | Production actual112 vs plan100 | 12.00%; not waste evidence | NOT IMPLEMENTED | No production-overrun calculation with accepted plan scope; production records are not proof of this KPI. |
| T08 | Unserved edible9/available90 | 10.00%; disposition separate | NOT IMPLEMENTED | Disposition record support does not implement surplus-ratio denominator. |
| T09 | Edible plate waste18/served150 | 12.00%; same sample/scope | NOT IMPLEMENTED | No approved plate-waste denominator/selection/sampling implementation. |
| T10 | 18kg waste/180 meals | 100g/meal; same sample cohort | NOT IMPLEMENTED | Serving record support does not authorize sampled denominator extrapolation. |
| T11 | 4kg raw loss ×Rp12500/kg | Rp50000 managerial; not accounting recognition | BLOCKED | application/p2.py::cost_valuation always blocks until cost ownership/source/allocation approved. |
| T12 | 3000g ×35kcal/100g | 1050kcal; correct food form | NOT IMPLEMENTED | No nutrient/recipe-composition mapping; do not substitute hypothetical arithmetic for product coverage. |
| T13 | Irrecoverable batch7/output140 | 5.00%; failed subset of output | NOT IMPLEMENTED | Failed-batch subset and denominator contract not implemented. |
| T14 | Available50/accounted50 | 0.00% residual; complete boundary | NOT IMPLEMENTED | No complete-boundary balance calculator; no zero residual inferred from absent records. |
| T15 | 1 extra duplicate/2 reviewed | 50.00%; confirmed duplicates only | NOT IMPLEMENTED | Stable identity/unique constraints exist but confirmed duplicate-review denominator/rate does not. |
| T16 | 0/1 scheduled measurement completed | Coverage0%; waste KPI N/A; missing≠zero | PARTIAL | test_fwi03_desk_guards.py::test_fwi03_t16_missing_is_not_measured_zero_guard_only PASS. Scheduled-opportunity coverage denominator is absent; no coverage% PASS claimed. |
| T17 | Numerator5/denominator0 | N/A; no divide-by-zero | PASS GUARD | test_fwi03_desk_guards.py::test_fwi03_t17_five_over_zero_has_no_numeric_result PASS against existing batch_yield (blocked/null with reason). Not general KPI activation. |
| T18 | 20kg raw numerator/100kg cooked denominator | BLOCK; incompatible basis | PASS GUARD | test_fwi03_desk_guards.py::test_fwi03_t18_raw_twenty_over_cooked_hundred_is_blocked PASS; no conversion or ratio emitted. |
| T19 | 0.8kg event +0.8kg compost disposition | One event;0.8kg counted once | PARTIAL | test_fwi03_desk_guards.py::test_fwi03_t19_disposition_link_keeps_one_event_guard_only PASS; test_p1_postgresql.py::test_dispositions_never_duplicate_events_and_rescue_gate supports persisted identity. Raw observation0.8 is not selected/effective reportable mass (OD-P1-02 OPEN). |
| T20 | Gross100g,BDD60%,35kcal/100g edible | 21kcal; apply BDD once | NOT IMPLEMENTED | No nutrient/BDD conversion; edible-net exception cannot be tested as implemented. |
| T21 | Same Rp50000 material pool FI01/FI02 | Block duplicated cost pool | BLOCKED | FI-02 HELD; valuations blocked. test_p1_domain.py::test_held_kpi_never_returns_numeric_on_any_path verifies held gating only; cost-pool overlap engine absent. |
| T22 | 10kg cooked waste /correct batchY2 | 5kg raw-equivalent; no borrowed yield | BLOCKED | No accepted raw-equivalent mapping; cannot substitute another batch or global yield. |
| T23 | 3/4 due checks on-time+passed | 75.00%; missed/failed remain denominator | NOT IMPLEMENTED | Due check scheduling and compliance reducer absent. |
| T24 | Inventory available60/accounted58 | 3.33% descriptive variance; no universal threshold | NOT IMPLEMENTED | No accepted complete inventory-profile balance implementation. |
| T25 | Available60; significant outflow unknown | BLOCKED; not zero/waste | NOT IMPLEMENTED | Complete-boundary/outflow metadata not implemented. Related missing aggregation guards do not prove this balance case. |
| T26 | 8kg unserved/100 available;5 rescued,3 retained | 8% surplus; not8kg assumed waste | PARTIAL | At-risk events/dispositions remain distinct and tests/test_p1_postgresql.py::test_dispositions_never_duplicate_events_and_rescue_gate preserves identity/safety. No numeric surplus KPI/accepted allocation implied. |
| T27 | 12prepared+14water+2other →26.5product+0.5byproduct+0.5waste+0.5evaporation | 28kg available/accounted;0.00% residual | NOT IMPLEMENTED | No explicit complete process-addition/evaporation boundary model; do not sum incomplete inputs. |
| T28 | 28available/27.5 documented;evaporation unknown | BLOCKED; do not plug residual into waste | NOT IMPLEMENTED | Unknown-vapor boundary contract/calculator not implemented. |
| T29 | 4kg mixed plate waste;only riceY2 | BLOCK raw-equivalent;4kg cooked only | BLOCKED | No approved component/recipe allocation; mixed-dish conversion stays unavailable. |
| T30 | No scale checks due in period | N/A,not100% compliance | NOT IMPLEMENTED | Scheduling denominator and DQ04 reducer absent; count-only DQ does not fabricate this percentage. |

Coverage disposition: **2 PASS GUARD,3 PARTIAL,6 BLOCKED,19 NOT IMPLEMENTED**. All30 source cases mapped; this is not30 passing implementation tests. No full FWI-03, M6, field or production acceptance is claimed. Final integrator must map any later accepted features and preserve this distinction. OP-08/FI-02/NI-03 remain HELD.

## FWI-09A-F01 protective boundary

- `migrations/env.py` denies ordinary Alembic downgrade before `run_migrations`; no existing revision/history/auth_0007 is rewritten. Pinned Alembic1.20.1 command callback classification is covered by actual command.downgrade tests. Offline downgrade is denied; no environment string or ordinary CLI flag grants permission. This is a controlled migration-execution safety boundary, not protection against a database owner intentionally issuing raw SQL or executing arbitrary trusted Python.
- Historical tests alone obtain an explicit in-memory, exact-connection permit, using their committed CREATE SCHEMA OID. Guard checks fwi_test/fwi_demo_test/PostgreSQL18, exact UUID4 schema, sole search_path/current_schema, owner and OID before use and again after locks. Never infer ownership from a UUID name. No development/UAT/production DB is accessed to test negative identities; those cases use in-memory fakes.
- The guard locks all owned tables in deterministic name order through transaction completion. Any persisted p1_/p2_ row or corresponding audit history refuses downgrade even on an explicitly disposable schema. Existing auth_0002 locking/audit checks and unconditional auth_0007 refusal remain intact.
- New PostgreSQL tests verify ordinary refusal before DDL, invalid/reused permits, both P1/P2 and audit-only history preservation, writer-before-inspection refusal, and writer blocking until rollback after an actual P1 DROP. Original four historical auth downgrade assertions for locking/concurrent writer/timeout/rollback remain unchanged. auth_0007 tests pin its exact revision for compatibility with later additive heads.
- Targeted PostgreSQL command: `pytest -q -p no:cacheprovider tests/test_migration_safety_postgresql.py tests/test_security_remediation.py tests/test_security_postgresql.py::test_migration_preserves_legacy_audit_and_reverses_only_without_security_evidence`: **18 PASS**,51 Starlette/Alembic warnings. AllDDL in verified owned UUID schemas; fixture finally verifies cleanup. Initial selected run9 PASS/1 FAIL was a test callback matching DROP TABLE instead of actual DROP TABLE IF EXISTS; only callback corrected before passing run, no assertion/retry/timeout weakened.
- In-memory/desk/pure-domain command: `pytest -q -p no:cacheprovider tests/test_migration_safety.py tests/test_fwi03_desk_guards.py tests/test_p1_domain.py`: **42 PASS**. No new dependency, public endpoint, schema migration, source-file supersession, KPI or formula implementation. These are implementer-run tests, not independent review.

## Integration boundaries

Owned files are migration environment, new infrastructure migration safety helper, historical-test fixture permits, new focused tests and this document. No application/model/API/frontend/HANDOFF or accepted ADR/research changes. One local commit maximum; lead integrator must reconcile the final additive head and run combined regression. Broader metadata/physical storage/reviewer/master permissions are owned by lead, not this branch.
