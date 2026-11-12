"""Provisional P1 operations use cases (FR-101..106 candidate).

This layer owns transaction boundaries and repeats authorization under the
domain transaction locks, mirroring application/demo.py. Receipts, lots,
movements, recipes, batches, deliveries, services, links, dispositions and
trend views never create a waste generation event; only the demo event route
does. Decisions still OPEN (EXT-OD-03/04/05/06/07/08) surface as blocked
statuses or PolicyBlocked errors instead of invented policies.
"""
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

from sqlalchemy import func, select

from fwi.application import security
from fwi.domain import aggregation as aggregation_domain
from fwi.domain import disposition as disposition_domain
from fwi.domain import distribution as distribution_domain
from fwi.domain import lineage as lineage_domain
from fwi.domain import operations as operations_domain
from fwi.domain import production as production_domain
from fwi.domain.measurements import PROVISIONAL_MASS_BASES
from fwi.infrastructure.database.models import AuditEvent, Measurement, Membership, Site, WasteEvent
from fwi.infrastructure.database.models_p1 import (
    P1BatchIO, P1Delivery, P1DistributionRun, P1Disposition, P1InventoryMovement, P1Lot,
    P1MaterialFlowLink, P1MealService, P1Menu, P1ProductionBatch, P1Receipt, P1Recipe,
    P1RecipeLine,
)

TRENDS_CALCULATION_VERSION = 'p1-trends-provisional-v1'
_LINK_MODEL_MAP = {
    'waste_event': WasteEvent,
    'lot': P1Lot,
    'batch': P1ProductionBatch,
    'delivery': P1Delivery,
    'meal_service': P1MealService,
}
_P1_ID_COLUMNS = ('receipt_id', 'lot_id', 'movement_id', 'menu_id', 'recipe_id', 'batch_id',
                  'io_id', 'run_id', 'delivery_id', 'service_id', 'link_id', 'disposition_id',
                  'recommendation_id')
_BOUND = 500


class NotFound(ValueError):
    pass


def snapshot(record):
    return {column.name: getattr(record, column.name) for column in record.__table__.columns}


def audit(session, record, actor=None, event_id=None):
    session.flush()
    data = snapshot(record)
    entity_id = next((data[name] for name in _P1_ID_COLUMNS if data.get(name) is not None), None)
    if entity_id is None:
        raise ValueError('p1 audit record has no identity column')
    add_audit(session, entity_type=record.__tablename__, entity_id=entity_id, action='created',
              actor=actor, event_id=event_id)
    session.flush()


def add_audit(session, *, entity_type, entity_id, action, actor=None, event_id=None):
    session.add(AuditEvent(
        entity_type=entity_type, entity_id=entity_id, action=action,
        actor=str(actor) if actor else 'synthetic-demo-actor', actor_principal_id=actor,
        event_id=event_id, recorded_at=datetime.now(timezone.utc)))
    session.flush()


@contextmanager
def unit(factory, access):
    if access is not None:
        yield access.session
    else:
        # Trusted internal fixtures; no unauthenticated HTTP route uses this path.
        with factory() as session, session.begin():
            yield session


def _require_site(session, organization_id, site_id, access):
    site = session.get(Site, site_id)
    if site is None or site.organization_id != organization_id:
        if access:
            raise security.Denied(403)
        raise NotFound('site does not belong to organization')
    return site


def _validate_unit(unit_value):
    if unit_value != 'kg':
        raise ValueError('only kg is authorized in the provisional unit vocabulary')


def _validate_basis(basis):
    if basis not in PROVISIONAL_MASS_BASES:
        raise ValueError('unsupported provisional mass basis')


# ---------------------------------------------------------------- FR-101

