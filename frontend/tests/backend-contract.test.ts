import { describe, expect, it } from "vitest";
import fixture from "./fixtures/backend-detail.json";
import { BACKEND_MASS_BASES, isAwareTimestamp, parseEvent, parseMeasurements } from "@/backend/contract";

const id = fixture.event.event_id;
describe("isolated backend wire parser", () => {
  it("preserves UUID, decimal text, offset, provenance and as_served verbatim", () => {
    expect(parseEvent(fixture.event, id)).toEqual(fixture.event);
    expect(parseMeasurements([fixture.measurement], id)[0]).toEqual(fixture.measurement);
  });
  it.each(BACKEND_MASS_BASES)("accepts shared provisional basis %s without mapping", mass_basis => {
    expect(parseMeasurements([{ ...fixture.measurement, mass_basis }], id)[0].mass_basis).toBe(mass_basis);
  });
  it.each(["missing", "not_measured"])("preserves null for %s", observation_status => {
    expect(parseMeasurements([{ ...fixture.measurement, observation_status, gross: null, tare: null, net: null }], id)[0].net).toBeNull();
  });
  it.each([
    { net: 0.1 }, { gross: "NaN" }, { net: "Infinity" }, { tare: "-1" }, { net: null },
    { event_id: "55555555-5555-4555-8555-555555555555" }, { measurement_id: "bad" },
    { measured_at: "2026-11-06T00:00:00" }, { recorded_at: "2026-02-30T00:00:00Z" },
    { mass_basis: "served" }, { mass_basis: "plate_leftover" }, { observation_status: "weighed" },
    { observation_status: "measured_zero", net: "1" },
    { observation_status: "missing" }, { original_unit: "g" }, { provenance: " " }, { measurement_method: null },
  ])("rejects malformed measurement %j", changes => {
    expect(() => parseMeasurements([{ ...fixture.measurement, ...changes }], id)).toThrow();
  });
  it("rejects malformed event, mismatched identity and duplicate observations", () => {
    expect(() => parseEvent({ ...fixture.event, event_type: "plate_leftover_stream" }, id)).toThrow();
    expect(() => parseEvent(fixture.event, fixture.event.site_id)).toThrow();
    expect(() => parseMeasurements([fixture.measurement, fixture.measurement], id)).toThrow();
    expect(() => parseMeasurements({}, id)).toThrow();
  });
  it.each(["2026-01-01T00:00:00", "2026-02-29T00:00:00Z", "2026-01-01T24:00:00Z", "2026-01-01T00:00:00+24:00", "2026-01-01T00:00:00+08:60"])("rejects invalid/naive timestamp %s", timestamp => {
    expect(isAwareTimestamp(timestamp)).toBe(false);
  });
  it("accepts leap calendar date and keeps subsecond text", () => {
    expect(isAwareTimestamp("2028-02-29T00:00:00.123456+08:00")).toBe(true);
  });
});
