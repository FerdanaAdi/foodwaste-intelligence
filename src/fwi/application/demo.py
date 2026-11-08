"""Synthetic Demo v0.1 use cases. This layer owns transaction boundaries."""

from datetime import datetime, timezone
from uuid import UUID
from contextlib import contextmanager

from sqlalchemy import select

from fwi.domain.demo_measurements import validate_demo_measurement
from fwi.domain.events import MaterialWasteEvent
from fwi.infrastructure.database.models import AuditEvent, Measurement, Site, WasteEvent
from fwi.application import security


class NotFound(ValueError):
    pass


def snapshot(record):
    return {column.name: getattr(record, column.name) for column in record.__table__.columns}


def audit(session, record, actor=None):
    """Flush in the caller's transaction; never commit independently."""
    session.flush()
    data = snapshot(record)
    entity_id = data.get('measurement_id') or data.get('event_id') or data.get('site_id') or data['organization_id']
    session.add(AuditEvent(
        entity_type=record.__tablename__, entity_id=entity_id, action='created',
        actor=str(actor) if actor else 'synthetic-demo-actor', actor_principal_id=actor,
        recorded_at=datetime.now(timezone.utc),
        event_id=data.get('event_id'), measurement_id=data.get('measurement_id'),
    ))
    session.flush()


@contextmanager
def unit(factory, access):
    if access is not None:
        yield access.session
    else:
        # Trusted internal fixtures; no unauthenticated HTTP route uses this path.
        with factory() as session, session.begin():
            yield session


def create_event(factory, values, access=None, intent=None):
    if values['event_type'] not in {'at_risk_surplus', 'actual_loss_discard'}:
        raise ValueError('unsupported provisional demo event type')
    with unit(factory, access) as session:
        if access:
            security.permit(access, values['site_id'], 'event.create')
        site = session.get(Site, values['site_id'])
        if site is None or site.organization_id != values['organization_id']:
            if access:
                raise security.Denied(403)
            raise NotFound('site does not belong to organization')
        if access:
            security.consume_intent(access, intent, 'event', site.site_id)
        record = WasteEvent(**values, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        # Reuse the existing domain identity/context invariants.
        MaterialWasteEvent(str(record.event_id), str(record.organization_id), str(record.site_id), record.occurred_at, record.recorded_at)
        result = snapshot(record)
        if access:
            security.complete_intent(access, record.event_id, record.event_id)
    return result


def add_measurement(factory, event_id: UUID, values, access=None, intent=None):
    validate_demo_measurement(values)
    with unit(factory, access) as session:
        event = session.get(WasteEvent, event_id)
        if event is None:
            raise NotFound('event not found')
        if access:
            security.permit(access, event.site_id, 'measurement.create', conceal=True)
            security.consume_intent(access, intent, 'measurement', event.site_id, event_id)
        record = Measurement(**values, event_id=event_id, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        audit(session, record, access.principal.principal_id if access else None)
        result = snapshot(record)
        if access:
            security.complete_intent(access, record.measurement_id, event_id)
    return result


def read_event(factory, event_id: UUID, access=None, intent=None):
    with unit(factory, access) as session:
        record = session.get(WasteEvent, event_id)
        if record is None:
            raise NotFound('event not found')
        if access:
            security.permit(access, record.site_id, 'event.read', conceal=True)
        return snapshot(record)


def read_measurements(factory, event_id: UUID, access=None, intent=None):
    with unit(factory, access) as session:
        event = session.get(WasteEvent, event_id)
        if event is None:
            raise NotFound('event not found')
        if access:
            security.permit(access, event.site_id, 'measurement.read', conceal=True)
        records = session.scalars(select(Measurement).where(Measurement.event_id == event_id).order_by(Measurement.recorded_at, Measurement.measurement_id))
        return [snapshot(record) for record in records]
