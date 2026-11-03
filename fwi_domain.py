"""Minimal synthetic-data domain validation prototype.

Vocabulary in this module is PROVISIONAL and is not an FWI-03 standard.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional


PROVISIONAL_OBSERVATION_STATUSES = {
    "observed",
    "measured_zero",
    "missing",
    "not_measured",
}
PROVISIONAL_MASS_BASES = {
    "raw",
    "after_preparation",
    "cooked",
    "ready_to_eat",
    "as_served",
    "other_documented",
}
PROVISIONAL_UNITS = {"kg"}  # v0.1 limitation; not an FWI final unit standard.


def _decimal(value: object, field: str) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        value_decimal = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{field} must be a decimal") from exc
    if not value_decimal.is_finite():
        raise ValueError(f"{field} must be finite")
    return value_decimal


@dataclass(frozen=True)
class MaterialWasteEvent:
    waste_event_id: str
    organization_id: str
    site_id: str
    occurred_at: datetime
    recorded_at: datetime

    def __post_init__(self) -> None:
        if not self.waste_event_id:
            raise ValueError("waste_event_id is required")
        if not self.organization_id or not self.site_id:
            raise ValueError("organization_id and site_id are required")


@dataclass(frozen=True)
class MeasurementRecord:
    measurement_id: str
    waste_event_id: str
    gross: object = None
    tare: object = None
    net: object = None
    unit: str = "kg"
    mass_basis: Optional[str] = None
    observation_status: str = "observed"
    validation_status: str = "unvalidated"  # PROVISIONAL, separate from observation_status.

    def validate(self, event: Optional[MaterialWasteEvent]) -> "MeasurementRecord":
        if event is None or event.waste_event_id != self.waste_event_id:
            raise ValueError("measurement must reference an existing matching event")
        if not self.measurement_id:
            raise ValueError("measurement_id is required")
        if not self.mass_basis or self.mass_basis not in PROVISIONAL_MASS_BASES:
            raise ValueError("mass_basis is required and must use a provisional allowed value")
        if self.unit not in PROVISIONAL_UNITS:
            raise ValueError("unit must be kg in this provisional v0.1 prototype")
        if self.observation_status not in PROVISIONAL_OBSERVATION_STATUSES:
            raise ValueError("unsupported provisional observation_status")

        gross = _decimal(self.gross, "gross")
        tare = _decimal(self.tare, "tare")
        net = _decimal(self.net, "net")
        if self.observation_status in {"missing", "not_measured"}:
            if any(value is not None for value in (gross, tare, net)):
                raise ValueError("missing/not_measured cannot carry mass values")
            return self
        if gross is None or tare is None:
            raise ValueError("gross and tare are required for an observed measurement")
        if any(value < 0 for value in (gross, tare) if value is not None):
            raise ValueError("gross and tare must be non-negative")
        if gross < tare:
            raise ValueError("gross must be greater than or equal to tare")
        calculated_net = gross - tare
        if net is None:
            raise ValueError("net is required for an observed measurement")
        if net < 0:
            raise ValueError("net must be non-negative")
        if net != calculated_net:
            raise ValueError("net must equal gross minus tare")
        if self.observation_status == "measured_zero" and net != Decimal("0"):
            raise ValueError("measured_zero requires net equal to zero")
        return self


@dataclass(frozen=True)
class ValidationRecord:
    """Minimal validation history, separate from the measurement observation."""

    validation_record_id: str
    measurement_id: str
    validation_status: str  # PROVISIONAL vocabulary; no workflow implied.
    recorded_at: datetime


def repeated_measurements(event: MaterialWasteEvent, measurements: list[MeasurementRecord]) -> list[MeasurementRecord]:
    """Validate and return records; deliberately does not sum or replace them."""
    for measurement in measurements:
        measurement.validate(event)
    return list(measurements)
