# FWI-P1-P2-CANDIDATE — Isolated P1 + P2 engineering candidate

**Current status:** `R3 TARGETED FIXES IMPLEMENTED — INDEPENDENT RE-VERIFICATION REQUIRED`; not full P1/P2 acceptance or central integration. **Date:** 2026-11-09. Earlier implementation/r2 results below are historical, not evidence of approved reporting policy. See §8 for current behavior/evidence.
**Implementer:** ZCode (GLM-5.3 Flash) per Owner directives of 2026-11-09 (P1 FR-101..106 + P2 FR-201..204 candidates; P0 untouched; no central write, no commit/push/merge).
**Workspace:** `D:/Projects/fwi-p1-zc-01` (isolated local clone, branch `zcode/fwi-p1-candidate-01`) at verified baseline **7462897** (`codex/fwi-integration-01` tip = origin/main `e3d4cac` + 11 integration checkpoints). Whole candidate = uncommitted working tree + `p1-candidate.patch` + `p1-candidate-manifest.txt` at the workspace root.
**Normative sources:** `docs/product/PRD-v0.1.md` (DR-01..16), `docs/domain/waste-event-measurement-v0.1.md`, accepted ADR-001..004, `FWI_PRD_P1_P2_P3_P4_Engineering_v0_1_DRAFT.md` (PROPOSED engineering detail). FWI-02/03 not in repository — no formula, threshold, or vocabulary invented from them.

## 1. Coverage (directive §12-A)

| Feature | Domain | Persistence | API | UI | Tests |
|---|---|---|---|---|---|
| FR-101 receipt/lot/movement | `domain/operations.py` | `p1_receipts/p1_lots/p1_inventory_movements` | 8 routes | Receiving+lot+movement section | pure + PG |
| FR-102 recipe/menu/batch | `domain/production.py` | `p1_menus/p1_recipes/p1_recipe_lines/p1_production_batches/p1_batch_io` | 6 routes | Production page (menu/recipe/batch/IO/yield) | pure + PG |
| FR-103 distribution/service | `domain/distribution.py` | `p1_distribution_runs/p1_deliveries/p1_meal_services` | 6 routes | Distribution page (delivery/receiving/service) | pure + PG |
| FR-104 flow links/lineage | `domain/lineage.py` | `p1_material_flow_links` | 2 routes | Lineage panel on Production page | pure + PG |
| FR-105 disposition+safety gate | `domain/disposition.py` | `p1_dispositions` | 2 routes | Disposition section | pure + PG |
| FR-106 operational trends | `application/p1.trends` | read model (no new table) | 1 route | Trends section | PG |
| FR-201 KPI registry | `domain/kpi_catalogue.py` | `p2_kpi_registry` + `p2_seed.py` | 2 routes | KPI catalogue section | pure + PG |
| FR-202 controlled preview | prerequisite/preview evaluator (value-free) | — (no persisted results; no authorized calculation) | 1 route | Preview panel | pure + PG |
| FR-203 cost references | `application/p2.py` | `p2_cost_references` | 3 routes | Insights page cost section | pure + PG |
| FR-204 explainable alerts | `domain/recommendations.py` (4 structural rules, no thresholds) | `p2_recommendations/p2_alert_settings` | 5 routes | Insights page alerts section | pure + PG |

Cross-feature E2E: `tests/test_p1_e2e_postgresql.py` (E2E-EXT-01 analog: receipt→lot→movements→recipe/batch→delivery→receiving by second site→service→event→2 measurements→dispositions+gate→links→lineage→trends→KPI→recommendations; exactly **1** waste generation event end to end).

## 2. Acceptance matrix — all executed against real PostgreSQL 18

Command (workspace root, central-repo venv, PYTHONPATH pinned to the clone):
`FWI_TEST_DATABASE_URL=postgresql+psycopg://fwi_test@127.0.0.1:5432/fwi_demo_test FWI_REQUIRE_POSTGRES=1 PYTHONPATH=<clone>/src python -m pytest tests/ -q`
→ **370 passed, 0 failed, 0 skipped, 6 subtests passed** (was: skipped-PG; the local PostgreSQL 18 service `postgresql-x64-18` with role `fwi_test`/db `fwi_demo_test` was located and used; schemas `fwi_demo_test_<uuid4>` created per test and dropped after).

