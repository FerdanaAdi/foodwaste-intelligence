"""Demo-only validation extension; no new scientific or rounding policy."""

from decimal import localcontext

from .measurements import PROVISIONAL_MASS_BASES, PROVISIONAL_UNITS
from .validation import _decimal


def validate_demo_measurement(values: dict) -> None:
    if values['original_unit'] not in PROVISIONAL_UNITS:
        raise ValueError('demo supports original_unit kg only')
    if values['mass_basis'] not in PROVISIONAL_MASS_BASES:
        raise ValueError('explicit provisional mass_basis required')
    status = values['observation_status']
    if status not in {'observed', 'measured_zero', 'estimated', 'missing', 'not_measured'}:
        raise ValueError('unsupported provisional observation status')
    masses = [_decimal(values[k], k) for k in ('gross', 'tare', 'net')]
    # Reversible resource limit, not metrological precision/rounding policy.
    if any(v is not None and (len(v.as_tuple().digits) > 1000 or abs(v.as_tuple().exponent) > 1000) for v in masses):
        raise ValueError('demo input exceeds technical decimal size limit')
    if status in {'missing', 'not_measured'}:
        if any(v is not None for v in masses):
            raise ValueError('missing/not_measured requires null masses, never zero')
        return
    if any(v is None for v in masses):
        raise ValueError('gross, tare and net required for observed/estimated masses')
    gross, tare, net = masses
    if any(v < 0 for v in masses):
        raise ValueError('mass must be nonnegative')
    # Exact subtraction at the supplied decimal exponents, not default precision.
    with localcontext() as context:
        context.prec = max(v.adjusted() for v in masses) - min(v.as_tuple().exponent for v in masses) + 3
        if gross < tare or net != gross - tare:
            raise ValueError('gross/tare/net inconsistent')
    if status == 'measured_zero' and net != 0:
        raise ValueError('measured_zero requires net zero')
