"""Reversible Demo v0.1 mappings, not an approved production schema."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (Boolean, CheckConstraint, Date, DateTime, ForeignKey, ForeignKeyConstraint,
                        Index, Integer, Numeric, String, UniqueConstraint, Uuid)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"
    organization_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Site(Base):
    __tablename__ = "sites"
    __table_args__ = (UniqueConstraint("site_id", "organization_id"),)
    site_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.organization_id"))
    name: Mapped[str] = mapped_column(String)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class WasteEvent(Base):
    __tablename__ = "waste_events"
    __table_args__ = (ForeignKeyConstraint(
        ["site_id", "organization_id"], ["sites.site_id", "sites.organization_id"]),
        CheckConstraint("event_type IN ('at_risk_surplus', 'actual_loss_discard')", name="event_demo_type"),
        CheckConstraint("regulatory_scope_status IS NULL OR regulatory_scope_status = 'pending_assessment'", name="event_regulatory_pending"),
        CheckConstraint("edibility_status IS NULL OR edibility_status IN ('edible','inedible','mixed','unknown')", name="event_edibility_source"),
        CheckConstraint("(regulatory_scope_status IS NULL AND edibility_status IS NULL) OR (classification_source IS NOT NULL AND length(trim(classification_source)) > 0)", name="event_classification_source"))
    event_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.organization_id"))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    event_type: Mapped[str] = mapped_column(String)
    stage_code: Mapped[str | None] = mapped_column(String)
    process_step: Mapped[str | None] = mapped_column(String)
    operation_date: Mapped[date | None] = mapped_column(Date)
    regulatory_scope_status: Mapped[str | None] = mapped_column(String)
    edibility_status: Mapped[str | None] = mapped_column(String)
    classification_source: Mapped[str | None] = mapped_column(String)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (
        CheckConstraint("original_unit = 'kg'", name="measurement_demo_unit"),
        CheckConstraint("observation_status IN ('observed', 'measured_zero', 'estimated', 'missing', 'not_measured')", name="measurement_demo_status"),
        CheckConstraint("(observation_status IN ('missing', 'not_measured') AND gross IS NULL AND tare IS NULL AND net IS NULL) OR (observation_status IN ('observed', 'measured_zero', 'estimated') AND gross IS NOT NULL AND tare IS NOT NULL AND net IS NOT NULL)", name="measurement_missing_values"),
        CheckConstraint("gross >= 0 AND tare >= 0 AND net >= 0 AND gross >= tare AND net = gross - tare", name="measurement_mass_consistency"),
        CheckConstraint("gross NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) AND tare NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) AND net NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)", name="measurement_finite"),
        CheckConstraint("observation_status <> 'measured_zero' OR net = 0", name="measurement_zero"),
    )
    measurement_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    event_id: Mapped[UUID] = mapped_column(ForeignKey("waste_events.event_id"), index=True)
    gross: Mapped[Decimal | None] = mapped_column(Numeric)
    tare: Mapped[Decimal | None] = mapped_column(Numeric)
    net: Mapped[Decimal | None] = mapped_column(Numeric)
    original_unit: Mapped[str] = mapped_column(String)
    mass_basis: Mapped[str] = mapped_column(String)
    measurement_method: Mapped[str] = mapped_column(String)
    provenance: Mapped[str] = mapped_column(String)
    observation_status: Mapped[str] = mapped_column(String)
    original_value_lexeme: Mapped[str | None] = mapped_column(String)
    instrument_ref: Mapped[str | None] = mapped_column(String)
    sample_context: Mapped[str | None] = mapped_column(String)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MasterReference(Base):
    """Append-only versioned reference row; values come only from approved sources."""
    __tablename__ = "master_references"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'inactive')", name="master_reference_status"),
        CheckConstraint("version >= 1", name="master_reference_version"),
        CheckConstraint("supersedes_version IS NULL OR supersedes_version < version", name="master_reference_supersedes"),
        UniqueConstraint("namespace", "code", "version"),
    )
    reference_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    namespace: Mapped[str] = mapped_column(String)
    code: Mapped[str] = mapped_column(String)
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String)
    label: Mapped[str] = mapped_column(String)
    definition: Mapped[str | None] = mapped_column(String)
    supersedes_version: Mapped[int | None] = mapped_column(Integer)
    changed_by: Mapped[str] = mapped_column(String)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class EvidenceReference(Base):
    """Evidence METADATA row only; file bytes/retention wait for ADR-005.

    ``storage_ref`` is an internal binding; it is never serialized to output.
    """
    __tablename__ = "evidence_references"
    __table_args__ = (
        CheckConstraint("target_kind IN ('event', 'measurement')", name="evidence_target_kind"),
        CheckConstraint("kind IN ('reference', 'attachment')", name="evidence_kind"),
        CheckConstraint("verification IN ('unverified', 'needs_review', 'verified')", name="evidence_verification"),
        CheckConstraint("availability IN ('available', 'unavailable', 'expired', 'unknown')", name="evidence_availability"),
        Index("ix_evidence_target", "target_kind", "target_id"),
    )
    evidence_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    target_kind: Mapped[str] = mapped_column(String)
    target_id: Mapped[UUID] = mapped_column(Uuid)
    kind: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    recorded_by: Mapped[str] = mapped_column(String)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    method: Mapped[str | None] = mapped_column(String)
    provenance: Mapped[str | None] = mapped_column(String)
    verification: Mapped[str] = mapped_column(String)
    availability: Mapped[str] = mapped_column(String)
    storage_ref: Mapped[str | None] = mapped_column(String)
    note: Mapped[str | None] = mapped_column(String)
    recorded_at_system: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ReviewDecision(Base):
    """One provisional review decision; only request_correction exists today."""
    __tablename__ = "review_decisions"
    __table_args__ = (
        CheckConstraint("target_kind IN ('event', 'measurement')", name="review_decision_kind"),
        CheckConstraint("decision IN ('request_correction')", name="review_decision_action"),
        Index("ix_review_target", "target_kind", "target_id"),
    )
    review_decision_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    target_kind: Mapped[str] = mapped_column(String)
    target_id: Mapped[UUID] = mapped_column(Uuid)
    decision: Mapped[str] = mapped_column(String)
    actor_id: Mapped[str] = mapped_column(String)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    rationale: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String)
    provenance: Mapped[str] = mapped_column(String)
    recorded_at_system: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CorrectionProposal(Base):
    """Append-only proposal; never applied. state is constrained to 'proposed'."""
    __tablename__ = "correction_proposals"
    __table_args__ = (
        CheckConstraint("target_kind IN ('event', 'measurement')", name="correction_target_kind"),
        CheckConstraint("state IN ('proposed')", name="correction_state"),
        Index("ix_correction_target", "target_kind", "target_id"),
    )
    correction_record_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    target_kind: Mapped[str] = mapped_column(String)
    target_id: Mapped[UUID] = mapped_column(Uuid)
    original_values: Mapped[dict] = mapped_column(JSONB)
    proposed_values: Mapped[dict] = mapped_column(JSONB)
    actor_id: Mapped[str] = mapped_column(String)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String)
    provenance: Mapped[str] = mapped_column(String)
    review_decision_id: Mapped[UUID | None] = mapped_column(ForeignKey("review_decisions.review_decision_id"))
    state: Mapped[str] = mapped_column(String)
    recorded_at_system: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (CheckConstraint("(actor_principal_id IS NULL AND actor = 'synthetic-demo-actor') OR (actor_principal_id IS NOT NULL AND actor = CAST(actor_principal_id AS TEXT))", name="audit_actor_identity"),)
    audit_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    event_id: Mapped[UUID | None] = mapped_column(ForeignKey("waste_events.event_id"))
    measurement_id: Mapped[UUID | None] = mapped_column(ForeignKey("measurements.measurement_id"))
    entity_type: Mapped[str] = mapped_column(String)
    entity_id: Mapped[UUID] = mapped_column(Uuid)
    action: Mapped[str] = mapped_column(String)
    actor: Mapped[str] = mapped_column(String)
    actor_principal_id: Mapped[UUID | None] = mapped_column(ForeignKey('auth_principals.principal_id'))
    reason: Mapped[str | None] = mapped_column(String)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Principal(Base):
    __tablename__ = 'auth_principals'
    principal_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(String)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Membership(Base):
    __tablename__ = 'auth_memberships'
    __table_args__ = (UniqueConstraint('principal_id', 'site_id'),
                     CheckConstraint("role IN ('writer','reader')", name='auth_demo_role'))
    membership_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    principal_id: Mapped[UUID] = mapped_column(ForeignKey('auth_principals.principal_id'))
    site_id: Mapped[UUID] = mapped_column(ForeignKey('sites.site_id'))
    role: Mapped[str] = mapped_column(String)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuthSession(Base):
    __tablename__ = 'auth_sessions'
    session_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    principal_id: Mapped[UUID] = mapped_column(ForeignKey('auth_principals.principal_id'))
    secret_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class PreAuth(Base):
    __tablename__ = 'auth_preauth'
    secret_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)


class LoginThrottle(Base):
    __tablename__ = 'auth_login_throttle'
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    failures: Mapped[int] = mapped_column(Integer, default=0)


class WriteIntent(Base):
    __tablename__ = 'auth_write_intents'
    __table_args__ = (CheckConstraint("kind IN ('event','measurement','p1')", name='intent_kind'),
                     CheckConstraint("state IN ('registered','committed')", name='intent_state'))
    intent_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    principal_id: Mapped[UUID] = mapped_column(ForeignKey('auth_principals.principal_id'))
    site_id: Mapped[UUID] = mapped_column(ForeignKey('sites.site_id'))
    kind: Mapped[str] = mapped_column(String)
    event_id: Mapped[UUID | None] = mapped_column(ForeignKey('waste_events.event_id'))
    result_id: Mapped[UUID | None] = mapped_column(Uuid)
    state: Mapped[str] = mapped_column(String, default='registered')
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MembershipAdmin(Base):
    """Seed-only site administrative authority, independent of operational roles."""
    __tablename__ = 'auth_membership_admins'
    principal_id: Mapped[UUID] = mapped_column(ForeignKey('auth_principals.principal_id'), primary_key=True)
    site_id: Mapped[UUID] = mapped_column(ForeignKey('sites.site_id'), primary_key=True)


class MembershipEligibility(Base):
    """Explicit synthetic site roster; not inferred from an organization or payload."""
    __tablename__ = 'auth_membership_eligibility'
    principal_id: Mapped[UUID] = mapped_column(ForeignKey('auth_principals.principal_id'), primary_key=True)
    site_id: Mapped[UUID] = mapped_column(ForeignKey('sites.site_id'), primary_key=True)


class MembershipChange(Base):
    __tablename__ = 'auth_membership_changes'
    __table_args__ = (
        CheckConstraint("old_role IS NULL OR old_role IN ('reader','writer')", name='membership_change_old_role'),
        CheckConstraint("new_role IN ('reader','writer')", name='membership_change_new_role'),
        CheckConstraint("length(trim(reason)) BETWEEN 1 AND 1000", name='membership_change_reason'),
    )
    audit_id: Mapped[UUID] = mapped_column(ForeignKey('audit_events.audit_id'), primary_key=True)
    principal_id: Mapped[UUID] = mapped_column(ForeignKey('auth_principals.principal_id'))
    site_id: Mapped[UUID] = mapped_column(ForeignKey('sites.site_id'))
    old_role: Mapped[str | None] = mapped_column(String)
    old_active: Mapped[bool | None] = mapped_column(Boolean)
    new_role: Mapped[str] = mapped_column(String)
    new_active: Mapped[bool] = mapped_column(Boolean)
    reason: Mapped[str] = mapped_column(String)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MasterNamespaceApproval(Base):
    __tablename__ = 'auth_master_namespaces'
    namespace: Mapped[str] = mapped_column(String, primary_key=True)
    source_ref: Mapped[str] = mapped_column(String)


class MasterAdministration(Base):
    __tablename__ = 'auth_master_grants'
    principal_id: Mapped[UUID] = mapped_column(ForeignKey('auth_principals.principal_id'), primary_key=True)
    namespace: Mapped[str] = mapped_column(ForeignKey('auth_master_namespaces.namespace'), primary_key=True)


class ReviewAuthority(Base):
    __tablename__ = 'auth_review_grants'
    principal_id: Mapped[UUID] = mapped_column(ForeignKey('auth_principals.principal_id'), primary_key=True)
    site_id: Mapped[UUID] = mapped_column(ForeignKey('sites.site_id'), primary_key=True)


class EvidenceFile(Base):
    __tablename__ = 'evidence_files'
    __table_args__ = (CheckConstraint("size_bytes > 0 AND size_bytes <= 10485760",name='evidence_file_size'),
        CheckConstraint("media_type IN ('application/pdf','image/jpeg','image/png')",name='evidence_file_type'))
    evidence_id: Mapped[UUID] = mapped_column(ForeignKey('evidence_references.evidence_id'), primary_key=True)
    file_id: Mapped[UUID] = mapped_column(Uuid, default=uuid4, unique=True)
    sha256: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer)
    media_type: Mapped[str] = mapped_column(String)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey('auth_principals.principal_id'))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ProposalApproval(Base):
    __tablename__ = 'proposal_approvals'
    __table_args__ = (UniqueConstraint('correction_record_id'),
        CheckConstraint('proposal_version = 1 AND decision_revision = 1',name='proposal_approval_revision'))
    approval_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    correction_record_id: Mapped[UUID] = mapped_column(ForeignKey('correction_proposals.correction_record_id'))
    proposal_version: Mapped[int] = mapped_column(Integer)
    decision_revision: Mapped[int] = mapped_column(Integer)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey('auth_principals.principal_id'))
    reason: Mapped[str] = mapped_column(String)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
