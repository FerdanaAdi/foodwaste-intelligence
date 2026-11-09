"""Provisional P1/P2 candidate tables (FR-101..106, FR-201/FR-203 foundations).

Isolated candidate schema for the P1 PRD extension draft; nothing here is an
approved production schema. Vocabularies are PROPOSED and check-constrained
for integrity only; final vocabularies remain FWI-02/03 decisions. Site-bound
rows carry the (site_id, organization_id) scope used by the demo core.
Typed lineage references are validated in the application layer because a
polymorphic foreign key is not expressible here.
"""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (Boolean, CheckConstraint, Date, DateTime, ForeignKey, ForeignKeyConstraint,
                        Integer, Numeric, String, UniqueConstraint, Uuid)
from sqlalchemy.orm import Mapped, mapped_column

from fwi.infrastructure.database.models import Base

_MASS_BASES = "('raw','after_preparation','cooked','ready_to_eat','as_served','other_documented')"
_SITE_SCOPE = ('ForeignKeyConstraint(["site_id", "organization_id"], '
               '["sites.site_id", "sites.organization_id"]),')


class P1Receipt(Base):
    __tablename__ = 'p1_receipts'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        UniqueConstraint('site_id', 'organization_id', 'source_ref', name='p1_receipt_identity'),
    )
    receipt_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    source_ref: Mapped[str] = mapped_column(String(120))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(500))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P1Lot(Base):
    __tablename__ = 'p1_lots'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        UniqueConstraint('site_id', 'organization_id', 'lot_ref', name='p1_lot_identity'),
        CheckConstraint("original_unit = 'kg'", name='p1_lot_unit'),
        CheckConstraint(f'mass_basis IN {_MASS_BASES}', name='p1_lot_basis'),
        CheckConstraint('quantity >= 0', name='p1_lot_quantity'),
    )
    lot_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    receipt_id: Mapped[UUID] = mapped_column(ForeignKey('p1_receipts.receipt_id'), index=True)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    lot_ref: Mapped[str] = mapped_column(String(120))
    item_code: Mapped[str] = mapped_column(String(120))
    item_version: Mapped[str | None] = mapped_column(String(40))
    quantity: Mapped[Decimal] = mapped_column(Numeric)
    original_unit: Mapped[str] = mapped_column(String(8))
    mass_basis: Mapped[str] = mapped_column(String(24))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P1InventoryMovement(Base):
    __tablename__ = 'p1_inventory_movements'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        CheckConstraint("movement_type IN ('issue_to_batch','return_from_batch','transfer','stock_correction')",
                        name='p1_movement_type'),
        CheckConstraint("direction IN ('in','out')", name='p1_movement_direction'),
        CheckConstraint('quantity >= 0', name='p1_movement_quantity'),
    )
    movement_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    lot_id: Mapped[UUID] = mapped_column(ForeignKey('p1_lots.lot_id'), index=True)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    movement_type: Mapped[str] = mapped_column(String(24))
    direction: Mapped[str] = mapped_column(String(4))
    quantity: Mapped[Decimal] = mapped_column(Numeric)
    target_ref: Mapped[str | None] = mapped_column(String(200))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P1Menu(Base):
    __tablename__ = 'p1_menus'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        UniqueConstraint('site_id', 'organization_id', 'menu_code', name='p1_menu_identity'),
    )
    menu_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    menu_code: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(200))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P1Recipe(Base):
    __tablename__ = 'p1_recipes'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        UniqueConstraint('site_id', 'organization_id', 'recipe_code', 'version_no',
                         name='p1_recipe_version_identity'),
    )
    recipe_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    menu_id: Mapped[UUID | None] = mapped_column(ForeignKey('p1_menus.menu_id'))
    recipe_code: Mapped[str] = mapped_column(String(120))
    version_no: Mapped[int] = mapped_column(Integer)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Immutable by construction: the candidate exposes no update path; a change
    # to a recipe is a new version row (P1-AC-03).


class P1RecipeLine(Base):
    __tablename__ = 'p1_recipe_lines'
    __table_args__ = (
        CheckConstraint("original_unit = 'kg'", name='p1_recipe_line_unit'),
        CheckConstraint(f'mass_basis IN {_MASS_BASES}', name='p1_recipe_line_basis'),
        CheckConstraint('quantity >= 0', name='p1_recipe_line_quantity'),
    )
    line_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    recipe_id: Mapped[UUID] = mapped_column(ForeignKey('p1_recipes.recipe_id'), index=True)
    line_no: Mapped[int] = mapped_column(Integer)
    item_code: Mapped[str] = mapped_column(String(120))
    quantity: Mapped[Decimal] = mapped_column(Numeric)
    original_unit: Mapped[str] = mapped_column(String(8))
    mass_basis: Mapped[str] = mapped_column(String(24))


