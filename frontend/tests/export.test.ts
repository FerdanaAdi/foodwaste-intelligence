import { describe, expect, it } from "vitest";
import { buildCsv, buildExportRows } from "@/data/export";
import { createDemoStore, type DemoStore } from "@/data/demoStore";

function withExtraMeasurement(store: DemoStore): DemoStore {
  const data = store.get();
  store.addMeasurement({
    ...data.measurements[0],
    measurementId: "MSR-TEST-EXPORT",
    gross: "2",
    tare: "0.5",
    net: "1.5",
  });
  return store;
}

describe("CSV export", () => {
  it("produces one row per measurement with traceable ids", () => {
    const store = createDemoStore();
    const rows = buildExportRows(store);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.measurementId)).toContain("MSR-DEMO-0001");
    expect(rows.every((r) => r.eventId.startsWith("EVT-DEMO-"))).toBe(true);
    expect(rows.every((r) => r.unit === "kg")).toBe(true);
  });

  it("includes missing rows without inventing values", () => {
    const store = createDemoStore();
    const missing = buildExportRows(store).find((r) => r.measurementId === "MSR-DEMO-0004")!;
    expect(missing.net).toBe("-");
    expect(missing.gross).toBe("-");
  });

  it("never emits a totals row", () => {
    const store = withExtraMeasurement(createDemoStore());
    const csv = buildCsv(store);
    for (const line of csv.split("\r\n")) {
      expect(line.toLowerCase()).not.toContain("total");
    }
  });

  it("carries the synthetic banner comment", () => {
    const csv = buildCsv(createDemoStore());
    expect(csv).toContain("SYNTHETIC / DEMO EXPORT");
    expect(csv).toContain("NOT OFFICIAL BGN SYSTEM");
  });

  it("escapes commas and quotes in provenance", () => {
    const store = createDemoStore();
    const data = store.get();
    store.addMeasurement({
      ...data.measurements[0],
      measurementId: "MSR-TEST-CSV",
      provenance: 'Tray "01, 02" (fiktif)',
    });
    const csv = buildCsv(store);
    expect(csv).toContain('"Tray ""01, 02"" (fiktif)"');
  });
});
