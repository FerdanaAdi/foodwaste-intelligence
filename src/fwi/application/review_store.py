"""Review decision and correction-proposal persistence (FR-006, proposal-only).

Fail-closed rules:
- only 'request_correction' decisions exist; approval/block policy is OPEN
  (VAL-003/OD-004) so no approve/reject/effectuate path is provided;
- proposals snapshot the original values and never mutate source records;
- allowed change fields come from the pure review-history core;
- writes require a server-resolved writer permit on the parent site; foreign
  or absent targets are concealed (404-class);
- audit rows are written in the same transaction as the decision/proposal.
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import select

from fwi.application import security
from fwi.application.demo import unit
from fwi.application.review_history import ReviewHistory
from fwi.domain.review import ReviewerDecision, TargetRef
from fwi.infrastructure.database.models import (CorrectionProposal, Measurement,
                                               ReviewDecision, WasteEvent)


class ReviewTargetUnresolvable(ValueError):
    """Foreign or absent target — concealed like other demo routes (404-class)."""


def _target_scope(session, target_kind: str, target_id: UUID):
    if target_kind == 'event':
        row = session.get(WasteEvent, target_id)
        return None if row is None else (row.organization_id, row.site_id)
    if target_kind == 'measurement':
        row = session.get(Measurement, target_id)
        if row is None:
            return None
        event = session.get(WasteEvent, row.event_id)
        return None if event is None else (event.organization_id, event.site_id)
    raise ValueError("target_kind must be 'event' or 'measurement'")


def _snapshots(session, target_kind: str, target_id: UUID) -> dict:
    from fwi.application.demo import snapshot
    if target_kind == 'event':
        return snapshot(session.get(WasteEvent, target_id))
    return snapshot(session.get(Measurement, target_id))


def _jsonable(values: dict) -> dict:
    """JSONB-safe copy: UUID/datetime/date/Decimal become explicit text."""
    out = {}
    for key, value in values.items():
        if isinstance(value, UUID):
            out[key] = str(value)
        elif isinstance(value, datetime):
            out[key] = value.isoformat()
        elif isinstance(value, date):
            out[key] = value.isoformat()
        elif isinstance(value, Decimal):
            out[key] = str(value)
        else:
            out[key] = value
    return out


def _serialize_decision(row) -> dict:
    return {'review_decision_id': str(row.review_decision_id), 'target_kind': row.target_kind,
            'target_id': str(row.target_id), 'decision': row.decision, 'actor_id': row.actor_id,
            'recorded_at': row.recorded_at.isoformat(), 'rationale': row.rationale,
            'source': row.source, 'provenance': row.provenance,
            'recorded_at_system': row.recorded_at_system.isoformat()}


def _serialize_proposal(row) -> dict:
    return {'correction_record_id': str(row.correction_record_id), 'target_kind': row.target_kind,
            'target_id': str(row.target_id), 'original_values': row.original_values,
            'proposed_values': row.proposed_values, 'actor_id': row.actor_id,
            'recorded_at': row.recorded_at.isoformat(), 'reason': row.reason,
            'source': row.source, 'provenance': row.provenance,
            'review_decision_id': str(row.review_decision_id) if row.review_decision_id else None,
            'state': row.state, 'recorded_at_system': row.recorded_at_system.isoformat()}


def submit_review(factory, values: dict, access=None, intent=None) -> dict:
    """Record one review decision (and optional correction proposal) atomically."""
    with unit(factory, access) as session:
        target_kind = values['target_kind']
        try:
            target_id = UUID(str(values['target_id']))
        except ValueError as exc:
            raise ReviewTargetUnresolvable('review target not found') from exc
        scope = _target_scope(session, target_kind, target_id)
        if scope is None:
            raise ReviewTargetUnresolvable('review target not found')
        site_id = scope[1]
        if access:
            security.permit(access, site_id, 'event.create', conceal=True)
        original = _snapshots(session, target_kind, target_id)
        instant = datetime.now(timezone.utc)
        actor = str(access.principal.principal_id) if access else 'synthetic-demo-actor'
        decision = ReviewerDecision(
            review_decision_id=str(uuid4()), target=TargetRef(target_kind, str(target_id)),
            decision='request_correction', actor_id=actor, recorded_at=instant,
            rationale=values['reason'], source=values['source'], provenance=values['provenance'])
        row = ReviewDecision(
            review_decision_id=UUID(decision.review_decision_id), target_kind=target_kind,
            target_id=target_id, decision=decision.decision, actor_id=actor,
            recorded_at=instant, rationale=values['reason'], source=values['source'],
            provenance=values['provenance'], recorded_at_system=instant)
        session.add(row)
        session.flush()
        result = {'review_decision_id': decision.review_decision_id,
                  'correction_proposal': None}
        if values.get('proposed_values') is not None:
            # The pure core requires the parent event for measurement targets.
            if target_kind == 'measurement':
                measurement_row = session.get(Measurement, target_id)
                event_snapshot = _snapshots(session, 'event', measurement_row.event_id)
                history = ReviewHistory([event_snapshot], [original])
            else:
                history = ReviewHistory([original], [])
            # The core requires the same-target review reference to exist first.
            history.add_review(decision)
            record = history.propose_correction(
                correction_record_id=str(uuid4()), target=TargetRef(target_kind, str(target_id)),
                proposed_values=values['proposed_values'], actor_id=actor, recorded_at=instant,
                reason=values['reason'], source=values['source'], provenance=values['provenance'],
                review_decision_id=decision.review_decision_id)
            proposal = CorrectionProposal(
                correction_record_id=UUID(record.correction_record_id), target_kind=target_kind,
                target_id=target_id, original_values=_jsonable(dict(record.original_values)),
                proposed_values=_jsonable(dict(record.proposed_values)), actor_id=actor,
                recorded_at=instant, reason=values['reason'], source=values['source'],
                provenance=values['provenance'], review_decision_id=row.review_decision_id,
                state='proposed', recorded_at_system=instant)
            session.add(proposal)
            session.flush()
            result['correction_proposal'] = _serialize_proposal(proposal)
        security.security_audit(session, access.principal.principal_id if access else None,
            'review_decisions', row.review_decision_id, 'created', decision.rationale)
        session.flush()
        return {**_serialize_decision(row), 'correction_proposal': result['correction_proposal']}


def read_review_history(factory, target_kind: str, target_id: UUID, access=None, intent=None) -> dict:
    if target_kind not in ('event', 'measurement'):
        raise ValueError("target_kind must be 'event' or 'measurement'")
    with unit(factory, access) as session:
        scope = _target_scope(session, target_kind, target_id)
        if scope is None:
            raise ReviewTargetUnresolvable('review target not found')
        if access:
            security.permit(access, scope[1], 'event.read', conceal=True)
        decisions = session.scalars(select(ReviewDecision).where(
            ReviewDecision.target_kind == target_kind, ReviewDecision.target_id == target_id)
            .order_by(ReviewDecision.recorded_at_system, ReviewDecision.review_decision_id))
        proposals = session.scalars(select(CorrectionProposal).where(
            CorrectionProposal.target_kind == target_kind, CorrectionProposal.target_id == target_id)
            .order_by(CorrectionProposal.recorded_at_system, CorrectionProposal.correction_record_id))
        return {'target_kind': target_kind, 'target_id': str(target_id),
                'decisions': [_serialize_decision(row) for row in decisions],
                'proposals': [_serialize_proposal(row) for row in proposals]}
