"""Append-only in-process history for supplied synthetic target snapshots.

No database, roles, permission grant, source mutation, automatic workflow or
canonical-measurement selection. A future authenticated adapter owns persistence.
"""
from types import MappingProxyType

from fwi.domain.demo_measurements import validate_demo_measurement
from fwi.domain.measurements import ValidationRecord
from fwi.domain.review import (
    CorrectionRecord, PROVISIONAL_VALIDATION_STATUSES, ReviewerDecision, TargetRef,
    _frozen_snapshot, _identity, _metadata,
)

# Technical identifier for the existing repository checker, NOT an FWI-03 rule.
DEMO_MASS_RULE_ID = 'repo-demo-mass-v0.1'

# Technical initial proposal surface, not the final correction policy.
_EVENT_CHANGES = frozenset({'occurred_at'})
_MEASUREMENT_CHANGES = frozenset({'gross', 'tare', 'net', 'original_unit',
    'mass_basis', 'measurement_method', 'provenance', 'observation_status', 'measured_at'})


def _target(entry):
    if isinstance(entry, ValidationRecord):
        return TargetRef(entry.target_type, entry.target_id)
    return entry.target


def _record_id(entry):
    if isinstance(entry, ValidationRecord):
        return _identity(entry.validation_record_id)
    if isinstance(entry, ReviewerDecision):
        return _identity(entry.review_decision_id)
    return _identity(entry.correction_record_id)


class ReviewHistory:
    def __init__(self, events, measurements):
        targets = {}
        for source in events:
            snapshot = _frozen_snapshot(source)
            target = TargetRef('event', snapshot.get('event_id'))
            if target in targets:
                raise ValueError('duplicate source event identity')
            targets[target] = snapshot
        for source in measurements:
            snapshot = _frozen_snapshot(source)
            target = TargetRef('measurement', snapshot.get('measurement_id'))
            if TargetRef('event', snapshot.get('event_id')) not in targets:
                raise ValueError('measurement must refer to an included existing event')
            if target in targets:
                raise ValueError('duplicate source measurement identity')
            targets[target] = snapshot
        self._targets = MappingProxyType(targets)
        self._entries = ()

    @property
    def targets(self):
        return tuple(self._targets)

    @property
    def history(self):
        return self._entries

    def original(self, target):
        if not isinstance(target, TargetRef) or target not in self._targets:
            raise ValueError('existing target required in supplied snapshot registry')
        return self._targets[target]

    def history_for(self, target):
        self.original(target)
        return tuple(entry for entry in self._entries if _target(entry) == target)

    def _append(self, entry):
        self.original(_target(entry))
        if any(_record_id(item) == _record_id(entry) for item in self._entries):
            raise ValueError('duplicate history record identity')
        self._entries += (entry,)
        return entry

    def add_validation(self, record):
        if not isinstance(record, ValidationRecord):
            raise ValueError('existing ValidationRecord type required')
        target = _target(record)
        original = self.original(target)
        if (target.target_type == 'measurement' and _identity(record.measurement_id) != target.target_id
                or target.target_type == 'event' and record.measurement_id is not None):
            raise ValueError('measurement_id and explicit validation target must agree')
        if not isinstance(record.validation_status, str) or record.validation_status not in PROVISIONAL_VALIDATION_STATUSES:
            raise ValueError('unsupported provisional validation status')
        _metadata(record.actor_id, record.recorded_at, record.source, record.reason, record.provenance)
        if record.rule_id is None:
            if record.outcome is not None:
                raise ValueError('validation outcome requires an explicit rule identifier')
        else:
            _identity(record.rule_id)
            if type(record.outcome) is not bool:
                raise ValueError('defined rule outcome must be an explicit boolean')
            if record.rule_id != DEMO_MASS_RULE_ID or target.target_type != 'measurement':
                raise ValueError('unsupported rule/target; final methodological rule registry remains OPEN')
            if {'gross', 'tare', 'net', 'original_unit', 'mass_basis', 'observation_status'} - set(original):
                raise ValueError('defined mass rule requires complete source context')
            failure_reason = None
            try:
                validate_demo_measurement(original)
                actual = True
            except ValueError as error:
                actual = False
                failure_reason = str(error)
            if record.outcome is not actual:
                raise ValueError('declared outcome contradicts existing source mass rule')
            if failure_reason is not None and failure_reason not in record.reason:
                raise ValueError('defined mass-rule failure requires its specific reason in the record')
        return self._append(record)

    def add_review(self, decision):
        if not isinstance(decision, ReviewerDecision):
            raise ValueError('separate ReviewerDecision required')
        self.original(decision.target)
        if decision.validation_record_id is not None and not any(
                isinstance(entry, ValidationRecord) and _record_id(entry) == _identity(decision.validation_record_id)
                and _target(entry) == decision.target for entry in self._entries):
            raise ValueError('review requires an existing same-target validation reference')
        return self._append(decision)

    def propose_correction(self, *, correction_record_id, target, proposed_values,
                           actor_id, recorded_at, reason, source, provenance,
                           review_decision_id=None):
        original = self.original(target)
        proposed = _frozen_snapshot(proposed_values)
        allowed = _EVENT_CHANGES if target.target_type == 'event' else _MEASUREMENT_CHANGES
        if not proposed or set(proposed) - allowed:
            raise ValueError('unsupported correction fields; identity/scope/audit/status rewrite forbidden')
        if not all(key in original for key in proposed):
            raise ValueError('correction fields must exist in the original snapshot')
        if review_decision_id is not None and not any(
                isinstance(entry, ReviewerDecision) and _record_id(entry) == _identity(review_decision_id)
                and entry.target == target for entry in self._entries):
            raise ValueError('correction requires an existing same-target review reference')
        if target.target_type == 'measurement':
            # Structural/domain consistency only. This never approves/applies a
            # proposal, nor equates arithmetic success with reviewer approval.
            candidate = {**original, **proposed}
            if {'gross', 'tare', 'net', 'original_unit', 'mass_basis', 'observation_status'} - set(candidate):
                raise ValueError('measurement correction requires complete demo mass/status context')
            validate_demo_measurement(candidate)
            for key in ('measurement_method', 'provenance'):
                if key in proposed and (not isinstance(proposed[key], str) or not proposed[key].strip()):
                    raise ValueError('proposed method/provenance must be explicit')
        record = CorrectionRecord(correction_record_id, target, original, proposed,
            actor_id, recorded_at, reason, source, provenance, review_decision_id)
        return self._append(record)
