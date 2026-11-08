"""Provisional review-history values, not a workflow or authorization contract."""
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from types import MappingProxyType
from uuid import UUID

# Existing repo demo labels (frontend/domain/types.ts), not FWI-03 final codes.
PROVISIONAL_VALIDATION_STATUSES = frozenset({'unvalidated', 'needs_review', 'flagged'})
# PRD J-02 requests correction. Other decisions remain OPEN-04; no approval path.
PROVISIONAL_REVIEW_DECISIONS = frozenset({'request_correction'})


def _identity(value):
    if not isinstance(value, (str, UUID)) or not str(value) or any(c.isspace() for c in str(value)):
        raise ValueError('explicit nonempty target/history/actor identity required')
    return str(value)


def _text(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError('explicit reason, source and supporting provenance required')
    return value


def _timestamp(value):
    if not isinstance(value, (datetime, str)):
        raise ValueError('history timestamps must have an explicit timezone offset')
    try:
        parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
        if parsed.utcoffset() is None:
            raise ValueError
    except ValueError:
        raise ValueError('history timestamps must have an explicit timezone offset') from None


def _metadata(actor, timestamp, source, reason, provenance):
    _identity(actor)
    _timestamp(timestamp)
    for value in (source, reason, provenance):
        _text(value)


def _frozen_snapshot(values):
    if not isinstance(values, Mapping) or not all(isinstance(k, str) for k in values):
        raise ValueError('flat source/proposal mapping required')
    if any(v is not None and not isinstance(v, (str, Decimal, UUID, date, bool, int)) for v in values.values()):
        raise ValueError('snapshots require immutable scalars; floats/nested mutable values forbidden')
    for key in ('gross', 'tare', 'net'):
        if key in values and values[key] is not None and not isinstance(values[key], (str, Decimal)):
            raise ValueError('mass values require original decimal text or Decimal, never floats or imputed zero')
    for key in ('occurred_at', 'measured_at', 'recorded_at'):
        if key in values:
            _timestamp(values[key])
    return MappingProxyType(dict(values))


@dataclass(frozen=True)
class TargetRef:
    target_type: str
    target_id: str

    def __post_init__(self):
        if self.target_type not in ('event', 'measurement'):
            raise ValueError('target_type must be event or measurement')
        object.__setattr__(self, 'target_id', _identity(self.target_id))


@dataclass(frozen=True)
class ReviewerDecision:
    review_decision_id: str
    target: TargetRef
    decision: str
    actor_id: str
    recorded_at: datetime | str
    rationale: str
    source: str
    provenance: str
    validation_record_id: str | None = None

    def __post_init__(self):
        _identity(self.review_decision_id)
        if not isinstance(self.target, TargetRef):
            raise ValueError('explicit review target required')
        if not isinstance(self.decision, str) or self.decision not in PROVISIONAL_REVIEW_DECISIONS:
            raise ValueError('unsupported provisional reviewer decision; approval/blocking policy remains OPEN')
        _metadata(self.actor_id, self.recorded_at, self.source, self.rationale, self.provenance)
        if self.validation_record_id is not None:
            _identity(self.validation_record_id)


@dataclass(frozen=True)
class CorrectionRecord:
    correction_record_id: str
    target: TargetRef
    original_values: Mapping
    proposed_values: Mapping
    actor_id: str
    recorded_at: datetime | str
    reason: str
    source: str
    provenance: str
    review_decision_id: str | None = None

    def __post_init__(self):
        _identity(self.correction_record_id)
        if not isinstance(self.target, TargetRef):
            raise ValueError('explicit correction target required')
        _metadata(self.actor_id, self.recorded_at, self.source, self.reason, self.provenance)
        object.__setattr__(self, 'original_values', _frozen_snapshot(self.original_values))
        object.__setattr__(self, 'proposed_values', _frozen_snapshot(self.proposed_values))
        if self.review_decision_id is not None:
            _identity(self.review_decision_id)
