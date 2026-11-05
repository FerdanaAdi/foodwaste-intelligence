"""Demo v0.1 only: five synthetic entities; not a production schema."""

from alembic import op

revision = "demo_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE organizations (
	organization_id UUID NOT NULL,
	name VARCHAR NOT NULL,
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (organization_id)
)""")
    op.execute("""CREATE TABLE sites (
	site_id UUID NOT NULL,
	organization_id UUID NOT NULL,
	name VARCHAR NOT NULL,
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (site_id),
	UNIQUE (site_id, organization_id),
	FOREIGN KEY(organization_id) REFERENCES organizations (organization_id)
)""")
    op.execute("""CREATE TABLE waste_events (
	event_id UUID NOT NULL,
	organization_id UUID NOT NULL,
	site_id UUID NOT NULL,
	event_type VARCHAR NOT NULL,
	occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (event_id),
	CONSTRAINT event_demo_type CHECK (event_type IN ('at_risk_surplus', 'actual_loss_discard')),
	FOREIGN KEY(site_id, organization_id) REFERENCES sites (site_id, organization_id),
	FOREIGN KEY(organization_id) REFERENCES organizations (organization_id)
)""")
    op.execute("""CREATE TABLE measurements (
	measurement_id UUID NOT NULL,
	event_id UUID NOT NULL,
	gross NUMERIC,
	tare NUMERIC,
	net NUMERIC,
	original_unit VARCHAR NOT NULL,
	mass_basis VARCHAR NOT NULL,
	measurement_method VARCHAR NOT NULL,
	provenance VARCHAR NOT NULL,
	observation_status VARCHAR NOT NULL,
	measured_at TIMESTAMP WITH TIME ZONE NOT NULL,
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (measurement_id),
	CONSTRAINT measurement_demo_unit CHECK (original_unit = 'kg'),
	CONSTRAINT measurement_demo_status CHECK (observation_status IN ('observed', 'measured_zero', 'estimated', 'missing', 'not_measured')),
	CONSTRAINT measurement_missing_values CHECK ((observation_status IN ('missing', 'not_measured') AND gross IS NULL AND tare IS NULL AND net IS NULL) OR (observation_status IN ('observed', 'measured_zero', 'estimated') AND gross IS NOT NULL AND tare IS NOT NULL AND net IS NOT NULL)),
	CONSTRAINT measurement_mass_consistency CHECK (gross >= 0 AND tare >= 0 AND net >= 0 AND gross >= tare AND net = gross - tare),
	CONSTRAINT measurement_finite CHECK (gross NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) AND tare NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) AND net NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT measurement_zero CHECK (observation_status <> 'measured_zero' OR net = 0),
	FOREIGN KEY(event_id) REFERENCES waste_events (event_id)
)""")
    op.execute("""CREATE TABLE audit_events (
	audit_id UUID NOT NULL,
	event_id UUID,
	measurement_id UUID,
	entity_type VARCHAR NOT NULL,
	entity_id UUID NOT NULL,
	action VARCHAR NOT NULL,
	actor VARCHAR NOT NULL,
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (audit_id),
	CONSTRAINT audit_synthetic_actor CHECK (actor = 'synthetic-demo-actor'),
	FOREIGN KEY(event_id) REFERENCES waste_events (event_id),
	FOREIGN KEY(measurement_id) REFERENCES measurements (measurement_id)
)""")
    op.execute("""CREATE INDEX ix_measurements_event_id ON measurements (event_id)""")


def downgrade():
    # Destructive: only run against a disposable synthetic demo database.
    for table in ("audit_events", "measurements", "waste_events", "sites", "organizations"):
        op.drop_table(table)