| AC | Scenario | Evidence | Status |
|---|---|---|---|
| P1-AC-01/02 | duplicate identity 409; movement ≠ event; cross-site 404 | `test_p1_postgresql.py` (duplicate/replay/movement tests) | **PASS (PG)** |
| P1-AC-03/04 | recipe immutability; yield blocked w/o pairs; rework not double-counted | `::test_recipe_versions_batches_and_yield_gate` + pure yield tests | **PASS** |
| P1-AC-05/06 | 100≠95 = needs_review, no event; no population estimate | `::test_delivery_mismatch…`, `::test_service_sampling…`, `population_estimate()` refusal | **PASS** |
| P1-AC-07/08 | 2 transfers = 1 distinct event; self/cycle/cross-site refused | `::test_lineage_counts_distinct_events…` + pure lineage | **PASS** |
| P1-AC-09/10 | dispositions ≠ new events; rescue gate closed for not_assessed/unsafe | `::test_dispositions_never_duplicate_events_and_rescue_gate` | **PASS** |
| P1-AC-11/12 | mixed ratio blocked w/ reason; residual descriptive only | `::test_trends_are_descriptive…` + UI test (no "total waste") | **PASS** |
| P2-AC-01/02 | HELD value-free on every path; registry read-only | `test_p2_postgresql.py::test_held_codes…`, `::test_registry_is_read_only…` | **PASS** |
| P2-AC-03/04 | basis mismatch ⇒ blocked N/A; deterministic idempotent evaluation | pure preview tests; `::test_recommendations_evaluate…` re-evaluation identity | **PASS** |
| P2-AC-05/06 | missing price N/A ≠ Rp0; history never silently changes | `::test_missing_price…`, `::test_new_cost_version…` | **PASS** |
| P2-AC-07/08 | insufficient inputs ⇒ explicit no-claim; zero automatic action (operational snapshot unchanged by evaluate+ack) | `::test_missing_reference_yields_insufficient_data…`, `::test_recommendations_evaluate_acknowledge_and_never_mutate_operations` | **PASS** |

Quality gate (§11): backend 370/0/0 with `FWI_REQUIRE_POSTGRES=1` · typecheck PASS · vitest **286/286 (19 files)** incl. HELD-value-freeness and no-"total-waste" UI assertions · `npm run build` PASS · `npm run test:proxy` 2 PASS / 1 pre-existing TLS skip · `python -I scripts/verify_kit.py` PASS. **Browser E2E: NOT RUN** (approved TLS cert files not configured in this environment; vitest+build+proxy cover the candidate; browser run needs the SEC-01D TLS setup owned by Codex). No double counting, no mass conversion, no fabricated cost/KPI values, no HELD numeric output anywhere in code or tests.

## 3. PROVISIONAL vocabularies introduced (need FWI-02/03 verification or Owner decision)

Movement types `{issue_to_batch, return_from_batch, transfer, stock_correction}` × `{in,out}` (implicit intake = lot receipt quantity; negative stock refused; reconciliation OPEN EXT-OD-05) · batch io `{input, output_primary, output_rework}` (rework excluded from yield numerator) · link types `{waste_event, lot, batch, delivery, meal_service}` + relations `{derived_from, input_to, transfer_of, disposition_of, rework_of, leftover_of}` (service-validated polymorphic refs; conservative cycle rejection) · outcomes `{compost, disposal, animal_feed, processing, redistribution_handover}`; rescue-like `{animal_feed, redistribution_handover}`; safety `{not_assessed, assessed_safe, assessed_unsafe}` · allocation statuses `{within_reference, exceeds_reference, no_reference}` with no automatic reference selection; allocation remains reference_unresolved (OD-P1-02 / EXT-OD-03 OPEN) · rule set `p2-rules-provisional-v0` (4 structural rules) · KPI seed = only the 6 codes citable from PRD v0.1 §11 · UTC-day period boundaries (operation_date OPEN EXT-OD-04) · units `kg` only.

## 4. Owner Decision packet (PROPOSED — consolidated; §10 of the directive)

