"""Explicit synthetic KPI catalogue seed, invoked by tests/local setup only.

All24 codes/titles/design statuses are transcribed from the verified Owner
FWI-03 v1.3 source. Three design-pass,18 conditional,3 HELD. Existing rows are
never rewritten. Formula implementations/operational authorization are not seeded. Never executed at application startup.
"""
from datetime import date, datetime, timezone

from fwi.infrastructure.database.models_p1 import P2KpiEntry

SOURCE_SHA256 = '5394dbcb7fd914a6635013cf7eb4eb7d2c293ffcab79561a10333b8176a6fa5a'
SOURCE_REVISION = 'FWI-03 v1.3; sha256:' + SOURCE_SHA256[:16]
DESCRIPTION = 'Source catalogue metadata only; no numeric activation or field validation'
GATE = 'Methodology, compatible data and operational authorization required; no formula activation'
KPI_DEFINITIONS = (
    ('OP-01', 'conditional', 'Receiving Rejection Ratio'),
    ('OP-02', 'conditional', 'Storage Spoilage Ratio'),
    ('OP-03', 'design_pass', 'Preparation Loss Ratio (Edible)'),
    ('OP-04', 'design_pass', 'Inedible Trim Proportion'),
    ('OP-05', 'conditional', 'Production Yield Factor'),
    ('OP-06', 'conditional', 'Failed Batch Ratio'),
    ('OP-07', 'conditional', 'Production Overrun Ratio'),
    ('OP-08', 'held', 'Distribution Loss Ratio'),
    ('OP-09', 'conditional', 'Unserved Edible Surplus Ratio'),
    ('OP-10', 'design_pass', 'Plate Waste Ratio (Edible, Served)'),
    ('OP-11', 'conditional', 'Plate Waste per Served Meal'),
    ('OP-12', 'conditional', 'Safe Food Rescue Rate'),
    ('DQ-01', 'conditional', 'Measurement Coverage Rate'),
    ('DQ-02', 'conditional', 'Required-field Completeness'),
    ('DQ-03', 'conditional', 'Evidence Validity Rate'),
    ('DQ-04', 'conditional', 'Scale Check Compliance'),
    ('DQ-05', 'conditional', 'Mass Balance Residual Ratio'),
    ('DQ-06', 'conditional', 'Duplicate Event Rate'),
    ('FI-01', 'conditional', 'Raw-stage Material Loss Value'),
    ('FI-02', 'held', 'MFCA Cost of Cooked Edible Waste'),
    ('FI-03', 'conditional', 'Waste Handling Cost per kg'),
    ('NI-01', 'conditional', 'Estimated Energy Content in Edible Waste'),
    ('NI-02', 'conditional', 'Nutrient-specific Content in Edible Waste'),
    ('NI-03', 'held', 'Nutrient Waste Share of Served Food'),
)
KPI_CATALOGUE_SEED = tuple((code,status) for code,status,_ in KPI_DEFINITIONS)
KPI_TITLES = {code:title for code,_,title in KPI_DEFINITIONS}



def seed_kpi_registry(factory):
    with factory() as session, session.begin():
        for code, design_status in KPI_CATALOGUE_SEED:
            if session.get(P2KpiEntry, code) is not None:
                continue  # read-only registry: never overwrite an existing definition
            session.add(P2KpiEntry(
                kpi_code=code, formula_version='not-implemented-FWI-03-v1.3',
                description=KPI_TITLES[code] + '; ' + DESCRIPTION, design_status=design_status, data_readiness_gate=GATE,
                source_doc_revision=SOURCE_REVISION, effective_at=date(2026, 11, 13),
                change_reason='synthetic catalogue metadata from verified FWI-03 source; no calculation authorization',
                recorded_at=datetime.now(timezone.utc)))
