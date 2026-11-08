"""Tests for the FR-007 data-quality read-model core (FWI-DQ-API-01A).

Synthetic records only. No database, no HTTP, no permissions — the core
consumes supplied snapshots, mirroring what a persistent read adapter
would pass in.
"""

from datetime import datetime, timezone

import pytest

from fwi.application.dataquality import (
    DqInputError,
    DataQualityFilters,
    build_data_quality_view,
)


def occurred(day: int, hour: int = 8) -> datetime:
    return datetime(2026, 11, day, hour, 0, tzinfo=timezone.utc)


def event(event_id: str, site_id: str = "SITE-A", day: int = 2, **extra) -> dict:
    return {
        "event_id": event_id,
        "organization_id": "ORG-1",
        "site_id": site_id,
        "event_type": "actual_loss_discard",
        "occurred_at": occurred(day),
        "recorded_at": occurred(day, 9),
        **extra,
    }


def measurement(measurement_id: str, event_id: str, status: str, **extra) -> dict:
    values = {
        "measurement_id": measurement_id,
        "event_id": event_id,
        "gross": "2.20" if status != "missing" else None,
        "tare": "0.40" if status != "missing" else None,
        "net": "1.80" if status == "observed" else ("0" if status == "measured_zero" else ("0.50" if status == "estimated" else None)),
        "original_unit": "kg",
        "mass_basis": "cooked",
        "measurement_method": "digital_scale",
        "provenance": "demo weighing (fiktif)",
        "observation_status": status,
        "measured_at": occurred(2, 10),
        "recorded_at": occurred(2, 11),
        **extra,
    }
    return values


def base_fixtures():
    events = [
        event("EVT-1", "SITE-A", day=2),
        event("EVT-2", "SITE-B", day=3),
        event("EVT-3", "SITE-A", day=4),  # intentionally unmeasured
    ]
    measurements = [
        measurement("M-1", "EVT-1", "observed"),
        # repeated measurement on the SAME event (not a new event)
        measurement("M-2", "EVT-1", "observed", measured_at=occurred(2, 12)),
        measurement("M-3", "EVT-1", "estimated", mass_basis="raw"),
        measurement("M-4", "EVT-2", "measured_zero", gross="0", tare="0", net="0"),
        measurement("M-5", "EVT-2", "missing", gross=None, tare=None, net=None),
        measurement(
            "M-6", "EVT-2", "not_measured", gross=None, tare=None, net=None,
            validation_status="flagged",
        ),
    ]
    return events, measurements


class TestStableCounts:
    def test_event_count_is_stable_under_repeated_measurements(self):
        events, measurements = base_fixtures()
        view = build_data_quality_view(events, measurements)
        assert view.summary.event_count == 3
        assert view.summary.measurement_count == 6
        # The repeated event still carries exactly its own measurements,
        # ordered by measured_at then measurement_id (M-2 was measured later).
        evt1 = next(r for r in view.records if r.event["event_id"] == "EVT-1")
        assert [m.measurement_id for m in evt1.measurements] == ["M-1", "M-3", "M-2"]

    def test_observation_statuses_remain_distinguishable(self):
        events, measurements = base_fixtures()
        counts = build_data_quality_view(events, measurements).summary.observation_counts
        assert counts == {
            "observed": 2,
            "measured_zero": 1,
            "estimated": 1,
            "missing": 1,
            "not_measured": 1,
        }

    def test_missing_count_never_treats_missing_or_not_measured_as_zero(self):
        events, measurements = base_fixtures()
        summary = build_data_quality_view(events, measurements).summary
        assert summary.missing_count == 2
        assert summary.observation_counts["measured_zero"] == 1
        assert summary.missing_count != summary.observation_counts["measured_zero"]

    def test_estimated_is_counted_separately(self):
        events, measurements = base_fixtures()
        assert build_data_quality_view(events, measurements).summary.estimated_count == 1

    def test_unmeasured_events_keep_their_identity(self):
        events, measurements = base_fixtures()
        view = build_data_quality_view(events, measurements)
        assert view.summary.unmeasured_event_count == 1
        evt3 = next(r for r in view.records if r.event["event_id"] == "EVT-3")
        assert evt3.measurements == ()


class TestNeedsAttention:
    def test_needs_attention_counts_needs_review_and_flagged_only(self):
        events, measurements = base_fixtures()
        extra = [measurement("M-7", "EVT-1", "observed", validation_status="needs_review")]
        summary = build_data_quality_view(events, measurements + extra).summary
        assert summary.needs_attention_count == 2
        assert summary.validation_counts == {"unvalidated": 0, "needs_review": 1, "flagged": 1}

    def test_no_blocked_status_is_invented(self):
        events, measurements = base_fixtures()
        summary = build_data_quality_view(events, measurements).summary
        assert set(summary.validation_counts) == {"unvalidated", "needs_review", "flagged"}

    def test_measurements_without_validation_status_do_not_feed_needs_attention(self):
        events, measurements = base_fixtures()
        summary = build_data_quality_view(events, measurements).summary
        assert summary.needs_attention_count == 1  # only the flagged M-6