| # | Decision (status) | Blocked behavior today | Options (smallest first) | Recommendation (PROPOSED) |
|---|---|---|---|---|
| OD-P1-01 | Inventory reconciliation/ownership (EXT-OD-05) | Stock sum labeled provisional; negative-stock writes refused | (a) keep descriptive sum, (b) per-lot closed periods | **(a)** — lowest complexity for free SPPG app |
| OD-P1-02 | Effective measurement selection + allocation reference (EXT-OD-03/08) — **r2: max(net) selection REMOVED** | dispositions carry `reference_unresolved`; effective/reportable mass is always null, including a single observed measurement; raw arithmetic is distinct from approval. Repeated/missing histories remain explicitly unresolved/incomplete | (a) keep fail-closed until FWI-03 defines supersession, (b) adopt latest-observation policy, (c) adopt explicit reviewer selection | **(a)** — no engineer-selected rule; FWI-03 must decide |
| OD-P1-03 | Disposition outcome taxonomy (EXT-OD-08) | 5 PROPOSED outcome codes + safety gate | confirm/adjust list via food-safety authority | confirm as provisional standard |
| OD-P1-04 | Recipe yield basis mapping (EXT-OD-06) | yield only same-basis; no universal factor | accept same-basis rule; raw↔cooked later only with documented batch evidence | **accept same-basis-only** |
| OD-P1-05 | Sampling gate (EXT-OD-07) | unframed samples labeled, `population_estimate()` refuses | (a) keep refusal, (b) approved expansion design later | **(a)** |
| OD-P1-06 | Operation date/timezone (EXT-OD-04) | trends use UTC day boundaries on `occurred_at` | (a) UTC days, (b) site-local operational day | **(b) eventually; (a) acceptable for candidate** |
| OD-P2-01 | KPI gate G1/G2 (EXT-OD-09) | catalogue + value-free preview only; FWI-03 source doc unavailable | provide FWI-03 v1.3 definitions → implement eligible formulas behind G-P2-METHOD | supply FWI-03; no formula invented meanwhile |
| OD-P2-02 | Cost ownership/allocation (EXT-OD-10) | references stored; valuation always blocked | approve managerial method + price-source rights | approve minimal "unit price × compatible basis" preview with provenance |
| OD-P2-03 | Alert rule catalogue (this candidate) | 4 structural rules, no thresholds | accept rule set v0; add rules only with evidence | **accept as provisional** |

Not self-authorized: KPI readiness, yield factors, rescue safety authority, cross-site admin policy (Gate B), financial methodology, new data sharing, new dependencies, official integrations.

## 5. Codex integration handoff (§12)

**C. Changed files + hashes:** `p1-candidate-manifest.txt` (sha256 per file; 10 modified shared files + 32 new source/test/doc files; the two package artifacts exclude themselves). Full unified diff: `p1-candidate.patch` (applies with `git apply` on baseline 7462897).
**D. API contract changes:** new prefixes `/p1/v0.1/*` (22 route paths) and `/p2/v0.1/*` (10 route paths), shapes PROPOSED per draft §10; error taxonomy reuses the demo mapping (404/409/422/503 + global `security.Denied`); all writes single-use `p1` intents; responses Decimal→string.
**E. Migration graph:** `demo_0001 → auth_0002 → p1_0003` (additive, reversible; adds 15 tables + `p1` intent kind; downgrade restores `intent_kind` and drops only p1/p2 tables). Verified: `alembic upgrade head` + `compare_metadata == []` against ORM on real PG.
**F. Results actually run:** §2 (backend 370 incl. PG; frontend 286; build; proxy; verify_kit). Browser E2E NOT RUN (TLS files absent).
**G. High-risk issues:** (1) shared-file edits may conflict with uncommitted SEC-01B work — especially `security.py` PERMISSIONS and `auth.py` IntentInput; (2) link endpoints are service-validated (no DB FK for polymorphic refs); (3) effective measurement selection remains OPEN; `_reference_net` max-selection has been removed, with no replacement heuristic; (4) browser E2E never executed.
**H. File allowlist + safe integration order:** (1) new backend modules (`domain/*6`, `application/p1|p2`, `api/schemas_p1|p2`, `api/routes/p1|p2`, `infrastructure/database/models_p1.py`, `p2_seed.py`, `migrations/versions/p1_0003.py`, `migrations/env.py` import); (2) shared backend edits (`models.py` intent kind, `security.py` permissions, `auth.py` intent literal, `app.py` routers+middleware) — reconcile with SEC-01B first; (3) tests (`tests/test_p1_domain.py`, `test_p2_recommendations.py`, `test_p1_postgresql.py`, `test_p2_postgresql.py`, `test_p1_e2e_postgresql.py`, `tests/p1_support.py`); (4) frontend new files (`backend/p1.ts`, 4 pages, 3 test files); (5) frontend shared edits (`auth.ts` KNOWN_PERMISSIONS+intent kind, `App.tsx`, `AppLayout.tsx`, `vite.config.ts` allowlist). Apply patch in one pass; do not merge piecemeal.
**I. Overlap with active P0 integration:** baseline 7462897 already contains the integration checkpoints; conflicts expected only in the five shared files listed in §2 of the previous revision (now: `models.py`, `security.py`, `auth.py`, `app.py`, `env.py` backend + `auth.ts`, `App.tsx`, `AppLayout.tsx`, `vite.config.ts` frontend). P0 worktree `fwi-mvp-p0-single-zcode` and central uncommitted SEC-01B changes were never touched.

