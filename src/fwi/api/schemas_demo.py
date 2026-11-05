"""Provisional, synthetic-only Demo v0.1 API contract."""

from datetime import datetime
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
    occurred_at: AwareDatetime


class EventOutput(EventInput):
    model_config = ConfigDict(from_attributes=True)
    event_id: UUID
    recorded_at: datetime


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
