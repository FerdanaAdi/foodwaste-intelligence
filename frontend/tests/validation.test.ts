import { describe, expect, it } from "vitest";
import { validateEventInput, validateMeasurementInput, measurementFromInput } from "@/domain/validation";

describe("validateMeasurementInput — mirrors Python domain semantics", () => {
  const valid = {
    observationStatus: "observed" as const,
    gross: "2.100",
    tare: "0.250",
    net: "1.850",
    massBasis: "cooked",
    method: "digital_scale",
  };

  it("accepts a valid gross/tare/net triple", () => {
    expect(validateMeasurementInput(valid)).toEqual({});
  });

  it("rejects negative mass", () => {
    const e = validateMeasurementInput({ ...valid, gross: "-1", net: "-1.25" });
    expect(e.massValues).toMatch(/negatif/i);
  });

  it("rejects gross < tare", () => {
    const e = validateMeasurementInput({ ...valid, gross: "0.2", tare: "0.3" });
    expect(e.massValues).toMatch(/gross harus ≥ tare/i);
  });

  it("rejects net != gross - tare", () => {
    const e = validateMeasurementInput({ ...valid, net: "9" });
    expect(e.massValues).toMatch(/gross − tare/i);
  });

  it("missing/not_measured must carry no values", () => {
    const e = validateMeasurementInput({ ...valid, observationStatus: "missing" });
    expect(e.massValues).toMatch(/tidak boleh memiliki nilai massa/i);
  });

  it("missing with empty values is valid (missing ≠ zero)", () => {
    const e = validateMeasurementInput({ ...valid, observationStatus: "missing", gross: "", tare: "", net: "" });
    expect(e).toEqual({});
  });

  it("measured_zero requires net exactly 0 and no gross/tare", () => {
    const e1 = validateMeasurementInput({ ...valid, observationStatus: "measured_zero", gross: "1", net: "0" });
    expect(e1.massValues).toMatch(/measured zero/i);
    const e2 = validateMeasurementInput({ ...valid, observationStatus: "measured_zero", gross: "", tare: "", net: "0.5" });
    expect(e2.net).toMatch(/tepat 0/i);
  });

  it("requires basis and method", () => {
    const e = validateMeasurementInput({ ...valid, massBasis: "", method: "" });
    expect(e.massBasis).toBeDefined();
    expect(e.method).toBeDefined();
  });
});

describe("validateEventInput", () => {
  it("requires all identity fields", () => {
    const e = validateEventInput({
      siteId: "", eventType: "", operationDate: "", occurredAt: "", materialCategory: "", stage: "",
    });
    expect(Object.keys(e)).toHaveLength(6);
  });
});

describe("measurementFromInput", () => {
  it("nulls mass values for missing observations", () => {
    const m = measurementFromInput({
      measurementId: "MSR-TEST-1",
      eventId: "EVT-TEST-1",
      observedAt: "2026-11-04T08:00:00+07:00",
      originalText: "",
      massBasis: "raw",
      observationStatus: "missing",
      estimationStatus: "estimated",
      method: "visual_estimate",
      provenance: "demo",
      gross: "1",
      tare: "0",
      net: "1",
    });
    expect(m.gross).toBeNull();
    expect(m.tare).toBeNull();
    expect(m.net).toBeNull();
    expect(m.unit).toBe("kg");
  });
});
