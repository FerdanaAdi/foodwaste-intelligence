"""Demo v0.1 review decision and correction-proposal persistence (FR-006).

Proposal-only: no approval/effectuation state exists (VAL-003, OD-004 OPEN).
Original records are never mutated; proposals keep explicit original and
proposed value snapshots. ``state`` is fixed to 'proposed' by constraint —
any future transition needs an approved policy first.
"""

from alembic import op

revision = "demo_0005"
down_revision = "demo_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE review_decisions (
	review_decision_id UUID NOT NULL,
	target_kind VARCHAR NOT NULL,
	target_id UUID NOT NULL,
	decision VARCHAR NOT NULL,
	actor_id VARCHAR NOT NULL,
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
	rationale VARCHAR NOT NULL,
	source VARCHAR NOT NULL,
	provenance VARCHAR NOT NULL,
	recorded_at_system TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (review_decision_id),
	CONSTRAINT review_decision_kind CHECK (target_kind IN ('event', 'measurement')),
	CONSTRAINT review_decision_action CHECK (decision IN ('request_correction'))
)""")
    op.execute("""CREATE TABLE correction_proposals (
	correction_record_id UUID NOT NULL,
	target_kind VARCHAR NOT NULL,
	target_id UUID NOT NULL,
	original_values JSONB NOT NULL,
	proposed_values JSONB NOT NULL,
	actor_id VARCHAR NOT NULL,
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
	reason VARCHAR NOT NULL,
	source VARCHAR NOT NULL,
	provenance VARCHAR NOT NULL,
	review_decision_id UUID NULL,
	state VARCHAR NOT NULL,
	recorded_at_system TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (correction_record_id),
	CONSTRAINT correction_target_kind CHECK (target_kind IN ('event', 'measurement')),
	CONSTRAINT correction_state CHECK (state IN ('proposed')),
	FOREIGN KEY(review_decision_id) REFERENCES review_decisions (review_decision_id)
)""")
    op.execute("CREATE INDEX ix_review_target ON review_decisions (target_kind, target_id)")
    op.execute("CREATE INDEX ix_correction_target ON correction_proposals (target_kind, target_id)")


def downgrade():
    # Destructive: only run against a disposable synthetic demo database.
    for statement in ("DROP INDEX ix_correction_target", "DROP INDEX ix_review_target",
                      "DROP TABLE correction_proposals", "DROP TABLE review_decisions"):
        op.execute(statement)
