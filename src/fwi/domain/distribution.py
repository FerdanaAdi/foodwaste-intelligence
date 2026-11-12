"""Provisional P1 distribution, delivery and meal-service invariants (FR-103 candidate).

Dispatch, receipt, service and leftover are separately recorded concepts. A
mismatch between dispatched and received quantity is a review status, never an
automatic waste event (PRD DR-03/DR-10; P1-AC-05). No student-level record
exists in this candidate and no population estimate is computed without an
approved sampling frame (P1-AC-06; EXT-OD-07 OPEN).
"""
from fwi.domain.operations import PolicyBlocked

PROVISIONAL_RECONCILIATION_STATUSES = frozenset({'not_received', 'match', 'needs_review'})


def delivery_reconciliation(dispatch_quantity, received_quantity):
    """Descriptive comparison of two separately recorded observations."""
    if received_quantity is None:
        return 'not_received'
    return 'match' if dispatch_quantity == received_quantity else 'needs_review'


def sampling_coverage(sampling_frame, sample_size, sampling_method):
    """Label sampling metadata; an unframed sample never represents a population."""
    if sampling_frame:
        return 'framed'
    if sample_size is not None or sampling_method:
        return 'unframed_sample'
    return 'not_sampled'


def population_estimate(*args, **kwargs):
    """Deliberately unimplemented.

    Plate-waste expansion into a population figure requires an approved
    sampling design (EXT-OD-07 OPEN; FWI-02 BR-10/11). This guard exists so no
    caller and no API surface can silently extrapolate a sample (P1-AC-06).
    """
    raise PolicyBlocked('population estimation requires an approved sampling frame and design (EXT-OD-07 OPEN)')
