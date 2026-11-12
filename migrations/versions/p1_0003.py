"""Provisional P1/P2 candidate tables and the 'p1' write-intent kind.

Revision ID: p1_0003
Revises: auth_0002
Create Date: 2026-11-09

Isolated candidate schema for the P1 PRD extension draft; reversible and
non-destructive to the demo core. Vocabularies are PROPOSED engineering
candidates, not final FWI-02/03 decisions.
"""
from alembic import op

revision = 'p1_0003'
down_revision = 'auth_0002'
branch_labels = None
depends_on = None

_MASS_BASES = "('raw','after_preparation','cooked','ready_to_eat','as_served','other_documented')"


def upgrade() -> None:
    op.execute("""
        CREATE TABLE p1_receipts (
            receipt_id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            source_ref VARCHAR(120) NOT NULL,
            received_at TIMESTAMPTZ NOT NULL,
            note VARCHAR(500),
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_receipt_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p1_receipt_identity UNIQUE (site_id, organization_id, source_ref)
        )""")
    op.execute(f"""
        CREATE TABLE p1_lots (
            lot_id UUID PRIMARY KEY,
            receipt_id UUID NOT NULL REFERENCES p1_receipts (receipt_id),
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            lot_ref VARCHAR(120) NOT NULL,
            item_code VARCHAR(120) NOT NULL,
            item_version VARCHAR(40),
            quantity NUMERIC NOT NULL,
            original_unit VARCHAR(8) NOT NULL,
            mass_basis VARCHAR(24) NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_lot_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p1_lot_identity UNIQUE (site_id, organization_id, lot_ref),
            CONSTRAINT p1_lot_unit CHECK (original_unit = 'kg'),
            CONSTRAINT p1_lot_basis CHECK (mass_basis IN {_MASS_BASES}),
            CONSTRAINT p1_lot_quantity CHECK (quantity >= 0)
        )""")
    op.execute('CREATE INDEX ix_p1_lots_receipt_id ON p1_lots (receipt_id)')
    op.execute("""
        CREATE TABLE p1_inventory_movements (
            movement_id UUID PRIMARY KEY,
            lot_id UUID NOT NULL REFERENCES p1_lots (lot_id),
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            movement_type VARCHAR(24) NOT NULL,
            direction VARCHAR(4) NOT NULL,
            quantity NUMERIC NOT NULL,
            target_ref VARCHAR(200),
            occurred_at TIMESTAMPTZ NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_movement_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p1_movement_type CHECK (movement_type IN
                ('issue_to_batch','return_from_batch','transfer','stock_correction')),
            CONSTRAINT p1_movement_direction CHECK (direction IN ('in','out')),
            CONSTRAINT p1_movement_quantity CHECK (quantity >= 0)
        )""")
    op.execute('CREATE INDEX ix_p1_inventory_movements_lot_id ON p1_inventory_movements (lot_id)')
    op.execute("""
        CREATE TABLE p1_menus (
            menu_id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            menu_code VARCHAR(120) NOT NULL,
            name VARCHAR(200) NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_menu_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p1_menu_identity UNIQUE (site_id, organization_id, menu_code)
        )""")
    op.execute("""
        CREATE TABLE p1_recipes (
            recipe_id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            menu_id UUID REFERENCES p1_menus (menu_id),
            recipe_code VARCHAR(120) NOT NULL,
            version_no INTEGER NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_recipe_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p1_recipe_version_identity UNIQUE (site_id, organization_id, recipe_code, version_no)
        )""")
    op.execute(f"""
        CREATE TABLE p1_recipe_lines (
            line_id UUID PRIMARY KEY,
            recipe_id UUID NOT NULL REFERENCES p1_recipes (recipe_id),
            line_no INTEGER NOT NULL,
            item_code VARCHAR(120) NOT NULL,
            quantity NUMERIC NOT NULL,
            original_unit VARCHAR(8) NOT NULL,
            mass_basis VARCHAR(24) NOT NULL,
            CONSTRAINT p1_recipe_line_unit CHECK (original_unit = 'kg'),
            CONSTRAINT p1_recipe_line_basis CHECK (mass_basis IN {_MASS_BASES}),
            CONSTRAINT p1_recipe_line_quantity CHECK (quantity >= 0)
        )""")
    op.execute('CREATE INDEX ix_p1_recipe_lines_recipe_id ON p1_recipe_lines (recipe_id)')
    op.execute(f"""
        CREATE TABLE p1_production_batches (
            batch_id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            recipe_id UUID NOT NULL REFERENCES p1_recipes (recipe_id),
            operation_date DATE NOT NULL,
            planned_output NUMERIC,
            original_unit VARCHAR(8) NOT NULL,
            mass_basis VARCHAR(24) NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_batch_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p1_batch_unit CHECK (original_unit = 'kg'),
            CONSTRAINT p1_batch_basis CHECK (mass_basis IN {_MASS_BASES}),
            CONSTRAINT p1_batch_planned CHECK (planned_output IS NULL OR planned_output >= 0)
        )""")
    op.execute('CREATE INDEX ix_p1_production_batches_recipe_id ON p1_production_batches (recipe_id)')
    op.execute(f"""
        CREATE TABLE p1_batch_io (
            io_id UUID PRIMARY KEY,
            batch_id UUID NOT NULL REFERENCES p1_production_batches (batch_id),
            source_lot_id UUID REFERENCES p1_lots (lot_id),
            io_kind VARCHAR(16) NOT NULL,
            quantity NUMERIC NOT NULL,
            original_unit VARCHAR(8) NOT NULL,
            mass_basis VARCHAR(24) NOT NULL,
            occurred_at TIMESTAMPTZ NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_batch_io_kind CHECK (io_kind IN ('input','output_primary','output_rework')),
            CONSTRAINT p1_batch_io_unit CHECK (original_unit = 'kg'),
            CONSTRAINT p1_batch_io_basis CHECK (mass_basis IN {_MASS_BASES}),
            CONSTRAINT p1_batch_io_quantity CHECK (quantity >= 0)
        )""")
    op.execute('CREATE INDEX ix_p1_batch_io_batch_id ON p1_batch_io (batch_id)')
    op.execute("""
        CREATE TABLE p1_distribution_runs (
            run_id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            run_code VARCHAR(120) NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_run_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p1_run_identity UNIQUE (site_id, organization_id, run_code)
        )""")
    op.execute(f"""
        CREATE TABLE p1_deliveries (
            delivery_id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            run_id UUID REFERENCES p1_distribution_runs (run_id),
            from_site_id UUID NOT NULL REFERENCES sites (site_id),
            to_site_id UUID NOT NULL REFERENCES sites (site_id),
            dispatch_quantity NUMERIC NOT NULL,
            received_quantity NUMERIC,
            original_unit VARCHAR(8) NOT NULL,
            mass_basis VARCHAR(24) NOT NULL,
            dispatched_at TIMESTAMPTZ NOT NULL,
            received_at TIMESTAMPTZ,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_delivery_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p1_delivery_unit CHECK (original_unit = 'kg'),
            CONSTRAINT p1_delivery_basis CHECK (mass_basis IN {_MASS_BASES}),
            CONSTRAINT p1_delivery_dispatch CHECK (dispatch_quantity >= 0),
            CONSTRAINT p1_delivery_received CHECK (received_quantity IS NULL OR received_quantity >= 0),
            CONSTRAINT p1_delivery_origin CHECK (from_site_id = site_id)
        )""")
    op.execute("""
        CREATE TABLE p1_meal_services (
            service_id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            delivery_id UUID REFERENCES p1_deliveries (delivery_id),
            served_count INTEGER,
            served_mass NUMERIC,
            original_unit VARCHAR(8),
            mass_basis VARCHAR(24),
            leftover_event_id UUID REFERENCES waste_events (event_id),
            sampling_frame VARCHAR(200),
            sample_size INTEGER,
            sampling_method VARCHAR(120),
            coverage NUMERIC,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_service_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p1_service_count CHECK (served_count IS NULL OR served_count >= 0),
            CONSTRAINT p1_service_mass CHECK (served_mass IS NULL OR (original_unit = 'kg' AND served_mass >= 0)),
            CONSTRAINT p1_service_basis_required CHECK (served_mass IS NULL OR mass_basis IS NOT NULL),
            CONSTRAINT p1_service_sample CHECK (sample_size IS NULL OR sample_size >= 0)
        )""")
    op.execute("""
        CREATE TABLE p1_material_flow_links (
            link_id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            source_type VARCHAR(16) NOT NULL,
            source_id UUID NOT NULL,
            target_type VARCHAR(16) NOT NULL,
            target_id UUID NOT NULL,
            relation_code VARCHAR(24) NOT NULL,
            quantity NUMERIC,
            original_unit VARCHAR(8),
            mass_basis VARCHAR(24),
            occurred_at TIMESTAMPTZ NOT NULL,
            note VARCHAR(500),
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_link_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p1_link_source_type CHECK (source_type IN
                ('waste_event','lot','batch','delivery','meal_service')),
            CONSTRAINT p1_link_target_type CHECK (target_type IN
                ('waste_event','lot','batch','delivery','meal_service')),
            CONSTRAINT p1_link_relation CHECK (relation_code IN
                ('derived_from','input_to','transfer_of','disposition_of','rework_of','leftover_of')),
            CONSTRAINT p1_link_no_self CHECK (NOT (source_type = target_type AND source_id = target_id)),
            CONSTRAINT p1_link_quantity CHECK (quantity IS NULL OR (original_unit = 'kg' AND quantity >= 0))
        )""")
    op.execute('CREATE INDEX ix_p1_material_flow_links_source_id ON p1_material_flow_links (source_id)')
    op.execute('CREATE INDEX ix_p1_material_flow_links_target_id ON p1_material_flow_links (target_id)')
    op.execute(f"""
        CREATE TABLE p1_dispositions (
            disposition_id UUID PRIMARY KEY,
            event_id UUID NOT NULL REFERENCES waste_events (event_id),
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            outcome_type VARCHAR(32) NOT NULL,
            quantity NUMERIC NOT NULL,
            original_unit VARCHAR(8) NOT NULL,
            mass_basis VARCHAR(24) NOT NULL,
            occurred_at TIMESTAMPTZ NOT NULL,
            food_safety_status VARCHAR(24) NOT NULL,
            handover_ref VARCHAR(200),
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p1_disposition_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p1_disposition_outcome CHECK (outcome_type IN
                ('compost','disposal','animal_feed','processing','redistribution_handover')),
            CONSTRAINT p1_disposition_safety CHECK (food_safety_status IN
                ('not_assessed','assessed_safe','assessed_unsafe')),
            CONSTRAINT p1_disposition_unit CHECK (original_unit = 'kg'),
            CONSTRAINT p1_disposition_basis CHECK (mass_basis IN {_MASS_BASES}),
            CONSTRAINT p1_disposition_quantity CHECK (quantity >= 0)
        )""")
    op.execute('CREATE INDEX ix_p1_dispositions_event_id ON p1_dispositions (event_id)')
    op.execute("""
        CREATE TABLE p2_kpi_registry (
            kpi_code VARCHAR(16) PRIMARY KEY,
            formula_version VARCHAR(40) NOT NULL,
            description VARCHAR(500) NOT NULL,
            design_status VARCHAR(16) NOT NULL,
            data_readiness_gate VARCHAR(300) NOT NULL,
            source_doc_revision VARCHAR(60) NOT NULL,
            effective_at DATE NOT NULL,
            change_reason VARCHAR(300),
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p2_kpi_design_status CHECK (design_status IN ('design_pass','conditional','held'))
        )""")
    op.execute("""
        CREATE TABLE p2_cost_references (
            cost_reference_id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            scope_type VARCHAR(8) NOT NULL,
            scope_ref UUID NOT NULL,
            currency VARCHAR(3) NOT NULL,
            amount NUMERIC,
            unit_basis VARCHAR(60) NOT NULL,
            price_source VARCHAR(200) NOT NULL,
            price_date DATE,
            method_version VARCHAR(60) NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p2_costref_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p2_costref_scope CHECK (scope_type IN ('item','lot','batch')),
            CONSTRAINT p2_costref_amount CHECK (amount IS NULL OR amount >= 0),
            CONSTRAINT p2_costref_currency CHECK (currency ~ '^[A-Z]{3}$')
        )""")
    op.execute('CREATE INDEX ix_p2_cost_references_scope_ref ON p2_cost_references (scope_ref)')
    op.execute("""
        CREATE TABLE p2_recommendations (
            recommendation_id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations (organization_id),
            site_id UUID NOT NULL,
            rule_code VARCHAR(40) NOT NULL,
            rule_version VARCHAR(40) NOT NULL,
            target_type VARCHAR(16) NOT NULL,
            target_ref UUID NOT NULL,
            detected_issue VARCHAR(300) NOT NULL,
            coverage VARCHAR(16) NOT NULL,
            recommended_action VARCHAR(300) NOT NULL,
            state VARCHAR(16) NOT NULL DEFAULT 'open',
            ack_reason VARCHAR(300),
            ack_actor UUID REFERENCES auth_principals (principal_id),
            ack_at TIMESTAMPTZ,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p2_recommendation_site_scope FOREIGN KEY (site_id, organization_id)
                REFERENCES sites (site_id, organization_id),
            CONSTRAINT p2_recommendation_identity UNIQUE (rule_code, rule_version, target_type, target_ref),
            CONSTRAINT p2_recommendation_coverage CHECK (coverage IN ('complete','partial')),
            CONSTRAINT p2_recommendation_state CHECK (state IN ('open','acknowledged','dismissed'))
        )""")
    op.execute('CREATE INDEX ix_p2_recommendations_target_ref ON p2_recommendations (target_ref)')
    op.execute("""
        CREATE TABLE p2_alert_settings (
            setting_id UUID PRIMARY KEY,
            rule_code VARCHAR(40) NOT NULL,
            disabled BOOLEAN NOT NULL DEFAULT FALSE,
            recorded_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT p2_alert_setting_rule UNIQUE (rule_code)
        )""")
    op.execute("ALTER TABLE auth_write_intents DROP CONSTRAINT intent_kind")
    op.execute("ALTER TABLE auth_write_intents ADD CONSTRAINT intent_kind "
               "CHECK (kind IN ('event','measurement','p1'))")


