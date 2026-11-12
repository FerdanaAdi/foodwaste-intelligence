"""Deterministic synthetic FR-006 / AC-05 / AC-09; no DB, API or roles."""
from dataclasses import FrozenInstanceError
from datetime import datetime, timezone
from decimal import Decimal, localcontext

import pytest

from fwi.application.review_history import ReviewHistory
from fwi.domain.demo_measurements import validate_demo_measurement
from fwi.domain.measurements import ValidationRecord
from fwi.domain.review import ReviewerDecision, TargetRef

E, M = TargetRef('event', 'EVT-SYN-1'), TargetRef('measurement', 'M-SYN-1')
TIME = '2026-11-08T10:01:00.123456+08:00'
LONG = '0.123456789012345678901234567890123456789000'


def event():
    return dict(event_id=E.target_id, site_id='SITE-SYN-1', organization_id='ORG-SYN-1',
                event_type='at_risk_surplus', occurred_at='2026-11-08T09:00:00+08:00', recorded_at=TIME)


def measurement(**changes):
    data = dict(measurement_id=M.target_id, event_id=E.target_id, gross='2.400', tare='0.400', net='2.000',
        original_unit='kg', mass_basis='cooked', observation_status='observed',
        validation_status='unvalidated', measurement_method='synthetic-scale',
        provenance='synthetic source fixture', measured_at='2026-11-08T09:01:00.000001+08:00', recorded_at=TIME)
    data.update(changes)
    return data


def history(*records):
    return ReviewHistory([event()], records or [measurement()])


def validation(**changes):
    data = dict(validation_record_id='V-SYN-1', measurement_id=M.target_id,
                validation_status='needs_review', recorded_at=TIME,
                target_type=M.target_type, target_id=M.target_id, actor_id='synthetic-evaluator',
                source='synthetic test', reason='Explicit synthetic finding', provenance='fixture v1')
    data.update(changes)
    return ValidationRecord(**data)


def review(**changes):
    data = dict(review_decision_id='R-SYN-1', target=M, decision='request_correction',
                actor_id='synthetic-reviewer-A', recorded_at=TIME, rationale='Check synthetic scale reading',
                source='synthetic review', provenance='fixture v1')
    data.update(changes)
    return ReviewerDecision(**data)


def propose(core, **changes):
    data = dict(correction_record_id='C-SYN-1', target=M, proposed_values={'gross':'2.500', 'net':'2.100'},
                actor_id='synthetic-proposer-A', recorded_at=TIME, reason='Synthetic transcription proposal',
                source='synthetic correction', provenance='fixture correction v1')
    data.update(changes)
    return core.propose_correction(**data)


def test_validation_records_existing_targets_explicitly_without_new_target_identity():
    core = history()
    m = core.add_validation(validation())
    e = core.add_validation(validation(validation_record_id='V-SYN-2', measurement_id=None,
        target_type='event', target_id=E.target_id))
    assert core.history_for(M) == (m,)
    assert core.history_for(E) == (e,)
    assert core.targets == (E, M)


@pytest.mark.parametrize('target_type,target_id', [('event',None), ('measurement',''), ('event',' '),
    ('event','contains space'), ('fabricated','id')])
def test_invalid_target_reference_rejected(target_type,target_id):
    with pytest.raises(ValueError):
        TargetRef(target_type,target_id)


def test_missing_unknown_or_mismatched_validation_target_rejected_without_history_change():
    core=history()
    for record in (validation(target_id=None), validation(target_id='M-SYN-absent', measurement_id='M-SYN-absent'),
        validation(measurement_id='M-SYN-other'), validation(target_type='event',target_id=E.target_id)):
        with pytest.raises(ValueError): core.add_validation(record)
    assert core.history == ()
    with pytest.raises(ValueError): core.add_review(review(target=TargetRef('event','absent')))
    with pytest.raises(ValueError): propose(core,target=TargetRef('measurement','absent'))


