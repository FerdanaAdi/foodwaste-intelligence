import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDomainFetch, prepareSession } from './backend-auth-fixture';
import { MemoryRouter, useNavigate } from "react-router";
import App from "@/App";
import fixture from "./fixtures/backend-detail.json";
import { CAPTURE_JOURNAL_KEY } from "@/backend/write";

const event = { ...fixture.event, occurred_at: "2026-11-06T12:00:00+08:00", event_type: "at_risk_surplus", organization_id: "11111111-1111-4111-8111-111111111111", site_id: "22222222-2222-4222-8222-222222222222" };
function response(value: unknown, status = 200) { return { status, ok: status >= 200 && status < 300, json: async () => value } as Response; }
function mount(path = "/backend-demo/capture") { installDomainFetch(fetch); return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
beforeEach(async () => { sessionStorage.clear(); await prepareSession(); });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("FWI-INT-005 backend capture page", () => {
  it("W-20: event response lost locks the form and prevents duplicate submission", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("lost response")); vi.stubGlobal("fetch", fetchMock);
    mount();
    await user.selectOptions(screen.getByLabelText(/Jenis kejadian/), "at_risk_surplus");
    await user.type(screen.getByLabelText(/Tanggal dan waktu kejadian ISO/), "2026-11-06T12:00:00+08:00");
    await user.click(screen.getByRole("button", { name: "Simpan kejadian" }));
    expect(await screen.findByText(/Hasil penyimpanan belum dapat dipastikan \(UNKNOWN\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan kejadian" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CAPTURE_JOURNAL_KEY)).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("W-23: recover known committed event on deep link via GET only, not POST", async () => {
    const fetchMock = vi.fn(async (url: string, _options?: { method?: string }) => response(url.endsWith("/measurements") ? [] : event));
    vi.stubGlobal("fetch", fetchMock);
    mount(`/backend-demo/capture?event=${event.event_id}`);
    expect(await screen.findByText(/Kejadian telah dibaca/)).toBeInTheDocument();
    expect(screen.getByText(/Riwayat telah dimuat: 0/)).toBeInTheDocument();
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(fetchMock.mock.calls.every(c => c[1]?.method === "GET")).toBe(true);
  });
  it("W-17: pending operation cannot trigger two POSTs", async () => {
    const user = userEvent.setup();
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(r => { resolve = r; })); vi.stubGlobal("fetch", fetchMock);
    mount(); await user.selectOptions(screen.getByLabelText(/Jenis kejadian/), "at_risk_surplus");
    await user.type(screen.getByLabelText(/Tanggal dan waktu kejadian ISO/), "2026-11-06T12:00:00+08:00");
    const submit = screen.getByRole("button", { name: "Simpan kejadian" });
    fireEvent.click(submit); fireEvent.click(submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Sedang menyimpan catatan/)).toBeInTheDocument();
    expect(screen.queryByText(/Hasil penyimpanan belum dapat dipastikan \(UNKNOWN\)/)).not.toBeInTheDocument();
    resolve(response(event, 201));
    await waitFor(() => expect(screen.getByText(/Kejadian berhasil dicatat./)).toBeInTheDocument());
  });
  it("W-21: ambiguous measurement leaves known event locked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, options: { method: string }) => {
      if (options.method === "POST") throw new TypeError("disconnected");
      return response(url.endsWith("/measurements") ? [] : event);
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(`/backend-demo/capture?event=${event.event_id}`);
    await screen.findByText(/Kejadian telah dibaca/);
    await user.selectOptions(screen.getByLabelText("Kondisi hasil pengukuran"), "observed");
    await user.selectOptions(screen.getByLabelText("Kondisi pangan saat diukur"), "as_served");
    fireEvent.change(screen.getByLabelText(/Berat total termasuk wadah \(kg\)/i), { target: { value: "0.4" } });
    fireEvent.change(screen.getByLabelText(/Berat wadah \(kg\)/i), { target: { value: "0.1" } });
    fireEvent.change(screen.getByLabelText(/Berat pangan tanpa wadah \(kg\)/i), { target: { value: "0.3" } });
    await user.type(screen.getByLabelText("Bagaimana berat diperoleh?"), "synthetic_scale");
    await user.type(screen.getByLabelText("Dari mana data ini berasal?"), "synthetic test source");
    await user.type(screen.getByLabelText(/Tanggal dan waktu pengukuran ISO/), "2026-11-06T12:02:00+08:00");
    await user.click(screen.getByRole("button", { name: "Simpan pengukuran" }));
    expect(await screen.findByText(/Hasil penyimpanan belum dapat dipastikan \(UNKNOWN\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan pengukuran" })).toBeDisabled();
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
    await screen.findByText(/Kejadian telah dibaca/);
    await user.selectOptions(screen.getByLabelText("Kondisi hasil pengukuran"), "observed");
    await user.selectOptions(screen.getByLabelText("Kondisi pangan saat diukur"), "as_served");
    fireEvent.change(screen.getByLabelText(/Berat total termasuk wadah \(kg\)/i), { target: { value: "0.4" } });
    fireEvent.change(screen.getByLabelText(/Berat wadah \(kg\)/i), { target: { value: "0.1" } });
    fireEvent.change(screen.getByLabelText(/Berat pangan tanpa wadah \(kg\)/i), { target: { value: "0.3" } });
    await user.type(screen.getByLabelText("Bagaimana berat diperoleh?"), "synthetic_scale");
    await user.type(screen.getByLabelText("Dari mana data ini berasal?"), "synthetic test source");
    await user.type(screen.getByLabelText(/Tanggal dan waktu pengukuran ISO/), "2026-11-06T12:02:00+08:00");
    const button = screen.getByRole("button", { name: "Simpan pengukuran" });
    await user.click(button);
    expect(await screen.findByText(/Server menolak operasi \(HTTP 422\)/)).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Berat pangan tanpa wadah \(kg\)/i), { target: { value: "0.3000" } });
    await user.click(button);
    expect(await screen.findByText(/Pengukuran tersimpan./)).toBeInTheDocument();
    const posted = fetchMock.mock.calls.filter(c => c[1].method === "POST");
    expect(posted).toHaveLength(2);
    expect(posted.every(c => c[0] === `/demo/v0.1/events/${event.event_id}/measurements`)).toBe(true);
  });
  it("W-20: unknown pending journal survives remount and blocks even with valid input", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem(CAPTURE_JOURNAL_KEY, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    const view = mount();
    expect(await screen.findByText(/Hasil penyimpanan belum dapat dipastikan \(UNKNOWN\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan kejadian" })).toBeDisabled();
    view.unmount();
    mount();
    expect(await screen.findByRole("button", { name: "Simpan kejadian" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("DemoStore ledger remains unchanged by opening backend capture", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(event)));
    mount();
    await screen.findByRole('button', { name: 'Simpan kejadian' });
    expect(screen.getByText(/Data latihan tersimpan terpisah/i)).toBeInTheDocument();
    expect(screen.queryByText("EVT-DEMO-2026-0001")).not.toBeInTheDocument();
  });
  it("storage write failure blocks before any POST and recovers busy state", async () => {
    const user = userEvent.setup(); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    mount();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage denied"); });
    await user.selectOptions(screen.getByLabelText(/Jenis kejadian/), "at_risk_surplus");
    await user.type(screen.getByLabelText(/Tanggal dan waktu kejadian ISO/), "2026-11-06T12:00:00+08:00");
    await user.click(screen.getByRole("button", { name: "Simpan kejadian" }));
    expect(await screen.findByText(/Tidak ada POST dikirim/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /buka kunci/ })).not.toBeInTheDocument();
  });
  it("invalid route context cannot retain or submit the previously loaded event", async () => {
    const fetchMock = vi.fn(async (url: string) => response(url.endsWith('/measurements') ? [] : event));
    vi.stubGlobal("fetch", fetchMock);
    function SwitchRoute() {
      const navigate = useNavigate();
      return <button onClick={() => navigate('/backend-demo/capture?event=invalid')}>Switch invalid context</button>;
    }
    installDomainFetch(fetchMock);
    render(<MemoryRouter initialEntries={[`/backend-demo/capture?event=${event.event_id}`]}><SwitchRoute /><App /></MemoryRouter>);
    await screen.findByText(/Kejadian telah dibaca/);
    fireEvent.click(screen.getByRole('button', { name: 'Switch invalid context' }));
    await screen.findByText('UUID pada URL tidak valid.');
    expect(screen.queryByText(/Memeriksa UUID event yang diketahui/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simpan pengukuran' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Kejadian telah dibaca/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls).toHaveLength(2);
  });
  it("confirmed save plus journal cleanup failure stays locked without a replay", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, options: { method: string }) => options.method === 'POST'
      ? response(event, 201) : response(url.endsWith('/measurements') ? [] : event));
    vi.stubGlobal('fetch', fetchMock);
    mount();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('storage cleanup denied'); });
    await user.selectOptions(screen.getByLabelText(/Jenis kejadian/), 'at_risk_surplus');
    await user.type(screen.getByLabelText(/Tanggal dan waktu kejadian ISO/), '2026-11-06T12:00:00+08:00');
    await user.click(screen.getByRole('button', { name: 'Simpan kejadian' }));
    await screen.findByText(/Kejadian berhasil dicatat./);
    expect(await screen.findByRole('button', { name: 'Simpan pengukuran' })).toBeDisabled();
    expect(sessionStorage.getItem(CAPTURE_JOURNAL_KEY)).not.toBeNull();
    expect(fetchMock.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1);
  });
});

it('OSS-01B associates empty event errors without sending a POST', async () => {
 const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);const user=userEvent.setup();mount();
 await user.click(screen.getByRole('button',{name:'Simpan kejadian'}));
 const kind=screen.getByLabelText('Jenis kejadian');expect(kind).toHaveAttribute('aria-invalid','true');
 expect(kind).toHaveAccessibleDescription(/Pilih jenis event/);
 expect(screen.getByLabelText('Tanggal dan waktu kejadian: tanggal')).toHaveAccessibleDescription(/Gunakan waktu ISO/);
 expect(fetchMock).not.toHaveBeenCalled();
});
it('OSS-01B associates measurement errors and preserves helper text without sending a POST', async () => {
 const fetchMock=vi.fn(async(url:string)=>response(url.endsWith('/measurements')?[]:event));vi.stubGlobal('fetch',fetchMock);
 const user=userEvent.setup();mount(`/backend-demo/capture?event=${event.event_id}`);
 await screen.findByRole('button',{name:'Simpan pengukuran'});await user.click(screen.getByRole('button',{name:'Simpan pengukuran'}));
 const gross=screen.getByLabelText(/Berat total termasuk wadah/);
 expect(gross).toHaveAttribute('aria-invalid','true');expect(gross).toHaveAccessibleDescription(/Isi ketiga berat.*Wajib angka desimal/);
 expect(screen.getByLabelText(/Kondisi pangan saat diukur/)).toHaveAccessibleDescription(/Pilih basis massa/);
 expect(fetchMock.mock.calls.every(call=>!String(call[0]).includes('/auth/intents'))).toBe(true);
 expect(fetchMock.mock.calls.every(call=>String(call[0]).includes('/events/'))).toBe(true);
});
