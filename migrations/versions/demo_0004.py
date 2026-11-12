"""Demo v0.1 evidence metadata persistence (FR-005 metadata-only scope).

ADR-005 (file bytes, upload, retention) stays OPEN: this slice stores
metadata rows only. ``storage_ref`` exists as an internal column but no API
output, route or serializer ever exposes it. Target links are polymorphic
(event/measurement) and validated in the application layer.
"""

from alembic import op

revision = "demo_0004"
down_revision = "demo_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE evidence_references (
	evidence_id UUID NOT NULL,
	target_kind VARCHAR NOT NULL,
	target_id UUID NOT NULL,
	kind VARCHAR NOT NULL,
	source VARCHAR NOT NULL,
	title VARCHAR NOT NULL,
	recorded_by VARCHAR NOT NULL,
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
	method VARCHAR NULL,
	provenance VARCHAR NULL,
	verification VARCHAR NOT NULL,
	availability VARCHAR NOT NULL,
	storage_ref VARCHAR NULL,
	note VARCHAR NULL,
	recorded_at_system TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (evidence_id),
	CONSTRAINT evidence_target_kind CHECK (target_kind IN ('event', 'measurement')),
	CONSTRAINT evidence_kind CHECK (kind IN ('reference', 'attachment')),
	CONSTRAINT evidence_verification CHECK (verification IN ('unverified', 'needs_review', 'verified')),
	CONSTRAINT evidence_availability CHECK (availability IN ('available', 'unavailable', 'expired', 'unknown'))
)""")
    op.execute("CREATE INDEX ix_evidence_target ON evidence_references (target_kind, target_id)")


def downgrade():
    # Destructive: only run against a disposable synthetic demo database.
    op.execute("DROP INDEX ix_evidence_target")
    op.execute("DROP TABLE evidence_references")
