"""Provisional P2 candidate API schemas (FR-201/FR-202/FR-203 foundations).

No response model in this module carries a numeric KPI or valuation result:
HELD codes and unmet gates resolve to blocked statuses with reasons.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Optional
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from fwi.api.schemas_demo import Mass, Text

ShortCode = Annotated[str, Field(min_length=1, max_length=16, pattern=r'\S')]


class KpiEntryOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    kpi_code: str
    formula_version: str
    description: str
    design_status: str
    data_readiness_gate: str
    source_doc_revision: str
    effective_at: date
    change_reason: Optional[str]
    recorded_at: datetime


class KpiPreviewOutput(BaseModel):
    """Deliberately value-free: a preview either explains why it is blocked or is absent."""
    kpi_code: str
    formula_version: str
    design_status: str
    status: str
    reason: str
    note: str


class CostReferenceInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: UUID
    site_id: UUID
    scope_type: str
    scope_ref: UUID
    currency: Annotated[str, Field(min_length=3, max_length=3, pattern=r'^[A-Z]{3}$')]
    amount: Optional[Mass] = None  # missing price stays absent; never inferred as Rp0
    unit_basis: Annotated[str, Field(min_length=1, max_length=60, pattern=r'\S')]
    price_source: Text
    price_date: Optional[date] = None
    method_version: Annotated[str, Field(min_length=1, max_length=60, pattern=r'\S')]
    recorded_at: Optional[AwareDatetime] = None  # ignored; server sets recorded_at


class CostReferenceOutput(BaseModel):
    cost_reference_id: UUID
    organization_id: UUID
    site_id: UUID
    scope_type: str
    scope_ref: UUID
    currency: str
    amount: Optional[Decimal]
    unit_basis: str
    price_source: str
    price_date: Optional[date]
    method_version: str
    recorded_at: datetime
    price_availability: str
    note: str


class ValuationBlockedOutput(BaseModel):
    status: str
    reason: str
    method_version: str
    price_availability: str
    note: str


class RecommendationOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    recommendation_id: UUID
    organization_id: UUID
    site_id: UUID
    rule_code: str
    rule_version: str
    target_type: str
    target_ref: UUID
    detected_issue: str
    coverage: str
    recommended_action: str
    state: str
    ack_reason: Optional[str]
    ack_actor: Optional[UUID]
    ack_at: Optional[datetime]
    recorded_at: datetime


class RecommendationAckInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    state: Literal['acknowledged', 'dismissed']
    reason: Annotated[str, Field(min_length=1, max_length=300, pattern=r'\S')]


class RuleDisableInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    site_id: UUID
    disabled: bool


class RuleView(BaseModel):
    rule_code: str
    description: str
    disabled: bool


class InsufficientView(BaseModel):
    rule_code: str
    target_type: str
    target_ref: UUID
    reason: str
    state: str


class EvaluateView(BaseModel):
    site_id: UUID
    rule_version: str
    alerts: list[RecommendationOutput]
    insufficient: list[InsufficientView]
    note: str
