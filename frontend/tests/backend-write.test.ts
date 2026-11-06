import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/backend-detail.json";
import {
  createBackendEvent, createBackendMeasurement, eventErrors, measurementErrors,
  SYNTHETIC_ORG_ID, SYNTHETIC_SITE_ID,
} from "@/backend/write";
import type { EventInput, MeasurementInput } from "@/backend/write";

const event: EventInput = { organization_id: SYNTHETIC_ORG_ID, site_id: SYNTHETIC_SITE_ID, event_type: "at_risk_surplus", occurred_at: "2026-11-06T12:00:00+08:00" };
const measurement: MeasurementInput = {
  observation_status: "observed", gross: "0.123456789012345678901234567890123456789", tare: "0", net: "0.123456789012345678901234567890123456789",
  original_unit: "kg", mass_basis: "as_served", measurement_method: "synthetic-test", provenance: "synthetic-test", measured_at: "2026-11-06T12:02:00+08:00",
};
const response = (body: unknown, status = 201) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("FWI-INT-005 write boundary client", () => {
  it("W-20: lost event response remains UNKNOWN; exactly one POST and no automatic retry", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network failure"));
    vi.stubGlobal("fetch", fetchMock);
    expect((await createBackendEvent(event)).kind).toBe("unknown");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });
  it("W-21: missing measurement response remains UNKNOWN and one POST only", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timeout", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);
    expect((await createBackendMeasurement(fixture.event.event_id, measurement)).kind).toBe("unknown");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("W-22: explicit 422 is rejected; draft can be corrected and consciously resubmitted to identical UUID", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({}, 422)).mockResolvedValueOnce(response({ ...fixture.measurement, ...measurement }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await createBackendMeasurement(fixture.event.event_id, { ...measurement, net: "9" })).kind).toBe("rejected");
    const second = await createBackendMeasurement(fixture.event.event_id, measurement);
    expect(second.kind).toBe("saved");
    expect(fetchMock.mock.calls.map(x => x[0])).toEqual([
      `/demo/v0.1/events/${fixture.event.event_id}/measurements`,
      `/demo/v0.1/events/${fixture.event.event_id}/measurements`,
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).net).toBe("9");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).net).toBe(measurement.net);
  });
  it("W-24: missing requires all null, zero requires explicit gross/tare/net", () => {
    expect(measurementErrors({ ...measurement, observation_status: "missing", gross: null, tare: null, net: null })).toEqual({});
    expect(measurementErrors({ ...measurement, observation_status: "missing", gross: "0", tare: null, net: null })).toHaveProperty("gross");
    expect(measurementErrors({ ...measurement, observation_status: "measured_zero", gross: "0.4", tare: "0.4", net: "0" })).toEqual({});
    expect(measurementErrors({ ...measurement, observation_status: "measured_zero", net: "0.1" })).toHaveProperty("net");
    expect(measurementErrors({ ...measurement, observation_status: "measured_zero", gross: null })).toHaveProperty("gross");
  });
  it("rejects non-aware timestamps, invalid site and bogus decimal before POST", async () => {
    expect(eventErrors({ ...event, occurred_at: "2026-11-06T12:00:00" })).toHaveProperty("occurred_at");
    expect(eventErrors({ ...event, site_id: "33333333-3333-4333-8333-333333333333" })).toHaveProperty("site");
    expect(measurementErrors({ ...measurement, gross: "NaN" })).toHaveProperty("gross");
    expect(measurementErrors({ ...measurement, gross: "-1" })).toHaveProperty("gross");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await createBackendMeasurement("invalid-uuid", measurement)).kind).toBe("rejected");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserves long decimal as string in outgoing JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ...fixture.measurement, ...measurement }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await createBackendMeasurement(fixture.event.event_id, measurement)).kind).toBe("saved");
    const request = fetchMock.mock.calls[0][1];
    expect(request.credentials).toBe("omit");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body).net).toBe("0.123456789012345678901234567890123456789");
  });
  it("201 with malformed JSON never claims success and never retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ incorrect: true })); vi.stubGlobal("fetch", fetchMock);
    expect((await createBackendEvent(event)).kind).toBe("unknown");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("5xx remains unknown, 404 remains explicit rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 503)));
    expect((await createBackendEvent(event)).kind).toBe("unknown");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 404)));
    expect((await createBackendEvent(event)).kind).toBe("rejected");
  });
  it("a well-formed response for different input is UNKNOWN", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(fixture.measurement)));
    expect((await createBackendMeasurement(fixture.event.event_id, measurement)).kind).toBe("unknown");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(fixture.event)));
    expect((await createBackendEvent(event)).kind).toBe("unknown");
  });
  it("accepts exact decimal normalization and equivalent timestamp offsets", async () => {
    const body = { ...measurement, gross: "0.4000", tare: "0.1", net: "0.3000" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...fixture.measurement, ...body, gross: "4E-1", net: "0.3", measured_at: "2026-11-06T04:02:00Z" })));
    expect((await createBackendMeasurement(fixture.event.event_id, body)).kind).toBe("saved");
  });
  it.each([
    ["2026-11-06T12:00:00.123456+08:00", "2026-11-06T04:00:00.123456Z", "saved"],
    ["2026-11-06T12:00:00.123456+08:00", "2026-11-06T04:00:00.123457Z", "unknown"],
    ["2026-11-06T12:00:00.1234+08:00", "2026-11-06T04:00:00.123400Z", "saved"],
  ])("sameInstant preserves fractional-second comparison: %s / %s", async (occurred_at, returnedTime, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...fixture.event, occurred_at: returnedTime })));
    expect((await createBackendEvent({ ...event, occurred_at })).kind).toBe(kind);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
