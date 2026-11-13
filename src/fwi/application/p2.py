"""Provisional P2 foundations (FR-201 catalogue, FR-202 blocked preview, FR-203 references,
FR-204 explainable non-autonomous recommendations).

The KPI registry is read-only in this candidate: no update path exists, so a
design status and its version cannot silently change (P2-AC-02). HELD codes
never produce numbers (P2-AC-01). Managerial valuation is blocked everywhere
because cost ownership, price source rights and allocation policy are OPEN
(EXT-OD-10; G-P2-COST); a missing price is N/A, never Rp0 (P2-AC-05).
Recommendations are structural, deterministic and value-free; they never touch
safety, serving, nutrition, procurement or rescue records (P2-AC-07/08).
"""
from datetime import datetime, time, timezone
from types import SimpleNamespace

from sqlalchemy import select

from fwi.application import security
from fwi.application.p1 import NotFound, _BOUND, _disposition_views, add_audit, unit
from fwi.domain import distribution as distribution_domain
from fwi.domain import kpi_catalogue
from fwi.domain import recommendations as recommendations_domain
from fwi.infrastructure.database.models import Measurement, Membership, Site, WasteEvent
from fwi.infrastructure.database.models_p1 import (P1Delivery, P1Disposition, P1MealService,
                                                  P2AlertSetting, P2CostReference, P2KpiEntry,
                                                  P2Recommendation)

PREVIEW_NOTE = ('internal non-official preview; no numeric result is authorized in this candidate '
                '(design-pass does not imply operational validation)')
_RECOMMENDATION_NOTE = ('recommendations are explanations with provenance only; FWI never applies an '
                        'automatic change to portions, menus, nutrition, food safety, procurement, '
                        'rescue handling or official reporting (P2-AC-08)')


def _snapshot(record):
    return {column.name: getattr(record, column.name) for column in record.__table__.columns}


def _global_permit(access, action):
    """Read gate for the site-agnostic registry via any active membership."""
    memberships = access.session.scalars(select(Membership).where(
        Membership.principal_id == access.principal.principal_id, Membership.active.is_(True))).all()
    for membership in memberships:
        if action in security.PERMISSIONS.get(membership.role, ()):
            return membership
    raise security.Denied(404)


def read_kpi_catalogue(factory, access=None, intent=None):
    with unit(factory, access) as session:
        if access:
            _global_permit(access, 'kpi.read')
        records = session.scalars(select(P2KpiEntry).order_by(P2KpiEntry.kpi_code)).all()
        return [{column.name: getattr(record, column.name) for column in record.__table__.columns}
                for record in records]


def kpi_preview(factory, code, *, numerator_basis=None, denominator_basis=None, access=None, intent=None):
    with unit(factory, access) as session:
        if access:
            _global_permit(access, 'kpi.read')
        record = session.get(P2KpiEntry, code)
        if record is None:
            raise NotFound('kpi code not found')
        outcome = kpi_catalogue.preview(
            record.kpi_code, record.design_status, numerator_basis=numerator_basis,
            denominator_basis=denominator_basis, prerequisites_met=False)
        outcome.update(formula_version=record.formula_version, design_status=record.design_status,
                       note=PREVIEW_NOTE)
        return outcome


