"""Negative authorization-contract tests for the evidence-metadata core.

Fast, synthetic-only, storage-agnostic: an in-memory fake stands in for the
repository port. No database, no API routes, no new dependencies.
"""

import dataclasses
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest

from fwi.application.evidence import (
    EvidenceAccessDenied,
    EvidenceActionNotPermitted,
    EvidenceMetadataRepository,
    EvidenceRecordNotFound,
    EvidenceMetadataView,
    EvidenceTargetUnresolvable,
    TargetScope,
    TrustedAccessContext,
    resolve_evidence_metadata,
)
from fwi.domain.evidence import EvidenceMetadata

ORG_A = UUID("00000000-0000-0000-0000-00000000000a")
ORG_B = UUID("00000000-0000-0000-0000-00000000000b")
SITE_A1 = UUID("00000000-0000-0000-0000-00000000a001")
SITE_A2 = UUID("00000000-0000-0000-0000-00000000a002")
SITE_B1 = UUID("00000000-0000-0000-0000-00000000b001")
NOW = datetime(2026, 11, 8, 1, 0, 0, tzinfo=timezone.utc)


class CallRecorder:
    def __init__(self):
        self.calls = []


class FakeRepository(EvidenceMetadataRepository):
    """In-memory adapter; also records that denial paths never touch storage."""

    def __init__(self, scopes, evidence_rows, recorder: CallRecorder):
        self._scopes = scopes
        self._evidence = evidence_rows
        self._recorder = recorder

    def resolve_target_scope(self, target_kind, target_id):
        self._recorder.calls.append(("resolve_target_scope", target_kind, target_id))
        return self._scopes.get((target_kind, target_id))

    def find_evidence_metadata(self, target_kind, target_id, evidence_id):
        self._recorder.calls.append(("find_evidence_metadata", target_kind, target_id, evidence_id))
        return self._evidence.get((target_kind, target_id, evidence_id))


def evidence_row(target_id, target_kind="event", **changes):
    values = dict(
        evidence_id="ev-1", target_kind=target_kind, target_id=str(target_id),
        kind="attachment", source="synthetic logbook",
        title="Synthetic logbook entry (fiktif)",
        recorded_by="synthetic-actor",
        recorded_at=NOW, method="synthetic_photo", provenance="synthetic fixture",
        verification="unverified", availability="available",
        storage_ref="internal/synthetic/object.key", note=None,
    )
    values.update(changes)
    return EvidenceMetadata(**values)


def make_context(sites=frozenset({SITE_A1}), org=ORG_A, can_read=True, **changes):
    values = dict(
        principal="synthetic-principal", organization_id=org,
        allowed_site_ids=sites, can_read_evidence=can_read,
    )
    values.update(changes)
    return TrustedAccessContext(**values)


def make_repository(**overrides):
    event_a = uuid4()
    event_foreign = uuid4()
    scopes = {
        ("event", str(event_a)): TargetScope(ORG_A, SITE_A1),
        ("event", str(event_foreign)): TargetScope(ORG_B, SITE_B1),
        ("measurement", "m-1"): TargetScope(ORG_A, SITE_A1),
        ("measurement", "m-2"): TargetScope(ORG_A, SITE_A2),
    }
    rows = {
        ("event", str(event_a), "ev-1"): evidence_row(event_a),
        ("measurement", "m-1", "ev-m1"): evidence_row("m-1", target_kind="measurement"),
        ("event", str(event_a), "ev-unknown-availability"): evidence_row(
            event_a, evidence_id="ev-unknown-availability", availability="unknown"),
        ("event", str(event_a), "ev-verified"): evidence_row(
            event_a, evidence_id="ev-verified", verification="verified"),
    }
    for key, value in overrides.items():
        rows[key] = value
    recorder = CallRecorder()
    return FakeRepository(scopes, rows, recorder), recorder, event_a, event_foreign


def test_authorized_resolve_returns_metadata_without_storage_ref():
    repo, _, event_a, _ = make_repository()
    view = resolve_evidence_metadata(make_context(), repo, "event", str(event_a), "ev-1")
    assert view.evidence_id == "ev-1"
    assert view.target_id == str(event_a)
    assert view.source == "synthetic logbook"
    assert view.title == "Synthetic logbook entry (fiktif)"
    assert view.recorded_by == "synthetic-actor"
    assert view.availability == "available"
    # The view structurally has no storage identifier and no URL field.
    assert "storage_ref" not in view.__dataclass_fields__
    assert "storageRef" not in view.__dataclass_fields__
    assert all("url" not in field for field in view.__dataclass_fields__)
    assert "internal/synthetic" not in repr(view)


def test_missing_context_fails_closed_before_any_repository_access():
    repo, recorder, event_a, _ = make_repository()
    with pytest.raises(EvidenceAccessDenied):
        resolve_evidence_metadata(None, repo, "event", str(event_a), "ev-1")
    assert recorder.calls == []


