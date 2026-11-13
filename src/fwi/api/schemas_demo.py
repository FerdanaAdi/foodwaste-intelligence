"""Provisional, synthetic-only Demo v0.1 API contract."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from fwi.domain.demo_measurements import validate_demo_measurement

Text = Annotated[str, Field(min_length=1, max_length=1000, pattern=r'\S')]
Mass = Annotated[Decimal, Field(allow_inf_nan=False, ge=0)]


class EventInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: UUID
    site_id: UUID
    event_type: Literal['at_risk_surplus', 'actual_loss_discard']  # demo subset only
    stage_code: Text | None = None
    process_step: Text | None = None
    # operation_date is supplied independently; the server never derives it from
    # occurred_at/recorded_at (PRD EVT-004; timezone policy remains OPEN OD-008).
    operation_date: date | None = None
    # Only the PRD pending-assessment state is supported; no legal verdict inferred.
    regulatory_scope_status: Literal['pending_assessment'] | None = None
    edibility_status: Literal['edible', 'inedible', 'mixed', 'unknown'] | None = None
    classification_source: Text | None = None
    occurred_at: AwareDatetime

    @model_validator(mode='after')
    def classification_provenance(self):
        if (self.regulatory_scope_status is not None or self.edibility_status is not None) and not self.classification_source:
            raise ValueError('classification_source required for recorded classifications')
        return self


class EventOutput(EventInput):
    model_config = ConfigDict(from_attributes=True)
    event_id: UUID
    recorded_at: datetime


class LedgerOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    events: list[EventOutput]
    total: int
    page: int
    page_size: int


class DataQualityRecord(BaseModel):
    event_id: UUID
    event_type: str
    occurred_at: datetime | None
    measurement_ids: list[UUID]
    observation_statuses: list[str]


class DataQualityOutput(BaseModel):
    # Count-only summary: event != measurement, missing != measured_zero,
    # estimated identified separately; no mass aggregation, no KPI output.
    summary: dict
    records: list[DataQualityRecord]


class MasterNamespaceOutput(BaseModel):
    namespace: str
    label: str
    code_count: int


class MasterReferenceOutput(BaseModel):
    reference_id: UUID
    namespace: str
    code: str
    version: int
    status: str
    label: str
    definition: str | None
    supersedes_version: int | None
    changed_by: str
    changed_at: datetime
    note: str | None
    recorded_at: datetime


class MasterHistoryOutput(BaseModel):
    namespace: str
    code: str
    versions: list[MasterReferenceOutput]


class EvidenceInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    target_kind: Literal['event', 'measurement']
    target_id: UUID
    kind: Literal['reference', 'attachment']
    source: Text
    title: Text
    method: Text | None = None
    provenance: Text | None = None
    verification: Literal['unverified', 'needs_review', 'verified'] = 'unverified'
    availability: Literal['available', 'unavailable', 'expired', 'unknown'] = 'unknown'
    # Metadata-only slice: no file bytes, no storage identifiers, no download
    # URLs. storage_ref is never accepted from clients (ADR-005 OPEN).
    note: Text | None = None
    recorded_at: AwareDatetime


class EvidenceOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    evidence_id: UUID
    target_kind: str
    target_id: UUID
    kind: str
    source: str
    title: str
    recorded_by: str
    recorded_at: datetime
    method: str | None
    provenance: str | None
    verification: str
    availability: str
    note: str | None
    recorded_at_system: datetime
    # No storage_ref field: structurally impossible to leak it here (EVD-003).


class ReviewSubmitInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    target_kind: Literal['event', 'measurement']
    target_id: UUID
    reason: Text
    source: Text
    provenance: Text
    # Proposal-only (VAL-003/OD-004 OPEN): proposed values are stored as a
    # snapshot; nothing here applies, approves, or mutates the original record.
    proposed_values: dict | None = None


class ReviewProposalOutput(BaseModel):
    proposal_version: int = 1
    approval_revision: int = 0
    approval_status: Literal["unreviewed","approved_prototype"] = "unreviewed"
    applied: Literal[False] = False
    correction_record_id: UUID
    target_kind: str
    target_id: UUID
    original_values: dict
    proposed_values: dict
    actor_id: str
    recorded_at: datetime
    reason: str
    source: str
    provenance: str
    review_decision_id: UUID | None
    state: str
    recorded_at_system: datetime


class ReviewDecisionOutput(BaseModel):
    review_decision_id: UUID
    target_kind: str
    target_id: UUID
    decision: str
    actor_id: str
    recorded_at: datetime
    rationale: str
    source: str
    provenance: str
    recorded_at_system: datetime


class ReviewSubmitOutput(ReviewDecisionOutput):
    correction_proposal: ReviewProposalOutput | None


class ReviewHistoryOutput(BaseModel):
    target_kind: str
    target_id: UUID
    decisions: list[ReviewDecisionOutput]
    proposals: list[ReviewProposalOutput]


class MeasurementInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    gross: Mass | None = None
    tare: Mass | None = None
    net: Mass | None = None
    original_unit: Text
    mass_basis: Text
    measurement_method: Text
    provenance: Text
    observation_status: Text
    # original_value_lexeme preserves the operator's typed representation (e.g. '2.40')
    # when provided; parsing stays exact and never rewrites this provenance text.
    original_value_lexeme: Text | None = None
    instrument_ref: Text | None = None
    sample_context: Text | None = None
    measured_at: AwareDatetime

    @model_validator(mode='after')
    def validate_mass(self):
        validate_demo_measurement(self.model_dump())
        return self


class MeasurementOutput(MeasurementInput):
    model_config = ConfigDict(from_attributes=True)
    measurement_id: UUID
    event_id: UUID
    recorded_at: datetime
