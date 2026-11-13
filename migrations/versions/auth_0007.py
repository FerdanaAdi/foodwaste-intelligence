"""Additive synthetic site membership administration; no historical data rewrites."""
from alembic import op
import sqlalchemy as sa

revision = 'auth_0007'
down_revision = 'int_p1_0006'
branch_labels = None
depends_on = None


def upgrade():
    for name in ('auth_membership_admins', 'auth_membership_eligibility'):
        op.create_table(name,
            sa.Column('principal_id', sa.Uuid(), sa.ForeignKey('auth_principals.principal_id'), primary_key=True),
            sa.Column('site_id', sa.Uuid(), sa.ForeignKey('sites.site_id'), primary_key=True))
    op.create_table('auth_membership_changes',
        sa.Column('audit_id', sa.Uuid(), sa.ForeignKey('audit_events.audit_id'), primary_key=True),
        sa.Column('principal_id', sa.Uuid(), sa.ForeignKey('auth_principals.principal_id'), nullable=False),
        sa.Column('site_id', sa.Uuid(), sa.ForeignKey('sites.site_id'), nullable=False),
        sa.Column('old_role', sa.String(), nullable=True),
        sa.Column('old_active', sa.Boolean(), nullable=True),
        sa.Column('new_role', sa.String(), nullable=False),
        sa.Column('new_active', sa.Boolean(), nullable=False),
        sa.Column('reason', sa.String(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("old_role IS NULL OR old_role IN ('reader','writer')", name='membership_change_old_role'),
        sa.CheckConstraint("new_role IN ('reader','writer')", name='membership_change_new_role'),
        sa.CheckConstraint("length(trim(reason)) BETWEEN 1 AND 1000", name='membership_change_reason'))


def downgrade():
    raise RuntimeError('membership security evidence/history must not be downgraded; use an approved forward fix')