## 6. Risks / open items

1. Browser E2E NOT RUN (needs authorized TLS setup); UI is design-neutral — Figma acceptance separate (EXT-OD-18).
2. FWI-03 v1.3 absent: 18 conditional KPI codes and all formula bodies unknown; registry seeded with 6 citable codes only.
3. Master item reference is `item_code` text (P0 master DTO decisions OPEN EXT-OD-02) — no invented master-data FK.
4. `p1_0003` has been applied only to disposable test schemas; Codex must re-run the PG suite before integration acceptance.


## 7. Historical remediation r2 (2026-11-09) — superseded by §8 where inconsistent

Reproduction first: `tests/test_p1_remediation_postgresql.py` written RED against the defects (T-01/T-01b/T-02+T-05/T-06 failed before the patch; T-07 cross-site ack already passed).

**Blocker 1 (FR-106 double-counting) — FIXED.** `func.sum(Measurement.net)` removed from trends; aggregation now groups per (event, basis) and runs `domain/aggregation.py::basis_aggregation`. Event count, measurement count and aggregation-eligible mass are separate labelled numbers; an event contributes mass only with exactly one usable observation (`observed`/`measured_zero`); any repeated-measurement event makes the whole-basis mass `unresolved_selection` (never summed, never partial-as-complete); missing is never zero; estimated never enters mass; mixed coverage ⇒ `incomplete_observation`; incompatible unit ⇒ `incompatible_unit`. Calculation version bumped to `p1-trends-provisional-v1`.

**Blocker 2 (unapproved MAX(net)) — FIXED.** `_reference_net` (max) and `_allocation_status` (sum of dispositions) deleted from `application/p1.py`; no latest/first/average replacement was introduced. Dispositions now carry the explicit fail-closed status `reference_unresolved` with an EXT-OD-03 note; the FR-204 allocation rule yields `insufficient_data` for it. `domain/disposition.py::allocation_status` remains as a pure utility documented as caller-forbidden until an accepted policy exists.

**Blocker 3 (global alert settings) — FIXED.** `p2_alert_settings` is global configuration; with no accepted global-admin contract (Gate B OPEN) `application/p2.set_rule_disabled` now raises `security.Denied(403)` for EVERY authenticated access before any read/write, and the HTTP route is fail-closed by construction (verified T-06: 403 + table unchanged). Rules stay readable via the existing authorized read (T-08); site-scoped evaluation/acknowledge authorization unchanged (T-07 already concealed-404, now regression-tested). Frontend mutation controls removed; the page states the read-only contract (backend denial is the actual control, not the UI).

**Regression evidence (all actually run):** backend `pytest tests/ -q` with `FWI_REQUIRE_POSTGRES=1` → **380 passed / 0 failed / 0 skipped / 6 subtests** (includes T-01..T-11 coverage: T-01/T-01b/T-02/T-03/T-04/T-05 in `test_p1_remediation_postgresql.py` + pure aggregation tests; T-06/T-07 remediation PG tests; T-09/T-10 pre-existing evaluate/HELD tests; T-11 e2e unchanged-and-green; T-12 full P0/demo/security suite green). Frontend: typecheck PASS, vitest **286/286**, `npm run test:proxy` 2 PASS / 1 pre-existing TLS skip, `npm run build` PASS, `verify_kit.py` PASS. Browser E2E still NOT RUN (no approved TLS files here). API schema change: `TrendsView.per_basis[]` replaced `observed_net_total/estimated_net_total` with `event_count`, `measurement_count`, per-status counts and nested `aggregation{status, reason, eligible_mass, eligible_event_count, unresolved_event_count}` — a deliberate breaking change to a PROPOSED candidate route; frontend client/page/tests updated in the same patch.


## 8. Remediation r3 — four independent-review failures (2026-11-09)

