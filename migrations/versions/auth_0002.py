"""Synthetic security slice; preserve historical event/measurement/audit IDs."""
from alembic import op
from sqlalchemy import Column, String, Uuid, text

revision = 'auth_0002'
down_revision = 'demo_0001'
branch_labels = depends_on = None


def upgrade():
    op.execute('''CREATE TABLE auth_principals (
        principal_id UUID PRIMARY KEY, username VARCHAR(80) NOT NULL UNIQUE,
        password_hash VARCHAR NOT NULL, enabled BOOLEAN NOT NULL)''')
    op.execute('''CREATE TABLE auth_memberships (
        membership_id UUID PRIMARY KEY, principal_id UUID NOT NULL REFERENCES auth_principals,
        site_id UUID NOT NULL REFERENCES sites, role VARCHAR NOT NULL, active BOOLEAN NOT NULL,
        UNIQUE(principal_id, site_id), CONSTRAINT auth_demo_role CHECK(role IN ('writer','reader')))''')
    op.execute('''CREATE TABLE auth_sessions (
        session_id UUID PRIMARY KEY, principal_id UUID NOT NULL REFERENCES auth_principals,
        secret_hash VARCHAR(64) NOT NULL UNIQUE, csrf_hash VARCHAR(64) NOT NULL,
        issued_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL, revoked BOOLEAN NOT NULL)''')
    op.execute('''CREATE TABLE auth_preauth (
        secret_hash VARCHAR(64) PRIMARY KEY, csrf_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL, consumed BOOLEAN NOT NULL)''')
    op.execute('''CREATE TABLE auth_login_throttle (
        key VARCHAR(64) PRIMARY KEY, window_start TIMESTAMPTZ NOT NULL, failures INTEGER NOT NULL)''')
    op.execute('''CREATE TABLE auth_write_intents (
        intent_id UUID PRIMARY KEY, principal_id UUID NOT NULL REFERENCES auth_principals,
        site_id UUID NOT NULL REFERENCES sites, kind VARCHAR NOT NULL,
        event_id UUID REFERENCES waste_events, result_id UUID, state VARCHAR NOT NULL,
        registered_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT intent_kind CHECK(kind IN ('event','measurement')),
        CONSTRAINT intent_state CHECK(state IN ('registered','committed')))''')
    op.add_column('audit_events', Column('actor_principal_id', Uuid(), nullable=True))
    op.add_column('audit_events', Column('reason', String(), nullable=True))
    op.create_foreign_key('audit_principal_fk', 'audit_events', 'auth_principals', ['actor_principal_id'], ['principal_id'])
    op.drop_constraint('audit_synthetic_actor', 'audit_events', type_='check')
    op.create_check_constraint('audit_actor_identity', 'audit_events',
        "(actor_principal_id IS NULL AND actor = 'synthetic-demo-actor') OR (actor_principal_id IS NOT NULL AND actor = CAST(actor_principal_id AS TEXT))")


def downgrade():
    # Refuse destructive removal of security/UNKNOWN or authenticated audit evidence.
    connection = op.get_bind()
    if (not connection.in_transaction()
            or connection.connection.driver_connection.autocommit):
        raise RuntimeError('downgrade requires one explicit PostgreSQL transaction')
    # All locks precede all checks; keep them through Alembic's version change
    # and commit. An arriving writer either commits before checks (then refuse)
    # or waits until DROP commits and fails, never commits unseen evidence.
    connection.execute(text('LOCK TABLE auth_principals, auth_sessions, '
        'auth_memberships, auth_write_intents, auth_preauth, auth_login_throttle, '
        'audit_events IN ACCESS EXCLUSIVE MODE'))
    tables = ('auth_write_intents', 'auth_sessions', 'auth_memberships',
              'auth_principals', 'auth_preauth', 'auth_login_throttle')
    if any(connection.scalar(text(f'SELECT EXISTS(SELECT 1 FROM {table})')) for table in tables):
        raise RuntimeError('security evidence exists; use forward fix, not downgrade')
    if connection.scalar(text('SELECT EXISTS(SELECT 1 FROM audit_events WHERE actor_principal_id IS NOT NULL)')):
        raise RuntimeError('authenticated audit exists; downgrade refused')
    op.drop_constraint('audit_actor_identity', 'audit_events', type_='check')
    op.create_check_constraint('audit_synthetic_actor', 'audit_events', "actor = 'synthetic-demo-actor'")
    op.drop_constraint('audit_principal_fk', 'audit_events', type_='foreignkey')
    op.drop_column('audit_events', 'actor_principal_id')
    op.drop_column('audit_events', 'reason')
    for table in tables:
        op.drop_table(table)
