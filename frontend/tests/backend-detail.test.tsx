import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { domainCalls, installDomainFetch, prepareSession } from './backend-auth-fixture';
import { MemoryRouter, useNavigate } from "react-router";
import App from "@/App";
import fixture from "./fixtures/backend-detail.json";
import { readBackendEvent, REQUEST_TIMEOUT_MS } from "@/backend/client";

const id = fixture.event.event_id;
const summaryName = "Ringkasan pengukuran backend";
function summaryCount(label: string) {
  return within(screen.getByRole("region", { name: summaryName })).getByText(label).nextElementSibling;
}
function response(value: unknown, status = 200) {
  return { ok: status === 200, status, json: async () => value } as Response;
}
function mockAPI(records: unknown = [fixture.measurement]) {
  return vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.endsWith("/measurements") ? records : fixture.event)));
}
function mount(path = `/backend-demo/events/${id}`) {
  installDomainFetch(fetch);
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
beforeEach(async () => { sessionStorage.clear(); await prepareSession(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("backend detail read-only route", () => {
  it("returns to measurement capture with the same event UUID using only GET", async () => {
    const user = userEvent.setup();
    mockAPI(); mount();
    await screen.findByText(fixture.measurement.measurement_id);
    await user.click(screen.getByRole('link', { name: 'Kembali: tambah pengukuran pada event ini' }));
    await screen.findByText(/Event dikonfirmasi:/);
    expect(screen.getByRole('button', { name: 'Simpan measurement ke event ini' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simpan event backend' })).not.toBeInTheDocument();
    for (const call of domainCalls()) expect(call[1]?.method).toBe('GET');
  });
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
    expect(summaryCount("Jumlah measurement pada respons")).toHaveTextContent(/^5$/);
    for (const status of ["observed", "estimated", "missing", "measured_zero", "not_measured"]) {
      expect(summaryCount(`Jumlah record ${status}`)).toHaveTextContent(/^1$/);
    }
    expect(screen.getByText(/Dua GET dibaca terpisah, bukan snapshot atomik/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: summaryName })).getByText(/tidak menyatakan kelengkapan atau mutu data/)).toBeInTheDocument();
    expect(screen.getAllByLabelText(`Net: ${fixture.measurement.net} kg`)).toHaveLength(2);
    expect(screen.getAllByLabelText(/: Tidak tersedia \(null\)/)).toHaveLength(6);
    expect(screen.getAllByLabelText(/: 0\.4 kg$/)).toHaveLength(2);
    expect(screen.getAllByLabelText(/: 0 kg$/)).toHaveLength(3);
    expect(screen.getByText(fixture.event.occurred_at)).toBeInTheDocument();
    expect(screen.getByText(fixture.event.recorded_at)).toBeInTheDocument();
    expect(screen.getAllByText("as_served")).toHaveLength(5);
    expect(screen.queryByText("Ditimbang")).not.toBeInTheDocument();
    expect(screen.queryByText("Belum divalidasi")).not.toBeInTheDocument();
    expect(screen.queryByText(/total massa/i)).not.toBeInTheDocument();
    for (const call of domainCalls()) expect(call[1]?.method).toBe("GET");
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
  it("invalid UUID never calls API", async () => {
    mockAPI(); mount("/backend-demo/events/not-a-uuid");
    expect(await screen.findByRole("alert")).toHaveTextContent("harus berupa UUID");
    expect(domainCalls()).toHaveLength(0);
  });
  it("empty success differs from failed history", async () => {
    mockAPI([]); mount();
    await screen.findByText(/Belum ada measurement untuk event/);
    expect(summaryCount("Jumlah measurement pada respons")).toHaveTextContent(/^0$/);
    for (const status of ["observed", "estimated", "missing", "measured_zero", "not_measured"]) {
      expect(summaryCount(`Jumlah record ${status}`)).toHaveTextContent(/^0$/);
    }
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it.each([404, 503])("shows event HTTP %s failure without fallback", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => response({}, status)));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(String(status));
    expect(screen.queryByText("EVT-DEMO-2026-0001")).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: summaryName })).not.toBeInTheDocument();
  });
  it("partial failure keeps event but never claims history is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.endsWith("/measurements") ? {} : fixture.event, url.endsWith("/measurements") ? 503 : 200)));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Riwayat gagal diambil");
    expect(screen.getByText("at_risk_surplus")).toBeInTheDocument();
    expect(screen.queryByText(/Belum ada measurement untuk event/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: summaryName })).not.toBeInTheDocument();
  });
  it("rejects malformed history instead of rendering partial observations", async () => {
    mockAPI([fixture.measurement, { ...fixture.measurement, net: 0 }]); mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("kontrak demo");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: summaryName })).not.toBeInTheDocument();
  });
  it("shows network and invalid JSON errors safely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("private detail")));
    const view = mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Koneksi jaringan backend gagal");
    view.unmount();
    await prepareSession();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError("private raw response"); } })));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("bukan JSON");
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();
  });
  it("times out without accepting a late result", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    installDomainFetch(fetch);
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
    installDomainFetch(fetch);
    render(<MemoryRouter initialEntries={[`/backend-demo/events/${id}`]}><Switch /><App /></MemoryRouter>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Switch event" }));
    await screen.findByText(secondId);
    await act(async () => { resolveOld(response(fixture.event)); });
    await waitFor(() => expect(screen.queryByText(id)).not.toBeInTheDocument());
    expect(screen.getByText(secondId)).toBeInTheDocument();
    expect(summaryCount("Jumlah measurement pada respons")).toHaveTextContent(/^0$/);
  });
});

