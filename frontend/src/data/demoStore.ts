/**
 * Synthetic demo data adapter — in-memory, resets on reload.
 * NOT a backend client. No claims of PostgreSQL/API persistence.
 * All data is fictional; no student or real SPPG data.
 */

import type { DemoData, Measurement, WasteEvent, Site } from "../domain/types";

export function initialDemoData(): DemoData {
  const sites: Site[] = [
    { siteId: "SITE-DEMO-01", name: "SPPG Demo Sinar PagI", organization: "ORG-DEMO-A" },
    { siteId: "SITE-DEMO-02", name: "SPPG Demo Harapan Jaya", organization: "ORG-DEMO-B" },
  ];

  const events: WasteEvent[] = [
    {
      eventId: "EVT-DEMO-2026-0001",
      siteId: "SITE-DEMO-01",
      eventType: "plate_leftover_stream",
      stage: "serving",
      operationDate: "2026-11-02",
      occurredAt: "2026-11-02T12:35:00+07:00",
      recordedAt: "2026-11-02T13:02:00+07:00",
      materialCategory: "rice_mixed_meal",
      note: "Contoh stream sisa piring tray lengkap (fiktif).",
    },
    {
      eventId: "EVT-DEMO-2026-0002",
      siteId: "SITE-DEMO-02",
      eventType: "preparation_loss",
      stage: "preparation",
      operationDate: "2026-11-02",
      occurredAt: "2026-11-02T08:12:00+07:00",
      recordedAt: "2026-11-02T08:40:00+07:00",
      materialCategory: "vegetables",
      note: "Contoh kehilangan saat penyiapan sayur (fiktif).",
    },
    {
      eventId: "EVT-DEMO-2026-0003",
      siteId: "SITE-DEMO-01",
      eventType: "storage_loss",
      stage: "storage",
      operationDate: "2026-11-03",
      occurredAt: "2026-11-03T07:05:00+07:00",
      recordedAt: "2026-11-03T07:30:00+07:00",
      materialCategory: "mixed_dry_goods",
      note: "Event tanpa pengukuran — hanya kejadian tercatat (fiktif).",
    },
  ];

  const measurements: Measurement[] = [
    {
      measurementId: "MSR-DEMO-0001",
      eventId: "EVT-DEMO-2026-0001",
      observedAt: "2026-11-02T12:40:00+07:00",
      originalText: "1,850",
      unit: "kg",
      massBasis: "as_served",
      observationStatus: "observed",
      estimationStatus: "weighed",
      method: "digital_scale",
      provenance: "Tray 01–12 (fiktif), timbangan dapur demo",
      gross: "2.100",
      tare: "0.250",
      net: "1.850",
      validationStatus: "needs_review",
      reviewNote: "Tare tray bervariasi — perlu cek ulang tare tray 07 (fiktif).",
    },
    {
      measurementId: "MSR-DEMO-0002",
      eventId: "EVT-DEMO-2026-0001",
      observedAt: "2026-11-02T12:52:00+07:00",
      originalText: "0",
      unit: "kg",
      massBasis: "as_served",
      observationStatus: "measured_zero",
      estimationStatus: "weighed",
      method: "digital_scale",
      provenance: "Tray 13 (fiktif), dibersihkan habis",
      gross: null,
      tare: null,
      net: "0",
      validationStatus: "unvalidated",
    },
    {
      measurementId: "MSR-DEMO-0003",
      eventId: "EVT-DEMO-2026-0002",
      observedAt: "2026-11-02T08:15:00+07:00",
      originalText: "≈ 0,4 (estimasi)",
      unit: "kg",
      massBasis: "raw",
      observationStatus: "observed",
      estimationStatus: "estimated",
      method: "visual_estimate",
      provenance: "Estimasi operator gudang (fiktif), tanpa timbangan",
      gross: "0.600",
      tare: "0.200",
      net: "0.400",
      validationStatus: "flagged",
      reviewNote: "Estimasi visual — tidak setara penimbangan; jangan agregasi dengan data weighed (fiktif).",
    },
    {
      measurementId: "MSR-DEMO-0004",
      eventId: "EVT-DEMO-2026-0002",
      observedAt: "2026-11-02T08:28:00+07:00",
      originalText: "",
      unit: "kg",
      massBasis: "raw",
      observationStatus: "missing",
      estimationStatus: "estimated",
      method: "visual_estimate",
      provenance: "Batch kedua tidak tercatat timbangannya (fiktif)",
      gross: null,
      tare: null,
      net: null,
      validationStatus: "needs_review",
      reviewNote: "Missing ≠ nol — tidak boleh dihitung sebagai 0 kg (fiktif).",
    },
  ];

  return { sites, events, measurements };
}

/** In-memory store: mutations vanish on reload — this is by design, labeled in UI. */
export function createDemoStore() {
  let data = initialDemoData();

  return {
    get(): DemoData {
      return data;
    },
    reset(): DemoData {
      data = initialDemoData();
      return data;
    },
    addEvent(event: WasteEvent): void {
      data = { ...data, events: [...data.events, event] };
    },
    addMeasurement(m: Measurement): void {
      data = { ...data, measurements: [...data.measurements, m] };
    },
    updateMeasurementReview(
      measurementId: string,
      update: Pick<Measurement, "validationStatus" | "reviewNote">,
    ): void {
      data = {
        ...data,
        measurements: data.measurements.map((m) =>
          m.measurementId === measurementId ? { ...m, ...update } : m,
        ),
      };
    },
    eventsForSite(siteId: string): WasteEvent[] {
      return data.events.filter((e) => e.siteId === siteId);
    },
    measurementsForEvent(eventId: string): Measurement[] {
      return data.measurements.filter((m) => m.eventId === eventId);
    },
    /** Dashboard counters — counts only; no mass totals (no cross-basis aggregation). */
    qualityCounts(): {
      eventCount: number;
      measurementCount: number;
      missingCount: number;
      reviewFlagCount: number;
      unmeasuredEventCount: number;
    } {
      const eventCount = data.events.length;
      const measurementCount = data.measurements.length;
      const missingCount = data.measurements.filter(
        (m) => m.observationStatus === "missing" || m.observationStatus === "not_measured",
      ).length;
      const reviewFlagCount = data.measurements.filter(
        (m) => m.validationStatus !== "unvalidated",
      ).length;
      const unmeasuredEventCount = data.events.filter(
        (e) => !data.measurements.some((m) => m.eventId === e.eventId),
      ).length;
      return { eventCount, measurementCount, missingCount, reviewFlagCount, unmeasuredEventCount };
    },
  };
}

export type DemoStore = ReturnType<typeof createDemoStore>;

/** Next IDs stay stable per occurrence; a new measurement never mints a new event id. */
export function nextDemoEventId(data: DemoData): string {
  const nums = data.events
    .map((e) => Number(e.eventId.split("-").pop()))
    .filter((n) => Number.isFinite(n)) as number[];
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `EVT-DEMO-2026-${String(next).padStart(4, "0")}`;
}

export function nextDemoMeasurementId(data: DemoData): string {
  const nums = data.measurements
    .map((m) => Number(m.measurementId.split("-").pop()))
    .filter((n) => Number.isFinite(n)) as number[];
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `MSR-DEMO-${String(next).padStart(4, "0")}`;
}