def downgrade() -> None:
    op.execute("ALTER TABLE auth_write_intents DROP CONSTRAINT intent_kind")
    op.execute("ALTER TABLE auth_write_intents ADD CONSTRAINT intent_kind "
               "CHECK (kind IN ('event','measurement'))")
    for statement in (
        'DROP INDEX IF EXISTS ix_p2_recommendations_target_ref',
        'DROP TABLE IF EXISTS p2_alert_settings',
        'DROP TABLE IF EXISTS p2_recommendations',
        'DROP INDEX IF EXISTS ix_p2_cost_references_scope_ref',
        'DROP TABLE IF EXISTS p2_cost_references',
        'DROP TABLE IF EXISTS p2_kpi_registry',
        'DROP INDEX IF EXISTS ix_p1_dispositions_event_id',
        'DROP TABLE IF EXISTS p1_dispositions',
        'DROP INDEX IF EXISTS ix_p1_material_flow_links_target_id',
        'DROP INDEX IF EXISTS ix_p1_material_flow_links_source_id',
        'DROP TABLE IF EXISTS p1_material_flow_links',
        'DROP TABLE IF EXISTS p1_meal_services',
        'DROP TABLE IF EXISTS p1_deliveries',
        'DROP TABLE IF EXISTS p1_distribution_runs',
        'DROP INDEX IF EXISTS ix_p1_batch_io_batch_id',
        'DROP TABLE IF EXISTS p1_batch_io',
        'DROP INDEX IF EXISTS ix_p1_production_batches_recipe_id',
        'DROP TABLE IF EXISTS p1_production_batches',
        'DROP INDEX IF EXISTS ix_p1_recipe_lines_recipe_id',
        'DROP TABLE IF EXISTS p1_recipe_lines',
        'DROP TABLE IF EXISTS p1_recipes',
        'DROP TABLE IF EXISTS p1_menus',
        'DROP INDEX IF EXISTS ix_p1_inventory_movements_lot_id',
        'DROP TABLE IF EXISTS p1_inventory_movements',
        'DROP INDEX IF EXISTS ix_p1_lots_receipt_id',
        'DROP TABLE IF EXISTS p1_lots',
        'DROP TABLE IF EXISTS p1_receipts',
    ):
        op.execute(statement)