**Provenance and scope.** The four independent reproductions were run before production changes: 4 FAILED (cross-basis event grouping, event without measurement, implicit `access=None` global mutation, context-rounded Decimal sum). All four original test function bodies/assertions are retained. This delta changes no migration, dependency, accepted methodology, auth permission or P0 file. It is not independent acceptance or full P1/P2 completion.

**A — event-level coverage.** The trends query starts from all site/date-scoped events, then loads their complete measurement histories before basis grouping. Zero-measurement events remain in the denominator; same-basis and cross-basis repeats remain one event with unresolved mass. Global distinct event and measurement counts are separate. Per-basis event counts describe intersecting sets and must not be added as new waste generation. Missing coverage prevents a partial raw sum from being represented as complete. Empty/missing/repeated scopes have explicit `mass_reporting.status/reason`, including when no per-basis row exists. UTC occurred_at filters remain provisional; operation_date is not fabricated.

**B — exact raw arithmetic, not precision policy.** `exact_decimal_sum` aligns integer coefficients/exponents and constructs an exact Decimal tuple, preserving the finest source scale without rounding or quantization. Tests include long decimals, mixed exponents and zero scale. PostgreSQL tests separately verify long-string roundtrip and exact raw sum; the owned-schema NUMERIC columns have no declared precision/scale. PostgreSQL still has finite implementation limits: this is not a claim of arbitrary database precision or scientific accuracy. Original measurements are neither rewritten nor selected.

**C — global mutation fails closed.** `set_rule_disabled` raises Denied(403) before opening/reading/writing the database for any access value, including None. Direct service tests detect any DB access; HTTP tests exercise all three synthetic roles, rejected writes and unchanged persisted state, while permitted reads remain available. No global administrator contract is invented; site-scoped evaluation/acknowledgement remains covered by regression tests.

**D — raw versus effective/reportable mass.** One observation is not automatically approved for reporting. The PROPOSED trends DTO adds `mass_reporting{status,reason,reportable_mass:null}` and per-basis `aggregation{raw_observed_mass,raw_observation_count}`. HTTP `eligible_mass` is always null and `eligible_event_count` is zero; complete raw-only input has `policy_unresolved`. UI shows counts and reporting-unavailable reasons, never a numeric reportable total. OD-P1-02 / EXT-OD-03 remains OPEN; estimated/missing/not_measured never become zero or eligible observed mass.

**Internal compatibility caveat.** The pure helper retains `eligible_mass` ONLY as a legacy alias of `raw_observed_mass` so the original arithmetic reproduction assertion remains unchanged. Its successful status is `raw_observation_available`, and its separate `reportable_mass` is null. The sole application caller explicitly serializes HTTP eligible_mass as null, never forwards this alias as approval. New callers must not treat that legacy helper name as a methodological decision.

**Actually executed after correction.** `python -B -m pytest -q -p no:cacheprovider --tb=line --disable-warnings tests` with candidate-only PYTHONPATH, fwi_test/fwi_demo_test and FWI_REQUIRE_POSTGRES=1: **396 PASS + 6 subtests, 0 FAIL/SKIP, 87 warnings**, including real PostgreSQL security/denial/atomicity/concurrency, isolated migration/cleanup and P1/P2 cases. `npm test -- --maxWorkers=2`: **287 PASS (19 files)**, including existing UNKNOWN/capture tests; no serial fallback. `npm run typecheck` and `npm run build`: PASS. jsdom emits its existing unsupported navigation stderr in export UI tests despite passing assertions; that is not browser evidence. Final focused `tests/test_p1_domain.py tests/test_p1_remediation_postgresql.py`: **39 PASS**; the unchanged four reviewer reproductions separately: **4 PASS, 35 deselected**. Repository verifier, `pip check` and whitespace checks PASS; proxy: **2 PASS / 1 TLS SKIP**. Full suite covers final behavior; subsequent client EOF-only formatting changes no logic. Typecheck is rechecked after packaging.

**Browser and integration remain outstanding.** Browser E2E NOT RUN: no dedicated TLS files/profile configured, and the existing browser harness pins auth_0002 while this candidate migrates to p1_0003. Do not repurpose Owner UAT services. The P0 migration branch and this candidate migration branch require explicit safe reconciliation before integration; no history rewrite or central capture is authorized here. FWI-02/03 source documents remain unavailable locally; source-specific policy claims are not validated. HELD OP-08/FI-02/NI-03 remain disabled; effective selection, operational date/timezone, cost allocation and methodology decisions remain OPEN.
