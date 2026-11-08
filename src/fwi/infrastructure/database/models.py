"""Reversible Demo v0.1 mappings, not an approved production schema."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint,
                        Integer, Numeric, String, UniqueConstraint, Uuid)
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
        CheckConstraint("event_type IN ('at_risk_surplus', 'actual_loss_discard')", name="event_demo_type"))
    event_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.organization_id"))
    site_id: Mapped[UUID] = mapped_column(Uuid)
    event_type: Mapped[str] = mapped_column(String)
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
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


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
    __table_args__ = (CheckConstraint("kind IN ('event','measurement')", name='intent_kind'),
                     CheckConstraint("state IN ('registered','committed')", name='intent_state'))
    intent_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    principal_id: Mapped[UUID] = mapped_column(ForeignKey('auth_principals.principal_id'))
    site_id: Mapped[UUID] = mapped_column(ForeignKey('sites.site_id'))
    kind: Mapped[str] = mapped_column(String)
    event_id: Mapped[UUID | None] = mapped_column(ForeignKey('waste_events.event_id'))
    result_id: Mapped[UUID | None] = mapped_column(Uuid)
    state: Mapped[str] = mapped_column(String, default='registered')
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
