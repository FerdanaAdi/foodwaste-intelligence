"""Evidence-metadata application core (FR-005, AC-10) — strict fail-closed.

Minimal, reusable, storage-agnostic resolver for evidence metadata. Deliberate
non-goals (still OPEN, not invented here): physical schema/migration, storage
provider and retention (ADR-005), public endpoints, artifact retrieval, upload.

Fail-closed contract:
- A trusted, server-supplied :class:`TrustedAccessContext` is REQUIRED before
  any metadata is resolved. This type must only be constructed by server-side
  session/authorization resolution (ADR-004 §5); never from client-supplied
  fields, headers or body values.
- Absent context, missing action grant, or unknown authorization state deny
  access without touching evidence contents.
- Foreign-site or out-of-scope targets are rejected with a generic message
  that leaks no scope details. Mapping exceptions to identical HTTP responses
  (absent vs foreign, per SEC-D03) is the API layer's responsibility.
- Availability "unknown" is reported as unknown; it is never presented as
  available and never yields artifact access.
- The public :class:`EvidenceMetadataView` structurally excludes
  ``storage_ref``: it has no such field, so no code path can leak it, and no
  public artifact URL is ever generated from a storage identifier.
- Verified evidence is metadata review state only; it never marks a
  measurement approved and never mutates measurement data.

Security exception classification (F-03, typed — the future HTTP layer maps
exception TYPE, never exception message text):
- :class:`EvidenceActionNotPermitted` (``http_status = 403``): missing/invalid
  trusted context, missing evidence-read grant, or no site membership at all.
  Raised BEFORE any repository/storage access (fail-closed, no probing).
- :class:`EvidenceTargetUnresolvable` (``http_status = 404``): absent target,
  foreign-site/out-of-scope target, misbound or absent evidence. Foreign and
  absent are DELIBERATELY indistinguishable: same class, same generic message.

Frontend storageRef warning mismatch (documented only; EVID-01A frontend is
out of scope for this task): EVID-01A's ``EvidenceDetail.tsx`` renders a
warning when ``kind === "attachment" && !item.storageRef``, and its fixture
type marks ``storageRef`` optional. Backend-backed views can never satisfy
that condition because :class:`EvidenceMetadataView` structurally has no
storage field — so for real backend data that warning would always render.
Fixture-driven frontend data masks this. The mismatch must be resolved in a
frontend task (drop the storageRef warning; title/availability are the
user-facing fields), NOT by exposing storage identifiers here. No actual
storage_ref value is quoted anywhere in this documentation.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from fwi.domain.evidence import PROVISIONAL_TARGET_KINDS, EvidenceMetadata


class EvidenceAccessError(Exception):
    """Base class: generic messages only; never include scope identifiers.

    Consumers must branch on exception TYPE (and may read ``http_status``);
    matching on message text is forbidden by contract.
    """

    http_status: int


class EvidenceActionNotPermitted(EvidenceAccessError):
    """Missing action permission or context. Maps to a generic HTTP 403."""

    http_status = 403


class EvidenceTargetUnresolvable(EvidenceAccessError):
    """Foreign or absent target — indistinguishable by design (HTTP 404)."""

    http_status = 404


# Backward-compatible names for the pre-F-03 API; same classes, so existing
# callers and tests keep working while the HTTP layer adopts the typed names.
EvidenceAccessDenied = EvidenceActionNotPermitted
EvidenceRecordNotFound = EvidenceTargetUnresolvable


@dataclass(frozen=True)
class TrustedAccessContext:
    """Server-resolved principal scope. Trust boundary: constructor input.

    ``allowed_site_ids`` is an explicit grant set (ADR-004 §5, SEC-D06):
    no membership implies global access; an empty set means no site access.
    """

    principal: str
    organization_id: UUID
    allowed_site_ids: frozenset[UUID]
    can_read_evidence: bool

    def __post_init__(self) -> None:
        if not isinstance(self.principal, str) or not self.principal.strip():
            raise ValueError("principal is required")
        if not isinstance(self.organization_id, UUID):
            raise ValueError("organization_id must be a UUID")
        if not isinstance(self.allowed_site_ids, frozenset) or not all(
            isinstance(site_id, UUID) for site_id in self.allowed_site_ids
        ):
            raise ValueError("allowed_site_ids must be a frozenset of UUIDs")
        if not isinstance(self.can_read_evidence, bool):
            raise ValueError("can_read_evidence must be an explicit boolean")


@dataclass(frozen=True)
class TargetScope:
    """Where an event/measurement record lives (organization + site)."""

    organization_id: UUID
    site_id: UUID


class EvidenceMetadataRepository(Protocol):
    """Storage-agnostic read port. Implementations own persistence details."""

    def resolve_target_scope(self, target_kind: str, target_id: str) -> TargetScope | None:
        """Return the scope of the named event/measurement, or None if absent."""
        ...

    def find_evidence_metadata(
        self, target_kind: str, target_id: str, evidence_id: str
    ) -> EvidenceMetadata | None:
        """Return evidence metadata bound to exactly this target, or None."""
        ...


@dataclass(frozen=True)
class EvidenceMetadataView:
    """User-facing evidence metadata. No storage_ref field, by construction."""

    evidence_id: str
    target_kind: str
    target_id: str
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


def resolve_evidence_metadata(
    context: TrustedAccessContext | None,
    repository: EvidenceMetadataRepository,
    target_kind: str,
    target_id: str,
    evidence_id: str,
) -> EvidenceMetadataView:
    """Resolve one evidence metadata record under a trusted context.

    Denies before any repository access when the context is missing/invalid or
    lacks the explicit evidence-read grant (403-class, no storage probing).
    Unsupported ``target_kind`` is rejected before repository operations.
    Foreign/absent targets raise the same 404-class exception with the same
    generic message (indistinguishable). Unknown availability stays unknown
    (fail-closed display), never available.
    """
    if not isinstance(context, TrustedAccessContext):
        raise EvidenceActionNotPermitted("authorization context required")
    if not context.can_read_evidence:
        raise EvidenceActionNotPermitted("evidence read not permitted")
    if not context.allowed_site_ids:
        # No membership means no records: deny without probing storage.
        raise EvidenceActionNotPermitted("evidence reference not accessible")

    # Reject unsupported target_kind before any repository operation.
    if target_kind not in PROVISIONAL_TARGET_KINDS:
        raise ValueError("unsupported target_kind")

    scope = repository.resolve_target_scope(target_kind, target_id)
    if scope is None:
        raise EvidenceTargetUnresolvable("evidence reference not found")
    if scope.organization_id != context.organization_id or scope.site_id not in context.allowed_site_ids:
        # Foreign/out-of-scope: indistinguishable from an absent target.
        raise EvidenceTargetUnresolvable("evidence reference not found")

    record = repository.find_evidence_metadata(target_kind, target_id, evidence_id)
    if record is None or record.target_kind != target_kind or record.target_id != target_id:
        raise EvidenceTargetUnresolvable("evidence reference not found")

    return EvidenceMetadataView(
        evidence_id=record.evidence_id,
        target_kind=record.target_kind,
        target_id=record.target_id,
        kind=record.kind,
        source=record.source,
        title=record.title,
        recorded_by=record.recorded_by,
        recorded_at=record.recorded_at,
        method=record.method,
        provenance=record.provenance,
        verification=record.verification,
        availability=record.availability,
        note=record.note,
    )
