"""Provisional P1 menu/recipe/batch invariants (FR-102 candidate).

Recipe versions are immutable once a batch references them; the candidate only
creates new version rows and exposes no update path for existing recipes or
lines. Yield is computed only from comparable input/output observations with
the same mass basis and unit; there is no universal raw-to-cooked factor
(PRD DR-07/DR-11; EXT-OD-06 OPEN).
"""
from decimal import Decimal

PROVISIONAL_IO_KINDS = frozenset({'input', 'output_primary', 'output_rework'})


def batch_yield(entries):
    """Return a yield view for one batch; never invent a factor or mix bases.

    Rework outputs are excluded from the yield numerator so a rework loop that
    is later linked as an input of another batch cannot be counted twice
    (P1-AC-04). Blocked results carry a reason instead of a number.
    """
    inputs = [entry for entry in entries if entry.io_kind == 'input']
    primary = [entry for entry in entries if entry.io_kind == 'output_primary']
    rework = [entry for entry in entries if entry.io_kind == 'output_rework']
    view = {
        'status': 'blocked', 'basis': None, 'value': None,
        'input_total': None, 'primary_output_total': None, 'rework_total': None,
        'reason': None,
    }
    if not inputs:
        view['reason'] = 'no recorded batch input; yield blocked'
        return view
    if not primary:
        view['reason'] = 'no recorded primary output; yield blocked'
        return view
    units = {entry.original_unit for entry in inputs + primary}
    if len(units) != 1:
        view['reason'] = 'incompatible units between batch input and output; conversion not authorized'
        return view
    input_bases = {entry.mass_basis for entry in inputs}
    output_bases = {entry.mass_basis for entry in primary}
    if len(input_bases) != 1 or input_bases != output_bases:
        view['reason'] = 'batch input and output mass bases do not match; mixed-basis yield blocked (DR-11)'
        return view
    basis = next(iter(input_bases))
    input_total = sum((entry.quantity for entry in inputs), Decimal('0'))
    output_total = sum((entry.quantity for entry in primary), Decimal('0'))
    if input_total <= 0:
        view['reason'] = 'batch input total is zero; yield undefined'
        return view
    rework_bases = {entry.mass_basis for entry in rework}
    rework_total = None
    if rework and rework_bases == {basis}:
        rework_total = sum((entry.quantity for entry in rework), Decimal('0'))
    view.update({
        'status': 'computed', 'basis': basis, 'value': output_total / input_total,
        'input_total': input_total, 'primary_output_total': output_total,
        'rework_total': rework_total, 'reason': None,
    })
    return view
