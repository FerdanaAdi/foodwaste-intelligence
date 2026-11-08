/**
 * FR-005 evidence/provenance type definitions (PROVISIONAL).
 *
 * Scope from PRD v0.1: "Lampiran/referensi bukti dengan kontrol akses
 * dan sumber; metadata siapa/kapan/metode" and AC-10 (authorized users
 * can open evidence; unauthorized users cannot).
 *
 * OPEN (not invented here — pending FWI-02/ADR-005):
 * - final evidence vocabulary and status enums;
 * - storage/retention policy and object storage choice (ADR-005);
 * - formal approval semantics (deliberately absent below).
 *
 * Evidence is metadata ABOUT attachments/references. It is a concept
 * distinct from measurement and validation: the presence, absence or
 * verification state of evidence never changes a measurement value, and
 * absence of evidence is not a zero measurement.
 */

/** The record this evidence belongs to. Evidence ≠ measurement ≠ validation. */
export type EvidenceTargetKind = "event" | "measurement";

/** Reference vs attachment metadata. Kind alone does not establish artifact availability. */
export type EvidenceKind = "reference" | "attachment";

/**
 * Whether the actual evidence artifact is currently retrievable.
 * Availability is a storage-level fact — not a truth judgment.
 */
export type EvidenceAvailability = "available" | "unavailable" | "expired" | "unknown";

/**
 * Review state of the evidence metadata. "verified" means a reviewer has
 * checked the metadata/artifact per current demo rules; it is NOT a
 * formal approval and never validates the underlying measurement.
 */
export type EvidenceVerification = "unverified" | "needs_review" | "verified";

export interface EvidenceMetadata {
  /** Stable evidence identifier. */
  evidenceId: string;
  targetKind: EvidenceTargetKind;
  /** The eventId or measurementId this evidence is attached to. */
  targetId: string;
  kind: EvidenceKind;
  /** Where the evidence came from (system, person, document) — verbatim. */
  source: string;
  /** Short human-readable label. */
  title: string;
  /** Who recorded this evidence metadata (synthetic identity). */
  createdBy: string;
  /** ISO datetime the evidence was recorded. */
  createdAt: string;
  /** How the evidence was produced/collected (who/when/method scope). */
  method?: string;
  /** Provenance note preserved verbatim. */
  provenance?: string;
  verification: EvidenceVerification;
  verifiedBy?: string;
  verifiedAt?: string;
  availability: EvidenceAvailability;
  /**
   * OPAQUE storage reference managed by the backend. The UI must never
   * construct or guess a public URL from it, and never renders it as a
   * link. Opening the artifact requires server-side authorization
   * (AC-10); this package renders metadata only — no previews.
   */
  storageRef?: string;
  note?: string;
}

/** Driving states for the read-only evidence panel. */
export type EvidenceAvailabilityState = "ready" | "loading" | "denied" | "unavailable";

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  reference: "Referensi (metadata saja)",
  attachment: "Lampiran",
};

export const EVIDENCE_VERIFICATION_LABELS: Record<EvidenceVerification, string> = {
  unverified: "Belum diverifikasi",
  needs_review: "Perlu review",
  verified: "Diverifikasi reviewer",
};

export const EVIDENCE_AVAILABILITY_LABELS: Record<EvidenceAvailability, string> = {
  available: "Berkas tersedia",
  unavailable: "Berkas tidak tersedia",
  expired: "Masa simpan berakhir",
  unknown: "Ketersediaan tidak diketahui",
};

export const EVIDENCE_TARGET_LABELS: Record<EvidenceTargetKind, string> = {
  event: "Event",
  measurement: "Pengukuran",
};
