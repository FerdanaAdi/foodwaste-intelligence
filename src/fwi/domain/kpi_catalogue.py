"""Provisional P2 KPI catalogue status logic (FR-201/FR-202 foundations).

The catalogue only records FWI-03 design statuses; design approval never
implies operational or field validation (P2-AC-02). HELD codes return no
numeric result on any path (P2-AC-01; PRD DR-16). No formula implementation is
authorized in this candidate, so every preview resolves to a blocked status
with an explicit reason instead of a value.
"""
DESIGN_STATUSES = frozenset({'design_pass', 'conditional', 'held'})
# FWI-03 v1.3 via PRD v0.1 section 11: 3 design-pass, 18 conditional, 3 HELD.
HELD_CODES = frozenset({'OP-08', 'FI-02', 'NI-03'})


def preview(code, design_status, *, numerator_basis=None, denominator_basis=None,
            prerequisites_met=False):
    """Resolve a preview request; the returned mapping never carries a value.

    P2-AC-03: an incompatible denominator is a blocked N/A with a reason.
    """
    if design_status not in DESIGN_STATUSES:
        return {'kpi_code': code, 'status': 'blocked', 'reason': 'unknown provisional design status'}
    if design_status == 'held' or code in HELD_CODES:
        return {'kpi_code': code, 'status': 'held_blocked',
                'reason': 'KPI HELD per FWI-03; calculation disabled on every path'}
    if (numerator_basis is not None and denominator_basis is not None
            and numerator_basis != denominator_basis):
        return {'kpi_code': code, 'status': 'blocked',
                'reason': 'denominator mass basis does not match numerator (DR-11); result is N/A'}
    if design_status == 'conditional':
        return {'kpi_code': code, 'status': 'blocked',
                'reason': 'conditional KPI; FWI-03 methodology gate not passed (G-P2-METHOD)'}
    if not prerequisites_met:
        return {'kpi_code': code, 'status': 'blocked', 'reason': 'data prerequisites not met; preview unavailable'}
    return {'kpi_code': code, 'status': 'blocked',
            'reason': 'no authorized formula implementation; design-pass does not imply operational validation'}