def test_untrusted_context_type_fails_closed():
    repo, recorder, event_a, _ = make_repository()
    for bad in ({}, "synthetic-principal", make_context().__dict__):
        with pytest.raises(EvidenceAccessDenied):
            resolve_evidence_metadata(bad, repo, "event", str(event_a), "ev-1")
    assert recorder.calls == []


@pytest.mark.parametrize("bad_grant", ["yes", None, 1])
def test_nonboolean_evidence_grant_rejected_at_construction(bad_grant):
    with pytest.raises(ValueError):
        make_context(can_read=bad_grant)


def test_missing_evidence_grant_denied_before_repository_access():
    repo, recorder, event_a, _ = make_repository()
    with pytest.raises(EvidenceAccessDenied):
        resolve_evidence_metadata(make_context(can_read=False), repo, "event", str(event_a), "ev-1")
    assert recorder.calls == []


def test_no_site_membership_denied():
    repo, recorder, event_a, _ = make_repository()
    context = make_context(sites=frozenset())
    with pytest.raises(EvidenceAccessDenied):
        resolve_evidence_metadata(context, repo, "event", str(event_a), "ev-1")
    assert recorder.calls == []


def test_foreign_and_absent_targets_are_indistinguishable():
    # F-03: foreign and absent must map to the SAME typed 404-class exception
    # with the SAME generic message — no message matching, no scope details.
    repo, _, _, event_foreign = make_repository()
    missing_id = str(uuid4())
    with pytest.raises(EvidenceTargetUnresolvable) as foreign:
        resolve_evidence_metadata(make_context(), repo, "event", str(event_foreign), "ev-1")
    with pytest.raises(EvidenceTargetUnresolvable) as absent:
        resolve_evidence_metadata(make_context(), repo, "event", missing_id, "ev-1")
    assert type(foreign.value) is type(absent.value)
    assert str(foreign.value) == str(absent.value) == "evidence reference not found"
    assert foreign.value.http_status == 404
    assert str(ORG_B) not in str(foreign.value)
    assert str(SITE_B1) not in str(foreign.value)
    assert str(event_foreign) not in str(foreign.value)


def test_other_granted_site_within_same_org_is_out_of_scope():
    # Site A2 belongs to ORG_A but was never granted to this principal.
    # Out-of-scope must be indistinguishable from absent (404-class).
    repo, _, _, _ = make_repository()
    with pytest.raises(EvidenceTargetUnresolvable):
        resolve_evidence_metadata(make_context(), repo, "measurement", "m-2", "ev-1")


def test_absent_target_not_found_without_scope_details():
    repo, _, _, _ = make_repository()
    missing_id = str(uuid4())
    with pytest.raises(EvidenceRecordNotFound) as excinfo:
        resolve_evidence_metadata(make_context(), repo, "event", missing_id, "ev-1")
    assert str(missing_id) not in str(excinfo.value)


def test_misbound_evidence_reference_rejected():
    # ev-m1 is bound to measurement m-1; requesting it under a different
    # target identity must not resolve it.
    repo, _, event_a, _ = make_repository()
    with pytest.raises(EvidenceRecordNotFound):
        resolve_evidence_metadata(make_context(), repo, "event", str(event_a), "ev-m1")


def test_absent_evidence_for_authorized_target_not_found():
    repo, _, event_a, _ = make_repository()
    with pytest.raises(EvidenceRecordNotFound):
        resolve_evidence_metadata(make_context(), repo, "event", str(event_a), "no-such")


def test_unknown_availability_stays_unknown_and_never_available():
    repo, _, event_a, _ = make_repository()
    view = resolve_evidence_metadata(
        make_context(), repo, "event", str(event_a), "ev-unknown-availability")
    assert view.availability == "unknown"
    assert view.availability != "available"


def test_verified_evidence_is_not_measurement_approval():
    repo, recorder, event_a, _ = make_repository()
    view = resolve_evidence_metadata(make_context(), repo, "event", str(event_a), "ev-verified")
    assert view.verification == "verified"
    # Verification is metadata review state only: no approval semantics exist
    # on the view, and resolving evidence never writes measurement data.
    assert not any("approv" in field for field in view.__dataclass_fields__)
    assert isinstance(view, EvidenceMetadataView)
    assert all(call[0] in {"resolve_target_scope", "find_evidence_metadata"} for call in recorder.calls)


def test_context_requires_explicit_fields():
    with pytest.raises(ValueError):
        TrustedAccessContext(principal="  ", organization_id=ORG_A,
                             allowed_site_ids=frozenset({SITE_A1}), can_read_evidence=True)
    with pytest.raises(ValueError):
        TrustedAccessContext(principal="p", organization_id="org-a",
                             allowed_site_ids=frozenset({SITE_A1}), can_read_evidence=True)
    with pytest.raises(ValueError):
        TrustedAccessContext(principal="p", organization_id=ORG_A,
                             allowed_site_ids={SITE_A1}, can_read_evidence=True)
    with pytest.raises(ValueError):
        TrustedAccessContext(principal="p", organization_id=ORG_A,
                             allowed_site_ids=frozenset({SITE_A1}), can_read_evidence=1)