def create_receipt(factory, values, access=None, intent=None):
    with unit(factory, access) as session:
        if access:
            security.permit(access, values['site_id'], 'receipt.create')
        _require_site(session, values['organization_id'], values['site_id'], access)
        if access:
            security.consume_intent(access, intent, 'p1', values['site_id'])
        record = P1Receipt(**values, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        result = snapshot(record)
        if access:
            security.complete_intent(access, record.receipt_id, None)
        return result


def read_receipts(factory, site_id, access=None, intent=None):
    with unit(factory, access) as session:
        if access:
            security.permit(access, site_id, 'receipt.read', conceal=True)
        records = session.scalars(select(P1Receipt).where(P1Receipt.site_id == site_id)
                                  .order_by(P1Receipt.recorded_at, P1Receipt.receipt_id).limit(_BOUND))
        return [snapshot(record) for record in records]


def read_receipt(factory, receipt_id, access=None, intent=None):
    with unit(factory, access) as session:
        record = session.get(P1Receipt, receipt_id)
        if record is None:
            raise NotFound('receipt not found')
        if access:
            security.permit(access, record.site_id, 'receipt.read', conceal=True)
        return snapshot(record)


def create_lot(factory, receipt_id, values, access=None, intent=None):
    _validate_unit(values['original_unit'])
    _validate_basis(values['mass_basis'])
    with unit(factory, access) as session:
        receipt = session.get(P1Receipt, receipt_id)
        if receipt is None:
            raise NotFound('receipt not found')
        if access:
            security.permit(access, receipt.site_id, 'receipt.create', conceal=True)
            security.consume_intent(access, intent, 'p1', receipt.site_id)
        record = P1Lot(receipt_id=receipt.receipt_id, organization_id=receipt.organization_id,
                       site_id=receipt.site_id, recorded_at=datetime.now(timezone.utc), **values)
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        result = snapshot(record)
        if access:
            security.complete_intent(access, record.lot_id, None)
        return result


def read_receipt_lots(factory, receipt_id, access=None, intent=None):
    with unit(factory, access) as session:
        receipt = session.get(P1Receipt, receipt_id)
        if receipt is None:
            raise NotFound('receipt not found')
        if access:
            security.permit(access, receipt.site_id, 'receipt.read', conceal=True)
        records = session.scalars(select(P1Lot).where(P1Lot.receipt_id == receipt_id)
                                  .order_by(P1Lot.recorded_at, P1Lot.lot_id)).all()
        return [snapshot(record) for record in records]


def read_lot(factory, lot_id, access=None, intent=None):
    with unit(factory, access) as session:
        record = session.get(P1Lot, lot_id)
        if record is None:
            raise NotFound('lot not found')
        if access:
            security.permit(access, record.site_id, 'lot.read', conceal=True)
        movements = session.scalars(select(P1InventoryMovement)
                                    .where(P1InventoryMovement.lot_id == lot_id)
                                    .order_by(P1InventoryMovement.occurred_at,
                                              P1InventoryMovement.movement_id)).all()
        stock = operations_domain.observed_stock(record.quantity, movements)
        result = snapshot(record)
        result.update(observed_stock=stock,
                      stock_note='provisional observed stock; inventory reconciliation policy OPEN (EXT-OD-05)',
                      movements=[snapshot(movement) for movement in movements])
        return result


def add_movement(factory, lot_id, values, access=None, intent=None):
    operations_domain.validate_movement(values['movement_type'], values['direction'])
    with unit(factory, access) as session:
        lot = session.get(P1Lot, lot_id)
        if lot is None:
            raise NotFound('lot not found')
        if access:
            security.permit(access, lot.site_id, 'movement.create', conceal=True)
            security.consume_intent(access, intent, 'p1', lot.site_id)
        movements = session.scalars(select(P1InventoryMovement)
                                    .where(P1InventoryMovement.lot_id == lot_id)).all()
        stock = operations_domain.observed_stock(lot.quantity, movements)
        if not operations_domain.movement_allowed(stock, values['direction'], values['quantity']):
            raise operations_domain.PolicyBlocked(
                'movement would make provisional observed stock negative; exception policy OPEN (EXT-OD-05)')
        record = P1InventoryMovement(lot_id=lot_id, organization_id=lot.organization_id,
                                     site_id=lot.site_id, recorded_at=datetime.now(timezone.utc),
                                     **values)
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        result = snapshot(record)
        if access:
            security.complete_intent(access, record.movement_id, None)
        return result


# ---------------------------------------------------------------- FR-102

def create_menu(factory, values, access=None, intent=None):
    with unit(factory, access) as session:
        if access:
            security.permit(access, values['site_id'], 'menu.create')
        _require_site(session, values['organization_id'], values['site_id'], access)
        if access:
            security.consume_intent(access, intent, 'p1', values['site_id'])
        record = P1Menu(**values, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        result = snapshot(record)
        if access:
            security.complete_intent(access, record.menu_id, None)
        return result


def create_recipe(factory, values, access=None, intent=None):
    lines = values.pop('lines')
    with unit(factory, access) as session:
        if access:
            security.permit(access, values['site_id'], 'recipe.create')
        _require_site(session, values['organization_id'], values['site_id'], access)
        if values.get('menu_id') is not None:
            menu = session.get(P1Menu, values['menu_id'])
            if menu is None or menu.organization_id != values['organization_id'] \
                    or menu.site_id != values['site_id']:
                raise security.Denied(403) if access else NotFound('menu does not belong to site')
        if access:
            security.consume_intent(access, intent, 'p1', values['site_id'])
        record = P1Recipe(**values, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        session.flush()
        for number, line in enumerate(lines, start=1):
            _validate_unit(line['original_unit'])
            _validate_basis(line['mass_basis'])
            line_values = dict(line)
            line_values.setdefault('line_no', None)
            if line_values['line_no'] is None:
                line_values['line_no'] = number
            session.add(P1RecipeLine(recipe_id=record.recipe_id, **line_values))
        audit(session, record, access.principal.principal_id if access else None)
        result = snapshot(record)
        result['lines'] = [snapshot(line) for line in session.scalars(
            select(P1RecipeLine).where(P1RecipeLine.recipe_id == record.recipe_id)
            .order_by(P1RecipeLine.line_no)).all()]
        if access:
            security.complete_intent(access, record.recipe_id, None)
        return result


def read_recipe(factory, recipe_id, access=None, intent=None):
    with unit(factory, access) as session:
        record = session.get(P1Recipe, recipe_id)
        if record is None:
            raise NotFound('recipe not found')
        if access:
            security.permit(access, record.site_id, 'recipe.read', conceal=True)
        result = snapshot(record)
        result['lines'] = [snapshot(line) for line in session.scalars(
            select(P1RecipeLine).where(P1RecipeLine.recipe_id == recipe_id)
            .order_by(P1RecipeLine.line_no)).all()]
        return result


def create_batch(factory, values, access=None, intent=None):
    _validate_unit(values['original_unit'])
    _validate_basis(values['mass_basis'])
    with unit(factory, access) as session:
        if access:
            security.permit(access, values['site_id'], 'batch.create')
        _require_site(session, values['organization_id'], values['site_id'], access)
        recipe = session.get(P1Recipe, values['recipe_id'])
        if recipe is None or recipe.organization_id != values['organization_id'] \
                or recipe.site_id != values['site_id']:
            raise security.Denied(403) if access else NotFound('recipe does not belong to site')
        if access:
            security.consume_intent(access, intent, 'p1', values['site_id'])
        record = P1ProductionBatch(**values, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        result = snapshot(record)
        if access:
            security.complete_intent(access, record.batch_id, None)
        return result


def add_batch_io(factory, batch_id, values, access=None, intent=None):
    _validate_unit(values['original_unit'])
    _validate_basis(values['mass_basis'])
    if values['io_kind'] not in production_domain.PROVISIONAL_IO_KINDS:
        raise ValueError('unsupported provisional batch io kind')
    with unit(factory, access) as session:
        batch = session.get(P1ProductionBatch, batch_id)
        if batch is None:
            raise NotFound('batch not found')
        if access:
            security.permit(access, batch.site_id, 'batch.create', conceal=True)
            security.consume_intent(access, intent, 'p1', batch.site_id)
        if values.get('source_lot_id') is not None:
            lot = session.get(P1Lot, values['source_lot_id'])
            if lot is None or lot.organization_id != batch.organization_id \
                    or lot.site_id != batch.site_id:
                raise security.Denied(403) if access else NotFound('source lot does not belong to site')
        record = P1BatchIO(batch_id=batch_id, recorded_at=datetime.now(timezone.utc), **values)
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        result = snapshot(record)
        if access:
            security.complete_intent(access, record.io_id, None)
        return result


def read_batch(factory, batch_id, access=None, intent=None):
    with unit(factory, access) as session:
        batch = session.get(P1ProductionBatch, batch_id)
        if batch is None:
            raise NotFound('batch not found')
        if access:
            security.permit(access, batch.site_id, 'batch.read', conceal=True)
        recipe = session.get(P1Recipe, batch.recipe_id)
        entries = session.scalars(select(P1BatchIO).where(P1BatchIO.batch_id == batch_id)
                                  .order_by(P1BatchIO.recorded_at, P1BatchIO.io_id)).all()
        result = snapshot(batch)
        result['recipe_code'] = recipe.recipe_code
        result['recipe_version_no'] = recipe.version_no
        result['io'] = [snapshot(entry) for entry in entries]
        result['yield_view'] = production_domain.batch_yield(entries)
        return result


# ---------------------------------------------------------------- FR-103

def create_run(factory, values, access=None, intent=None):
    with unit(factory, access) as session:
        if access:
            security.permit(access, values['site_id'], 'delivery.create')
        _require_site(session, values['organization_id'], values['site_id'], access)
        if access:
            security.consume_intent(access, intent, 'p1', values['site_id'])
        record = P1DistributionRun(**values, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        result = snapshot(record)
        if access:
            security.complete_intent(access, record.run_id, None)
        return result


def create_delivery(factory, values, access=None, intent=None):
    _validate_unit(values['original_unit'])
    _validate_basis(values['mass_basis'])
    with unit(factory, access) as session:
        if access:
            security.permit(access, values['site_id'], 'delivery.create')
        _require_site(session, values['organization_id'], values['site_id'], access)
        if values['from_site_id'] != values['site_id']:
            raise ValueError('delivery origin must be the recording site')
        destination = session.get(Site, values['to_site_id'])
        if destination is None or destination.organization_id != values['organization_id']:
            raise security.Denied(403) if access else NotFound('destination site unknown')
        if values.get('run_id') is not None:
            run = session.get(P1DistributionRun, values['run_id'])
            if run is None or run.organization_id != values['organization_id'] \
                    or run.site_id != values['site_id']:
                raise security.Denied(403) if access else NotFound('run does not belong to site')
        if access:
            security.consume_intent(access, intent, 'p1', values['site_id'])
        record = P1Delivery(**values, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        result = snapshot(record)
        result['reconciliation_status'] = distribution_domain.delivery_reconciliation(
            record.dispatch_quantity, record.received_quantity)
        if access:
            security.complete_intent(access, record.delivery_id, None)
        return result


def record_receiving(factory, delivery_id, values, access=None, intent=None):
    """Receiving is recorded by the destination site; the two observations stay separate."""
    with unit(factory, access) as session:
        record = session.get(P1Delivery, delivery_id)
        if record is None:
            raise NotFound('delivery not found')
        if access:
            security.permit(access, record.to_site_id, 'delivery.create', conceal=True)
            security.consume_intent(access, intent, 'p1', record.to_site_id)
        if record.received_quantity is not None:
            raise ValueError('receiving already recorded; corrections need an approved policy (EXT-OD-05)')
        record.received_quantity = values['received_quantity']
        record.received_at = values['received_at']
        session.flush()
        add_audit(session, entity_type=record.__tablename__, entity_id=record.delivery_id,
                  action='received', actor=access.principal.principal_id if access else None)
        result = snapshot(record)
        result['reconciliation_status'] = distribution_domain.delivery_reconciliation(
            record.dispatch_quantity, record.received_quantity)
        if access:
            security.complete_intent(access, record.delivery_id, None)
        return result


def read_delivery(factory, delivery_id, access=None, intent=None):
    with unit(factory, access) as session:
        record = session.get(P1Delivery, delivery_id)
        if record is None:
            raise NotFound('delivery not found')
        if access:
            _permit_either_site(access, (record.site_id, record.to_site_id), 'delivery.read')
        result = snapshot(record)
        result['reconciliation_status'] = distribution_domain.delivery_reconciliation(
            record.dispatch_quantity, record.received_quantity)
        return result


def _permit_either_site(access, site_ids, action):
    """Visibility for users of the originating or the receiving site."""
    memberships = access.session.scalars(select(Membership).where(
        Membership.principal_id == access.principal.principal_id, Membership.active.is_(True),
        Membership.site_id.in_(site_ids))).all()
    for membership in memberships:
        if action in security.PERMISSIONS.get(membership.role, ()):
            return membership
    raise security.Denied(404)


# ---------------------------------------------------------------- FR-103 services

def create_service(factory, values, access=None, intent=None):
    if values.get('served_mass') is not None:
        _validate_unit(values.get('original_unit') or 'kg')
        _validate_basis(values['mass_basis'])
    with unit(factory, access) as session:
        if access:
            security.permit(access, values['site_id'], 'service.create')
        _require_site(session, values['organization_id'], values['site_id'], access)
        if values.get('delivery_id') is not None:
            delivery = session.get(P1Delivery, values['delivery_id'])
            if delivery is None or delivery.organization_id != values['organization_id'] \
                    or delivery.to_site_id != values['site_id']:
                raise security.Denied(403) if access else NotFound('delivery does not belong to site')
        if values.get('leftover_event_id') is not None:
            event = session.get(WasteEvent, values['leftover_event_id'])
            if event is None or event.organization_id != values['organization_id'] \
                    or event.site_id != values['site_id']:
                raise security.Denied(403) if access else NotFound('leftover event does not belong to site')
        if access:
            security.consume_intent(access, intent, 'p1', values['site_id'])
        record = P1MealService(**values, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        result = _service_view(record)
        if access:
            security.complete_intent(access, record.service_id, None)
        return result


def read_service(factory, service_id, access=None, intent=None):
    with unit(factory, access) as session:
        record = session.get(P1MealService, service_id)
        if record is None:
            raise NotFound('service not found')
        if access:
            security.permit(access, record.site_id, 'service.read', conceal=True)
        return _service_view(record)


def _service_view(record):
    result = snapshot(record)
    result['sampling_coverage_status'] = distribution_domain.sampling_coverage(
        record.sampling_frame, record.sample_size, record.sampling_method)
    result['estimate_note'] = ('no population estimate is computed; expansion requires an approved '
                               'sampling design (EXT-OD-07 OPEN)')
    return result


# ---------------------------------------------------------------- FR-104

def create_link(factory, values, access=None, intent=None):
    lineage_domain.validate_link(values['source_type'], values['source_id'],
                                 values['target_type'], values['target_id'])
    if values['relation_code'] not in lineage_domain.PROVISIONAL_RELATION_CODES:
        raise ValueError('unsupported provisional relation code')
    with unit(factory, access) as session:
        source = _link_object(session, values['source_type'], values['source_id'])
        target = _link_object(session, values['target_type'], values['target_id'])
        if access:
            security.permit(access, source.site_id, 'link.create')
            security.permit(access, target.site_id, 'link.read', conceal=True)
            security.consume_intent(access, intent, 'p1', source.site_id)
        edges = session.scalars(select(P1MaterialFlowLink)
                                .where(P1MaterialFlowLink.organization_id == source.organization_id)
                                .limit(1000)).all()
        if lineage_domain.creates_cycle(edges, (values['source_type'], values['source_id']),
                                        (values['target_type'], values['target_id'])):
            raise ValueError('lineage link rejected: it would close a directed cycle')
        record = P1MaterialFlowLink(
            organization_id=source.organization_id, site_id=source.site_id, recorded_at=datetime.now(timezone.utc),
            **values)
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        result = snapshot(record)
        if access:
            security.complete_intent(access, record.link_id, None)
        return result


def _link_object(session, object_type, object_id):
    model = _LINK_MODEL_MAP.get(object_type)
    if model is None:
        raise NotFound('unsupported lineage object type')
    record = session.get(model, object_id)
    if record is None:
        raise NotFound(f'{object_type} not found')
    return record


def read_lineage(factory, object_type, object_id, access=None, intent=None):
    with unit(factory, access) as session:
        record = _link_object(session, object_type, object_id)
        if access:
            security.permit(access, record.site_id, 'link.read', conceal=True)
        links = session.scalars(select(P1MaterialFlowLink).where(
            ((P1MaterialFlowLink.source_type == object_type) & (P1MaterialFlowLink.source_id == object_id))
            | ((P1MaterialFlowLink.target_type == object_type) & (P1MaterialFlowLink.target_id == object_id)))
            .order_by(P1MaterialFlowLink.recorded_at, P1MaterialFlowLink.link_id).limit(_BOUND)).all()
        return {
            'object_type': object_type, 'object_id': object_id,
            'links': [snapshot(link) for link in links],
            'distinct_source_event_count': lineage_domain.distinct_source_event_count(links),
            'note': 'links are relationships, not waste generations; event counts use distinct canonical event ids',
        }


# ---------------------------------------------------------------- FR-105

def create_disposition(factory, values, access=None, intent=None):
    disposition_domain.safety_gate(values['outcome_type'], values['food_safety_status'])
    _validate_unit(values['original_unit'])
    _validate_basis(values['mass_basis'])
    values = dict(values)
    submitted_organization_id = values.pop('organization_id')
    submitted_site_id = values.pop('site_id')
    with unit(factory, access) as session:
        event = session.get(WasteEvent, values['event_id'])
        if event is None:
            raise NotFound('event not found')
        if (event.organization_id != submitted_organization_id
                or event.site_id != submitted_site_id):
            raise security.Denied(403)
        if access:
            security.permit(access, event.site_id, 'disposition.create', conceal=True)
            security.consume_intent(access, intent, 'p1', event.site_id, event.event_id)
        record = P1Disposition(organization_id=event.organization_id, site_id=event.site_id,
                               recorded_at=datetime.now(timezone.utc), **values)
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None, event_id=event.event_id)
        result = snapshot(record)
        result['allocation_status'] = 'reference_unresolved'
        result['allocation_note'] = ('no accepted policy selects the effective reference measurement '
                                     '(EXT-OD-03 OPEN); mass comparison is unresolved, not a validated '
                                     'warning, and nothing was auto-corrected')
        if access:
            security.complete_intent(access, record.disposition_id, event.event_id)
        return result


def read_dispositions(factory, event_id, access=None, intent=None):
    with unit(factory, access) as session:
        event = session.get(WasteEvent, event_id)
        if event is None:
            raise NotFound('event not found')
        if access:
            security.permit(access, event.site_id, 'disposition.read', conceal=True)
        records = session.scalars(select(P1Disposition).where(P1Disposition.event_id == event_id)
                                  .order_by(P1Disposition.recorded_at, P1Disposition.disposition_id)).all()
        return _disposition_views(session, event.event_id, records)


def _disposition_views(session, event_id, records):
    """Snapshots with an explicit unresolved allocation status.

    The reference-observation selection has no accepted policy (EXT-OD-03
    OPEN), so no max/latest/first measurement is ever chosen here and no
    over-allocation warning is invented; the status is fail-closed instead.
    """
    results = []
    for record in records:
        result = snapshot(record)
        result['allocation_status'] = 'reference_unresolved'
        result['allocation_note'] = ('no accepted policy selects the effective reference measurement '
                                     '(EXT-OD-03 OPEN); mass comparison is unresolved, not a validated '
                                     'warning, and nothing was auto-corrected')
        results.append(result)
    return results


# ---------------------------------------------------------------- FR-106

def trends(factory, site_id, date_from: date, date_to: date, access=None, intent=None):
    """Descriptive operational read model; never a waste percentage or KPI."""
    with unit(factory, access) as session:
        if access:
            security.permit(access, site_id, 'trends.read', conceal=True)
        if session.get(Site, site_id) is None:
            raise NotFound('site not found')
        start = datetime.combine(date_from, time.min, tzinfo=timezone.utc)
        end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc)
        # Period boundaries use UTC days; operation_date semantics are OPEN (EXT-OD-04).
        event_rows = session.execute(
            select(WasteEvent.event_id, WasteEvent.event_type).where(
                WasteEvent.site_id == site_id,
                WasteEvent.occurred_at >= start, WasteEvent.occurred_at < end,
            )).all()
        measurement_rows = session.execute(
            select(WasteEvent.event_id, Measurement.mass_basis, Measurement.observation_status,
                   Measurement.net, Measurement.original_unit).join(
                Measurement, Measurement.event_id == WasteEvent.event_id).where(
                WasteEvent.site_id == site_id,
                WasteEvent.occurred_at >= start, WasteEvent.occurred_at < end)).all()
        # Inspect every event and every observation before dividing into bases.
        by_event = {event_id: [] for event_id, _kind in event_rows}
        event_counts = {}
        for _event_id, kind in event_rows:
            event_counts[kind] = event_counts.get(kind, 0) + 1
        basis_members = {}
        for event_id, basis, status, net, original_unit in measurement_rows:
            by_event[event_id].append(SimpleNamespace(
                mass_basis=basis, observation_status=status, net=net, original_unit=original_unit))
            basis_members.setdefault(basis, set()).add(event_id)
        unmeasured = sum(not items for items in by_event.values())
        per_basis = {}
        for basis, event_ids in basis_members.items():
            # A raw/cooked remeasurement is still one unresolved event, not two
            # independent masses. Counts below describe only records on this basis.
            groups = [(event_id, by_event[event_id]) for event_id in event_ids]
            view = aggregation_domain.basis_aggregation(
                groups, basis=basis, unmeasured_event_count=unmeasured)
            counts = {}
            for event_id in event_ids:
                for item in by_event[event_id]:
                    if item.mass_basis == basis:
                        counts[item.observation_status] = counts.get(item.observation_status, 0) + 1
            raw_available = view['status'] == 'raw_observation_available'
            per_basis[basis] = {
                'mass_basis': basis, 'event_count': len(event_ids),
                'measurement_count': sum(counts.values()),
                'observed_measurement_count': counts.get('observed', 0),
                'measured_zero_count': counts.get('measured_zero', 0),
                'estimated_measurement_count': counts.get('estimated', 0),
                'missing_count': counts.get('missing', 0),
                'not_measured_count': counts.get('not_measured', 0),
                'aggregation': {
                    'status': 'policy_unresolved' if raw_available else view['status'],
                    'reason': ('OD-P1-02 / EXT-OD-03 OPEN: raw observations are not approved '
                               'effective/reportable mass; no observation is selected automatically')
                              if raw_available else view['reason'],
                    'eligible_mass': None, 'eligible_event_count': 0,
                    'raw_observed_mass': view['raw_observed_mass'],
                    'raw_observation_count': view['eligible_event_count'],
                    'unresolved_event_count': view['unresolved_event_count'],
                },
            }
        events_with = sum(bool(items) for items in by_event.values())
        total_events = len(event_rows)
        if not event_rows:
            mass_status, mass_reason = 'empty_scope', 'no events in the authorized scope; no mass inferred'
        elif any(len(items) > 1 for items in by_event.values()):
            mass_status, mass_reason = 'unresolved_selection', aggregation_domain.UNRESOLVED_REASON
        elif unmeasured or any(not items or items[0].observation_status not in {'observed', 'measured_zero'} for items in by_event.values()):
            mass_status, mass_reason = 'incomplete_observation', aggregation_domain.INCOMPLETE_REASON
        else:
            mass_status, mass_reason = 'policy_unresolved', 'OD-P1-02 OPEN: raw observations are not approved effective/reportable mass'
        deliveries = session.scalars(select(P1Delivery).where(
            ((P1Delivery.site_id == site_id) | (P1Delivery.to_site_id == site_id))
            & (P1Delivery.dispatched_at >= start) & (P1Delivery.dispatched_at < end))
            .order_by(P1Delivery.dispatched_at, P1Delivery.delivery_id).limit(_BOUND)).all()
        residuals = []
        for delivery in deliveries:
            difference = None
            if delivery.received_quantity is not None:
                difference = delivery.dispatch_quantity - delivery.received_quantity
            residuals.append({
                'delivery_id': delivery.delivery_id,
                'dispatch_quantity': delivery.dispatch_quantity,
                'received_quantity': delivery.received_quantity,
                'difference': difference,
                'reconciliation_status': distribution_domain.delivery_reconciliation(
                    delivery.dispatch_quantity, delivery.received_quantity),
            })
        return {
            'site_id': site_id, 'date_from': date_from, 'date_to': date_to,
            'calculation_version': TRENDS_CALCULATION_VERSION,
            'note': 'descriptive operational view per mass basis and status; no waste percentage, '
                    'no KPI, no mixed-basis ratio (DR-11/DR-12); mass is aggregated only over '
                    'single-observation events and is unresolved whenever any repeated measurement '
                    'exists (EXT-OD-03 OPEN)',
            'event_counts': event_counts,
            'mass_reporting': {'status': mass_status, 'reason': mass_reason, 'reportable_mass': None},
            'per_basis': [per_basis[basis] for basis in sorted(per_basis)],
            'completeness': {'measurements_total': len(measurement_rows), 'events_total': total_events, 'events_with_measurement': events_with or 0,
                             'events_without_measurement': total_events - (events_with or 0)},
            'delivery_residuals': residuals,
            'mixed_basis_ratio': {'status': 'blocked',
                                  'reason': 'mixed raw/cooked ratio is not authorized (DR-11/DR-12); '
                                            'per-basis totals only'},
        }
