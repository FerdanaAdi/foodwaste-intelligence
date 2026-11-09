"""Pure-domain tests for the provisional FR-204 recommendation rules.

Rules are structural only: no numeric threshold exists, insufficient inputs
yield explicit no-claim outcomes, and every output is text plus provenance
(P2-AC-07/08).
"""
from types import SimpleNamespace

import pytest

from fwi.domain import recommendations


def delivery(status, delivery_id='D1'):
    return SimpleNamespace(delivery_id=delivery_id, reconciliation_status=status)


def measurement(status='observed'):
    return SimpleNamespace(observation_status=status)


def event(event_id='E1'):
    return SimpleNamespace(event_id=event_id)


def service(status, service_id='S1'):
    return SimpleNamespace(service_id=service_id, sampling_coverage_status=status)


def disposition(status, disposition_id='X1'):
    return SimpleNamespace(disposition_id=disposition_id, allocation_status=status)


def test_only_review_reconciliation_raises_an_alert():
    assert recommendations.delivery_reconciliation_review(delivery('match')) is None
    assert recommendations.delivery_reconciliation_review(delivery('not_received')) is None
    alert = recommendations.delivery_reconciliation_review(delivery('needs_review', 'D9'))
    assert alert['rule_code'] == 'delivery_reconciliation_review'
    assert alert['target_type'] == 'delivery' and alert['target_ref'] == 'D9'
    assert 'not an automatic waste event' in alert['detected_issue']


def test_event_coverage_alert_only_without_usable_observations():
    assert recommendations.event_coverage_insufficient(event(), []) is not None
    assert recommendations.event_coverage_insufficient(
        event(), [measurement('missing'), measurement('not_measured')]) is not None
    for usable in ('observed', 'measured_zero', 'estimated'):
        assert recommendations.event_coverage_insufficient(event(), [measurement(usable)]) is None


def test_allocation_rule_and_explicit_insufficient_data_outcome():
    exceeds = recommendations.allocation_exceeds_reference(disposition('exceeds_reference'))
    assert exceeds and exceeds['coverage'] == 'partial'
    no_reference = recommendations.allocation_exceeds_reference(disposition('no_reference'))
    assert no_reference['state'] == 'insufficient_data'
    assert 'no confident claim' in no_reference['reason']
    assert recommendations.allocation_exceeds_reference(disposition('within_reference')) is None


def test_sampling_frame_alert_only_for_unframed_samples():
    assert recommendations.sampling_frame_missing(service('unframed_sample')) is not None
    assert recommendations.sampling_frame_missing(service('framed')) is None
    assert recommendations.sampling_frame_missing(service('not_sampled')) is None


@pytest.mark.parametrize('builder', [
    lambda: recommendations.delivery_reconciliation_review(delivery('needs_review')),
    lambda: recommendations.event_coverage_insufficient(event(), []),
    lambda: recommendations.allocation_exceeds_reference(disposition('exceeds_reference')),
    lambda: recommendations.sampling_frame_missing(service('unframed_sample')),
])
def test_alerts_carry_rule_version_and_never_numeric_values(builder):
    alert = builder()
    assert alert['rule_version'] == recommendations.RULE_VERSION
    assert alert['state'] == 'open'
    assert 'never applies an automatic change' in alert['recommended_action']
    for forbidden in ('value', 'result', 'confidence_score', 'threshold'):
        assert forbidden not in alert


def test_rule_catalogue_is_versioned_and_fixed():
    assert set(recommendations.RULE_DESCRIPTIONS) == {
        'delivery_reconciliation_review', 'event_coverage_insufficient',
        'allocation_exceeds_reference', 'sampling_frame_missing'}
    assert recommendations.RULE_VERSION.startswith('p2-rules-provisional-')
