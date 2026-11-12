"""Provisional P2 explainable alerts and recommendations (FR-204 candidate).

Rules are structural and deterministic: each derives an issue from states that
existing P1 records already encode (reconciliation status, measurement
coverage, allocation warning, sampling frame). No numeric threshold is
invented anywhere. When inputs are incomplete the rule yields an explicit
insufficient-data outcome instead of a confident claim (P2-AC-07). A
recommendation is text plus provenance only: no code path in this module or in
its callers can change portions, menus, nutrition, food safety, procurement,
rescue handling or official reporting (P2-AC-08).
"""
RULE_VERSION = 'p2-rules-provisional-v0'

RULE_DESCRIPTIONS = {
    'delivery_reconciliation_review': 'dispatch and received quantities differ; the difference needs human review and is never an automatic waste event',
    'event_coverage_insufficient': 'event has no usable measurement (none recorded, or only missing/not_measured); analysis coverage is insufficient',
    'allocation_exceeds_reference': 'recorded disposition allocation exceeds the single reference observation; review required (rule still OPEN, EXT-OD-03/08)',
    'sampling_frame_missing': 'sample recorded without a population frame; no population estimate is possible (EXT-OD-07 OPEN)',
}

_NON_AUTONOMOUS_ACTION = 'review the linked record with the site team; FWI never applies an automatic change'


def _alert(rule_code, target_type, target_ref, detected_issue, coverage):
    return {
        'rule_code': rule_code, 'rule_version': RULE_VERSION,
        'target_type': target_type, 'target_ref': target_ref,
        'detected_issue': detected_issue, 'coverage': coverage,
        'recommended_action': _NON_AUTONOMOUS_ACTION, 'state': 'open',
    }


def _insufficient(rule_code, target_type, target_ref, reason):
    return {
        'state': 'insufficient_data', 'rule_code': rule_code,
        'target_type': target_type, 'target_ref': target_ref, 'reason': reason,
    }


def delivery_reconciliation_review(delivery):
    """Needs-review reconciliation of two separately recorded observations."""
    if delivery.reconciliation_status == 'needs_review':
        return _alert('delivery_reconciliation_review', 'delivery', delivery.delivery_id,
                      'dispatched and received quantities differ; the difference needs review '
                      '(not an automatic waste event)', 'complete')
    return None


def event_coverage_insufficient(event, measurements):
    """Event without any usable observation is a coverage gap, not a waste estimate."""
    usable = [measurement for measurement in measurements
              if measurement.observation_status in ('observed', 'measured_zero', 'estimated')]
    if usable:
        return None
    reason = ('no measurement recorded' if not measurements
              else 'only missing/not_measured observations recorded')
    return _alert('event_coverage_insufficient', 'waste_event', event.event_id,
                  f'{reason}; coverage insufficient for analysis', 'partial')


def allocation_exceeds_reference(disposition):
    """Surface the disposition allocation state without inventing a selection.

    Blocker-2 remediation: no max/latest/first reference exists anymore, so the
    application reports 'reference_unresolved' and this rule yields an explicit
    insufficient-data outcome instead of a claim. The 'exceeds_reference' branch
    is kept only for a future accepted policy; no caller produces it today."""
    if disposition.allocation_status == 'exceeds_reference':
        return _alert('allocation_exceeds_reference', 'disposition', disposition.disposition_id,
                      'disposition allocation exceeds the approved reference observation; '
                      'review required', 'partial')
    if disposition.allocation_status in ('reference_unresolved', 'no_reference'):
        return _insufficient('allocation_exceeds_reference', 'disposition', disposition.disposition_id,
                             'effective reference measurement selection has no accepted policy '
                             '(EXT-OD-03 OPEN); no confident claim is made')
    return None


def sampling_frame_missing(service):
    """Unframed samples are labeled; they never become a population figure."""
    if service.sampling_coverage_status == 'unframed_sample':
        return _alert('sampling_frame_missing', 'meal_service', service.service_id,
                      'sample recorded without a population frame; no population estimate is possible',
                      'partial')
    return None