class TestFilters:
    def test_site_filter_selects_only_that_site(self):
        events, measurements = base_fixtures()
        view = build_data_quality_view(events, measurements, DataQualityFilters(site_id="SITE-A"))
        assert view.summary.event_count == 2
        assert all(r.event["site_id"] == "SITE-A" for r in view.records)
        assert view.summary.measurement_count == 3  # M-1, M-2, M-3

    def test_period_filter_is_inclusive_on_occurred_at(self):
        events, measurements = base_fixtures()
        view = build_data_quality_view(
            events, measurements,
            DataQualityFilters(occurred_from=occurred(2), occurred_to=occurred(3)),
        )
        assert {r.event["event_id"] for r in view.records} == {"EVT-1", "EVT-2"}

    def test_combined_filters_are_conjunctive(self):
        events, measurements = base_fixtures()
        view = build_data_quality_view(
            events, measurements,
            DataQualityFilters(site_id="SITE-A", occurred_from=occurred(4)),
        )
        assert [r.event["event_id"] for r in view.records] == ["EVT-3"]
        assert view.summary.measurement_count == 0

    def test_empty_result_set_is_valid(self):
        view = build_data_quality_view(
            base_fixtures()[0], base_fixtures()[1],
            DataQualityFilters(site_id="SITE-UNKNOWN"),
        )
        assert view.records == ()
        assert view.summary.event_count == 0
        assert view.summary.measurement_count == 0
        assert view.summary.missing_count == 0


class TestRejection:
    def test_measurement_with_unknown_event_is_rejected(self):
        events, measurements = base_fixtures()
        orphan = measurement("M-X", "EVT-UNKNOWN", "observed")
        with pytest.raises(DqInputError, match="unknown event"):
            build_data_quality_view(events, measurements + [orphan])

    def test_inconsistent_cross_site_measurement_is_rejected(self):
        events, _ = base_fixtures()
        cross_site = measurement("M-X", "EVT-1", "observed", site_id="SITE-B")
        with pytest.raises(DqInputError, match="does not match event"):
            build_data_quality_view(events, [cross_site])

    def test_consistent_measurement_site_is_accepted(self):
        events, _ = base_fixtures()
        consistent = measurement("M-X", "EVT-1", "observed", site_id="SITE-A")
        view = build_data_quality_view(events, [consistent])
        assert view.summary.measurement_count == 1

    def test_duplicate_event_ids_are_rejected(self):
        events, _ = base_fixtures()
        with pytest.raises(DqInputError, match="duplicate event_id"):
            build_data_quality_view(events + [event("EVT-1", "SITE-B")], [])

    def test_duplicate_measurement_ids_are_rejected(self):
        events, measurements = base_fixtures()
        with pytest.raises(DqInputError, match="duplicate measurement_id"):
            build_data_quality_view(events, measurements + [measurement("M-1", "EVT-2", "observed")])

    def test_unknown_observation_status_is_rejected(self):
        events, _ = base_fixtures()
        with pytest.raises(DqInputError, match="unknown observation_status"):
            build_data_quality_view(events, [measurement("M-X", "EVT-1", "zeroed")])

    def test_unknown_validation_status_is_rejected(self):
        events, _ = base_fixtures()
        with pytest.raises(DqInputError, match="unknown validation_status"):
            build_data_quality_view(events, [measurement("M-X", "EVT-1", "observed", validation_status="blocked")])

    def test_missing_required_fields_are_rejected(self):
        with pytest.raises(DqInputError, match="missing required fields"):
            build_data_quality_view([{"event_id": "EVT-1"}], [])


class TestLineagePassthrough:
    def test_units_basis_method_provenance_pass_through_verbatim(self):
        events, measurements = base_fixtures()
        view = build_data_quality_view(events, measurements)
        evt1 = next(r for r in view.records if r.event["event_id"] == "EVT-1")
        raw_basis = next(m for m in evt1.measurements if m.measurement_id == "M-3")
        assert raw_basis.original_unit == "kg"
        assert raw_basis.mass_basis == "raw"
        assert raw_basis.measurement_method == "digital_scale"
        assert raw_basis.provenance == "demo weighing (fiktif)"

    def test_drilldown_identifiers_are_safe_and_stable(self):
        events, measurements = base_fixtures()
        view = build_data_quality_view(events, measurements)
        assert [r.event["event_id"] for r in view.records] == ["EVT-1", "EVT-2", "EVT-3"]
        evt2 = next(r for r in view.records if r.event["event_id"] == "EVT-2")
        assert all(m.event_id == "EVT-2" for m in evt2.measurements)
        assert evt2.event["organization_id"] == "ORG-1"
        assert evt2.event["site_id"] == "SITE-B"

    def test_view_contains_no_mass_aggregation_or_kpi_fields(self):
        events, measurements = base_fixtures()
        view = build_data_quality_view(events, measurements)
        summary_dict = vars(view.summary)
        assert not any("mass" in key or "kg" in key for key in summary_dict)
        assert not any(key.upper() in {"OP_08", "FI_02", "NI_03"} for key in summary_dict)
        # Raw measurement snapshots remain available for drilldown, unmodified.
        evt1 = next(r for r in view.records if r.event["event_id"] == "EVT-1")
        assert evt1.measurements[0].raw["net"] == "1.80"