def test_multiple_reviews_and_proposals_preserve_complete_chain_and_original_values():
    core=history()
    v=core.add_validation(validation(validation_status='flagged'))
    r1=core.add_review(review(validation_record_id=v.validation_record_id))
    c1=propose(core,review_decision_id=r1.review_decision_id)
    saved=core.history
    r2=core.add_review(review(review_decision_id='R-SYN-2',actor_id='synthetic-reviewer-B',
        recorded_at='2026-11-08T10:02:00+08:00',rationale='Second explicit correction request'))
    c2=propose(core,correction_record_id='C-SYN-2',review_decision_id=r2.review_decision_id,
        proposed_values={'gross':'2.600','net':'2.200'})
    assert core.history_for(M) == (v,r1,c1,r2,c2)
    assert saved == (v,r1,c1)
    assert c1.original_values['net'] == c2.original_values['net'] == core.original(M)['net'] == '2.000'
    assert c1.proposed_values['net'] == '2.100' and c2.proposed_values['net'] == '2.200'
    assert (c1.actor_id,c1.recorded_at,c1.reason,c1.provenance) == (
        'synthetic-proposer-A',TIME,'Synthetic transcription proposal','fixture correction v1')
    assert r1.actor_id == 'synthetic-reviewer-A' and r2.actor_id == 'synthetic-reviewer-B'
    assert core.original(M)['validation_status'] == 'unvalidated'


def test_snapshots_and_records_are_detached_and_read_only():
    source=measurement(); core=ReviewHistory([event()],[source])
    changes={'gross':'2.500','net':'2.100'}
    correction=propose(core,proposed_values=changes)
    source['net']='999'; changes['net']='888'
    assert core.original(M)['net'] == correction.original_values['net'] == '2.000'
    assert correction.proposed_values['net'] == '2.100'
    with pytest.raises(TypeError): correction.proposed_values['net']='0'
    with pytest.raises(TypeError): core.original(M)['net']='0'
    with pytest.raises(FrozenInstanceError): correction.reason='replacement'


def test_event_correction_remains_a_proposal_on_same_event():
    core=history()
    c=propose(core,target=E,proposed_values={'occurred_at':'2026-11-08T08:59:00+08:00'})
    assert c.target == E and c.original_values['event_id'] == E.target_id
    assert core.original(E)['occurred_at'] == '2026-11-08T09:00:00+08:00'
    assert core.targets == (E,M)


def test_repeated_measurements_keep_one_event_and_distinct_observations():
    second=measurement(measurement_id='M-SYN-2',observation_status='estimated')
    core=history(measurement(),second)
    core.add_validation(validation())
    core.add_validation(validation(validation_record_id='V-SYN-2',measurement_id='M-SYN-2',target_id='M-SYN-2'))
    assert core.targets == (E,M,TargetRef('measurement','M-SYN-2'))
    assert core.original(M)['event_id'] == core.original(TargetRef('measurement','M-SYN-2'))['event_id'] == E.target_id
    assert core.original(M)['observation_status'] == 'observed'
    assert core.original(TargetRef('measurement','M-SYN-2'))['observation_status'] == 'estimated'
    assert len(core.history_for(M)) == 1


@pytest.mark.parametrize('status',['missing','not_measured'])
def test_missing_never_becomes_zero_during_review_or_correction(status):
    absent=measurement(observation_status=status,gross=None,tare=None,net=None)
    core=history(absent)
    core.add_review(review())
    with pytest.raises(ValueError): propose(core,proposed_values={'observation_status':'measured_zero'})
    c=propose(core,proposed_values={'observation_status':'measured_zero','gross':'0.40','tare':'0.40','net':'0'})
    assert c.original_values['net'] is None and c.original_values['observation_status'] == status
    assert c.proposed_values['net'] == '0'
    assert core.original(M)['net'] is None and core.original(M)['observation_status'] == status


def test_long_decimals_units_basis_and_quality_are_preserved_without_rounding():
    core=history(measurement(gross=LONG,tare='0',net=LONG,observation_status='estimated'))
    with localcontext() as ctx:
        ctx.prec=4
        c=propose(core,proposed_values={'measurement_method':'synthetic verified method'})
    assert c.original_values['gross'] == c.original_values['net'] == LONG
    assert (c.original_values['original_unit'],c.original_values['mass_basis'],c.original_values['observation_status']) == ('kg','cooked','estimated')
    assert c.proposed_values == {'measurement_method':'synthetic verified method'}


@pytest.mark.parametrize('bad',['not a timestamp','2026-11-08T10:00:00','2026-13-01T00:00:00Z',datetime(2026,11,8),None,123])
def test_bad_or_naive_history_timestamps_rejected(bad):
    core=history()
    with pytest.raises(ValueError): core.add_validation(validation(recorded_at=bad))
    with pytest.raises(ValueError): core.add_review(review(recorded_at=bad))
    with pytest.raises(ValueError): propose(core,recorded_at=bad)
    assert core.history == ()


