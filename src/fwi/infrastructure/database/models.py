"""Reversible Demo v0.1 mappings, not an approved production schema."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint,
                        Numeric, String, UniqueConstraint, Uuid)
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
    __table_args__ = (CheckConstraint("actor = 'synthetic-demo-actor'", name="audit_synthetic_actor"),)
    audit_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    event_id: Mapped[UUID | None] = mapped_column(ForeignKey("waste_events.event_id"))
    measurement_id: Mapped[UUID | None] = mapped_column(ForeignKey("measurements.measurement_id"))
    entity_type: Mapped[str] = mapped_column(String)
    entity_id: Mapped[UUID] = mapped_column(Uuid)
    action: Mapped[str] = mapped_column(String)
    actor: Mapped[str] = mapped_column(String)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
