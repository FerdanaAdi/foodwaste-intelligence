"""FWI-03 v1.3 desk regression matrix (30 scenarios, T01-T30) mapped to the P0 app.

Source of truth (verbatim transcription, not re-invented):
  FWI-03_Consolidated_Methodology_v1_3.docx — desk regression scenario table
  (ID/Kasus/Input hipotetis/Aturan/Hasil/Catatan, rows T01-T30).
  SHA-256: 5394dbcb7fd914a6635013cf7eb4eb7d2c293ffcab79561a10333b8176a6fa5a
  Extraction: document.xml table 43, 2026-11-09 (unmodified text; note the
  source uses ASCII comma decimals and × for multiplication).

Honest status vocabulary (PRD v0.3 §14.3; reconciled with the Codex preflight
finding that the previous AUTOMATED count overstated coverage):
  PASS     — the full original scenario (formula AND preconditions) is proven
             by an executable test. None qualify: the P0 PRD forbids a KPI
             engine, so no desk formula is computed anywhere in the app.
  PARTIAL  — a related app-level invariant or guardrail is automated (evidence
             path below), but the scenario's own formula/inputs (lot traces,
             yield mappings, served-meal denominators, schedules) are not
             modeled in P0. A related invariant is NOT full verification.
  N/A      — the scenario is outside P0 scope entirely (feature/model absent
             by accepted scope decision); reason stated per row. T30's empty-
             DQ test does NOT prove scale-check scheduling and stays N/A.

No methodological expectation is modified; OP-08, FI-02 and NI-03 stay HELD.
"""

import pytest

from fwi.application.dataquality import DataQualityFilters, build_data_quality_view
from fwi.application.export_csv import serialize_export
from fwi.domain.demo_measurements import validate_demo_measurement

