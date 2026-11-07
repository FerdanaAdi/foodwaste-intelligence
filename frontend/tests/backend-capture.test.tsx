import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useNavigate } from "react-router";
import App from "@/App";
import fixture from "./fixtures/backend-detail.json";
import { CAPTURE_JOURNAL_KEY } from "@/backend/write";

const event = { ...fixture.event, occurred_at: "2026-11-06T12:00:00+08:00", event_type: "at_risk_surplus", organization_id: "11111111-1111-4111-8111-111111111111", site_id: "22222222-2222-4222-8222-222222222222" };
function response(value: unknown, status = 200) { return { status, ok: status >= 200 && status < 300, json: async () => value } as Response; }
function mount(path = "/backend-demo/capture") { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("FWI-INT-005 backend capture page", () => {
  it("W-20: event response lost locks the form and prevents duplicate submission", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("lost response")); vi.stubGlobal("fetch", fetchMock);
    mount();
    await user.selectOptions(screen.getByLabelText(/Jenis event backend provisional/), "at_risk_surplus");
    await user.type(screen.getByLabelText(/Waktu kejadian ISO/), "2026-11-06T12:00:00+08:00");
    await user.click(screen.getByRole("button", { name: "Simpan event backend" }));
    expect(await screen.findByText(/Hasil penyimpanan belum dapat dipastikan \(UNKNOWN\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan event backend" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(CAPTURE_JOURNAL_KEY)!)).toMatchObject({ operation: "event", state: "unknown" });
  });
  it("W-23: recover known committed event on deep link via GET only, not POST", async () => {
    const fetchMock = vi.fn(async (url: string, _options?: { method?: string }) => response(url.endsWith("/measurements") ? [] : event));
    vi.stubGlobal("fetch", fetchMock);
    mount(`/backend-demo/capture?event=${event.event_id}`);
    expect(await screen.findByText(/Event dikonfirmasi/)).toBeInTheDocument();
    expect(screen.getByText(/Riwayat backend berhasil dibaca: 0/)).toBeInTheDocument();
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(fetchMock.mock.calls.every(c => c[1]?.method === "GET")).toBe(true);
  });
  it("W-17: pending operation cannot trigger two POSTs", async () => {
    const user = userEvent.setup();
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(r => { resolve = r; })); vi.stubGlobal("fetch", fetchMock);
    mount(); await user.selectOptions(screen.getByLabelText(/Jenis event backend provisional/), "at_risk_surplus");
    await user.type(screen.getByLabelText(/Waktu kejadian ISO/), "2026-11-06T12:00:00+08:00");
    const submit = screen.getByRole("button", { name: "Simpan event backend" });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Sedang menyimpan ke backend/)).toBeInTheDocument();
    expect(screen.queryByText(/Hasil penyimpanan belum dapat dipastikan \(UNKNOWN\)/)).not.toBeInTheDocument();
    resolve(response(event, 201));
    await waitFor(() => expect(screen.getByText(/Event disimpan:/)).toBeInTheDocument());
  });
  it("W-21: ambiguous measurement leaves known event locked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, options: { method: string }) => {
      if (options.method === "POST") throw new TypeError("disconnected");
      return response(url.endsWith("/measurements") ? [] : event);
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(`/backend-demo/capture?event=${event.event_id}`);
    await screen.findByText(/Event dikonfirmasi/);
    await user.selectOptions(screen.getByLabelText("Observation status"), "observed");
    await user.selectOptions(screen.getByLabelText("Mass basis provisional"), "as_served");
    fireEvent.change(screen.getByLabelText(/gross \(kg\)/i), { target: { value: "0.4" } });
    fireEvent.change(screen.getByLabelText(/tare \(kg\)/i), { target: { value: "0.1" } });
    fireEvent.change(screen.getByLabelText(/net \(kg\)/i), { target: { value: "0.3" } });
    await user.type(screen.getByLabelText("Measurement method"), "synthetic_scale");
    await user.type(screen.getByLabelText("Provenance sintetis"), "synthetic test source");
    await user.type(screen.getByLabelText(/Waktu pengukuran ISO/), "2026-11-06T12:02:00+08:00");
    await user.click(screen.getByRole("button", { name: "Simpan measurement ke event ini" }));
    expect(await screen.findByText(/Hasil penyimpanan belum dapat dipastikan \(UNKNOWN\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan measurement ke event ini" })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(c => c[1].method === "POST")).toHaveLength(1);
  });
  it("W-22: explicit measurement rejection keeps the event and corrected POST only targets same UUID", async () => {
    const user = userEvent.setup();
    let posts = 0;
    const fetchMock = vi.fn(async (url: string, options: { method: string; body?: string }) => {
      if (options.method === "POST") { posts++; return posts === 1 ? response({}, 422) : response({ ...fixture.measurement, ...JSON.parse(options.body!) }, 201); }
      return response(url.endsWith("/measurements") ? [] : event);
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(`/backend-demo/capture?event=${event.event_id}`);
    await screen.findByText(/Event dikonfirmasi/);
    await user.selectOptions(screen.getByLabelText("Observation status"), "observed");
    await user.selectOptions(screen.getByLabelText("Mass basis provisional"), "as_served");
    fireEvent.change(screen.getByLabelText(/gross \(kg\)/i), { target: { value: "0.4" } });
    fireEvent.change(screen.getByLabelText(/tare \(kg\)/i), { target: { value: "0.1" } });
    fireEvent.change(screen.getByLabelText(/net \(kg\)/i), { target: { value: "0.3" } });
    await user.type(screen.getByLabelText("Measurement method"), "synthetic_scale");
    await user.type(screen.getByLabelText("Provenance sintetis"), "synthetic test source");
    await user.type(screen.getByLabelText(/Waktu pengukuran ISO/), "2026-11-06T12:02:00+08:00");
    const button = screen.getByRole("button", { name: "Simpan measurement ke event ini" });
    await user.click(button);
    expect(await screen.findByText(/Server menolak operasi \(HTTP 422\)/)).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText(/net \(kg\)/i), { target: { value: "0.3000" } });
    await user.click(button);
    expect(await screen.findByText(/Measurement tersimpan:/)).toBeInTheDocument();
    const posted = fetchMock.mock.calls.filter(c => c[1].method === "POST");
    expect(posted).toHaveLength(2);
    expect(posted.every(c => c[0] === `/demo/v0.1/events/${event.event_id}/measurements`)).toBe(true);
  });
  it("W-20: unknown pending journal survives remount and blocks even with valid input", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem(CAPTURE_JOURNAL_KEY, JSON.stringify({ operation: "event", eventId: null, state: "pending" }));
    const view = mount();
    expect(screen.getByText(/Hasil penyimpanan belum dapat dipastikan \(UNKNOWN\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan event backend" })).toBeDisabled();
    view.unmount();
    mount();
    expect(screen.getByRole("button", { name: "Simpan event backend" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("DemoStore ledger remains unchanged by opening backend capture", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(event)));
    mount();
    expect(screen.getByText(/Terpisah sepenuhnya dari QuickCapture/)).toBeInTheDocument();
    expect(screen.queryByText("EVT-DEMO-2026-0001")).not.toBeInTheDocument();
  });
  it("storage write failure blocks before any POST and recovers busy state", async () => {
    const user = userEvent.setup(); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    mount();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage denied"); });
    await user.selectOptions(screen.getByLabelText(/Jenis event backend provisional/), "at_risk_surplus");
    await user.type(screen.getByLabelText(/Waktu kejadian ISO/), "2026-11-06T12:00:00+08:00");
    await user.click(screen.getByRole("button", { name: "Simpan event backend" }));
    expect(await screen.findByText(/Tidak ada POST dikirim/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /buka kunci/ })).not.toBeDisabled();
  });
  it("invalid route context cannot retain or submit the previously loaded event", async () => {
    const fetchMock = vi.fn(async (url: string) => response(url.endsWith('/measurements') ? [] : event));
    vi.stubGlobal("fetch", fetchMock);
    function SwitchRoute() {
      const navigate = useNavigate();
      return <button onClick={() => navigate('/backend-demo/capture?event=invalid')}>Switch invalid context</button>;
    }
    render(<MemoryRouter initialEntries={[`/backend-demo/capture?event=${event.event_id}`]}><SwitchRoute /><App /></MemoryRouter>);
    await screen.findByText(/Event dikonfirmasi/);
    fireEvent.click(screen.getByRole('button', { name: 'Switch invalid context' }));
    await screen.findByText('UUID pada URL tidak valid.');
    expect(screen.queryByText(/Memeriksa UUID event yang diketahui/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simpan measurement ke event ini' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Event dikonfirmasi/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls).toHaveLength(2);
  });
  it("confirmed save plus journal cleanup failure stays locked without a replay", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, options: { method: string }) => options.method === 'POST'
      ? response(event, 201) : response(url.endsWith('/measurements') ? [] : event));
    vi.stubGlobal('fetch', fetchMock);
    mount();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('storage cleanup denied'); });
    await user.selectOptions(screen.getByLabelText(/Jenis event backend provisional/), 'at_risk_surplus');
    await user.type(screen.getByLabelText(/Waktu kejadian ISO/), '2026-11-06T12:00:00+08:00');
    await user.click(screen.getByRole('button', { name: 'Simpan event backend' }));
    await screen.findByText(/Event disimpan:/);
    expect(await screen.findByRole('button', { name: 'Simpan measurement ke event ini' })).toBeDisabled();
    expect(sessionStorage.getItem(CAPTURE_JOURNAL_KEY)).not.toBeNull();
    expect(fetchMock.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1);
  });
});
