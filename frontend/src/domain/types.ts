/**
 * Domain demo types — mirror of src/fwi/domain PROVISIONAL vocabulary.
 * NOT a canonical standard; final vocabulary is source-gated (FWI-03).
 */

export type MassBasis =
  | "raw"
  | "after_preparation"
  | "cooked"
  | "ready_to_eat"
  | "as_served"
  | "other_documented";

export const MASS_BASES: readonly MassBasis[] = [
  "raw",
  "after_preparation",
  "cooked",
  "ready_to_eat",
  "as_served",
  "other_documented",
] as const;

export const MASS_BASIS_LABELS: Record<MassBasis, string> = {
  raw: "Bahan mentah",
  after_preparation: "Setelah penyiapan",
  cooked: "Setelah dimasak",
  ready_to_eat: "Siap makan",
  as_served: "Saat disajikan",
  other_documented: "Lainnya (terdokumentasi)",
};

/** plate_leftover is a stream/event type (FWI-02 v1.0), NOT a mass basis. */
export const EVENT_TYPES = ["plate_leftover_stream", "preparation_loss", "storage_loss"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  plate_leftover_stream: "Sisa piring (stream)",
  preparation_loss: "Hilang saat penyiapan",
  storage_loss: "Hilang saat penyimpanan",
};

export type ObservationStatus =
  | "observed"
  | "measured_zero"
  | "missing"
  | "not_measured";

export const OBSERVATION_STATUS_LABELS: Record<ObservationStatus, string> = {
  observed: "Terukur",
  measured_zero: "Terukur nol",
  missing: "Hilang (missing)",
  not_measured: "Tidak diukur",
};

export type EstimationStatus = "weighed" | "estimated";
export const ESTIMATION_STATUS_LABELS: Record<EstimationStatus, string> = {
  weighed: "Ditimbang",
  estimated: "Estimasi",
};

export type ValidationStatus = "unvalidated" | "needs_review" | "flagged";
export const VALIDATION_STATUS_LABELS: Record<ValidationStatus, string> = {
  unvalidated: "Belum divalidasi",
  needs_review: "Perlu review",
  flagged: "Ditandai reviewer",
};

export interface Site {
  siteId: string;
  name: string;
  organization: string;
}

export interface Measurement {
  measurementId: string;
  eventId: string;
  observedAt: string; // ISO datetime string
  /** Original mass text as recorded; preserved verbatim. */
  originalText: string;
  unit: "kg";
  massBasis: MassBasis;
  observationStatus: ObservationStatus;
  estimationStatus: EstimationStatus;
  method: string;
  provenance: string;
  gross: string | null;
  tare: string | null;
  net: string | null;
  validationStatus: ValidationStatus;
  reviewNote?: string;
}

export interface WasteEvent {
  eventId: string;
  siteId: string;
  eventType: EventType;
  stage: string;
  operationDate: string; // ISO date
  occurredAt: string; // ISO datetime
  recordedAt: string; // ISO datetime
  materialCategory: string;
  note?: string;
}

export interface DemoData {
  sites: Site[];
  events: WasteEvent[];
  measurements: Measurement[];
}

/** KPI guardrail: held KPIs are never computed or displayed. */
export const HELD_KPIS = ["OP-08", "FI-02", "NI-03"] as const;

export const DEMO_BANNER =
  "SYNTHETIC / DEMO — NOT OFFICIAL BGN SYSTEM";