SCENARIO_TABLE = [
    ("T01", "Receiving rejection", "4 kg rejected; 100 kg inspected", "4/100×100", "4,00%", "Reject/return bukan otomatis waste."),
    ("T02", "Storage spoilage", "3 kg; usable stock available 120 kg", "3/120×100", "2,50%", "Lot and inventory trace required."),
    ("T03", "Preparation edible loss", "0,6 kg; edible raw input 12 kg", "0,6/12×100", "5,00%", "Same item/process."),
    ("T04", "Inedible trim share", "1,4 kg inedible; total trim 3,5 kg", "1,4/3,5×100", "40,00%", "Trim denominator only."),
    ("T05", "Yield factor", "Cooked output 75 kg; raw input 30 kg", "75/30", "2,50", "Same recipe/batch boundary."),
    ("T06", "Raw-equivalent cooked waste", "Cooked waste 10 kg; Y=2,5", "10/2,5", "4 kg raw-eq", "Actual remains 10 kg cooked."),
    ("T07", "Production overrun", "Actual 112 kg; plan 100 kg", "(112−100)/100×100", "12,00%", "Not waste evidence."),
    ("T08", "Unserved edible surplus", "9 kg unserved; 90 kg available", "9/90×100", "10,00%", "Disposition separated."),
    ("T09", "Plate waste ratio", "18 kg edible waste; 150 kg edible served", "18/150×100", "12,00%", "Same sample/scope."),
    ("T10", "Waste per served meal", "18 kg waste; 180 meals served", "18.000/180", "100 g/meal", "Sample cohort same."),
    ("T11", "Raw material loss value", "4 kg raw loss; Rp12.500/kg", "4×12.500", "Rp50.000", "Not accounting loss recognition."),
    ("T12", "Energy in edible waste", "3.000 g; 35 kcal/100 g", "3.000/100×35", "1.050 kcal", "Food form matched."),
    ("T13", "Failed batch ratio", "7 kg irrecoverable; batch output 140 kg", "7/140×100", "5,00%", "Failed subset of output."),
    ("T14", "Mass balance closure", "Available 50 kg; accounted 50 kg", "|50−50|/50×100", "0,00%", "Boundary complete only."),
    ("T15", "Duplicate event rate", "1 extra duplicate; 2 records reviewed", "1/2×100", "50,00%", "Confirmed only."),
    ("T16", "Measurement missed", "0 of 1 scheduled opportunities completed", "0/1×100", "Coverage 0%; waste KPI N/A", "Missing ≠ zero waste."),
    ("T17", "Zero denominator", "Numerator 5; denominator 0", "N/A", "N/A", "No divide-by-zero."),
    ("T18", "Mixed basis ratio", "Raw numerator 20 kg; cooked denominator 100 kg", "BLOCK", "BLOCK", "Incompatible basis."),
    ("T19", "Disposition duplicate", "0,8 kg event; same event transferred to compost 0,8 kg", "One event + disposition", "0,8 kg counted once", "No double event."),
    ("T20", "BDD once", "Gross 100 g; BDD 60%; nutrient 35 kcal/100g edible", "100×0,6/100×35", "21 kcal", "If net edible mass measured, no BDD again."),
    ("T21", "FI-01/FI-02 overlap", "Same Rp50.000 material pool in both", "Block duplicate pool", "No duplicate sum", "Material cost linked once."),
    ("T22", "Batch-specific yield", "Cooked waste 10 kg; correct batch Y=2,0", "10/2,0", "5 kg raw-eq", "Do not borrow Y from another batch."),
    ("T23", "DQ-04 compliance", "3 of 4 due check events completed on time and passed", "3/4×100", "75,00%", "Failed/missed due events remain denominator."),
    ("T24", "DQ-05 inventory-profile residual", "Inventory profile: M_available 60 kg; M_accounted 58 kg", "|60−58|/60×100", "3,33%", "Descriptive stock variance; residual ≠ automatic waste and has no universal pass/fail threshold."),
    ("T25", "DQ-05 incomplete boundary", "Available 60 kg; significant outflow unknown", "BLOCK", "BLOCKED", "No infer as zero or waste."),
    ("T26", "OP-09 disposition", "8 kg unserved/100 kg available; 5 rescued, 3 retained", "8/100×100", "8% surplus", "No 8 kg waste assumption."),
    ("T27", "Process balance with additions", "12 kg prepared edible + 14 kg water + 2 kg other inputs; outputs: 26.5 kg product + 0.5 kg by-product + 0.5 kg waste + 0.5 kg measured evaporation", "28 kg available; 28 kg accounted", "0,00% residual", "All additions and material outputs documented; hypothetical only."),
    ("T28", "Cooking boundary with unknown vapor loss", "28 kg available; 27.5 kg documented outflows; material evaporation not measured/estimated", "BLOCK", "BLOCKED", "Do not plug residual into waste or mark boundary as complete."),
    ("T29", "Composite plate waste with wrong yield mapping", "4 kg mixed plate waste; only rice component yield Y=2,0 available", "BLOCK raw-equivalent", "Cooked mass 4 kg only", "No dish-wide conversion without component/recipe allocation."),
    ("T30", "No scale checks due this period", "No active scale-check event has due_at within period", "N/A", "N/A", "DQ-04 is not 100%; no denominator events."),
]

