"""Provisional P1 candidate API schemas; route shapes are PROPOSED, not approved routes.

Request/response shapes mirror the synthetic demo conventions: strict
extra='forbid' inputs, decimal masses, timezone-aware instants. Mass bases are
validated against the domain vocabulary in the application layer.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Optional
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from fwi.api.schemas_demo import Mass, Text

SourceRef = Annotated[str, Field(min_length=1, max_length=120, pattern=r'\S')]
ShortRef = Annotated[str, Field(min_length=1, max_length=200, pattern=r'\S')]


class ReceiptInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: UUID
    site_id: UUID
    source_ref: SourceRef
    received_at: AwareDatetime
    note: Optional[Annotated[str, Field(min_length=1, max_length=500)]] = None


class ReceiptOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    receipt_id: UUID
    organization_id: UUID
    site_id: UUID
    source_ref: str
    received_at: datetime
    note: Optional[str]
    recorded_at: datetime


class LotInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    lot_ref: SourceRef
    item_code: SourceRef
    item_version: Optional[Annotated[str, Field(min_length=1, max_length=40)]] = None
    quantity: Mass
    original_unit: str = 'kg'
    mass_basis: str


class LotOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    lot_id: UUID
    receipt_id: UUID
    organization_id: UUID
    site_id: UUID
    lot_ref: str
    item_code: str
    item_version: Optional[str]
    quantity: Decimal
    original_unit: str
    mass_basis: str
    recorded_at: datetime


class MovementInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    movement_type: str
    direction: str
    quantity: Mass
    target_ref: Optional[Annotated[str, Field(min_length=1, max_length=200)]] = None
    occurred_at: AwareDatetime


class MovementOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    movement_id: UUID
    lot_id: UUID
    movement_type: str
    direction: str
    quantity: Decimal
    target_ref: Optional[str]
    occurred_at: datetime
    recorded_at: datetime


class LotDetailOutput(BaseModel):
    lot_id: UUID
    receipt_id: UUID
    organization_id: UUID
    site_id: UUID
    lot_ref: str
    item_code: str
    item_version: Optional[str]
    quantity: Decimal
    original_unit: str
    mass_basis: str
    recorded_at: datetime
    observed_stock: Decimal
    stock_note: str
    movements: list[MovementOutput]


class MenuInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: UUID
    site_id: UUID
    menu_code: SourceRef
    name: Annotated[str, Field(min_length=1, max_length=200, pattern=r'\S')]


class MenuOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    menu_id: UUID
    organization_id: UUID
    site_id: UUID
    menu_code: str
    name: str
    recorded_at: datetime


class RecipeLineInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    item_code: SourceRef
    quantity: Mass
    original_unit: str = 'kg'
    mass_basis: str
    line_no: Optional[int] = Field(default=None, ge=1)


class RecipeLineOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    line_id: UUID
    recipe_id: UUID
    line_no: int
    item_code: str
    quantity: Decimal
    original_unit: str
    mass_basis: str


class RecipeInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: UUID
    site_id: UUID
    recipe_code: SourceRef
    version_no: int = Field(ge=1, le=1000000)
    menu_id: Optional[UUID] = None
    lines: list[RecipeLineInput] = Field(min_length=1)


class RecipeOutput(BaseModel):
    recipe_id: UUID
    organization_id: UUID
    site_id: UUID
    menu_id: Optional[UUID]
    recipe_code: str
    version_no: int
    recorded_at: datetime
    lines: list[RecipeLineOutput]


class RunInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: UUID
    site_id: UUID
    run_code: SourceRef


class RunOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    run_id: UUID
    organization_id: UUID
    site_id: UUID
    run_code: str
    recorded_at: datetime


class BatchInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: UUID
    site_id: UUID
    recipe_id: UUID
    operation_date: date
    planned_output: Optional[Mass] = None
    original_unit: str = 'kg'
    mass_basis: str


class BatchOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    batch_id: UUID
    organization_id: UUID
    site_id: UUID
    recipe_id: UUID
    operation_date: date
    planned_output: Optional[Decimal]
    original_unit: str
    mass_basis: str
    recorded_at: datetime


class BatchIOInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    io_kind: str
    quantity: Mass
    original_unit: str = 'kg'
    mass_basis: str
    source_lot_id: Optional[UUID] = None
    occurred_at: AwareDatetime


class BatchIOOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    io_id: UUID
    batch_id: UUID
    source_lot_id: Optional[UUID]
    io_kind: str
    quantity: Decimal
    original_unit: str
    mass_basis: str
    occurred_at: datetime
    recorded_at: datetime


class YieldView(BaseModel):
    status: str
    basis: Optional[str]
    value: Optional[Decimal]
    input_total: Optional[Decimal]
    primary_output_total: Optional[Decimal]
    rework_total: Optional[Decimal]
    reason: Optional[str]


class BatchDetailOutput(BaseModel):
    batch_id: UUID
    organization_id: UUID
    site_id: UUID
    recipe_id: UUID
    recipe_code: str
    recipe_version_no: int
    operation_date: date
    planned_output: Optional[Decimal]
    original_unit: str
    mass_basis: str
    recorded_at: datetime
    io: list[BatchIOOutput]
    yield_view: YieldView


class DeliveryInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: UUID
    site_id: UUID
    run_id: Optional[UUID] = None
    from_site_id: UUID
    to_site_id: UUID
    dispatch_quantity: Mass
    original_unit: str = 'kg'
    mass_basis: str
    dispatched_at: AwareDatetime


class DeliveryOutput(BaseModel):
    delivery_id: UUID
    organization_id: UUID
    site_id: UUID
    run_id: Optional[UUID]
    from_site_id: UUID
    to_site_id: UUID
    dispatch_quantity: Decimal
    received_quantity: Optional[Decimal]
    original_unit: str
    mass_basis: str
    dispatched_at: datetime
    received_at: Optional[datetime]
    recorded_at: datetime
    reconciliation_status: str


class ReceivingInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    received_quantity: Mass
    received_at: AwareDatetime


class ServiceInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: UUID
    site_id: UUID
    delivery_id: Optional[UUID] = None
    served_count: Optional[int] = Field(default=None, ge=0)
    served_mass: Optional[Mass] = None
    original_unit: str = 'kg'
    mass_basis: Optional[str] = None
    leftover_event_id: Optional[UUID] = None
    sampling_frame: Optional[Annotated[str, Field(min_length=1, max_length=200)]] = None
    sample_size: Optional[int] = Field(default=None, ge=0)
    sampling_method: Optional[Annotated[str, Field(min_length=1, max_length=120)]] = None
    coverage: Optional[Annotated[Decimal, Field(ge=0)]] = None

    @model_validator(mode='after')
    def mass_requires_basis(self):
        if self.served_mass is not None and not self.mass_basis:
            raise ValueError('served_mass requires an explicit mass_basis')
        return self


class ServiceOutput(BaseModel):
    service_id: UUID
    organization_id: UUID
    site_id: UUID
    delivery_id: Optional[UUID]
    served_count: Optional[int]
    served_mass: Optional[Decimal]
    original_unit: Optional[str]
    mass_basis: Optional[str]
    leftover_event_id: Optional[UUID]
    sampling_frame: Optional[str]
    sample_size: Optional[int]
    sampling_method: Optional[str]
    coverage: Optional[Decimal]
    recorded_at: datetime
    sampling_coverage_status: str
    estimate_note: str


class LinkInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    source_type: str
    source_id: UUID
    target_type: str
    target_id: UUID
    relation_code: str
    quantity: Optional[Mass] = None
    original_unit: Optional[str] = 'kg'
    mass_basis: Optional[str] = None
    occurred_at: AwareDatetime
    note: Optional[Annotated[str, Field(min_length=1, max_length=500)]] = None

    @model_validator(mode='after')
    def quantity_requires_unit_and_basis(self):
        if self.quantity is not None and (not self.original_unit or not self.mass_basis):
            raise ValueError('link quantity requires explicit original_unit and mass_basis')
        return self


class LinkOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    link_id: UUID
    organization_id: UUID
    site_id: UUID
    source_type: str
    source_id: UUID
    target_type: str
    target_id: UUID
    relation_code: str
    quantity: Optional[Decimal]
    original_unit: Optional[str]
    mass_basis: Optional[str]
    occurred_at: datetime
    note: Optional[str]
    recorded_at: datetime


class LineageView(BaseModel):
    object_type: str
    object_id: UUID
    links: list[LinkOutput]
    distinct_source_event_count: int
    note: str


class DispositionInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: UUID
    site_id: UUID
    event_id: UUID
    outcome_type: str
    quantity: Mass
    original_unit: str = 'kg'
    mass_basis: str
    occurred_at: AwareDatetime
    food_safety_status: str
    handover_ref: Optional[ShortRef] = None


class DispositionOutput(BaseModel):
    disposition_id: UUID
    event_id: UUID
    organization_id: UUID
    site_id: UUID
    outcome_type: str
    quantity: Decimal
    original_unit: str
    mass_basis: str
    occurred_at: datetime
    food_safety_status: str
    handover_ref: Optional[str]
    recorded_at: datetime
    allocation_status: str
    allocation_note: str


class BasisAggregation(BaseModel):
    """Blocker-1/2 remediation: mass is available only for single-observation events;
    unresolved selection, missing observations and unit incompatibility are explicit."""
    status: str
    reason: str
    eligible_mass: Optional[Decimal]
    eligible_event_count: int
    raw_observed_mass: Optional[Decimal]
    raw_observation_count: int
    unresolved_event_count: int


class BasisStat(BaseModel):
    mass_basis: str
    event_count: int
    measurement_count: int
    observed_measurement_count: int
    measured_zero_count: int
    estimated_measurement_count: int
    missing_count: int
    not_measured_count: int
    aggregation: BasisAggregation


class DeliveryResidual(BaseModel):
    delivery_id: UUID
    dispatch_quantity: Decimal
    received_quantity: Optional[Decimal]
    difference: Optional[Decimal]
    reconciliation_status: str


class MassReportingView(BaseModel):
    status: str
    reason: str
    reportable_mass: None


class TrendsView(BaseModel):
    site_id: UUID
    date_from: date
    date_to: date
    calculation_version: str
    note: str
    event_counts: dict[str, int]
    mass_reporting: MassReportingView
    per_basis: list[BasisStat]
    completeness: dict[str, int]
    delivery_residuals: list[DeliveryResidual]
    mixed_basis_ratio: dict[str, str]
