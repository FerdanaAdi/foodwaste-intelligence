"""Synthetic Demo v0.1 use cases. This layer owns transaction boundaries."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select

from fwi.domain.demo_measurements import validate_demo_measurement
from fwi.domain.events import MaterialWasteEvent
from fwi.infrastructure.database.models import AuditEvent, Measurement, Site, WasteEvent


class NotFound(ValueError):
    pass


def snapshot(record):
    return {column.name: getattr(record, column.name) for column in record.__table__.columns}


def audit(session, record):
    """Flush in the caller's transaction; never commit independently."""
    session.flush()
    data = snapshot(record)
    entity_id = data.get('measurement_id') or data.get('event_id') or data.get('site_id') or data['organization_id']
    session.add(AuditEvent(
        entity_type=record.__tablename__, entity_id=entity_id, action='created',
        actor='synthetic-demo-actor', recorded_at=datetime.now(timezone.utc),
        event_id=data.get('event_id'), measurement_id=data.get('measurement_id'),
    ))
    session.flush()


def create_event(factory, values):
    if values['event_type'] not in {'at_risk_surplus', 'actual_loss_discard'}:
        raise ValueError('unsupported provisional demo event type')
    with factory() as session, session.begin():
        site = session.get(Site, values['site_id'])
        if site is None or site.organization_id != values['organization_id']:
            raise NotFound('site does not belong to organization')
        record = WasteEvent(**values, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        audit(session, record)
        # Reuse the existing domain identity/context invariants.
        MaterialWasteEvent(str(record.event_id), str(record.organization_id), str(record.site_id), record.occurred_at, record.recorded_at)
        result = snapshot(record)
    return result


def add_measurement(factory, event_id: UUID, values):
    validate_demo_measurement(values)
    with factory() as session, session.begin():
        if session.get(WasteEvent, event_id) is None:
            raise NotFound('event not found')
        record = Measurement(**values, event_id=event_id, recorded_at=datetime.now(timezone.utc))
        session.add(record)
        audit(session, record)
        result = snapshot(record)
    return result


def read_event(factory, event_id: UUID):
    with factory() as session:
        record = session.get(WasteEvent, event_id)
        if record is None:
            raise NotFound('event not found')
        return snapshot(record)


def read_measurements(factory, event_id: UUID):
    with factory() as session:
        if session.get(WasteEvent, event_id) is None:
            raise NotFound('event not found')
        records = session.scalars(select(Measurement).where(Measurement.event_id == event_id).order_by(Measurement.recorded_at, Measurement.measurement_id))
        return [snapshot(record) for record in records]
