# FWI-EXPORT-01A — export serialization core

Status: IMPLEMENTED LOCALLY / INDEPENDENT REVIEW PENDING. Synthetic-only, no
production or full FR-008 acceptance. Branch `codex/fwi-export-01a`, isolated
worktree `D:/Projects/fwi-export-01a`, baseline
`e3d4cac3a8bd3eb640d421b5c3f27351d11115dc`.

## Exact changes

- `src/fwi/application/export_csv.py`: pure reusable `serialize_export` and immutable
  `CsvExport` result. Standard library plus existing domain validator only.
- `tests/test_export_csv.py`: 55 synthetic serialization/negative tests, no DB.
- `docs/backend/FWI-EXPORT-01A.md`: contract, limitations, evidence and handoff.
- `docs/ai/HANDOFF.md`: short export handoff; historical content preserved.

No endpoint, query, file write, auth implementation, dependency, migration, UI,
accepted ADR/PRD edit or held-KPI activation. Main S1/SEC-01D and other worktrees
were not copied or edited. OP-08/FI-02/NI-03 remain HELD.

## Contract and requirement trace

`serialize_export(events, measurements, allowed_site_ids=..., generated_at=...)`
accepts explicit snapshot mappings. Existing `EventOutput.model_dump()` and
`MeasurementOutput.model_dump()`, or existing application `demo.snapshot` mappings,
fit this boundary. It returns three byte payloads: `events_csv`,
`measurements_csv`, `metadata_json`. The caller supplies an aware generation time;
no hidden clock, selection query, DB session, implicit commit or filesystem IO.

| Requirement | Implemented core behavior | Remaining acceptance gap |
|---|---|---|
| FR-008 / AC-11 | Reject ANY event outside explicit caller site set; included parent required for every measurement; explicit measurement site must agree; unit/basis/status/provenance retained | Caller scope is NOT backend authorization. No persistent filters, export permission, route or UI integration |
| AC-15 / DR-04 | Separate event occurred_at/recorded_at and measurement measured_at/recorded_at; timezone required; explicit source operation_date retained | Current persistence/API has no operation_date. Absent date stays null, never derived from timestamp/server timezone |
| Event integrity / DR-01 | events.csv has one unique event row; measurements.csv has one unique measurement row with event FK/site lineage; duplicate source IDs and orphans rejected | No canonical/latest measurement choice, reconciliation or generation-mass total |
| Measurement integrity | Exact incoming decimal strings, Decimal=str, no float/bool; reuse current demo consistency/finite/nonnegative validator; null is not zero | Raw original input lexemes cannot be reconstructed from PostgreSQL NUMERIC/Pydantic Decimal |
| Reproducibility | Fixed columns, UUID order, CSV hashes, caller time, scope/count/escape/source-capability metadata | Large dataset limits, streaming, retention and delivery policy are not implemented |

No methodology source FWI-01/02/03/04 files were found in the scoped repository
inventory. This implementation uses the available PRD, provisional domain contract,
actual backend models/API schemas/domain code and relevant accepted ADR-001/002
sections. It does not claim full methodology validation or run unavailable FWI-03
30-case desk regressions. ADR-004 remains PROPOSED in this baseline; this work does
not copy the approved-but-uncommitted security implementation from another worktree.

## Data representation

- Separate files prevent multiplying event rows by joining repeated measurements.
  All supplied observations are exported, including estimated/missing/not_measured
  and measured_zero. No summation, conversion, selection, replacement or ratio.
- Event columns: `event_id, organization_id, site_id, event_type, operation_date,
  occurred_at, recorded_at, export_label`.
- Measurement columns: `measurement_id, event_id, site_id, measured_at, recorded_at,
  gross, tare, net, original_unit, mass_basis, measurement_method,
  observation_status, validation_status, provenance, export_label`.
- Measurement site is traced through its included event; a supplied conflicting
  site is rejected. Event and measurement UUID columns remain separate identities.
- `operation_date` and `validation_status` are optional SOURCE-ONLY fields. The
  current persistent schema supports neither. Missing source data is `\N` and
  metadata explicitly reports baseline support false and number provided. An
  explicit source validation string is passed through, with no invented vocabulary,
  default approval/unvalidated status, validation history or workflow decision.
- `export_label=SYNTHETIC/DEMO` is a serialization label, not domain vocabulary.
  Synthetic input is a caller obligation; this function is not a PII/data classifier.
- Existing demo unit restriction is kg; six existing provisional mass bases and
  five demo observation statuses are reused, not redefined as final methodology.
  Future units/statuses require their approved domain extension first.
- Unknown extra fields fail closed rather than silently losing new source data.
  Timestamp strings retain their representation/offset; aware datetime objects use
  isoformat. operation_date accepts an explicit date only, never datetime derivation.

## CSV / spreadsheet handling

Both CSVs use UTF-8 with BOM, comma separator, CRLF, every field quoted and embedded
quotes doubled by Python csv. Header-only CSVs represent empty datasets; an event
without measurements creates no fabricated mass row.