class P1ProductionBatch(Base):
    __tablename__ = 'p1_production_batches'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        CheckConstraint("original_unit = 'kg'", name='p1_batch_unit'),
        CheckConstraint(f'mass_basis IN {_MASS_BASES}', name='p1_batch_basis'),
        CheckConstraint('planned_output IS NULL OR planned_output >= 0', name='p1_batch_planned'),
    )
    batch_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    recipe_id: Mapped[UUID] = mapped_column(ForeignKey('p1_recipes.recipe_id'), index=True)
    operation_date: Mapped[date] = mapped_column(Date)
    planned_output: Mapped[Decimal | None] = mapped_column(Numeric)
    original_unit: Mapped[str] = mapped_column(String(8))
    mass_basis: Mapped[str] = mapped_column(String(24))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P1BatchIO(Base):
    __tablename__ = 'p1_batch_io'
    __table_args__ = (
        CheckConstraint("io_kind IN ('input','output_primary','output_rework')", name='p1_batch_io_kind'),
        CheckConstraint("original_unit = 'kg'", name='p1_batch_io_unit'),
        CheckConstraint(f'mass_basis IN {_MASS_BASES}', name='p1_batch_io_basis'),
        CheckConstraint('quantity >= 0', name='p1_batch_io_quantity'),
    )
    io_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    batch_id: Mapped[UUID] = mapped_column(ForeignKey('p1_production_batches.batch_id'), index=True)
    source_lot_id: Mapped[UUID | None] = mapped_column(ForeignKey('p1_lots.lot_id'))
    io_kind: Mapped[str] = mapped_column(String(16))
    quantity: Mapped[Decimal] = mapped_column(Numeric)
    original_unit: Mapped[str] = mapped_column(String(8))
    mass_basis: Mapped[str] = mapped_column(String(24))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P1DistributionRun(Base):
    __tablename__ = 'p1_distribution_runs'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        UniqueConstraint('site_id', 'organization_id', 'run_code', name='p1_run_identity'),
    )
    run_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    run_code: Mapped[str] = mapped_column(String(120))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P1Delivery(Base):
    __tablename__ = 'p1_deliveries'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        CheckConstraint("original_unit = 'kg'", name='p1_delivery_unit'),
        CheckConstraint(f'mass_basis IN {_MASS_BASES}', name='p1_delivery_basis'),
        CheckConstraint('dispatch_quantity >= 0', name='p1_delivery_dispatch'),
        CheckConstraint('received_quantity IS NULL OR received_quantity >= 0', name='p1_delivery_received'),
        CheckConstraint('from_site_id = site_id', name='p1_delivery_origin'),
    )
    delivery_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)  # originating/dispatching site
    run_id: Mapped[UUID | None] = mapped_column(ForeignKey('p1_distribution_runs.run_id'))
    from_site_id: Mapped[UUID] = mapped_column(ForeignKey('sites.site_id'))
    to_site_id: Mapped[UUID] = mapped_column(ForeignKey('sites.site_id'))
    dispatch_quantity: Mapped[Decimal] = mapped_column(Numeric)
    received_quantity: Mapped[Decimal | None] = mapped_column(Numeric)
    original_unit: Mapped[str] = mapped_column(String(8))
    mass_basis: Mapped[str] = mapped_column(String(24))
    dispatched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P1MealService(Base):
    __tablename__ = 'p1_meal_services'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        CheckConstraint('served_count IS NULL OR served_count >= 0', name='p1_service_count'),
        CheckConstraint("served_mass IS NULL OR (original_unit = 'kg' AND served_mass >= 0)",
                        name='p1_service_mass'),
        CheckConstraint('served_mass IS NULL OR mass_basis IS NOT NULL', name='p1_service_basis_required'),
        CheckConstraint('sample_size IS NULL OR sample_size >= 0', name='p1_service_sample'),
    )
    service_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    delivery_id: Mapped[UUID | None] = mapped_column(ForeignKey('p1_deliveries.delivery_id'))
    served_count: Mapped[int | None] = mapped_column(Integer)  # aggregate; no student identity, ever
    served_mass: Mapped[Decimal | None] = mapped_column(Numeric)
    original_unit: Mapped[str | None] = mapped_column(String(8))
    mass_basis: Mapped[str | None] = mapped_column(String(24))
    leftover_event_id: Mapped[UUID | None] = mapped_column(ForeignKey('waste_events.event_id'))
    sampling_frame: Mapped[str | None] = mapped_column(String(200))
    sample_size: Mapped[int | None] = mapped_column(Integer)
    sampling_method: Mapped[str | None] = mapped_column(String(120))
    coverage: Mapped[Decimal | None] = mapped_column(Numeric)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P1MaterialFlowLink(Base):
    __tablename__ = 'p1_material_flow_links'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        CheckConstraint("source_type IN ('waste_event','lot','batch','delivery','meal_service')",
                        name='p1_link_source_type'),
        CheckConstraint("target_type IN ('waste_event','lot','batch','delivery','meal_service')",
                        name='p1_link_target_type'),
        CheckConstraint("relation_code IN ('derived_from','input_to','transfer_of','disposition_of',"
                        "'rework_of','leftover_of')", name='p1_link_relation'),
        CheckConstraint('NOT (source_type = target_type AND source_id = target_id)', name='p1_link_no_self'),
        CheckConstraint("quantity IS NULL OR (original_unit = 'kg' AND quantity >= 0)", name='p1_link_quantity'),
    )
    link_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)  # owning site: the source object's site
    source_type: Mapped[str] = mapped_column(String(16))
    source_id: Mapped[UUID] = mapped_column(Uuid, index=True)
    target_type: Mapped[str] = mapped_column(String(16))
    target_id: Mapped[UUID] = mapped_column(Uuid, index=True)
    relation_code: Mapped[str] = mapped_column(String(24))
    quantity: Mapped[Decimal | None] = mapped_column(Numeric)
    original_unit: Mapped[str | None] = mapped_column(String(8))
    mass_basis: Mapped[str | None] = mapped_column(String(24))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(500))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P1Disposition(Base):
    __tablename__ = 'p1_dispositions'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        CheckConstraint("outcome_type IN ('compost','disposal','animal_feed','processing',"
                        "'redistribution_handover')", name='p1_disposition_outcome'),
        CheckConstraint("food_safety_status IN ('not_assessed','assessed_safe','assessed_unsafe')",
                        name='p1_disposition_safety'),
        CheckConstraint("original_unit = 'kg'", name='p1_disposition_unit'),
        CheckConstraint(f'mass_basis IN {_MASS_BASES}', name='p1_disposition_basis'),
        CheckConstraint('quantity >= 0', name='p1_disposition_quantity'),
    )
    disposition_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    event_id: Mapped[UUID] = mapped_column(ForeignKey('waste_events.event_id'), index=True)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    outcome_type: Mapped[str] = mapped_column(String(32))
    quantity: Mapped[Decimal] = mapped_column(Numeric)
    original_unit: Mapped[str] = mapped_column(String(8))
    mass_basis: Mapped[str] = mapped_column(String(24))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    food_safety_status: Mapped[str] = mapped_column(String(24))
    handover_ref: Mapped[str | None] = mapped_column(String(200))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P2KpiEntry(Base):
    __tablename__ = 'p2_kpi_registry'
    __table_args__ = (
        CheckConstraint("design_status IN ('design_pass','conditional','held')", name='p2_kpi_design_status'),
    )
    kpi_code: Mapped[str] = mapped_column(String(16), primary_key=True)
    formula_version: Mapped[str] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(String(500))
    design_status: Mapped[str] = mapped_column(String(16))
    data_readiness_gate: Mapped[str] = mapped_column(String(300))
    source_doc_revision: Mapped[str] = mapped_column(String(60))
    effective_at: Mapped[date] = mapped_column(Date)
    change_reason: Mapped[str | None] = mapped_column(String(300))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Read-only by contract: the candidate exposes no update path (P2-AC-02).


