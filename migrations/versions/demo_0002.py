"""Demo v0.1 ledger fidelity: event stage/operation date, measurement source fidelity.

Nullable additions only; existing demo rows stay valid. operation_date is an
independent supplied concept (PRD EVT-004); it is never derived from timestamps.
"""

from alembic import op

revision = "demo_0002"
down_revision = "auth_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE waste_events ADD COLUMN stage_code VARCHAR NULL")
    op.execute("ALTER TABLE waste_events ADD COLUMN process_step VARCHAR NULL")
    op.execute("ALTER TABLE waste_events ADD COLUMN operation_date DATE NULL")
    op.execute("ALTER TABLE measurements ADD COLUMN original_value_lexeme VARCHAR NULL")
    op.execute("ALTER TABLE measurements ADD COLUMN instrument_ref VARCHAR NULL")
    op.execute("ALTER TABLE measurements ADD COLUMN sample_context VARCHAR NULL")


def downgrade():
    # Destructive: only run against a disposable synthetic demo database.
    for column, table in (("sample_context", "measurements"), ("instrument_ref", "measurements"),
                          ("original_value_lexeme", "measurements"), ("operation_date", "waste_events"),
                          ("process_step", "waste_events"), ("stage_code", "waste_events")):
        op.execute(f"ALTER TABLE {table} DROP COLUMN {column}")
