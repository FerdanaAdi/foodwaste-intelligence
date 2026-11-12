import { describe, expect, it } from "vitest";
import { applyFilters, emptyFilters, siteOptions, stageOptions, summarize, summarizeRecords } from "@/data/dataquality/summary";
import { dqFixtures } from "@/data/dataquality/fixtures";

const { events, measurements, sites } = dqFixtures;

describe("summarize — domain-count integrity", () => {
  const full = summarize(events, measurements);

  it("counts events and measurements separately (event ≠ measurement)", () => {
    expect(full.eventCount).toBe(events.length);
    expect(full.measurementCount).toBe(measurements.length);
    // Fixture: EVT-DQ-2026-0001 has 2 measurement records, EVT-DQ-2026-0005 has 2.
    expect(full.measurementCount).toBeGreaterThan(full.eventCount);
  });

  it("counts missing and not_measured without treating them as zero", () => {
    expect(full.observationCounts.missing).toBe(1);
    expect(full.observationCounts.not_measured).toBe(1);
    expect(full.missingCount).toBe(2);
    expect(full.observationCounts.measured_zero).toBe(1);
    // measured zero is distinct from missing in the summary.
    expect(full.missingCount).not.toEqual(full.observationCounts.measured_zero);
  });

  it("counts needs-attention records as needs_review + flagged (count semantics, not approval or blocked)", () => {
    // Field-level count check, not text search.
    expect(full.needsAttentionCount).toBe(2);
    expect(full.needsAttentionCount).toBe(
      full.validationCounts.needs_review + full.validationCounts.flagged,
    );
    // The current model has no blocked status; the summary must not
    // fabricate one (only unvalidated/needs_review/flagged exist).
    expect(Object.keys(full.validationCounts).sort()).toEqual(["flagged", "needs_review", "unvalidated"]);
  });

  it("counts events without measurements while keeping their identity", () => {
    expect(full.unmeasuredEventCount).toBe(1); // EVT-DQ-2026-0003
  });

  it("counts estimated records separately from weighed", () => {
    expect(full.estimatedCount).toBe(3);
  });
});

describe("applyFilters — event/measurement integrity under filtering", () => {
  it("filters by site without duplicating events", () => {
    const records = applyFilters(dqFixtures, { ...emptyFilters, siteId: "SITE-DQ-01" });
    expect(records.map((r) => r.event.eventId).sort()).toEqual([
      "EVT-DQ-2026-0001",
      "EVT-DQ-2026-0003",
      "EVT-DQ-2026-0005",
    ]);
    // The repeated-measurement event keeps both measurement records.
    const evt1 = records.find((r) => r.event.eventId === "EVT-DQ-2026-0001");
    expect(evt1?.measurements).toHaveLength(2);
  });

  it("filters by stage derived from records", () => {
    expect(stageOptions(events).sort()).toEqual(["preparation", "serving", "storage"]);
    const records = applyFilters(dqFixtures, { ...emptyFilters, stage: "serving" });
    expect(records).toHaveLength(2);
  });

  it("filters by inclusive operation-date period", () => {
    const records = applyFilters(dqFixtures, { ...emptyFilters, operationFrom: "2026-11-03", operationTo: "2026-11-04" });
    expect(records.map((r) => r.event.eventId).sort()).toEqual([
      "EVT-DQ-2026-0003",
      "EVT-DQ-2026-0004",
      "EVT-DQ-2026-0005",
    ]);
  });

  it("keeps events listed with zero matching measurements when status filters exclude them", () => {
    const records = applyFilters(dqFixtures, { ...emptyFilters, observationStatus: "measured_zero" });
    expect(records.map((r) => r.event.eventId).sort()).toEqual([
      "EVT-DQ-2026-0001", // 0 matching measurements, event remains listed
      "EVT-DQ-2026-0002", // 0 matching measurements
      "EVT-DQ-2026-0003", // unmeasured event
      "EVT-DQ-2026-0004", // its measured_zero record matches
      "EVT-DQ-2026-0005", // 0 matching measurements
    ]);
    const evt4 = records.find((r) => r.event.eventId === "EVT-DQ-2026-0004");
    expect(evt4?.measurements).toHaveLength(1);
    const evt1 = records.find((r) => r.event.eventId === "EVT-DQ-2026-0001");
    expect(evt1?.measurements).toHaveLength(0);
  });

  it("excludes events outside the date range entirely, measurements included", () => {
    const records = applyFilters(dqFixtures, { ...emptyFilters, operationFrom: "2026-11-02", operationTo: "2026-11-02" });
    const evt1 = records.find((r) => r.event.eventId === "EVT-DQ-2026-0001");
    expect(evt1?.measurements).toHaveLength(2);
    // EVT-DQ-2026-0005 falls outside the period, so it is absent together
    // with its measurements (no half-filtered event rows).
    expect(records.find((r) => r.event.eventId === "EVT-DQ-2026-0005")).toBeUndefined();
    expect(records.map((r) => r.event.eventId).sort()).toEqual(["EVT-DQ-2026-0001", "EVT-DQ-2026-0002"]);
  });
});

