"""Demo v0.1 master reference persistence (FR-002 read/version scope).

Append-only versioned reference rows. Vocabulary VALUES are never seeded here:
registries start empty and are populated only from approved sources
(OD-ZC02-1..6 mapping/write policy stays OPEN). No write HTTP route is
activated by this migration slice.
"""

from alembic import op

revision = "demo_0003"
down_revision = "demo_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE master_references (
	reference_id UUID NOT NULL,
	namespace VARCHAR NOT NULL,
	code VARCHAR NOT NULL,
	version INTEGER NOT NULL,
	status VARCHAR NOT NULL,
	label VARCHAR NOT NULL,
	definition VARCHAR NULL,
	supersedes_version INTEGER NULL,
	changed_by VARCHAR NOT NULL,
	changed_at TIMESTAMP WITH TIME ZONE NOT NULL,
	note VARCHAR NULL,
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (reference_id),
	CONSTRAINT master_reference_status CHECK (status IN ('active', 'inactive')),
	CONSTRAINT master_reference_version CHECK (version >= 1),
	CONSTRAINT master_reference_supersedes CHECK (supersedes_version IS NULL OR supersedes_version < version),
	UNIQUE (namespace, code, version)
)""")


def downgrade():
    # Destructive: only run against a disposable synthetic demo database.
    op.execute("DROP TABLE master_references")
