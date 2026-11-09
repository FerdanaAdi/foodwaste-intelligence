"""Explicit synthetic KPI catalogue seed, invoked by tests/local setup only.

Only codes and design statuses citable from PRD v0.1 section 11 (FWI-03 v1.3)
are seeded: three design-pass, three HELD. FWI-03 v1.3 itself is not available
in this repository, so the 18 conditional codes and every formula body are
NOT invented here. Never executed at application startup.
"""
from datetime import date, datetime, timezone

from fwi.infrastructure.database.models_p1 import P2KpiEntry

SOURCE_REVISION = 'FWI-03 v1.3 via PRD v0.1 section 11'
DESCRIPTION = ('code and design status only; formula body not available in this repository '
               'and not invented')
GATE = 'pending FWI-03 gate definitions'
KPI_CATALOGUE_SEED = (
    ('OP-03', 'design_pass'),
    ('OP-04', 'design_pass'),
    ('OP-10', 'design_pass'),
    ('OP-08', 'held'),
    ('FI-02', 'held'),
    ('NI-03', 'held'),
)


def seed_kpi_registry(factory):
    with factory() as session, session.begin():
        for code, design_status in KPI_CATALOGUE_SEED:
            if session.get(P2KpiEntry, code) is not None:
                continue  # read-only registry: never overwrite an existing definition
            session.add(P2KpiEntry(
                kpi_code=code, formula_version='unavailable-pending-FWI-03',
                description=DESCRIPTION, design_status=design_status, data_readiness_gate=GATE,
                source_doc_revision=SOURCE_REVISION, effective_at=date(2026, 11, 9),
                change_reason='initial candidate seed from citable sources only',
                recorded_at=datetime.now(timezone.utc)))