def test_aware_datetime_is_retained_and_invalid_source_or_proposed_times_are_rejected():
    core=history(); now=datetime(2026,11,8,tzinfo=timezone.utc)
    record=core.add_validation(validation(recorded_at=now))
    assert record.recorded_at is now
    with pytest.raises(ValueError): propose(core,target=E,proposed_values={'occurred_at':'invalid'})
    with pytest.raises(ValueError): history(measurement(recorded_at='2026-11-08T01:00:00'))


@pytest.mark.parametrize('status',['approved','blocked','validated','fabricated',None])
def test_unsupported_validation_vocabulary_rejected(status):
    core=history()
    with pytest.raises(ValueError): core.add_validation(validation(validation_status=status))
    assert core.history == ()


@pytest.mark.parametrize('decision',['approved','blocked','flagged','needs_review','fabricated',None])
def test_unsupported_reviewer_decisions_rejected(decision):
    with pytest.raises(ValueError): review(decision=decision)


@pytest.mark.parametrize('status',['needs_review','flagged','unvalidated'])
def test_validation_result_never_promotes_or_blocks_source_or_selects_measurement(status):
    core=history()
    record=core.add_validation(validation(validation_status=status,rule_id='repo-demo-mass-v0.1',outcome=True))
    core.add_review(review(validation_record_id=record.validation_record_id))
    assert core.original(M)['validation_status'] == 'unvalidated'
    assert core.original(M)['net'] == '2.000' and core.original(M)['observation_status'] == 'observed'
    assert core.history_for(M)[0].validation_status == status
    assert core.history_for(M)[1].decision == 'request_correction'


@pytest.mark.parametrize('gross',['0.1','-1','NaN','Infinity'])
def test_ac05_existing_mass_rule_failure_and_specific_reason_remain_traceable(gross):
    source=measurement(gross=gross)
    core=history(source)
    with pytest.raises(ValueError) as error:
        validate_demo_measurement(source)
    record=core.add_validation(validation(validation_status='flagged',rule_id='repo-demo-mass-v0.1',
        outcome=False,reason=str(error.value),provenance='synthetic source evaluated by existing demo validator'))
    assert record.outcome is False and record.reason == str(error.value)
    assert core.original(M)['gross'] == gross
    assert core.original(M)['validation_status'] == 'unvalidated'


@pytest.mark.parametrize('changes',[dict(outcome=True),dict(rule_id='defined-rule'),dict(rule_id='defined-rule',outcome=1),dict(rule_id='',outcome=False)])
def test_rule_outcome_requires_defined_identifier_and_boolean(changes):
    with pytest.raises(ValueError): history().add_validation(validation(**changes))


@pytest.mark.parametrize('field',['actor_id','source','reason','provenance'])
def test_validation_metadata_cannot_be_missing_or_blank(field):
    with pytest.raises(ValueError): history().add_validation(validation(**{field:' '}))


@pytest.mark.parametrize('field',['actor_id','source','rationale','provenance'])
def test_reviewer_metadata_cannot_be_missing_or_blank(field):
    with pytest.raises(ValueError): review(**{field:''})


@pytest.mark.parametrize('field',['actor_id','source','reason','provenance'])
def test_correction_metadata_cannot_be_missing_or_blank(field):
    with pytest.raises(ValueError): propose(history(),**{field:''})


def test_history_identifiers_unique_across_all_kinds_and_failures_do_not_append():
    core=history(); v=core.add_validation(validation())
    with pytest.raises(ValueError,match='duplicate'): core.add_validation(v)
    with pytest.raises(ValueError,match='duplicate'): core.add_review(review(review_decision_id=v.validation_record_id))
    with pytest.raises(ValueError,match='duplicate'): propose(core,correction_record_id=v.validation_record_id)
    assert core.history == (v,)


def test_reference_links_cannot_point_to_missing_or_other_target_history():
    core=history(); v=core.add_validation(validation())
    with pytest.raises(ValueError): core.add_review(review(validation_record_id='absent'))
    with pytest.raises(ValueError): core.add_review(review(target=E,validation_record_id=v.validation_record_id))
    r=core.add_review(review())
    with pytest.raises(ValueError): propose(core,review_decision_id='absent')
    with pytest.raises(ValueError): propose(core,target=E,proposed_values={'occurred_at':TIME},review_decision_id=r.review_decision_id)
    assert core.history == (v,r)


