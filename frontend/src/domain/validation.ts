/**
 * Demo validation rules — UI mirror of src/fwi/domain validation.
 * Not an independent truth: semantics follow the Python domain prototype.
 */

import type { Measurement, ObservationStatus } from "./types";

export interface FieldErrors {
  [field: string]: string;
}

export function validateEventInput(input: {
  siteId: string;
  eventType: string;
  operationDate: string;
  occurredAt: string;
  materialCategory: string;
  stage: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.siteId) errors.siteId = "Site wajib dipilih.";
  if (!input.eventType) errors.eventType = "Jenis stream/event wajib dipilih.";
  if (!input.operationDate) errors.operationDate = "Tanggal operasi wajib diisi.";
  if (!input.occurredAt) errors.occurredAt = "Waktu kejadian wajib diisi.";
  if (!input.stage) errors.stage = "Tahap operasional wajib diisi.";
  if (!input.materialCategory) errors.materialCategory = "Kategori material wajib dipilih.";
  return errors;
}

function parseMass(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Mirrors domain: missing/not_measured carry no values; observed requires
 * gross+tare+net with net = gross − tare; measured_zero requires net = 0.
 * Negative mass and invalid gross/tare relationships are rejected.
 */
export function validateMeasurementInput(input: {
  observationStatus: ObservationStatus;
  gross: string;
  tare: string;
  net: string;
  massBasis: string;
  method: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.massBasis) errors.massBasis = "Mass basis wajib dipilih.";
  if (!input.method) errors.method = "Metode pengukuran wajib dipilih.";

  const status = input.observationStatus;
  if (status === "missing" || status === "not_measured") {
    if (input.gross.trim() || input.tare.trim() || input.net.trim()) {
      errors.massValues =
        "Status missing / tidak diukur tidak boleh memiliki nilai massa. Kosongkan nilai atau ubah status.";
    }
    return errors;
  }

  const gross = parseMass(input.gross || null);
  const tare = parseMass(input.tare || null);
  const net = parseMass(input.net || null);

  if (status === "measured_zero") {
    if (gross !== null || tare !== null) {
      errors.massValues =
        "Measured zero hanya mencatat net nol; tidak ada gross/tare.";
    }
    if (net === null) {
      errors.net = "Nilai net 0 wajib dicatat untuk measured zero.";
    } else if (!Number.isNaN(net) && net !== 0) {
      errors.net = "Measured zero memerlukan net tepat 0.";
    }
    return errors;
  }

  // status === "observed"
  if (input.gross.trim() === "") errors.gross = "Gross wajib diisi.";
  if (input.tare.trim() === "") errors.tare = "Tare wajib diisi.";
  if (input.net.trim() === "") errors.net = "Net wajib diisi.";
  if (gross === null || tare === null || net === null) return errors;

  if (Number.isNaN(gross) || Number.isNaN(tare) || Number.isNaN(net)) {
    errors.massValues = "Nilai massa harus berupa angka.";
    return errors;
  }
  if (gross < 0 || tare < 0 || net < 0) {
    errors.massValues = "Massa tidak boleh negatif.";
    return errors;
  }
  if (gross < tare) {
    errors.massValues = "Gross harus ≥ tare.";
    return errors;
  }
  if (net !== gross - tare) {
    errors.massValues = `Net harus sama dengan gross − tare (${gross - tare} kg).`;
  }
  return errors;
}

export function measurementFromInput(
  input: {
    measurementId: string;
    eventId: string;
    observedAt: string;
    originalText: string;
    massBasis: Measurement["massBasis"];
    observationStatus: ObservationStatus;
    estimationStatus: Measurement["estimationStatus"];
    method: string;
    provenance: string;
    gross: string;
    tare: string;
    net: string;
  },
): Measurement {
  const noValues = input.observationStatus === "missing" || input.observationStatus === "not_measured";
  return {
    measurementId: input.measurementId,
    eventId: input.eventId,
    observedAt: input.observedAt,
    originalText: input.originalText,
    unit: "kg",
    massBasis: input.massBasis,
    observationStatus: input.observationStatus,
    estimationStatus: input.estimationStatus,
    method: input.method,
    provenance: input.provenance,
    gross: noValues ? null : input.gross || null,
    tare: noValues ? null : input.tare || null,
    net: noValues ? null : input.net || null,
    validationStatus: "unvalidated",
  };
}