# ---------------------------------------------------------------------------
# F-01: source-backed non-empty title contract
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_title", ["", "   ", None, 42, " padded "])
def test_title_must_be_source_backed_non_empty(bad_title):
    with pytest.raises(ValueError):
        evidence_row("evt", title=bad_title)


def test_title_propagates_to_view_and_stays_provisional():
    repo, _, event_a, _ = make_repository()
    view = resolve_evidence_metadata(make_context(), repo, "event", str(event_a), "ev-1")
    assert isinstance(view.title, str) and view.title.strip() == view.title
    assert "title" in EvidenceMetadataView.__dataclass_fields__
    # provisional schema status marker lives on the domain module contract
    import fwi.domain.evidence as evidence_module

    assert "PROVISIONAL" in evidence_module.__doc__


# ---------------------------------------------------------------------------
# F-02: timestamp validation + immutability
# ---------------------------------------------------------------------------


def test_recorded_at_missing_rejected():
    with pytest.raises(ValueError):
        evidence_row("evt", recorded_at=None)


def test_recorded_at_wrong_type_rejected():
    for bad in ("2026-11-08T01:00:00Z", 1731027600, object()):
        with pytest.raises(ValueError):
            evidence_row("evt", recorded_at=bad)


def test_recorded_at_naive_datetime_rejected():
    naive = datetime(2026, 11, 8, 1, 0, 0)  # no tzinfo
    with pytest.raises(ValueError) as excinfo:
        evidence_row("evt", recorded_at=naive)
    assert "timezone-aware" in str(excinfo.value)


def test_recorded_at_tz_aware_accepted():
    aware = datetime(2026, 11, 8, 8, 0, tzinfo=timezone(timedelta(hours=7)))
    row = evidence_row("evt", recorded_at=aware)
    assert row.recorded_at.tzinfo is not None
    assert row.recorded_at.utcoffset() is not None


@pytest.mark.parametrize(
    "frozen_cls",
    [EvidenceMetadata, EvidenceMetadataView, TrustedAccessContext],
    ids=["EvidenceMetadata", "EvidenceMetadataView", "TrustedAccessContext"],
)
def test_frozen_models_reject_mutation(frozen_cls):
    instance = (
        evidence_row("evt")
        if frozen_cls is EvidenceMetadata
        else make_context()
        if frozen_cls is TrustedAccessContext
        else EvidenceMetadataView(
            evidence_id="ev-1", target_kind="event", target_id="t",
            kind="reference", source="s", title="t", recorded_by="a",
            recorded_at=NOW, method=None, provenance=None,
            verification="unverified", availability="unknown", note=None,
        )
    )
    with pytest.raises(dataclasses.FrozenInstanceError):
        instance.recorded_by = "tamper"  # type: ignore[misc]


# ---------------------------------------------------------------------------
# F-03: typed security exceptions
# ---------------------------------------------------------------------------


def test_action_permission_failures_are_typed_403_before_storage():
    repo, recorder, event_a, _ = make_repository()
    for context in (None, "not-a-context", make_context(can_read=False)):
        with pytest.raises(EvidenceActionNotPermitted) as excinfo:
            resolve_evidence_metadata(context, repo, "event", str(event_a), "ev-1")
        assert excinfo.value.http_status == 403
    # no-site-membership is also an action-permission denial
    with pytest.raises(EvidenceActionNotPermitted) as excinfo:
        resolve_evidence_metadata(make_context(sites=frozenset()), repo, "event", str(event_a), "ev-1")
    assert excinfo.value.http_status == 403
    assert recorder.calls == []  # storage never probed when authorization is denied


def test_exception_types_are_distinct_from_message_text():
    # The HTTP layer branches on type; messages alone must not be the contract.
    assert EvidenceActionNotPermitted.http_status == 403
    assert EvidenceTargetUnresolvable.http_status == 404
    from fwi.application.evidence import EvidenceAccessError as Base

    assert issubclass(EvidenceActionNotPermitted, Base)
    assert issubclass(EvidenceTargetUnresolvable, Base)
    # backward-compatible aliases point at the same typed classes
    assert EvidenceAccessDenied is EvidenceActionNotPermitted
    assert EvidenceRecordNotFound is EvidenceTargetUnresolvable


def test_unsupported_target_kind_rejected_before_repository_operations():
    repo, recorder, event_a, _ = make_repository()
    for bad_kind in ("ledger", "site", "", "EVENT"):
        with pytest.raises(ValueError):
            resolve_evidence_metadata(make_context(), repo, bad_kind, str(event_a), "ev-1")
    assert recorder.calls == []


def test_event_and_measurement_target_identity_stay_separate():
    repo, _, _, _ = make_repository()
    # same evidence id bound to a measurement must not resolve under event kind
    with pytest.raises(EvidenceTargetUnresolvable):
        resolve_evidence_metadata(make_context(), repo, "event", "m-1", "ev-m1")
    view = resolve_evidence_metadata(make_context(), repo, "measurement", "m-1", "ev-m1")
    assert view.target_kind == "measurement"
    assert view.target_id == "m-1"
