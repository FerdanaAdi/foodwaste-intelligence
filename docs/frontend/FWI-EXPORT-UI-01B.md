# FWI-EXPORT-UI-01B — CSV export frontend integration candidate

Status: IMPLEMENTED LOCALLY / STOP FOR INDEPENDENT REVIEW. Frontend-only
candidate; **no live backend integration is claimed**. Branch
`codex/fwi-export-ui-01b`, isolated worktree `D:/Projects/fwi-export-ui-01b`,
baseline `e3d4cac3a8bd3eb640d421b5c3f27351d11115dc`.

## What this is (and is not)

The FWI-EXPORT-01A serializer (`D:/Projects/fwi-export-01a`,
`src/fwi/application/export_csv.py`, format `fwi-synthetic-export-v0.1`,
review PENDING) defines the only real export contract that exists. This task
adds the frontend-side interaction and its testable integration contract only:

- No backend export route exists at this baseline; none was invented. No new
  proxy path, no fetch call to any export endpoint, no permission vocabulary.
- Authentication (SEC-01D) is uncommitted in the main worktree with Gate A
  pending; nothing here depends on it or claims authorization.
- No dependency additions, no DB migration, no mass/KPI logic. Held KPIs
  OP-08/FI-02/NI-03 stay HELD and are surfaced read-only in metadata.

## Exact changes

- `frontend/src/backend/export.ts`: typed request/metadata contract mirroring
  the serializer metadata (format, scope, counts, csv block, source-only
  fields, escaped_cells, held_kpis, per-file sha256), fail-closed runtime
  validator `parseExportMetadata`, request guard `exportRequestErrors`, and
  `ExportAdapter` seam with an in-memory `createSyntheticExportAdapter`
  (scenarios: confirmed / empty / denied / unavailable) for tests and demo.
- `frontend/src/pages/BackendExportPage.tsx`: `/backend-demo/export` page with
  explicit site/date-basis/date-range presentation, scope summary, and
  loading / denied / unavailable / fail-closed / empty / confirmed states.
- `frontend/src/App.tsx`, `frontend/src/components/layout/AppLayout.tsx`:
  one route + one nav item ("Ekspor Backend CSV (kandidat)") and a distinct
  header source label. Minimal diff, existing shell preserved.
- `frontend/tests/backend-export.test.tsx`: 12 tests (see evidence).
- This document; `docs/ai/HANDOFF.md` entry appended.

## Contract decisions (candidate, pending backend approval)

- **Adapter seam instead of a route.** The page takes an optional
  `ExportAdapter`; default is the synthetic adapter whose default scenario is
  `unavailable` — the truthful state while no route is approved. Scenario
  switching in the UI is clearly labeled simulation. A future HTTP adapter is
  injected once the authenticated route contract is approved (EXPORT-01A
  attachment steps 1–4 are prerequisites, not done).
- **Explicit filter basis.** The date-range basis is an explicit choice of
  `occurred_at` or `measured_at` (actually persisted timestamps). The empty
  choice blocks submission. `operation_date` is source-only with
  `baseline_persistence_support: false`; it can never be a filter basis and is
  never derived from a timestamp. Filter/timezone semantics remain OPEN per
  EXPORT-01A.
- **No automatic download.** The UI requests a decision, never a file. Only a
  server-confirmed outcome (validated metadata) reveals user-initiated
  download buttons. Denied/unavailable/fail-closed show no download affordance.
- **Fail-closed metadata.** `parseExportMetadata` requires the exact v0.1 key
  set (unknown fields reject), exact serializer column order per file, 64-hex
  sha256, nonempty UUID site scope, aware `generated_at`, exact csv block,
  exact held-KPI list, and valid escaped_cells coordinates. A violating
  confirmed outcome renders a fail-closed refusal, not a partial render.
- **Missing fields are explicit.** Source-only fields render their `provided`
  count and "tidak didukung" persistence status; nulls stay `\\N` semantics;
  zero-count exports render a distinct empty state (header-only CSVs are valid
  exports) while keeping metadata and downloads.
- **Lineage preserved.** Metadata panel shows generated_at, scope, ordering,
  row semantics, csv encoding/null token, decimal fidelity, measurement
  selection, spreadsheet safety, restore-source-text, escaped_cells table and
  per-file sha256, plus a keep-metadata-with-CSVs note. Downloads are
  byte-exact `Uint8Array` blobs (CSV bytes keep the UTF-8 BOM).
- **XLSX**: not implemented, not claimed (OPEN upstream).

## Requirements trace

1 Reusable adapter + request interface → `export.ts`; 2 explicit site/basis/
range presentation → page form + scope summary; 3 all four states + fail-closed
+ empty; 4 metadata/lineage panel; 5 no auto-download before confirmed
availability (tested); 6 no public/unauthenticated endpoint — none exists;
7 no fabricated operation_date/validation_status/XLSX; 8 explicit missing-field
rendering; 9 unit tests for denied/unavailable/empty/confirmed; 10 labelled
controls, `role=status`/`role=alert`, disabled states, keyboard-operable
native controls.

## Verification — implementer, 2026-11-08 (Windows)

- `npm run typecheck`: PASS.
- `npx vitest run tests/backend-export.test.tsx`: 12 PASS (denied, unavailable
  + user-initiated retry, loading, confirmed + no-auto-download + 3 downloads,
  empty state, fail-closed metadata, request guard, UI explicit-basis/site
  blocking, metadata validator negatives, adapter request rejection, BOM bytes,
  unmount abort).
- `npm test` (full frontend regression): 9 files, **115 PASS**, 0 FAIL
  (103 pre-existing + 12 new).
- `npm run build`: PASS (vite build ok).
- `node_modules` was installed via `npm ci` from the existing lockfile; no
  dependency changes. Backend tests not run (no backend change).
- Not run: browser E2E for this page, PostgreSQL export integration, HTTP
  adapter — deliberately out of scope; see prerequisites below.

## Integration prerequisites (unresolved contracts)

1. Independent review + Owner acceptance of FWI-EXPORT-01A (serializer) — PENDING.
2. Gate A owner decision for SEC-01D authenticated implementation — PENDING.
3. An approved authenticated export route contract (method, path, request,
   response shape incl. payload packaging and private content disposition) and
   an explicit export permission/site-scope decision — none exists; EXPORT-01A
   explicitly forbids inferring export permission from `event.read`.
4. Server-side date-range filter semantics (basis + timezone rules) — OPEN.
5. Filename, download packaging (e.g. zip), size limits/streaming, retention
   and audit attribution — OPEN upstream.
6. Browser E2E for this page after a real adapter exists.

No staging, commit, push, merge, deploy, reset, clean or stash. Other
worktrees were not modified.
