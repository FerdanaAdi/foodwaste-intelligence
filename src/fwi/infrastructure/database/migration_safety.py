"""Fail-closed migration lifecycle boundary, not application authorization.

Ordinary downgrade is prohibited. A trusted test may request a short-lived,
connection-bound permit only for a verified owned disposable UUID schema.
Even that permit cannot remove persisted P1/P2 records or their audit history.
Existing migration revisions are deliberately not rewritten.
"""
from dataclasses import dataclass
from uuid import UUID
from sqlalchemy import text


@dataclass(frozen=True)
class DisposableDowngradePermit:
    connection: object
    schema: str
    created_oid: int


def _verify(connection, schema, created_oid):
    suffix = schema.removeprefix('fwi_demo_test_')
    try:
        identifier = UUID(hex=suffix)
    except (ValueError, AttributeError):
        raise RuntimeError('downgrade requires an owned disposable UUID schema') from None
    if (not schema.startswith('fwi_demo_test_') or len(suffix) != 32
            or identifier.version != 4 or identifier.hex != suffix or not isinstance(created_oid, int)):
        raise RuntimeError('downgrade requires an owned disposable UUID schema')
    identity = connection.execute(text(
        "SELECT current_user AS role, current_database() AS database, "
        "current_setting('server_version_num')::integer AS version, "
        "current_schema() AS schema, current_setting('search_path') AS search_path"
    )).mappings().one()
    if (identity['role'] != 'fwi_test' or identity['database'] != 'fwi_demo_test'
            or not 180000 <= identity['version'] < 190000
            or identity['schema'] != schema or identity['search_path'] != schema):
        raise RuntimeError('downgrade target identity/search_path refused')
    row = connection.execute(text(
        "SELECT oid, nspowner = (SELECT oid FROM pg_roles WHERE rolname=current_user) AS owned "
        "FROM pg_namespace WHERE nspname=:schema"), {'schema': schema}).mappings().one_or_none()
    if row is None or row['oid'] != created_oid or not row['owned']:
        raise RuntimeError('downgrade schema OID/owner refused')
    if not connection.in_transaction() or connection.connection.driver_connection.autocommit:
        raise RuntimeError('downgrade requires one PostgreSQL transaction')


def disposable_downgrade_permit(connection, schema, created_oid):
    """Trusted fixture opt-in; not an env var, public API, or CLI flag.

    The caller must supply the OID captured from its committed CREATE SCHEMA,
    not infer ownership from a pre-existing UUID name. A permit is valid only
    on this exact transaction connection; identity is checked again at use.
    """
    _verify(connection, schema, created_oid)
    return DisposableDowngradePermit(connection, schema, created_oid)


def protect_downgrade(connection, permit):
    if not isinstance(permit, DisposableDowngradePermit) or permit.connection is not connection:
        raise RuntimeError('security evidence/history protected: ordinary downgrade prohibited; use forward fix')
    _verify(connection, permit.schema, permit.created_oid)
    names = connection.scalars(text(
        "SELECT c.relname FROM pg_class c WHERE c.relnamespace=:oid "
        "AND c.relkind IN ('r','p') ORDER BY c.relname"), {'oid': permit.created_oid}).all()
    if 'alembic_version' not in names:
        raise RuntimeError('downgrade requires an existing versioned test schema')
    quote = connection.dialect.identifier_preparer.quote_identifier
    qualified = [quote(permit.schema) + '.' + quote(name) for name in names]
    # Keep locks through the enclosing migration commit/rollback. Concurrent
    # writers either commit before inspection (refusal) or wait until rollback.
    connection.execute(text('LOCK TABLE ' + ', '.join(qualified) + ' IN ACCESS EXCLUSIVE MODE'))
    _verify(connection, permit.schema, permit.created_oid)
    protected = [name for name in names if name.startswith(('p1_', 'p2_'))]
    for name in protected:
        if connection.scalar(text('SELECT EXISTS(SELECT 1 FROM ' + quote(permit.schema) + '.' + quote(name) + ')')):
            raise RuntimeError('P1/P2 data/history exists; downgrade refused; use forward fix')
    if 'audit_events' in names and connection.scalar(text(
            'SELECT EXISTS(SELECT 1 FROM ' + quote(permit.schema) + '.audit_events '
            "WHERE left(entity_type,3) IN ('p1_','p2_'))")):
        raise RuntimeError('P1/P2 audit history exists; downgrade refused; use forward fix')
