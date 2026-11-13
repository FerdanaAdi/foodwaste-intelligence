"""Master reference persistence adapter (FR-002) — read/version scope only.

Access contract (Owner decision DEC-P0-ACCESS-01, synthetic MVP):
- the shared catalog is GLOBAL: ``master_references`` has no site/organization
  columns, so no private site data can exist here by construction;
- any AUTHENTICATED user may READ the shared references (no membership check);
- CREATE/UPDATE/DELETE stay disabled — no mutation route exists;
- OD-ZC02-1..6 mapping decisions remain OPEN; no vocabulary value is invented.

Wraps the pure :mod:`fwi.domain.references` core with PostgreSQL rows.
"""

from datetime import datetime, timezone
from fwi.application.demo import unit
from uuid import UUID, uuid4

from sqlalchemy import select

from fwi.domain.references import (ChangeOwnership, ReferenceKey, ReferenceNotFoundError,
                                   ReferenceRecord, ReferenceRegistry, provisional_namespaces)
from fwi.infrastructure.database.models import MasterReference


def _record_from_row(row) -> tuple[ReferenceRecord, dict]:
    key = ReferenceKey(namespace=row.namespace, code=row.code)
    record = ReferenceRecord(
        key=key, version=row.version, status=row.status, label=row.label,
        ownership=ChangeOwnership(changed_by=row.changed_by, changed_at=row.changed_at, note=row.note),
        definition=row.definition, supersedes_version=row.supersedes_version,
    )
    snapshot = {'reference_id': row.reference_id, 'namespace': row.namespace, 'code': row.code,
                'version': row.version, 'status': row.status, 'label': row.label,
                'definition': row.definition, 'supersedes_version': row.supersedes_version,
                'changed_by': row.changed_by, 'changed_at': row.changed_at.isoformat(),
                'note': row.note, 'recorded_at': row.recorded_at.isoformat()}
    return record, snapshot


def load_registry(factory, access=None) -> ReferenceRegistry:
    """Rebuild the in-memory registry from persisted, append-only versions."""
    registry = ReferenceRegistry()
    with unit(factory, access) as session:
        rows = session.scalars(select(MasterReference).order_by(
            MasterReference.namespace, MasterReference.code, MasterReference.version))
        for row in rows:
            record, _ = _record_from_row(row)
            if record.version == 1:
                registry.register(record)
            else:
                registry.register_superseding_version(record.key, label=record.label,
                    ownership=record.ownership, status=record.status, definition=record.definition)
    return registry


def insert_reference(factory, values: dict, access=None) -> dict:
    """Trusted-fixture persistence path; no HTTP route activates this in the P0 slice."""
    record_values = dict(values)
    registry = load_registry(factory, access=access)
    key = ReferenceKey(namespace=record_values['namespace'], code=record_values['code'])
    ownership = ChangeOwnership(changed_by=record_values['changed_by'],
                                changed_at=record_values['changed_at'], note=record_values.get('note'))
    if record_values.get('supersedes_version') is not None:
        record = registry.register_superseding_version(key, label=record_values['label'],
            ownership=ownership, status=record_values.get('status', 'active'),
            definition=record_values.get('definition'))
    else:
        record = registry.register(ReferenceRecord(key=key, version=record_values['version'],
            status=record_values.get('status', 'active'), label=record_values['label'],
            ownership=ownership, definition=record_values.get('definition'),
            supersedes_version=record_values.get('supersedes_version')))
    from fwi.application.demo import unit
    with unit(factory, access) as session:
        row = MasterReference(reference_id=uuid4(), namespace=record.key.namespace, code=record.key.code,
                              version=record.version, status=record.status, label=record.label,
                              definition=record.definition, supersedes_version=record.supersedes_version,
                              changed_by=record.ownership.changed_by, changed_at=record.ownership.changed_at,
                              note=record.ownership.note, recorded_at=datetime.now(timezone.utc))
        session.add(row)
        session.flush()
        return {'reference_id': row.reference_id, 'namespace': row.namespace, 'code': row.code,
                'version': row.version, 'status': row.status, 'label': row.label,
                'definition': row.definition, 'supersedes_version': row.supersedes_version,
                'changed_by': row.changed_by, 'changed_at': row.changed_at.isoformat(),
                'note': row.note, 'recorded_at': row.recorded_at.isoformat()}


def list_references(factory, namespace: str | None, include_inactive: bool = False) -> list[dict]:
    """Latest version per (namespace, code), then the status filter — in that order.

    DEC-P0-ACCESS-01: the newest version is authoritative; an inactive latest
    version hides the code entirely and NEVER resurrects an older version.
    Full history stays available through ``reference_history``.
    """
    with factory() as session:
        criteria = []
        if namespace is not None:
            criteria.append(MasterReference.namespace == namespace)
        rows = session.scalars(select(MasterReference).where(*criteria).order_by(
            MasterReference.namespace, MasterReference.code, MasterReference.version.desc()))
        latest: dict[tuple[str, str], dict] = {}
        for row in rows:
            key = (row.namespace, row.code)
            if key not in latest:  # highest version first per ordering above
                _, snapshot = _record_from_row(row)
                latest[key] = snapshot
        if not include_inactive:
            latest = {key: snap for key, snap in latest.items() if snap['status'] == 'active'}
        return sorted(latest.values(), key=lambda s: (s['namespace'], s['code']))


def reference_history(factory, namespace: str, code: str) -> list[dict]:
    from fwi.domain.references import ReferenceNotFoundError
    with factory() as session:
        rows = session.scalars(select(MasterReference).where(
            MasterReference.namespace == namespace, MasterReference.code == code)
            .order_by(MasterReference.version.asc())).all()
        if not rows:
            raise ReferenceNotFoundError(f'reference not found: {namespace}/{code}')
        return [_record_from_row(row)[1] for row in rows]


def namespace_overview(factory) -> list[dict]:
    examples = provisional_namespaces()
    with factory() as session:
        rows = session.execute(select(MasterReference.namespace, MasterReference.code).distinct()).all()
    counts: dict[str, int] = {}
    for namespace, _code in rows:
        counts[namespace] = counts.get(namespace, 0) + 1
    return [{'namespace': name, 'label': label, 'code_count': counts.get(name, 0)}
            for name, label in examples.items()]