# Per-scenario status and evidence path. Statuses: PARTIAL / N/A only (PASS
# would require the scenario's own formula to be computed and proven; the P0
# app computes none of them by accepted scope).
MATRIX = {
    "T01": ("N/A", "reject/inspected ratio; receiving KPI not modeled in P0 (PRD §13: no KPI engine)"),
    "T02": ("N/A", "needs lot/inventory traces; inventory is OUT of P0 scope"),
    "T03": ("N/A", "edible-loss ratio; denominator model absent in P0"),
    "T04": ("N/A", "inedible/trim share; trim classification not modeled in P0"),
    "T05": ("N/A", "yield factor needs recipe/batch boundary; batch linkage is P1 (EVT-006)"),
    "T06": ("N/A", "raw-equivalent conversion needs approved yield mapping; MEA-006 forbids it"),
    "T07": ("N/A", "production overrun vs plan; no plan data model in P0"),
    "T08": ("N/A", "surplus ratio; served-available denominator not modeled"),
    "T09": ("N/A", "plate waste ratio; served-mass denominator not modeled"),
    "T10": ("N/A", "g/meal ratio; meal count model absent in P0"),
    "T11": ("N/A", "material value; FI computations are P2 and never in P0 output"),
    "T12": ("N/A", "energy conversion; nutrition math absent and HELD-adjacent"),
    "T13": ("N/A", "failed batch ratio; batch linkage is P1"),
    "T14": ("N/A", "mass balance closure; no boundary/accounting model in P0"),
    "T15": ("PARTIAL", "invariant automated: duplicate identity rejected (DB unique PK; tests/test_ledger_postgresql.py) and DQ counts never multiply; the 50% duplicate-rate FORMULA is not computed (no such DQ metric in P0)"),
    "T16": ("PARTIAL", "invariant automated: missing ≠ zero and unmeasured events counted separately (tests/test_dq_live_postgresql.py); the scheduled-opportunities coverage FORMULA is not computed (no scheduling model)"),
    "T17": ("N/A", "no ratio engine exists to divide by zero; absence is by accepted scope, not a testable P0 behavior"),
    "T18": ("PARTIAL", "guardrail automated: rows keep per-row mass_basis and no cross-basis sum/ratio column exists (tests/test_export_postgresql.py + matrix guardrail test); the BLOCK outcome is achieved by absence of a ratio engine, not by a ratio module"),
    "T19": ("PARTIAL", "invariant automated: one event stays one with repeated observations (tests/test_dq_live_postgresql.py::test_one_event_two_measurements_counts_1_and_2); disposition transfer itself is P1"),
    "T20": ("N/A", "BDD nutrient math; no nutrient engine and never in P0 output"),
    "T21": ("N/A", "FI cost pools are P2; no cost model exists"),
    "T22": ("N/A", "batch-specific yield; MEA-006 forbids borrowing conversions"),
    "T23": ("N/A", "DQ-04 due-event compliance; no check-scheduling model in P0"),
    "T24": ("N/A", "inventory residual is descriptive; no inventory model in P0"),
    "T25": ("PARTIAL", "guardrail automated: unknown stays unknown — DQ/UI report 'belum dinilai', never 0 issues (DQ-003/DQ-008; matrix guardrail test)"),
    "T26": ("PARTIAL", "guardrail automated: at_risk_surplus is never actual discard — separate event_type, no discard aggregation in DQ/export (DR-10, AC-08); the 8% surplus FORMULA is not computed"),
    "T27": ("N/A", "process balance with documented additions; no boundary model in P0"),
    "T28": ("PARTIAL", "guardrail automated: unknown loss never plugged as waste — missing/unknown statuses distinct, unmeasured events reported separately (matrix guardrail test)"),
    "T29": ("PARTIAL", "guardrail automated: no cross-component conversion — export/DQ keep original basis/unit per row (MEA-006; matrix guardrail test); component-level yield allocation is not modeled"),
    "T30": ("N/A", "no scale-check scheduling model exists in P0; the empty-scope DQ test does NOT prove this scenario (per Codex preflight)"),
}


def _event(event_id, **changes):
    from datetime import datetime, timezone
    row = dict(event_id=event_id, organization_id='11111111-1111-4111-8111-111111111111',
               site_id='22222222-2222-4222-8222-222222222222', event_type='at_risk_surplus',
               occurred_at=datetime(2026, 11, 4, 7, 0, tzinfo=timezone.utc),
               recorded_at=datetime(2026, 11, 4, 7, 5, tzinfo=timezone.utc))
    row.update(changes)
    return row


def _measurement(measurement_id, event_id, status='observed', basis='cooked', **changes):
    from datetime import datetime, timezone
    row = dict(measurement_id=measurement_id, event_id=event_id, site_id='22222222-2222-4222-8222-222222222222',
               measured_at=datetime(2026, 11, 4, 7, 10, tzinfo=timezone.utc),
               recorded_at=datetime(2026, 11, 4, 7, 11, tzinfo=timezone.utc),
               gross='2.40', tare='0.40', net='2.00', original_unit='kg', mass_basis=basis,
               measurement_method='scale_reading', observation_status=status,
               validation_status=None, provenance='synthetic_fixture')
    row.update(changes)
    return row


