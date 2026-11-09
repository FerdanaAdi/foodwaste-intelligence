"""Provisional FR-106 mass-aggregation semantics (remediation of Codex blockers 1 and 2).

Raw arithmetic is not effective/reportable measurement selection. An event
with multiple observations is unresolved across ALL bases. Missing coverage
blocks a complete raw sum. OD-P1-02 / EXT-OD-03 remains OPEN; no effective
mass is selected even for a single observation. ``eligible_mass`` is retained
ONLY as an internal legacy alias of raw_observed_mass for arithmetic callers;
it is never serialized as eligible/reportable mass by the trends adapter.
"""
from decimal import Decimal
from .measurements import PROVISIONAL_MASS_BASES

USABLE_OBSERVATION_STATUSES = frozenset({'observed', 'measured_zero'})
CANONICAL_UNIT = 'kg'

UNRESOLVED_REASON = ('effective measurement selection for repeated observations has no accepted '
                     'policy (EXT-OD-03 OPEN); event mass is unresolved and is not summed')
NO_USABLE_REASON = ('no usable physical observation on this basis (only estimated, missing or '
                    'not_measured records); no mass is aggregated')
INCOMPLETE_REASON = ('events without a determinate usable observation (estimated, missing or '
                     'not_measured) exist in scope; showing a total now would present a partial '
                     'figure as complete')
INCOMPATIBLE_REASON = 'measurements with units other than kg are present; aggregation refused'
AVAILABLE_REASON = ('every measured event in scope has exactly one usable observation; mass covers '
                    'single-observation events only and is not a KPI')


def exact_decimal_sum(values):
    """Exact finite nonnegative Decimal sum; no context rounding or quantization.

    Align integer coefficients to the finest source exponent. Construction from
    a Decimal tuple preserves that exponent (including measured-zero scale).
    This arithmetic helper does not claim unbounded PostgreSQL storage precision.
    """
    values = list(values)
    if not values:
        return Decimal('0')
    if any(not isinstance(v, Decimal) or not v.is_finite() or v < 0 for v in values):
        raise ValueError('mass operands must be finite nonnegative Decimal values')
    exponent = min(v.as_tuple().exponent for v in values)
    total = 0
    for value in values:
        parts = value.as_tuple()
        coefficient = 0
        for digit in parts.digits:
            coefficient = coefficient * 10 + digit
        total += coefficient * 10 ** (parts.exponent - exponent)
    # Decimal(int) is exact and avoids Python's string-to-integer digit limit.
    return Decimal((0, Decimal(total).as_tuple().digits, exponent))


def basis_aggregation(groups, *, basis=None, unmeasured_event_count=0):
    """Aggregate one mass basis from per-event measurement groups.

    ``groups`` is an iterable of ``(event_key, measurements)`` where each
    measurement exposes ``observation_status``, ``net`` and ``original_unit``.
    Returns a structured view that separates available value, unresolved
    selection, missing observation and unit compatibility; it never invents a
    number for unknown mass.
    """
    event_count = 0
    measurement_count = 0
    eligible_event_count = 0
    unresolved_event_count = 0
    estimated_event_count = 0
    unobserved_event_count = 0
    measured_zero_event_count = 0
    unit_compatible = True
    operands = []
    basis_compatible = basis is None or basis in PROVISIONAL_MASS_BASES
    for _event_key, measurements in groups:
        event_count += 1
        measurement_count += len(measurements)
        if any(getattr(measurement, 'original_unit', None) != CANONICAL_UNIT
               for measurement in measurements):
            unit_compatible = False
        statuses = [measurement.observation_status for measurement in measurements]
        usable = [measurement for measurement in measurements
                  if measurement.observation_status in USABLE_OBSERVATION_STATUSES]
        if len(measurements) > 1:
            unresolved_event_count += 1  # repeated observations: selection is OPEN
        elif len(usable) == 1:
            eligible_event_count += 1
            operands.append(usable[0].net)
            if usable[0].observation_status == 'measured_zero':
                measured_zero_event_count += 1
        elif statuses == ['estimated'] or (len(statuses) == 1 and 'estimated' in statuses):
            estimated_event_count += 1
        else:
            unobserved_event_count += 1  # missing / not_measured only
    incomplete = estimated_event_count + unobserved_event_count
    if not unit_compatible:
        status, reason, mass = 'incompatible_unit', INCOMPATIBLE_REASON, None
    elif not basis_compatible:
        status, reason, mass = 'incompatible_basis', 'mass basis is not in the provisional contract', None
    elif unresolved_event_count > 0:
        status, reason, mass = 'unresolved_selection', UNRESOLVED_REASON, None
    elif eligible_event_count == 0:
        status, reason, mass = 'no_usable_observation', NO_USABLE_REASON, None
    elif incomplete > 0 or unmeasured_event_count > 0:
        # a partial total presented as complete would misrepresent coverage
        status, reason, mass = 'incomplete_observation', INCOMPLETE_REASON, None
    else:
        status, reason, mass = 'raw_observation_available', AVAILABLE_REASON, exact_decimal_sum(operands)
    return {
        'status': status, 'reason': reason, 'eligible_mass': mass,
        'raw_observed_mass': mass, 'reportable_mass': None,
        'event_count': event_count, 'measurement_count': measurement_count,
        'eligible_event_count': eligible_event_count,
        'unresolved_event_count': unresolved_event_count,
        'estimated_event_count': estimated_event_count,
        'unobserved_event_count': unobserved_event_count,
        'measured_zero_event_count': measured_zero_event_count,
    }