Null is the literal marker `\N`, not blank or numeric zero. Literal source `\N`
and formula-sensitive text receive one apostrophe prefix. Metadata `escaped_cells`
records file, stable row identity, column and prefix. A machine importer first
checks those coordinates: remove one prefix to recover literal source text; ONLY
an unescaped `\N` means None. Existing source apostrophes are never blindly stripped.
Keep metadata with the CSVs to preserve this distinction.

Formula detection covers =/+/-/@, full-width equivalents, leading whitespace,
format/control characters and embedded tab/CR/LF. Normalization is used only for
*detection*; original Unicode/content is retained underneath the recorded escape.
NUL/unpaired surrogates are rejected. Quoting prevents delimiter/quote/newline
breakout. Formula mitigations follow the risk model described in
[OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection).

**Limitations:** apostrophe quoting is not a universal spreadsheet guarantee,
particularly after a spreadsheet saves/reopens a CSV. Spreadsheet import can also
coerce long decimals, timestamps or IDs even when CSV bytes are exact. Import as
text, do not execute formulas, and retain the authoritative metadata/package.
No Excel/LibreOffice execution or save/reopen safety is claimed. XLSX is OPEN: no
approved project XLSX dependency/contract was found in pyproject.toml; none added.

## Verification — implementer, 2026-11-08

Existing installed Python 3.14 environment was reused read-only, no installation.
PYTHONPATH explicitly selects this worktree/src; import path was asserted to be
`D:/Projects/fwi-export-01a/src/fwi/__init__.py` to avoid importing the dirty security
worktree through its editable installation. Python -B disables bytecode writes.

- Focused `python -B -m pytest tests/test_export_csv.py -q -x`: 54 PASS initially;
  final combined run includes 55 export tests after adding explicit CSV demo labels.
- Combined equivalent pytest selection: `pytest -q --ignore=tests/test_demo_postgresql.py`:
  **121 PASS + 6 subtests PASS**, 0 FAIL/SKIP. Actual execution used pytest.main under
  `unittest.mock.patch('psycopg.connect', side_effect=AssertionError(...))` so an
  accidental real connection fails before DB access. FWI_DATABASE_URL and
  FWI_TEST_DATABASE_URL were removed from the child test environment.
- `python -B -I scripts/verify_kit.py`: PASS, nine kit files/JSON/guardrails.
- `python -B -m pip check`: PASS, no broken requirements; no dependency changes.
- `git diff --check` plus untracked task-file whitespace validation: PASS.
- PostgreSQL integration/migrations and authenticated HTTP/browser export: NOT RUN,
  deliberately outside this pure core scope. No DB connection or destructive DDL.
- One existing Starlette/httpx TestClient deprecation warning; not an install request.

Tests include empty files/events without measurements, repeated measurements,
site A rejection of B plus explicit multi-site scope, orphan/forged site, duplicate
IDs, long decimals under precision=4, trailing zeros, missing vs measured_zero,
source-only validation/date, all six mixed bases without totals, 14 dangerous text
variants, Unicode/newlines/quotes/delimiters, literal null collision, invalid masses,
naive timestamps, bad encoding, stable hashes/order/input immutability and actual
API output snapshot compatibility. These are serialization guarantees, not a DB
snapshot-consistency, authorization or field-data validation claim.

## Attachment to SEC-01D after Gate A (not implemented)

1. Independent review/Owner acceptance of Gate A must precede integrating a route.
   Do not add a public endpoint or copy the current baseline's unauthenticated
   demo-route pattern. No export permission is inferred from event.read: approve
   explicit export permission/action and its site scope first.
2. The authenticated application use case derives permitted sites from server
   membership, intersects validated filters, checks direct-object scope and loads
   event/measurement snapshots consistently through the approved transaction policy.
   Do not obtain scope from an unchecked browser list. Pass those snapshots to the
   pure serializer; its rejection guard is defense in depth, never an auth substitute.
3. Define policy/tests for membership revocation vs long-running selection/delivery,
   audit attribution, private filenames/content disposition, no-store responses,
   downloads and metadata packaging. Do not claim the serializer handles these.
4. Add authenticated positive/negative cross-site and permission tests plus actual
   PostgreSQL export fixture tests after that application contract is approved.

## Before full FR-008 acceptance

OPEN: operation_date persistence/source and timezone/filter semantics for AC-15;
validation history/status provenance and any selected-measurement policy; explicit
export permission and revocation/delivery/audit contract; matching UI/server filters;
XLSX decision and approved dependency if needed; spreadsheet compatibility/text
import testing; package/download format, limits/streaming, retention and authorized
HTTP/browser verification. This core does not close these decisions or PRD gates.
No FWI formulas, accepted architecture or KPI states changed.

Independent review is PENDING. Review source-only fields/null+escape reversibility,
site/FK rejection, exact numeric text and partial AC-11/15 claims. No staging,
commit, push, merge, deployment, reset, clean or stash. Main S1/SEC-01D remains intact.

## Full Git status at handoff

```text
 M docs/ai/HANDOFF.md
?? docs/backend/FWI-EXPORT-01A.md
?? src/fwi/application/export_csv.py
?? tests/test_export_csv.py
```