@pytest.mark.parametrize('changes',[{'event_id':'new-event'},{'measurement_id':'new-id'},{'site_id':'foreign'},
    {'recorded_at':TIME},{'validation_status':'approved'},{'net':None},{'original_unit':'g'},
    {'mass_basis':'plate_leftover'},{'observation_status':'blocked'},{}])
def test_proposals_cannot_rewrite_identity_scope_audit_or_invent_mass_status(changes):
    core=history()
    with pytest.raises(ValueError): propose(core,proposed_values=changes)
    assert core.history == () and core.original(M)['net'] == '2.000'


@pytest.mark.parametrize('value',[0.1,True,{},[]])
def test_mutable_or_inexact_mass_values_rejected(value):
    with pytest.raises(ValueError): history(measurement(net=value))
    with pytest.raises(ValueError): propose(history(),proposed_values={'net':value})


def test_duplicate_or_orphan_registry_sources_rejected():
    with pytest.raises(ValueError): ReviewHistory([event(),event()],[])
    with pytest.raises(ValueError): history(measurement(),measurement())
    with pytest.raises(ValueError): ReviewHistory([],[measurement()])


def test_existing_validation_record_constructor_remains_compatible_but_lacks_history_metadata():
    legacy=ValidationRecord('legacy',M.target_id,'unvalidated',datetime(2026,11,8,tzinfo=timezone.utc))
    assert legacy.measurement_id == M.target_id
    with pytest.raises(ValueError): history().add_validation(legacy)


def test_incomplete_source_can_be_reviewed_but_no_partial_correction_is_applied():
    core=ReviewHistory([event()],[{'measurement_id':M.target_id,'event_id':E.target_id,'net':None}])
    core.add_validation(validation(validation_status='needs_review'))
    with pytest.raises(ValueError,match='complete demo'): propose(core,proposed_values={'net':'0'})
    assert core.original(M)['net'] is None


@pytest.mark.parametrize('gross',['NaN','Infinity','-1','0.1'])
def test_invalid_source_cannot_be_recorded_as_passing_the_defined_mass_rule(gross):
    core=history(measurement(gross=gross))
    with pytest.raises(ValueError,match='contradicts'):
        core.add_validation(validation(rule_id='repo-demo-mass-v0.1',outcome=True))
    assert core.history == ()


def test_unavailable_methodological_rule_and_inapplicable_rule_targets_are_rejected():
    core=history()
    with pytest.raises(ValueError,match='unsupported rule'):
        core.add_validation(validation(rule_id='invented-FWI-03-rule',outcome=True))
    with pytest.raises(ValueError,match='unsupported rule'):
        core.add_validation(validation(target_type='event',target_id=E.target_id,measurement_id=None,
            rule_id='repo-demo-mass-v0.1',outcome=True))
    assert core.history == ()


def test_actual_api_snapshots_uuid_and_decimal_values_fit_without_database_access():
    from uuid import UUID
    from fwi.api.schemas_demo import EventOutput, MeasurementOutput
    e=EventOutput(**{**event(),'event_id':UUID(int=1),'organization_id':UUID(int=2),'site_id':UUID(int=3)}).model_dump()
    source={k:v for k,v in measurement().items() if k!='validation_status'}
    m=MeasurementOutput(**{**source,'measurement_id':UUID(int=4),'event_id':UUID(int=1)}).model_dump()
    core=ReviewHistory([e],[m])
    target=TargetRef('measurement',UUID(int=4))
    record=core.add_validation(validation(target_id=target.target_id,measurement_id=target.target_id,
        rule_id='repo-demo-mass-v0.1',outcome=True))
    assert core.original(target)['net'] == Decimal('2.000')
    assert str(core.original(target)['net']) == '2.000'
    assert record.outcome is True and core.history_for(target) == (record,)


def test_known_failure_requires_specific_reason_not_an_unrelated_generic_message():
    core=history(measurement(gross='NaN'))
    with pytest.raises(ValueError,match='specific reason'):
        core.add_validation(validation(rule_id='repo-demo-mass-v0.1',outcome=False,reason='Generic annotation'))
    assert core.history == ()
