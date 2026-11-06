import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useNavigate } from "react-router";
import App from "@/App";
import fixture from "./fixtures/backend-detail.json";
import { readBackendEvent, REQUEST_TIMEOUT_MS } from "@/backend/client";

const id = fixture.event.event_id;
function response(value: unknown, status = 200) {
  return { ok: status === 200, status, json: async () => value } as Response;
}
function mockAPI(records: unknown = [fixture.measurement]) {
  return vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.endsWith("/measurements") ? records : fixture.event)));
}
function mount(path = `/backend-demo/events/${id}`) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("backend detail read-only route", () => {
  it("renders every observation, exact decimal/null and separate timestamps without totals", async () => {
    mockAPI(["observed", "estimated", "missing", "measured_zero", "not_measured"].map((observation_status, index) => ({
      ...fixture.measurement, measurement_id: `44444444-4444-4444-8444-44444444444${index}`,
      observation_status, ...(["missing", "not_measured"].includes(observation_status) ? { gross: null, tare: null, net: null }
        : observation_status === "measured_zero" ? { gross: "0.4", tare: "0.4", net: "0" } : {}),
    })));
    mount();
    expect(screen.getByText("Memuat event backend…")).toBeInTheDocument();
    await screen.findByText("Estimasi (estimated)");
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(screen.getAllByText(`${fixture.measurement.net} kg`).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tidak tersedia (null)")).toHaveLength(6);
    expect(screen.getAllByText("0.4 kg")).toHaveLength(2);
    expect(screen.getAllByText("0 kg")).toHaveLength(3);
    expect(screen.getByText(fixture.event.occurred_at)).toBeInTheDocument();
    expect(screen.getByText(fixture.event.recorded_at)).toBeInTheDocument();
    expect(screen.getAllByText("as_served")).toHaveLength(5);
    expect(screen.queryByText("Ditimbang")).not.toBeInTheDocument();
    expect(screen.queryByText("Belum divalidasi")).not.toBeInTheDocument();
    expect(screen.queryByText(/total massa/i)).not.toBeInTheDocument();
    for (const call of vi.mocked(fetch).mock.calls) expect(call[1]?.method).toBe("GET");
  });
  it("refresh preserves UUID and in-memory ledger remains uncontaminated", async () => {
    const user = userEvent.setup();
    mockAPI(); mount();
    await screen.findByText(fixture.measurement.measurement_id);
    await user.click(screen.getByRole("button", { name: /Muat ulang/ }));
    await screen.findByText(fixture.measurement.measurement_id);
    expect(screen.getAllByText(id).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("link", { name: /Buka ledger in-memory/ }));
    expect(screen.getByText("EVT-DEMO-2026-0001")).toBeInTheDocument();
    expect(screen.queryByText(id)).not.toBeInTheDocument();
  });
  it("invalid UUID never calls API", () => {
    mockAPI(); mount("/backend-demo/events/not-a-uuid");
    expect(screen.getByRole("alert")).toHaveTextContent("harus berupa UUID");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("empty success differs from failed history", async () => {
    mockAPI([]); mount();
    await screen.findByText(/Belum ada measurement untuk event/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it.each([404, 503])("shows event HTTP %s failure without fallback", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => response({}, status)));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(String(status));
    expect(screen.queryByText("EVT-DEMO-2026-0001")).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
  it("partial failure keeps event but never claims history is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.endsWith("/measurements") ? {} : fixture.event, url.endsWith("/measurements") ? 503 : 200)));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Riwayat gagal diambil");
    expect(screen.getByText("at_risk_surplus")).toBeInTheDocument();
    expect(screen.queryByText(/Belum ada measurement untuk event/)).not.toBeInTheDocument();
  });
  it("rejects malformed history instead of rendering partial observations", async () => {
    mockAPI([fixture.measurement, { ...fixture.measurement, net: 0 }]); mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("kontrak demo");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
  it("shows network and invalid JSON errors safely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("private detail")));
    const view = mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Koneksi jaringan backend gagal");
    view.unmount();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError("private raw response"); } })));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("bukan JSON");
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();
  });
  it("times out without accepting a late result", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const result = readBackendEvent(id, new AbortController().signal);
    const assertion = expect(result).rejects.toThrow("Batas waktu");
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("ignores old requests even when transport ignores abort", async () => {
    let resolveOld!: (value: Response) => void;
    const old = new Promise<Response>(resolve => { resolveOld = resolve; });
    const secondId = "55555555-5555-4555-8555-555555555555";
    vi.stubGlobal("fetch", vi.fn((url: string) => url.includes(secondId)
      ? Promise.resolve(response(url.endsWith("/measurements") ? [] : { ...fixture.event, event_id: secondId })) : old));
    function Switch() {
      const navigate = useNavigate();
      return <button onClick={() => navigate(`/backend-demo/events/${secondId}`)}>Switch event</button>;
    }
    render(<MemoryRouter initialEntries={[`/backend-demo/events/${id}`]}><Switch /><App /></MemoryRouter>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Switch event" }));
    await screen.findByText(secondId);
    await act(async () => { resolveOld(response(fixture.event)); });
    await waitFor(() => expect(screen.queryByText(id)).not.toBeInTheDocument());
    expect(screen.getByText(secondId)).toBeInTheDocument();
  });
});
