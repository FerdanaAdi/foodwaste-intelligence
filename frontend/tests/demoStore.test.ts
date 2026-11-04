import { describe, expect, it } from "vitest";
import { initialDemoData, createDemoStore, nextDemoEventId, nextDemoMeasurementId } from "@/data/demoStore";

describe("demoStore — data boundary", () => {
  it("provides 2 sites, 3 events, and an event with 2 measurements", () => {
    const data = initialDemoData();
    expect(data.sites).toHaveLength(2);
    expect(data.events).toHaveLength(3);
    const evt1 = data.measurements.filter((m) => m.eventId === "EVT-DEMO-2026-0001");
    expect(evt1).toHaveLength(2);
  });

  it("has an event without measurement", () => {
    const data = initialDemoData();
    const unmeasured = data.events.filter(
      (e) => !data.measurements.some((m) => m.eventId === e.eventId),
    );
    expect(unmeasured).toHaveLength(1);
    expect(unmeasured[0].eventId).toBe("EVT-DEMO-2026-0003");
  });

  it("multiple measurements never create additional events", () => {
    const store = createDemoStore();
    const before = store.get().events.length;
    const data = store.get();
    const m = data.measurements[0];
    store.addMeasurement({ ...m, measurementId: "MSR-DEMO-9999", gross: "1", tare: "0", net: "1" });
    expect(store.get().events.length).toBe(before);
    expect(store.measurementsForEvent(m.eventId)).toHaveLength(3);
  });

  it("represent missing vs measured zero distinctly", () => {
    const data = initialDemoData();
    const missing = data.measurements.find((m) => m.observationStatus === "missing")!;
    const zero = data.measurements.find((m) => m.observationStatus === "measured_zero")!;
    expect(missing.net).toBeNull();
    expect(zero.net).toBe("0");
  });

  it("marks estimated distinctly from weighed", () => {
    const data = initialDemoData();
    const est = data.measurements.find((m) => m.estimationStatus === "estimated")!;
    expect(est.method).toBe("visual_estimate");
    const weighed = data.measurements.find((m) => m.estimationStatus === "weighed")!;
    expect(weighed.method).toBe("digital_scale");
  });

  it("preserves original mass text verbatim", () => {
    const data = initialDemoData();
    expect(data.measurements[0].originalText).toBe("1,850");
    expect(data.measurements[2].originalText).toBe("≈ 0,4 (estimasi)");
  });

  it("in-memory write resets on reload (fresh store)", () => {
    const store = createDemoStore();
    store.addMeasurement({
      ...store.get().measurements[0],
      measurementId: "MSR-DEMO-7777",
    });
    const fresh = initialDemoData();
    expect(fresh.measurements.some((m) => m.measurementId === "MSR-DEMO-7777")).toBe(false);
    expect(fresh.measurements).toHaveLength(4);
  });

  it("quality counts count only, never mass totals", () => {
    const store = createDemoStore();
    const c = store.qualityCounts();
    expect(c).toEqual({
      eventCount: 3,
      measurementCount: 4,
      missingCount: 1,
      reviewFlagCount: 3,
      unmeasuredEventCount: 1,
    });
    // ensure no mass fields leak into counters
    expect(Object.values(c).every((v) => typeof v === "number")).toBe(true);
  });

  it("next ids stay stable-format and never mint events from measurements", () => {
    const data = initialDemoData();
    expect(nextDemoEventId(data)).toBe("EVT-DEMO-2026-0004");
    expect(nextDemoMeasurementId(data)).toBe("MSR-DEMO-0005");
  });
});
