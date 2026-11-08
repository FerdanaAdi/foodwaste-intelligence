"""Persistent data-quality read-model core (FR-007, FWI-DQ-API-01A).

Pure application-layer module: no SQLAlchemy, no HTTP, no permissions.
It consumes event/measurement snapshots already supplied by the caller
(e.g. dicts produced by ``application.demo.snapshot`` or a future
authenticated read adapter) and derives count-only views.

Domain invariants preserved:
- one stable event identity; event counts never multiply through
  repeated measurements (event != measurement);
- observation statuses observed / measured_zero / missing / not_measured
  and estimated remain fully distinguishable; missing is never zero;
- needs_review + flagged are reported as ``needs_attention`` only —
  no canonical "blocked" status is invented (mapping gap stays OPEN);
- units, mass basis, measurement method and provenance pass through
  verbatim; no mass aggregation, conversion, or KPI computation
  (OP-08, FI-02, NI-03 stay HELD);
- inconsistent event/measurement site relationships are rejected, not
  silently coerced.

OPEN (source-unavailable at this baseline):
- stage/operation_date/material_category fields are not present in the
  persistent demo schema, so no stage filter is offered yet;
- validation_status is optional input; the persistent model has no such
  column, so needs_attention counts only records that carry it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

OBSERVATION_STATUSES = ("observed", "measured_zero", "estimated", "missing", "not_measured")
VALIDATION_STATUSES = ("unvalidated", "needs_review", "flagged")
NEEDS_ATTENTION_STATUSES = ("needs_review", "flagged")

_EVENT_REQUIRED_KEYS = ("event_id", "organization_id", "site_id", "occurred_at")
_MEASUREMENT_REQUIRED_KEYS = (
    "measurement_id",
    "event_id",
    "original_unit",
    "mass_basis",
    "measurement_method",
    "provenance",
    "observation_status",
)


class DqInputError(ValueError):
    """Raised for inconsistent or malformed snapshot input."""


@dataclass(frozen=True)
class DataQualityFilters:
    """Explicit site and period filters. None = unfiltered."""

    site_id: str | None = None
    occurred_from: datetime | None = None
    occurred_to: datetime | None = None


@dataclass(frozen=True)
class MeasurementView:
    """One measurement record with lineage passthrough — never aggregated."""

    measurement_id: str
    event_id: str
    observation_status: str
    original_unit: str
    mass_basis: str
    measurement_method: str
    provenance: str
    validation_status: str | None
    measured_at: datetime | None
    recorded_at: datetime | None
    site_id: str | None
    raw: dict


@dataclass(frozen=True)
class EventRecord:
    """One event with its 0..n measurements (stable event identity)."""

    event: dict
    measurements: tuple[MeasurementView, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class DataQualitySummary:
    """Count-only summary. Contains no mass values and no KPI figures."""

    event_count: int
    measurement_count: int
    observation_counts: dict[str, int]
    validation_counts: dict[str, int]
    missing_count: int  # missing + not_measured, never counted as zero
    needs_attention_count: int  # needs_review + flagged, if statuses supplied
    unmeasured_event_count: int
    estimated_count: int


@dataclass(frozen=True)
class DataQualityView:
    summary: DataQualitySummary
    records: tuple[EventRecord, ...]


def _as_datetime(value: object, field_name: str) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    raise DqInputError(f"{field_name} must be a datetime, got {type(value).__name__}")


def _required(snapshot: dict, keys: tuple[str, ...], kind: str) -> None:
    if not isinstance(snapshot, dict):
        raise DqInputError(f"{kind} snapshot must be a mapping")
    missing = [key for key in keys if snapshot.get(key) in (None, "")]
    if missing:
        raise DqInputError(f"{kind} snapshot is missing required fields: {', '.join(missing)}")


def _matches_period(occurred_at: datetime, filters: DataQualityFilters) -> bool:
    if filters.occurred_from is not None and occurred_at < filters.occurred_from:
        return False
    if filters.occurred_to is not None and occurred_at > filters.occurred_to:
        return False
    return True


def build_data_quality_view(
    events: list[dict],
    measurements: list[dict],
    filters: DataQualityFilters | None = None,
) -> DataQualityView:
    """Derive a count-only data-quality view from supplied snapshots.

    Raises :class:`DqInputError` for duplicate identifiers, measurements
    referencing unknown events, or measurement site ids that disagree
    with their event's site.
    """
    filters = filters or DataQualityFilters()

    events_by_id: dict[str, dict] = {}
    for event in events:
        _required(event, _EVENT_REQUIRED_KEYS, "event")
        event_id = str(event["event_id"])
        if event_id in events_by_id:
            raise DqInputError(f"duplicate event_id in input: {event_id}")
        events_by_id[event_id] = event

    measurements_by_event: dict[str, list[MeasurementView]] = {}
    seen_measurement_ids: set[str] = set()
    for measurement in measurements:
        _required(measurement, _MEASUREMENT_REQUIRED_KEYS, "measurement")
        measurement_id = str(measurement["measurement_id"])
        if measurement_id in seen_measurement_ids:
            raise DqInputError(f"duplicate measurement_id in input: {measurement_id}")
        seen_measurement_ids.add(measurement_id)

        event_id = str(measurement["event_id"])
        event = events_by_id.get(event_id)
        if event is None:
            raise DqInputError(f"measurement {measurement_id} references unknown event {event_id}")

        status = measurement["observation_status"]
        if status not in OBSERVATION_STATUSES:
            raise DqInputError(f"measurement {measurement_id} has unknown observation_status: {status}")

        measurement_site = measurement.get("site_id")
        event_site = str(event["site_id"])
        if measurement_site is not None and str(measurement_site) != event_site:
            raise DqInputError(
                f"measurement {measurement_id} site {measurement_site} does not match event {event_id} site {event_site}"
            )

        validation_status = measurement.get("validation_status")
        if validation_status is not None and validation_status not in VALIDATION_STATUSES:
            raise DqInputError(f"measurement {measurement_id} has unknown validation_status: {validation_status}")

        view = MeasurementView(
            measurement_id=measurement_id,
            event_id=event_id,
            observation_status=status,
            original_unit=str(measurement["original_unit"]),
            mass_basis=str(measurement["mass_basis"]),
            measurement_method=str(measurement["measurement_method"]),
            provenance=str(measurement["provenance"]),
            validation_status=validation_status,
            measured_at=_as_datetime(measurement.get("measured_at"), "measured_at"),
            recorded_at=_as_datetime(measurement.get("recorded_at"), "recorded_at"),
            site_id=str(measurement_site) if measurement_site is not None else None,
            raw=dict(measurement),
        )
        measurements_by_event.setdefault(event_id, []).append(view)

    records: list[EventRecord] = []
    for event_id, event in events_by_id.items():
        if filters.site_id is not None and str(event["site_id"]) != str(filters.site_id):
            continue
        occurred_at = _as_datetime(event["occurred_at"], "occurred_at")
        assert occurred_at is not None  # guaranteed by _required
        if not _matches_period(occurred_at, filters):
            continue
        # Stable ordering for reproducible drilldown; never summed.
        ordered = sorted(
            measurements_by_event.get(event_id, []),
            key=lambda m: (m.measured_at is None, m.measured_at or occurred_at, m.measurement_id),
        )
        records.append(EventRecord(event=dict(event), measurements=tuple(ordered)))

    records.sort(key=lambda r: str(r.event["event_id"]))

    observation_counts = {status: 0 for status in OBSERVATION_STATUSES}
    validation_counts = {status: 0 for status in VALIDATION_STATUSES}
    measurement_count = 0
    for record in records:
        for measurement in record.measurements:
            measurement_count += 1
            observation_counts[measurement.observation_status] += 1
            if measurement.validation_status is not None:
                validation_counts[measurement.validation_status] += 1

    summary = DataQualitySummary(
        event_count=len(records),
        measurement_count=measurement_count,
        observation_counts=observation_counts,
        validation_counts=validation_counts,
        missing_count=observation_counts["missing"] + observation_counts["not_measured"],
        needs_attention_count=sum(validation_counts[s] for s in NEEDS_ATTENTION_STATUSES),
        unmeasured_event_count=sum(1 for r in records if not r.measurements),
        estimated_count=observation_counts["estimated"],
    )
    return DataQualityView(summary=summary, records=tuple(records))
