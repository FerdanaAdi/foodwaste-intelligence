"""Authorized export service (FR-008, CSV): server-side scope + serializer.

The hardened serializer core never enforces authorization by itself (EXP-001);
this adapter re-checks the session's site permit on every request, queries
only the permitted site's rows, and hands explicit snapshots to the pure
serializer. Delivery is session-bound over HTTPS with no-store; there are no
presigned URLs, cached artifacts, or XLSX output (OD-005/OD-006 OPEN).
"""

from datetime import date as date_type
from uuid import UUID

from sqlalchemy import func, select

from fwi.application import security
from fwi.application.demo import snapshot, unit
from fwi.application.export_csv import serialize_export
from fwi.infrastructure.database.models import Measurement, WasteEvent


class ExportScopeDenied(Exception):
    """Requested site is foreign or absent; concealed like other demo reads."""


EXPORT_FILTER_KEYS = frozenset({'site_id', 'event_type', 'stage_code',
                                'operation_date_from', 'operation_date_to'})


def _criteria(query):
    criteria = []
    if query.get('event_type'):
        if query['event_type'] not in ('at_risk_surplus', 'actual_loss_discard'):
            raise ValueError('unsupported event_type filter for export')
        criteria.append(WasteEvent.event_type == query['event_type'])
    if query.get('stage_code'):
        criteria.append(WasteEvent.stage_code == query['stage_code'])
    for bound in ('operation_date_from', 'operation_date_to'):
        if query.get(bound):
            try:
                value = date_type.fromisoformat(query[bound])
            except (TypeError, ValueError) as exc:
                raise ValueError(f'{bound} must be an ISO date (YYYY-MM-DD)') from exc
            criteria.append(WasteEvent.operation_date >= value if bound.endswith('from')
                            else WasteEvent.operation_date <= value)
    return criteria


def build_authorized_export(factory, site_id: UUID, query: dict, access=None, intent=None,
                            generated_at=None):
    """Return (CsvExport, counts) for the permitted site only."""
    from datetime import datetime, timezone
    with unit(factory, access) as session:
        if access:
            security.permit(access, site_id, 'event.read', conceal=True)
        criteria = [WasteEvent.site_id == site_id] + _criteria(query)
        events = session.scalars(select(WasteEvent).where(*criteria)
                                 .order_by(WasteEvent.event_id.asc()))
        event_rows = [snapshot(record) for record in events]
        event_ids = [row['event_id'] for row in event_rows]
        measurement_rows: list[dict] = []
        if event_ids:
            records = session.scalars(select(Measurement).where(Measurement.event_id.in_(event_ids))
                                      .order_by(Measurement.measurement_id.asc()))
            measurement_rows = [snapshot(record) for record in records]
        bundle = serialize_export(event_rows, measurement_rows, allowed_site_ids=[site_id],
                                  generated_at=generated_at or datetime.now(timezone.utc))
        return bundle, {'events': len(event_rows), 'measurements': len(measurement_rows)}


def count_export_scope(factory, site_id: UUID, query: dict, access=None, intent=None) -> int:
    with unit(factory, access) as session:
        if access:
            security.permit(access, site_id, 'event.read', conceal=True)
        criteria = [WasteEvent.site_id == site_id] + _criteria(query)
        return int(session.scalar(select(func.count()).select_from(WasteEvent).where(*criteria)) or 0)
