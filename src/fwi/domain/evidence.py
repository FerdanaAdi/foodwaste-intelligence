"""FR-005 evidence/provenance domain concepts (PROVISIONAL vocabulary).

Evidence is metadata ABOUT an attachment/reference. It is a concept distinct
from WasteEvent, Measurement and Validation (PRD v0.1 invariant 7; FWI-ARCH-001
§5.5/§6.6). The final Evidence schema, storage provider, retention policy and
formal approval semantics remain OPEN (ADR-005 not written); nothing here
freezes a physical schema or a storage decision.

Invariants enforced by this module:
- An evidence record always names exactly one associated event or measurement
  identity. It is never attached to "the ledger" in general.
- ``title`` is a required, source-backed, non-empty human label. It must be
  transcribed from the evidence source (or supplied verbatim by the recording
  actor); this module never fabricates or derives one. (F-01, EVID-01A
  frontend contract: ``title: string`` is required there too.)
- ``recorded_at`` must be an explicit timezone-aware datetime. Missing,
  mistyped and naive timestamps are rejected at construction (F-02).
- Presence, absence or verification state of evidence never changes a
  measurement value or its quality status; absence of evidence is not a
  missing/zero measurement (FWI-03 measurement semantics).
- ``verified`` evidence is NOT an approved measurement. Verification is a
  metadata-level review state only.
- ``storage_ref`` is an opaque internal storage binding; it must never be
  exposed or turned into a public URL (see fwi.application.evidence).
"""

from dataclasses import dataclass
from datetime import datetime

PROVISIONAL_TARGET_KINDS = ("event", "measurement")
PROVISIONAL_EVIDENCE_KINDS = ("reference", "attachment")
PROVISIONAL_AVAILABILITY = ("available", "unavailable", "expired", "unknown")
PROVISIONAL_VERIFICATION = ("unverified", "needs_review", "verified")


def _require_non_empty_text(value: str, field_name: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    if not value.strip():
        raise ValueError(f"{field_name} must be a non-empty, source-backed string")
    if value != value.strip():
        raise ValueError(f"{field_name} must not have leading/trailing whitespace")
    return value


def _require_aware_datetime(value: datetime, field_name: str) -> datetime:
    """Reject missing, mistyped and naive timestamps (F-02)."""
    if value is None:
        raise ValueError(f"{field_name} is required")
    if not isinstance(value, datetime):
        raise ValueError(f"{field_name} must be a datetime")
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must be timezone-aware (naive datetimes rejected)")
    return value


@dataclass(frozen=True)
class EvidenceMetadata:
    """Domain evidence metadata for one associated event/measurement identity.

    ``storage_ref`` is an opaque storage identifier for attachments. It is an
    internal infrastructure binding: application code must never expose it in
    user-facing output and must never derive a public artifact URL from it.
    """

    evidence_id: str
    target_kind: str
    target_id: str
    kind: str
    source: str
    title: str
    recorded_by: str
    recorded_at: datetime
    method: str | None = None
    provenance: str | None = None
    verification: str = "unverified"
    availability: str = "unknown"
    storage_ref: str | None = None
    note: str | None = None

    def __post_init__(self) -> None:
        if not self.evidence_id:
            raise ValueError("evidence_id is required")
        if self.target_kind not in PROVISIONAL_TARGET_KINDS:
            raise ValueError("target_kind must be 'event' or 'measurement'")
        if not self.target_id:
            raise ValueError("target_id is required")
        if self.kind not in PROVISIONAL_EVIDENCE_KINDS:
            raise ValueError("kind must be 'reference' or 'attachment'")
        if not self.source:
            raise ValueError("source is required")
        # F-01: source-backed, non-empty title; never fabricated here.
        _require_non_empty_text(self.title, "title")
        if not self.recorded_by:
            raise ValueError("recorded_by is required")
        # F-02: explicit timezone-aware timestamp only.
        _require_aware_datetime(self.recorded_at, "recorded_at")
        if self.verification not in PROVISIONAL_VERIFICATION:
            raise ValueError("verification must be a provisional verification state")
        if self.availability not in PROVISIONAL_AVAILABILITY:
            raise ValueError("availability must be a provisional availability state")
