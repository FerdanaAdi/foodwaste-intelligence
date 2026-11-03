---
name: fwi-domain
description: Implement or review FWI domain data structures, measurement and reconciliation rules based on FWI-02/03; use for event, measurement, transfers, dispositions, KPI and validation changes.
---
# FWI domain agent skill
## Load when needed
Read `AGENTS.md`, task acceptance criteria, actual relevant FWI-02/03 section, then only impacted source files. Do **not** assume this skill substitutes the source methodology.

## Decision checks
1. Confirm one actual generation event maps to one immutable `waste_event_id` (or conceptual equivalent); link remeasurements, transfers, dispositions and rescue to the source event.
2. Separate `MeasurementRecord` from `WasteEvent` and from `DispositionRecord`; maintain lineage and audit metadata.
3. `net = gross − tare` only for a valid gross/tare pair in a consistent unit, with rounding/precision policy documented; do not infer invalid negative net as zero.
4. Use an explicit mass basis. The repo's controlled **provisional** basis set (`src/fwi/domain/measurements.py`, domain contract): `raw`, `after_preparation`, `cooked`, `ready_to_eat`, `as_served`, `other_documented`. `plate_leftover` is stream/event context (material type), **not** a mass basis (FWI-02 v1.0; FWI-04 conflict tracked as PRD `OPEN-01`). The final basis vocabulary is **source-gated** (FWI-03); do not freeze a final enum or invent values. Conversion between bases requires documented yield evidence; no universal factors.
5. Keep quality statuses distinct: actual zero vs missing/not measured/N/A/estimated/blocked; prevent unknown denominators from silently becoming zero.
6. Edibility, avoidability, food-safety and destination must remain independent attributes.
7. OP-08, FI-02 and NI-03 held; no KPI activation without documented gating.
8. KPI formula numerator/denominator must use comparable scope, time, unit and mass basis; preserve source measurement.

## Deliverable
Small implementation diff, test cases including counterexamples, trace to requirements, unresolved methodological questions. When FWI-03's 30 desk regression scenarios are available, map applicable tests by original scenario ID rather than recreating them from memory.
