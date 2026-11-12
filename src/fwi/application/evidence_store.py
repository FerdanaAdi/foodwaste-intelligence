"""Evidence metadata persistence store (FR-005 metadata-only, fail-closed ACL).

Wraps the pure domain/application evidence cores with PostgreSQL persistence
and the demo authorization primitives. Fail-closed rules preserved here:

- write requires a server-resolved writer permit on the parent target's site;
  foreign/absent targets are concealed (404-class, indistinguishable);
- read requires an event.read permit on the parent site, likewise concealed;
- ``storage_ref`` is never returned in any view dict (EVD-003);
- availability unknown stays unknown (EVD-004);
- evidence metadata is never an approval of a measurement (EVD-005);
- audit is written in the caller's transaction (atomic with the insert).
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import select

from fwi.application import security
from fwi.application.demo import unit
from fwi.domain.evidence import (PROVISIONAL_TARGET_KINDS, EvidenceMetadata)
from fwi.infrastructure.database.models import EvidenceReference, Measurement, WasteEvent


class EvidenceTargetUnresolvable(ValueError):
    """Foreign or absent target — concealed like the application core (404-class)."""


def _target_scope(session, target_kind: str, target_id: UUID):
    """Return (organization_id, site_id) for a target, or None if absent."""
    if target_kind == 'event':
        row = session.get(WasteEvent, target_id)
        return None if row is None else (row.organization_id, row.site_id)
    if target_kind == 'measurement':
        row = session.get(Measurement, target_id)
        if row is None:
            return None
        event = session.get(WasteEvent, row.event_id)
        return None if event is None else (event.organization_id, event.site_id)
    raise ValueError('unsupported target_kind')


def _public_view(row) -> dict:
    # storage_ref is deliberately absent from this mapping, by construction.
    return {'evidence_id': str(row.evidence_id), 'target_kind': row.target_kind,
            'target_id': str(row.target_id), 'kind': row.kind, 'source': row.source,
            'title': row.title, 'recorded_by': row.recorded_by,
            'recorded_at': row.recorded_at.isoformat(), 'method': row.method,
            'provenance': row.provenance, 'verification': row.verification,
            'availability': row.availability, 'note': row.note,
            'recorded_at_system': row.recorded_at_system.isoformat()}


def add_evidence_metadata(factory, values: dict, access=None) -> dict:
    if values.get('target_kind') not in PROVISIONAL_TARGET_KINDS:
        raise ValueError("target_kind must be 'event' or 'measurement'")
    with unit(factory, access) as session:
        try:
            target_id = UUID(str(values['target_id']))
        except ValueError as exc:
            raise EvidenceTargetUnresolvable('evidence reference not found') from exc
        scope = _target_scope(session, values['target_kind'], target_id)
        if scope is None:
            raise EvidenceTargetUnresolvable('evidence reference not found')
        organization_id, site_id = scope
        if access:
            # Writer capability on the parent site; foreign targets conceal (404).
            security.permit(access, site_id, 'event.create', conceal=True)
        record = EvidenceMetadata(
            evidence_id=str(uuid4()), target_kind=values['target_kind'], target_id=str(target_id),
            kind=values['kind'], source=values['source'], title=values['title'],
            recorded_by=str(access.principal.principal_id) if access else values.get('recorded_by', 'synthetic-demo-actor'),
            recorded_at=values['recorded_at'], method=values.get('method'),
            provenance=values.get('provenance'), verification=values.get('verification', 'unverified'),
            availability=values.get('availability', 'unknown'), storage_ref=None, note=values.get('note'))
        row = EvidenceReference(
            evidence_id=UUID(record.evidence_id), target_kind=record.target_kind,
            target_id=UUID(record.target_id), kind=record.kind, source=record.source,
            title=record.title, recorded_by=record.recorded_by, recorded_at=record.recorded_at,
            method=record.method, provenance=record.provenance, verification=record.verification,
            availability=record.availability, storage_ref=None, note=record.note,
            recorded_at_system=datetime.now(timezone.utc))
        session.add(row)
        session.flush()
        security.security_audit(session, access.principal.principal_id if access else None,
            'evidence_references', row.evidence_id, 'created',
            f'attached to {record.target_kind} {record.target_id}')
        session.flush()
        return _public_view(row)


def list_evidence_metadata(factory, target_kind: str, target_id: UUID, access=None, intent=None) -> list[dict]:
    # ``intent`` is accepted for route-invoke compatibility; reads never consume one.
    if target_kind not in PROVISIONAL_TARGET_KINDS:
        raise ValueError("target_kind must be 'event' or 'measurement'")
    with unit(factory, access) as session:
        scope = _target_scope(session, target_kind, target_id)
        if scope is None:
            raise EvidenceTargetUnresolvable('evidence reference not found')
        if access:
            security.permit(access, scope[1], 'event.read', conceal=True)
        rows = session.scalars(select(EvidenceReference).where(
            EvidenceReference.target_kind == target_kind,
            EvidenceReference.target_id == target_id).order_by(EvidenceReference.recorded_at_system,
                                                              EvidenceReference.evidence_id))
        return [_public_view(row) for row in rows]


def read_evidence_metadata(factory, target_kind: str, target_id: UUID, evidence_id: UUID, access=None) -> dict:
    for view in list_evidence_metadata(factory, target_kind, target_id, access=access):
        if view['evidence_id'] == str(evidence_id):
            return view
    raise EvidenceTargetUnresolvable('evidence reference not found')
