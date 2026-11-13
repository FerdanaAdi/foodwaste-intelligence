"""Synthetic Demo v0.1 use cases. This layer owns transaction boundaries."""

from datetime import datetime, timezone
from uuid import UUID
from contextlib import contextmanager

from sqlalchemy import func, select

from fwi.domain.demo_measurements import validate_demo_measurement
from fwi.domain.events import MaterialWasteEvent
from fwi.application.dataquality import DataQualityFilters, build_data_quality_view
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
    if values.get('regulatory_scope_status') not in (None, 'pending_assessment'):
        raise ValueError('unsupported regulatory classification; legal vocabulary remains OPEN')
    if values.get('edibility_status') not in (None, 'edible', 'inedible', 'mixed', 'unknown'):
        raise ValueError('unsupported source edibility classification')
    if (values.get('regulatory_scope_status') or values.get('edibility_status')) and not str(values.get('classification_source') or '').strip():
        raise ValueError('classification source is required')
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


EVENT_TYPE_FILTERS = {'at_risk_surplus', 'actual_loss_discard'}
MAX_PAGE_SIZE = 100


def read_data_quality(factory, site_id: UUID, query=None, access=None, intent=None):
    """Authorized count-only data-quality view (FR-007) over persistent site rows.

    Site scope is re-checked server-side; drill-down returns stable identities
    only (no mass aggregation, no KPI output; OP-08/FI-02/NI-03 stay HELD)."""
    from dataclasses import asdict

    with unit(factory, access) as session:
        if access:
            security.permit(access, site_id, 'event.read', conceal=True)
        # Kitchen operation dates are independent source dates, never occurred_at filters.
        # Inclusive bounds match the ledger; SQL excludes NULL dates only when bounded.
        from datetime import date as date_type
        query = query or {}
        criteria = [WasteEvent.site_id == site_id]
        if query.get('stage_code') is not None:
            criteria.append(WasteEvent.stage_code == query['stage_code'])
        bounds = {}
        for key in ('operation_date_from', 'operation_date_to'):
            if query.get(key) is not None:
                try:
                    value = date_type.fromisoformat(query[key])
                    if value.isoformat() != query[key]:
                        raise ValueError('expected YYYY-MM-DD')
                except (TypeError, ValueError) as exc:
                    raise ValueError(f'{key} must be an ISO date (YYYY-MM-DD)') from exc
                bounds[key] = value
                criteria.append(WasteEvent.operation_date >= value if key.endswith('from')
                                else WasteEvent.operation_date <= value)
        if ('operation_date_from' in bounds and 'operation_date_to' in bounds
                and bounds['operation_date_from'] > bounds['operation_date_to']):
            raise ValueError('operation_date_from must not be after operation_date_to')
        events = session.scalars(select(WasteEvent).where(*criteria)
                                 .order_by(WasteEvent.occurred_at.desc(), WasteEvent.event_id.asc()))
        event_rows = [snapshot(record) for record in events]
        event_ids = [row['event_id'] for row in event_rows]
        measurement_rows: list[dict] = []
        if event_ids:
            records = session.scalars(select(Measurement).where(Measurement.event_id.in_(event_ids))
                                      .order_by(Measurement.recorded_at, Measurement.measurement_id))
            measurement_rows = [snapshot(record) for record in records]
        view = build_data_quality_view(event_rows, measurement_rows,
                                       DataQualityFilters(site_id=str(site_id)))
        return {
            'summary': asdict(view.summary),
            # Drill-down references only; fetch details through the ledger/detail routes.
            'records': [{'event_id': str(record.event['event_id']),
                         'event_type': record.event['event_type'],
                         'occurred_at': record.event['occurred_at'].isoformat() if record.event.get('occurred_at') else None,
                         'measurement_ids': [m.measurement_id for m in record.measurements],
                         'observation_statuses': [m.observation_status for m in record.measurements]}
                        for record in view.records],
        }


def list_events(factory, site_id: UUID, query, access=None, intent=None):
    """Authorized, deterministic site ledger page. Count is query-separate from rows
    so measurement joins can never multiply event rows (PRD EVT-005/DQ-001)."""
    from datetime import date as date_type

    with unit(factory, access) as session:
        if access:
            security.permit(access, site_id, 'event.read', conceal=True)
        criteria = [WasteEvent.site_id == site_id]
        if query.get('event_type') is not None:
            if query['event_type'] not in EVENT_TYPE_FILTERS:
                raise ValueError('unsupported event_type filter for demo ledger')
            criteria.append(WasteEvent.event_type == query['event_type'])
        if query.get('stage_code') is not None:
            criteria.append(WasteEvent.stage_code == query['stage_code'])
        for bound, column in (('operation_date_from', WasteEvent.operation_date),
                              ('operation_date_to', WasteEvent.operation_date)):
            if query.get(bound) is not None:
                try:
                    value = date_type.fromisoformat(query[bound])
                except (TypeError, ValueError) as exc:
                    raise ValueError(f'{bound} must be an ISO date (YYYY-MM-DD)') from exc
                criteria.append(column >= value if bound.endswith('from') else column <= value)
        try:
            page = int(query.get('page', 1))
            page_size = int(query.get('page_size', 20))
        except (TypeError, ValueError) as exc:
            raise ValueError('page and page_size must be integers') from exc
        if page < 1 or page_size < 1:
            raise ValueError('page and page_size must be positive')
        page_size = min(page_size, MAX_PAGE_SIZE)
        total = session.scalar(select(func.count()).select_from(WasteEvent).where(*criteria))
        records = session.scalars(
            select(WasteEvent).where(*criteria)
            # Stable ordering with an immutable tie-breaker for equal timestamps.
            .order_by(WasteEvent.occurred_at.desc(), WasteEvent.event_id.asc())
            .offset((page - 1) * page_size).limit(page_size))
        return {'events': [snapshot(record) for record in records],
                'total': int(total or 0), 'page': page, 'page_size': page_size}