def create_cost_reference(factory, values, access=None, intent=None):
    values = dict(values)
    values.pop('recorded_at', None)
    if values['scope_type'] not in {'item', 'lot', 'batch'}:
        raise ValueError('unsupported provisional cost reference scope')
    with unit(factory, access) as session:
        if access:
            security.permit(access, values['site_id'], 'costref.create')
            security.consume_intent(access, intent, 'p1', values['site_id'])
        record = P2CostReference(**values, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        session.flush()
        if access:
            security.complete_intent(access, record.cost_reference_id, None)
        return _cost_view(record)


def read_cost_reference(factory, cost_reference_id, access=None, intent=None):
    with unit(factory, access) as session:
        record = session.get(P2CostReference, cost_reference_id)
        if record is None:
            raise NotFound('cost reference not found')
        if access:
            security.permit(access, record.site_id, 'costref.read', conceal=True)
        return _cost_view(record)


def _cost_view(record):
    data = {column.name: getattr(record, column.name) for column in record.__table__.columns}
    data['price_availability'] = 'not_available' if record.amount is None else 'available'
    data['note'] = ('managerial reference only; missing price stays N/A and is never inferred as Rp0 '
                    '(P2-AC-05); no accounting claim')
    return data


def cost_valuation(factory, cost_reference_id, access=None, intent=None):
    """Always blocked: no approved allocation method or cost data rights exist yet."""
    reference = read_cost_reference(factory, cost_reference_id, access=access, intent=intent)
    return {
        'status': 'blocked',
        'reason': 'managerial valuation requires approved cost ownership, price source and allocation '
                  'policy (EXT-OD-10 OPEN; G-P2-COST); no numeric result is produced',
        'method_version': reference['method_version'],
        'price_availability': reference['price_availability'],
        'note': PREVIEW_NOTE,
    }


# ---------------------------------------------------------------- FR-204

def evaluate_recommendations(factory, site_id, access=None, intent=None):
    """Deterministic structural evaluation of P1 records; idempotent upserts.

    Re-running with identical data creates nothing new, and acknowledged or
    dismissed records are never regenerated or overwritten. Rules whose inputs
    are incomplete yield explicit insufficient-data outcomes instead of claims.
    """
    with unit(factory, access) as session:
        if access:
            security.permit(access, site_id, 'alert.ack')
            security.consume_intent(access, intent, 'p1', site_id)
        site = session.get(Site, site_id)
        if site is None:
            raise NotFound('site not found')
        organization_id = site.organization_id
        disabled = {row.rule_code for row in session.scalars(
            select(P2AlertSetting).where(P2AlertSetting.disabled.is_(True)))}
        candidates, insufficient = [], []
        deliveries = session.scalars(select(P1Delivery).where(P1Delivery.site_id == site_id)
                                     .order_by(P1Delivery.dispatched_at, P1Delivery.delivery_id)
                                     .limit(_BOUND)).all()
        for delivery in deliveries:
            candidate = recommendations_domain.delivery_reconciliation_review(SimpleNamespace(
                delivery_id=delivery.delivery_id,
                reconciliation_status=distribution_domain.delivery_reconciliation(
                    delivery.dispatch_quantity, delivery.received_quantity)))
            if candidate:
                candidates.append(candidate)
        events = session.scalars(select(WasteEvent).where(WasteEvent.site_id == site_id)
                                 .order_by(WasteEvent.occurred_at, WasteEvent.event_id)
                                 .limit(_BOUND)).all()
        by_event = {}
        for record in session.scalars(select(P1Disposition).join(
                WasteEvent, P1Disposition.event_id == WasteEvent.event_id).where(
                WasteEvent.site_id == site_id).order_by(P1Disposition.recorded_at,
                                                        P1Disposition.disposition_id).limit(_BOUND)):
            by_event.setdefault(record.event_id, []).append(record)
        for event_id, records in by_event.items():
            for view in _disposition_views(session, event_id, records):
                candidate = recommendations_domain.allocation_exceeds_reference(SimpleNamespace(
                    disposition_id=view['disposition_id'], allocation_status=view['allocation_status']))
                if candidate:
                    candidates.append(candidate)
        services = session.scalars(select(P1MealService).where(P1MealService.site_id == site_id)
                                   .order_by(P1MealService.recorded_at, P1MealService.service_id)
                                   .limit(_BOUND)).all()
        for service in services:
            candidate = recommendations_domain.sampling_frame_missing(SimpleNamespace(
                service_id=service.service_id,
                sampling_coverage_status=distribution_domain.sampling_coverage(
                    service.sampling_frame, service.sample_size, service.sampling_method)))
            if candidate:
                candidates.append(candidate)
        for event in events:
            measurements = session.scalars(select(Measurement).where(
                Measurement.event_id == event.event_id).order_by(Measurement.recorded_at)).all()
            candidate = recommendations_domain.event_coverage_insufficient(event, measurements)
            if candidate:
                candidates.append(candidate)
        stored = []
        for candidate in candidates:
            if candidate['state'] == 'insufficient_data':
                insufficient.append(candidate)
                continue
            if candidate['rule_code'] in disabled:
                continue
            record = session.scalar(select(P2Recommendation).where(
                P2Recommendation.rule_code == candidate['rule_code'],
                P2Recommendation.rule_version == candidate['rule_version'],
                P2Recommendation.target_type == candidate['target_type'],
                P2Recommendation.target_ref == candidate['target_ref']))
            if record is None:
                record = P2Recommendation(organization_id=organization_id, site_id=site_id,
                                          recorded_at=datetime.now(timezone.utc), **candidate)
                session.add(record)
                session.flush()
            stored.append(_snapshot(record))
        return {'site_id': site_id, 'rule_version': recommendations_domain.RULE_VERSION,
                'alerts': stored, 'insufficient': insufficient, 'note': _RECOMMENDATION_NOTE}


def read_recommendations(factory, site_id, access=None, intent=None, *, recorded_from=None, recorded_to=None, state=None, rule_version=None):
    with unit(factory, access) as session:
        if access:
            security.permit(access, site_id, 'alert.read', conceal=True)
        if recorded_from and recorded_to and recorded_from > recorded_to:
            raise ValueError('recorded_from must not be after recorded_to')
        query = select(P2Recommendation).where(P2Recommendation.site_id == site_id)
        if recorded_from:
            query = query.where(P2Recommendation.recorded_at >= datetime.combine(recorded_from, time.min, timezone.utc))
        if recorded_to:
            end = datetime.combine(recorded_to, time.max, timezone.utc)
            query = query.where(P2Recommendation.recorded_at <= end)
        if state:
            query = query.where(P2Recommendation.state == state)
        if rule_version:
            query = query.where(P2Recommendation.rule_version == rule_version)
        records = session.scalars(query.order_by(P2Recommendation.recorded_at.desc(),
                                              P2Recommendation.recommendation_id).limit(_BOUND)).all()
        return [_snapshot(record) for record in records]


def acknowledge_recommendation(factory, recommendation_id, values, access=None, intent=None):
    with unit(factory, access) as session:
        record = session.get(P2Recommendation, recommendation_id)
        if record is None:
            raise NotFound('recommendation not found')
        if access:
            security.permit(access, record.site_id, 'alert.ack', conceal=True)
            security.consume_intent(access, intent, 'p1', record.site_id)
        record = session.scalar(select(P2Recommendation).where(
            P2Recommendation.recommendation_id == recommendation_id,
        ).with_for_update().execution_options(populate_existing=True))
        if record is None:
            raise NotFound('recommendation not found')
        if record.state != 'open':
            raise ValueError('only an open recommendation can be acknowledged or dismissed')
        if values['state'] not in {'acknowledged', 'dismissed'}:
            raise ValueError('unsupported provisional recommendation state')
        record.state = values['state']
        record.ack_reason = values['reason']
        record.ack_actor = access.principal.principal_id if access else None
        record.ack_at = datetime.now(timezone.utc)
        session.flush()
        add_audit(session, entity_type=record.__tablename__, entity_id=record.recommendation_id,
                  action=values['state'], actor=access.principal.principal_id if access else None)
        if access:
            security.complete_intent(access, record.recommendation_id, None)
        return _snapshot(record)


def read_alert_rules(factory, access=None, intent=None):
    with unit(factory, access) as session:
        if access:
            _global_permit(access, 'alert.read')
        settings = {row.rule_code: row.disabled for row in session.scalars(select(P2AlertSetting))}
        return [{'rule_code': code, 'description': description, 'disabled': settings.get(code, False)}
                for code, description in recommendations_domain.RULE_DESCRIPTIONS.items()]


def set_rule_disabled(factory, values, access=None, intent=None):
    """Global configuration is read-only until an explicit global contract exists.

    No authenticated or implicit trusted/default caller may mutate it. Reject
    before opening a transaction; site-scoped evaluation/ack and reads are separate.
    """
    raise security.Denied(403)
