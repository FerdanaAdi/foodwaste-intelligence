"""Source-backed AC-14 axes; additive, nullable, no backfill or inferred status."""
from alembic import op
import sqlalchemy as sa
revision = 'p0_0008'
down_revision = 'auth_0007'
branch_labels = None
depends_on = None


def upgrade():
    for name in ('regulatory_scope_status', 'edibility_status', 'classification_source'):
        op.add_column('waste_events', sa.Column(name, sa.String(), nullable=True))
    op.create_check_constraint('event_regulatory_pending','waste_events',"regulatory_scope_status IS NULL OR regulatory_scope_status = 'pending_assessment'")
    op.create_check_constraint('event_edibility_source','waste_events',"edibility_status IS NULL OR edibility_status IN ('edible','inedible','mixed','unknown')")
    op.create_check_constraint('event_classification_source','waste_events',"(regulatory_scope_status IS NULL AND edibility_status IS NULL) OR (classification_source IS NOT NULL AND length(trim(classification_source)) > 0)")

    op.create_table('auth_master_namespaces',sa.Column('namespace',sa.String(),primary_key=True),sa.Column('source_ref',sa.String(),nullable=False))
    op.create_table('auth_master_grants',sa.Column('principal_id',sa.Uuid(),sa.ForeignKey('auth_principals.principal_id'),primary_key=True),sa.Column('namespace',sa.String(),sa.ForeignKey('auth_master_namespaces.namespace'),primary_key=True))
    op.create_table('auth_review_grants',sa.Column('principal_id',sa.Uuid(),sa.ForeignKey('auth_principals.principal_id'),primary_key=True),sa.Column('site_id',sa.Uuid(),sa.ForeignKey('sites.site_id'),primary_key=True))
    op.create_table('evidence_files',sa.Column('evidence_id',sa.Uuid(),sa.ForeignKey('evidence_references.evidence_id'),primary_key=True),
        sa.Column('file_id',sa.Uuid(),nullable=False,unique=True),sa.Column('sha256',sa.String(64),nullable=False),sa.Column('size_bytes',sa.Integer(),nullable=False),
        sa.Column('media_type',sa.String(),nullable=False),sa.Column('actor_id',sa.Uuid(),sa.ForeignKey('auth_principals.principal_id'),nullable=False),sa.Column('recorded_at',sa.DateTime(timezone=True),nullable=False),
        sa.CheckConstraint('size_bytes > 0 AND size_bytes <= 10485760',name='evidence_file_size'),sa.CheckConstraint("media_type IN ('application/pdf','image/jpeg','image/png')",name='evidence_file_type'))
    op.create_table('proposal_approvals',sa.Column('approval_id',sa.Uuid(),primary_key=True),
        sa.Column('correction_record_id',sa.Uuid(),sa.ForeignKey('correction_proposals.correction_record_id'),nullable=False,unique=True),
        sa.Column('proposal_version',sa.Integer(),nullable=False),sa.Column('decision_revision',sa.Integer(),nullable=False),
        sa.Column('actor_id',sa.Uuid(),sa.ForeignKey('auth_principals.principal_id'),nullable=False),sa.Column('reason',sa.String(),nullable=False),sa.Column('recorded_at',sa.DateTime(timezone=True),nullable=False),
        sa.CheckConstraint('proposal_version = 1 AND decision_revision = 1',name='proposal_approval_revision'))


def downgrade():
    raise RuntimeError('classification history must not be downgraded; use forward fix')
