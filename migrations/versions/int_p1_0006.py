"""Join compatible P0 and P1/P2 histories; no existing revision rewritten.

Branches add disjoint tables; p1_0003 extends existing intent kinds with p1.
"""
revision = 'int_p1_0006'
down_revision = ('demo_0005', 'p1_0003')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
