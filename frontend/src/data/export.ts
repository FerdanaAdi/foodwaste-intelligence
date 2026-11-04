/**
 * CSV export preview — traceable synthetic rows only.
 * No totals row: aggregating across mass bases is prohibited.
 */

import type { DemoStore } from "./demoStore";
import { MASS_BASIS_LABELS, OBSERVATION_STATUS_LABELS, ESTIMATION_STATUS_LABELS } from "../domain/types";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export interface ExportRow {
  eventId: string;
  measurementId: string;
  unit: string;
  massBasis: string;
  observationStatus: string;
  estimationStatus: string;
  method: string;
  originalText: string;
  gross: string;
  tare: string;
  net: string;
  observedAt: string;
  provenance: string;
  validationStatus: string;
}

export function buildExportRows(store: DemoStore): ExportRow[] {
  const data = store.get();
  return data.measurements.map((m) => ({
    eventId: m.eventId,
    measurementId: m.measurementId,
    unit: m.unit,
    massBasis: MASS_BASIS_LABELS[m.massBasis],
    observationStatus: OBSERVATION_STATUS_LABELS[m.observationStatus],
    estimationStatus: ESTIMATION_STATUS_LABELS[m.estimationStatus],
    method: m.method,
    originalText: m.originalText || "-",
    gross: m.gross ?? "-",
    tare: m.tare ?? "-",
    net: m.net ?? "-",
    observedAt: m.observedAt,
    provenance: m.provenance,
    validationStatus: m.validationStatus,
  }));
}

const HEADERS = [
  "event_id",
  "measurement_id",
  "unit",
  "mass_basis",
  "observation_status",
  "estimation_status",
  "method",
  "original_text",
  "gross",
  "tare",
  "net",
  "observed_at",
  "provenance",
  "validation_status",
];

export function buildCsv(store: DemoStore): string {
  const rows = buildExportRows(store);
  const lines = [
    "# FWI SYNTHETIC / DEMO EXPORT — NOT OFFICIAL BGN SYSTEM",
    "# Satu baris per measurement; tidak ada agregasi antar mass basis.",
    HEADERS.join(","),
    ...rows.map((r) =>
      [
        r.eventId,
        r.measurementId,
        r.unit,
        r.massBasis,
        r.observationStatus,
        r.estimationStatus,
        r.method,
        r.originalText,
        r.gross,
        r.tare,
        r.net,
        r.observedAt,
        r.provenance,
        r.validationStatus,
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    ),
  ];
  return lines.join("\r\n");
}

export function downloadCsv(store: DemoStore): void {
  const blob = new Blob([buildCsv(store)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fwi-demo-export.csv";
  a.click();
  URL.revokeObjectURL(url);
}