class P2CostReference(Base):
    __tablename__ = 'p2_cost_references'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        CheckConstraint("scope_type IN ('item','lot','batch')", name='p2_costref_scope'),
        CheckConstraint('amount IS NULL OR amount >= 0', name='p2_costref_amount'),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name='p2_costref_currency'),
    )
    cost_reference_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    scope_type: Mapped[str] = mapped_column(String(8))
    scope_ref: Mapped[UUID] = mapped_column(Uuid, index=True)
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[Decimal | None] = mapped_column(Numeric)  # missing price stays NULL, never Rp0
    unit_basis: Mapped[str] = mapped_column(String(60))
    price_source: Mapped[str] = mapped_column(String(200))
    price_date: Mapped[date | None] = mapped_column(Date)
    method_version: Mapped[str] = mapped_column(String(60))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class P2Recommendation(Base):
    __tablename__ = 'p2_recommendations'
    __table_args__ = (
        ForeignKeyConstraint(['site_id', 'organization_id'], ['sites.site_id', 'sites.organization_id']),
        UniqueConstraint('rule_code', 'rule_version', 'target_type', 'target_ref',
                         name='p2_recommendation_identity'),
        CheckConstraint("coverage IN ('complete','partial')", name='p2_recommendation_coverage'),
        CheckConstraint("state IN ('open','acknowledged','dismissed')", name='p2_recommendation_state'),
    )
    recommendation_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.organization_id'))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    rule_code: Mapped[str] = mapped_column(String(40))
    rule_version: Mapped[str] = mapped_column(String(40))
    target_type: Mapped[str] = mapped_column(String(16))
    target_ref: Mapped[UUID] = mapped_column(Uuid, index=True)
    detected_issue: Mapped[str] = mapped_column(String(300))
    coverage: Mapped[str] = mapped_column(String(16))
    recommended_action: Mapped[str] = mapped_column(String(300))
    state: Mapped[str] = mapped_column(String(16), default='open')
    ack_reason: Mapped[str | None] = mapped_column(String(300))
    ack_actor: Mapped[UUID | None] = mapped_column(ForeignKey('auth_principals.principal_id'))
    ack_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Text plus provenance only; acknowledging never mutates any operational record.


class P2AlertSetting(Base):
    __tablename__ = 'p2_alert_settings'
    __table_args__ = (UniqueConstraint('rule_code', name='p2_alert_setting_rule'),)
    setting_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    rule_code: Mapped[str] = mapped_column(String(40))
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