describe("summarizeRecords — filtered summary consistency", () => {
  it("summarizes only filtered records", () => {
    const records = applyFilters(dqFixtures, { ...emptyFilters, siteId: "SITE-DQ-02" });
    const s = summarizeRecords(records);
    expect(s.eventCount).toBe(2);
    expect(s.measurementCount).toBe(2); // M-DQ-0003 estimated + M-DQ-0004 measured zero
    expect(s.observationCounts.measured_zero).toBe(1);
    expect(s.estimatedCount).toBe(1);
  });

  it("produces an all-zero summary for an empty filter result", () => {
    const records = applyFilters(dqFixtures, { ...emptyFilters, siteId: "SITE-DQ-02", stage: "storage" });
    expect(records).toHaveLength(0);
    const s = summarizeRecords(records);
    expect(s.eventCount).toBe(0);
    expect(s.measurementCount).toBe(0);
    expect(s.missingCount).toBe(0);
    expect(s.needsAttentionCount).toBe(0);
  });
});

describe("siteOptions — demo-only site vocabulary", () => {
  it("exposes synthetic site labels", () => {
    const options = siteOptions(sites);
    expect(options).toHaveLength(2);
    expect(options[0].name).toContain("[SYNTHETIC]");
  });
});

// CP7-F01: recorded relationships survive display/status filtering.
describe("CP7-F01 — recorded versus matching measurements", () => {
  it.each(["measured_zero", "observed", "missing", "not_measured"] as const)(
    "keeps genuine unmeasured events distinct under %s filtering", (observationStatus) => {
      const saved = JSON.stringify(dqFixtures);
      const records = applyFilters(dqFixtures, { ...emptyFilters, observationStatus });
      const summary = summarizeRecords(records);
      expect(summary.eventCount).toBe(5);
      expect(summary.unmeasuredEventCount).toBe(1);
      expect(summary.measurementCount).toBe(measurements.filter((m) => m.observationStatus === observationStatus).length);
      expect(summary.missingCount).toBe(observationStatus === "missing" || observationStatus === "not_measured" ? 1 : 0);
      for (const record of records) {
        expect(record.recordedMeasurementCount).toBe(measurements.filter((m) => m.eventId === record.event.eventId).length);
        expect(record.measurements.every((m) => m.observationStatus === observationStatus)).toBe(true);
      }
      expect(records.find((r) => r.event.eventId === "EVT-DQ-2026-0003")?.recordedMeasurementCount).toBe(0);
      expect(JSON.stringify(dqFixtures)).toBe(saved);
    },
  );

  it("preserves repeated observation IDs when filters are applied and cleared", () => {
    const hidden = applyFilters(dqFixtures, { ...emptyFilters, observationStatus: "measured_zero" });
    const repeated = hidden.find((r) => r.event.eventId === "EVT-DQ-2026-0001");
    expect(repeated?.measurements).toEqual([]);
    expect(repeated?.recordedMeasurementCount).toBe(2);
    const restored = applyFilters(dqFixtures, emptyFilters).find((r) => r.event.eventId === repeated?.event.eventId);
    expect(restored?.measurements.map((m) => m.measurementId)).toEqual(["M-DQ-0001", "M-DQ-0002"]);
    expect(restored?.recordedMeasurementCount).toBe(2);
  });

  it("retains estimated source records without counting hidden estimates as missing", () => {
    const scope = { ...emptyFilters, siteId: "SITE-DQ-02", operationFrom: "2026-11-02", operationTo: "2026-11-02" };
    const visible = applyFilters(dqFixtures, { ...scope, observationStatus: "observed" });
    expect(summarizeRecords(visible).estimatedCount).toBe(1);
    expect(visible[0].measurements[0].estimationStatus).toBe("estimated");
    const hidden = applyFilters(dqFixtures, { ...scope, observationStatus: "measured_zero" });
    expect(hidden).toHaveLength(1);
    expect(hidden[0].recordedMeasurementCount).toBe(1);
    expect(hidden[0].measurements).toEqual([]);
    expect(summarizeRecords(hidden)).toMatchObject({ measurementCount: 0, missingCount: 0, estimatedCount: 0, unmeasuredEventCount: 0 });
  });

  it.each([
    { siteId: "SITE-DQ-01", operationFrom: "2026-11-04", operationTo: "2026-11-04", expectedIds: ["EVT-DQ-2026-0005"] },
    { siteId: "SITE-DQ-02", operationFrom: "2026-11-02", operationTo: "2026-11-04", expectedIds: ["EVT-DQ-2026-0002", "EVT-DQ-2026-0004"] },
  ])("does not count unmeasured events outside site/date scope: $siteId", ({ expectedIds, ...scope }) => {
    const records = applyFilters(dqFixtures, { ...emptyFilters, ...scope, observationStatus: "measured_zero" });
    expect(records.map((r) => r.event.eventId)).toEqual(expectedIds);
    expect(summarizeRecords(records).unmeasuredEventCount).toBe(0);
  });

  it("uses only caller-supplied scoped records and preserves counts under validation filtering", () => {
    const scopedEvents = events.filter((e) => e.siteId === "SITE-DQ-01");
    const ids = new Set(scopedEvents.map((e) => e.eventId));
    const scoped = { sites: sites.filter((s) => s.siteId === "SITE-DQ-01"), events: scopedEvents, measurements: measurements.filter((m) => ids.has(m.eventId)) };
    const records = applyFilters(scoped, { ...emptyFilters, validationStatus: "flagged" });
    expect(records.every((r) => r.event.siteId === "SITE-DQ-01")).toBe(true);
    expect(summarizeRecords(records)).toMatchObject({ eventCount: 3, measurementCount: 1, unmeasuredEventCount: 1, missingCount: 1 });
    const absent = applyFilters(scoped, { ...emptyFilters, siteId: "SITE-DQ-02" });
    expect(absent).toEqual([]);
    expect(summarizeRecords(absent).unmeasuredEventCount).toBe(0);
  });
});