describe("backend event measurement count summary", () => {
  it("counts repeated observations on one stable event without aggregation or another event", async () => {
    mockAPI([fixture.measurement, { ...fixture.measurement, measurement_id: "55555555-5555-4555-8555-555555555555" }]);
    mount();
    await screen.findByRole("region", { name: summaryName });
    expect(summaryCount("Jumlah measurement pada respons")).toHaveTextContent(/^2$/);
    expect(summaryCount("Jumlah record observed")).toHaveTextContent(/^2$/);
    expect(summaryCount("Jumlah record measured_zero")).toHaveTextContent(/^0$/);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Detail event backend" })).getAllByText(id)).toHaveLength(1);
    expect(screen.getAllByLabelText(`Net: ${fixture.measurement.net} kg`)).toHaveLength(2);
    expect(domainCalls()).toHaveLength(2);
    for (const call of domainCalls()) expect(call[1]?.method).toBe("GET");
  });

  it.each(["event", "measurements"])("does not show counts until the %s response also succeeds", async pendingKind => {
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>(r => { resolve = r; });
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const isHistory = url.endsWith("/measurements");
      return (isHistory === (pendingKind === "measurements")) ? pending : Promise.resolve(response(isHistory ? [fixture.measurement] : fixture.event));
    }));
    mount();
    await waitFor(() => expect(domainCalls()).toHaveLength(2));
    if (pendingKind === "measurements") await screen.findByRole("region", { name: "Detail event backend" });
    else expect(screen.getByText("Memuat event backend…")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: summaryName })).not.toBeInTheDocument();
    await act(async () => resolve(response(pendingKind === "measurements" ? [fixture.measurement] : fixture.event)));
    await screen.findByRole("region", { name: summaryName });
    expect(summaryCount("Jumlah measurement pada respons")).toHaveTextContent(/^1$/);
  });

  it("hides old counts during refresh and replaces them only with the new successful response", async () => {
    let refreshing = false;
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>(r => { resolve = r; });
    vi.stubGlobal("fetch", vi.fn((url: string) => refreshing && url.endsWith("/measurements")
      ? pending : Promise.resolve(response(url.endsWith("/measurements") ? [fixture.measurement] : fixture.event))));
    mount();await screen.findByRole("region", { name: summaryName });
    expect(summaryCount("Jumlah measurement pada respons")).toHaveTextContent(/^1$/);
    refreshing = true;
    await userEvent.setup().click(screen.getByRole("button", { name: /Muat ulang/ }));
    expect(screen.queryByRole("region", { name: summaryName })).not.toBeInTheDocument();
    await screen.findByText("Memuat riwayat pengukuran…");
    await act(async () => resolve(response([])));
    await screen.findByRole("region", { name: summaryName });
    expect(summaryCount("Jumlah measurement pada respons")).toHaveTextContent(/^0$/);
    expect(screen.getByText(/Belum ada measurement untuk event/)).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    for (const call of domainCalls()) expect(call[1]?.method).toBe("GET");
  });

  it.each([401, 403])("session/action HTTP %s closes private counts without fixture fallback", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => response({}, status)));
    mount();
    await screen.findByRole("heading", { name: "Masuk backend sintetis" });
    expect(screen.queryByRole("region", { name: summaryName })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Detail event backend" })).not.toBeInTheDocument();
    expect(screen.queryByText("EVT-DEMO-2026-0001")).not.toBeInTheDocument();
    for (const call of domainCalls()) expect(call[1]?.method).toBe("GET");
  });

  it.each([404, 503])("history HTTP %s never becomes a zero-count or complete summary", async status => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/measurements") ? response({}, status) : response(fixture.event)));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(String(status));
    expect(screen.getByRole("region", { name: "Detail event backend" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: summaryName })).not.toBeInTheDocument();
    expect(screen.queryByText(/Belum ada measurement untuk event/)).not.toBeInTheDocument();
  });

  it("does not summarize successful measurements when the event cannot be verified", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/measurements") ? response([fixture.measurement]) : response({}, 404)));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("404");
    expect(screen.queryByRole("region", { name: summaryName })).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it.each(["duplicate ID", "foreign event", "unknown status"])("refuses the entire count summary for %s in history", async problem => {
    const second = { ...fixture.measurement,
      measurement_id: problem === "duplicate ID" ? fixture.measurement.measurement_id : "55555555-5555-4555-8555-555555555555",
      ...(problem === "foreign event" ? { event_id: "66666666-6666-4666-8666-666666666666" } : {}),
      ...(problem === "unknown status" ? { observation_status: "invented_status" } : {}),
    };
    mockAPI([fixture.measurement, second]);mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("kontrak demo");
    expect(screen.queryByRole("region", { name: summaryName })).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
