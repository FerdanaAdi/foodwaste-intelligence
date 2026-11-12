"""Provisional P1 disposition recording with the rescue safety boundary (FR-105 candidate).

Dispositions record where material ended up. They are fates of an existing
event, never new waste generation (PRD DR-03; P1-AC-09). Rescue-like outcomes
require an assessed-safe food-safety status before handover metadata can be
recorded, and no rescue execution endpoint exists in this candidate
(G-SAFETY; PRD DR-14; P1-AC-10). The allocation comparison is descriptive
only: the approved reference-observation and blocking rule is still OPEN
(EXT-OD-03/08).
"""
PROVISIONAL_OUTCOME_TYPES = frozenset({
    'compost', 'disposal', 'animal_feed', 'processing', 'redistribution_handover',
})
PROVISIONAL_RESCUE_OUTCOMES = frozenset({'animal_feed', 'redistribution_handover'})
PROVISIONAL_FOOD_SAFETY_STATUSES = frozenset({'not_assessed', 'assessed_safe', 'assessed_unsafe'})


def safety_gate(outcome_type, food_safety_status):
    """Refuse rescue-like outcomes that are not assessed safe (P1-AC-10)."""
    if outcome_type not in PROVISIONAL_OUTCOME_TYPES:
        raise ValueError('unsupported provisional disposition outcome type')
    if food_safety_status not in PROVISIONAL_FOOD_SAFETY_STATUSES:
        raise ValueError('unsupported provisional food-safety status')
    if outcome_type in PROVISIONAL_RESCUE_OUTCOMES and food_safety_status != 'assessed_safe':
        raise ValueError('safety gate blocked: rescue-like outcome requires assessed_safe food safety')
    return True


def allocation_status(quantity, recorded_total, reference):
    """Descriptive comparison against one reference observation.

    Blocker-2 remediation: NO application caller may use this function today,
    because selecting a reference measurement has no accepted policy
    (EXT-OD-03 OPEN) and max/latest/first selection was removed. It is kept as
    a pure domain utility for a future accepted policy; the application
    reports 'reference_unresolved' instead of inventing a selection.
    Repeated measurements are never summed (PRD DR-02), so the caller would
    have to supply a single approved reference observation, never a total.
    """
    if reference is None:
        return 'no_reference'
    return 'within_reference' if recorded_total + quantity <= reference else 'exceeds_reference'