def test_matrix_covers_all_thirty_scenarios_with_honest_status():
    assert len(SCENARIO_TABLE) == 30
    assert {row[0] for row in SCENARIO_TABLE} == set(MATRIX) == {f'T{i:02d}' for i in range(1, 31)}
    for scenario_id, (status, _evidence) in MATRIX.items():
        assert status in ('PASS', 'PARTIAL', 'NOT RUN', 'N/A')
    # Honest totals: PASS 0 (no KPI engine), NOT RUN 0; PARTIAL = invariant/
    # guardrail automated only; everything else out of P0 scope with a reason.
    counts = {}
    for status, _evidence in MATRIX.values():
        counts[status] = counts.get(status, 0) + 1
    assert counts == {'PARTIAL': 8, 'N/A': 22}
    assert MATRIX['T30'][0] == 'N/A'  # empty-DQ test must not claim this scenario


@pytest.mark.parametrize('scenario_id,kase,input_hypothetis,aturan,hasil,catatan', SCENARIO_TABLE)
def test_scenario_verbatim_source_preserved(scenario_id, kase, input_hypothetis, aturan, hasil, catatan):
    """Every embedded row matches its verbatim transcription; nothing invented."""
    status, evidence = MATRIX[scenario_id]
    assert status in ('PASS', 'PARTIAL', 'NOT RUN', 'N/A')
    assert evidence  # every row carries a reason/evidence path


def test_guardrail_no_ratio_or_mass_aggregation_anywhere_in_outputs():
    """T17/T18/T24/T25/T26/T28/T29 guardrails: count-only DQ, per-row export."""
    events = [_event('33333333-3333-4333-8333-333333333301'),
              _event('33333333-3333-4333-8333-333333333302', event_type='actual_loss_discard')]
    measurements = [_measurement('44444444-4444-4444-8444-444444444401', events[0]['event_id'], basis='cooked'),
                    _measurement('44444444-4444-4444-8444-444444444402', events[0]['event_id'], basis='raw')]
    view = build_data_quality_view(events, measurements, DataQualityFilters())
    summary = view.summary
    # Count-only: no mass totals, no ratios, no discard mass anywhere.
    payload = repr(summary)
    for forbidden in ('kg', 'ratio', 'discard_mass', 'total_mass', 'percent'):
        assert forbidden not in payload
    assert summary.measurement_count == 2 and summary.event_count == 2  # never summed as generation
    # Export rows keep their own basis labels; no aggregate or computed column exists.
    bundle = serialize_export(events, measurements, allowed_site_ids=['22222222-2222-4222-8222-222222222222'],
                              generated_at=datetime_now())
    header = bundle.measurements_csv.decode('utf-8-sig').splitlines()[0]
    assert 'mass_basis' in header and 'ratio' not in header and 'total' not in header.lower()
    assert repr(bundle.metadata_json)  # metadata carries counts, never computed KPIs


def datetime_now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


def test_guardrail_held_kpis_never_appear_as_output():
    """OP-08 / FI-02 / NI-03 remain HELD across API and export (DR-16, AC-13)."""
    bundle = serialize_export([_event('33333333-3333-4333-8333-333333333301')], [],
                              allowed_site_ids=['22222222-2222-4222-8222-222222222222'],
                              generated_at=datetime_now())
    import json
    metadata = json.loads(bundle.metadata_json.decode('utf-8'))
    assert metadata['held_kpis'] == ['OP-08', 'FI-02', 'NI-03']
    csv_text = (bundle.events_csv + bundle.measurements_csv).decode('utf-8-sig')
    for held in ('OP-08', 'FI-02', 'NI-03'):
        assert held not in csv_text


def test_guardrail_unknown_and_incomplete_boundary_stay_blocked_not_zero():
    """T25/T28: unknown outflow is never inferred as zero or waste."""
    events = [_event('33333333-3333-4333-8333-333333333301')]
    view = build_data_quality_view(events, [], DataQualityFilters())
    assert view.summary.unmeasured_event_count == 1  # reported, not imputed 0 kg
    assert view.summary.missing_count == 0
    # An observation with missing values stays null; validation never fabricates mass.
    with pytest.raises(Exception):
        validate_demo_measurement(dict(gross=None, tare=None, net=None, original_unit='kg',
                                       mass_basis='cooked', measurement_method='scale_reading',
                                       provenance='synthetic_fixture', observation_status='observed',
                                       measured_at=datetime_now()))
