import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDomainFetch, prepareSession, sessionA } from './backend-auth-fixture';
import { MemoryRouter } from "react-router";
import App from "@/App";
import userEvent from '@testing-library/user-event';
import { invalidateAuth, selectSite } from '@/backend/auth';
import { readBackendDataQuality } from '@/backend/client';

const live = {
  summary: {
    event_count: 2, measurement_count: 3,
    observation_counts: { observed: 1, measured_zero: 1, estimated: 1, missing: 0, not_measured: 0 },
    validation_counts: { unvalidated: 0, needs_review: 0, flagged: 0 },
    missing_count: 0, needs_attention_count: 0, unmeasured_event_count: 0, estimated_count: 1,
  },
  records: [{ event_id: "33333333-3333-4333-8333-333333333331", event_type: "at_risk_surplus",
              occurred_at: "2026-11-04T07:00:00+08:00", measurement_ids: ["44444444-4444-4444-8444-444444444441"],
              observation_statuses: ["observed"] },
            { event_id: "33333333-3333-4333-8333-333333333332", event_type: "actual_loss_discard",
              occurred_at: "2026-11-05T07:00:00+08:00", measurement_ids: ["44444444-4444-4444-8444-444444444442", "44444444-4444-4444-8444-444444444443"],
              observation_statuses: ["measured_zero", "estimated"] }],
};
function response(value: unknown, status = 200) { return { status, ok: status >= 200 && status < 300, json: async () => value } as Response; }
function mount() { installDomainFetch(fetch); return render(<MemoryRouter initialEntries={["/backend-demo/data-quality"]}><App /></MemoryRouter>); }
beforeEach(async () => { sessionStorage.clear(); await prepareSession(); });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("FR-007 live data-quality dashboard", () => {
  it("shows count-only summary with distinct statuses and drill-down", async () => {
    const fetchMock = vi.fn(async () => response(live));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    expect(await screen.findByText(/Mutu Data — LIVE BACKEND/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Ringkasan hitungan")).toHaveTextContent("2"));
    expect(screen.getByLabelText("Rincian status observasi")).toHaveTextContent("measured_zero");
    expect(screen.getByLabelText("Status validasi")).toHaveTextContent(/Belum dinilai/);
    expect(screen.getByLabelText("Drill-down sumber")).toHaveTextContent("1 pengukuran");
    expect(screen.getByRole("link", { name: live.records[0]!.event_id })).toBeInTheDocument();
  });

  it("backend failure shows an error state without fixture fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("boom", 503)));
    mount();
    expect(await screen.findByText(/Layanan tidak tersedia/)).toBeInTheDocument();
    expect(screen.queryByText(/LIVE BACKEND/)).toBeInTheDocument(); // header label remains
    expect(screen.queryByLabelText("Ringkasan hitungan")).not.toBeInTheDocument();
  });
});


const filtered = {
  summary: { ...live.summary, event_count: 1, measurement_count: 2, estimated_count: 0,
    missing_count: 1, observation_counts: { observed: 0, measured_zero: 1, missing: 1, estimated: 0, not_measured: 0 } },
  records: [{ ...live.records[0], measurement_ids: live.records[1].measurement_ids,
    observation_statuses: ['measured_zero', 'missing'] }],
};
const empty = { summary: { ...live.summary, event_count: 0, measurement_count: 0, estimated_count: 0,
  observation_counts: { observed: 0, measured_zero: 0, missing: 0, estimated: 0, not_measured: 0 } }, records: [] };
function dates(from: string, to: string) {
  fireEvent.change(screen.getByLabelText('Tanggal kegiatan dapur dari'), { target: { value: from } });
  fireEvent.change(screen.getByLabelText('Tanggal kegiatan dapur sampai'), { target: { value: to } });
}

describe('FR-007 kitchen operation-date and stage filters', () => {
  it('applies filters explicitly, reconciles summary/drill-down, and resets to unfiltered data', async () => {
    const user = userEvent.setup();
    const mock = vi.fn(async (url: string) => response(new URL(url, 'https://127.0.0.1:5173').searchParams.has('operation_date_from') ? filtered : live));
    vi.stubGlobal('fetch', mock); mount();
    await screen.findByLabelText('Ringkasan hitungan');
    dates('2026-11-05', '2026-11-05');
    fireEvent.change(screen.getByLabelText('Kode tahap kegiatan'), { target: { value: 'preparation' } });
    expect(mock).toHaveBeenCalledTimes(1); // Draft editing does not dispatch a request.
    await user.click(screen.getByRole('button', { name: 'Terapkan filter' }));
    await waitFor(() => expect(screen.getByLabelText('Drill-down sumber')).toHaveTextContent('2 pengukuran'));
    const params = new URL(String(mock.mock.calls.at(-1)![0]), 'https://127.0.0.1:5173').searchParams;
    expect(Object.fromEntries(params)).toEqual({ site_id: sessionA.sites[0].site_id,
      stage_code: 'preparation', operation_date_from: '2026-11-05', operation_date_to: '2026-11-05' });
    expect(screen.getByLabelText('Filter aktif')).toHaveTextContent('2026-11-05');
    expect(screen.getByLabelText('Filter aktif')).toHaveTextContent('preparation');
    expect(screen.getByLabelText('Rincian status observasi')).toHaveTextContent('missing1');
    expect(screen.getByLabelText('Rincian status observasi')).toHaveTextContent('measured_zero1');
    expect(screen.getByRole('link', { name: filtered.records[0].event_id! })).toHaveAttribute('href', `/backend-demo/events/${filtered.records[0].event_id}`);
    expect(screen.queryByRole('link', { name: live.records[1].event_id })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset filter' }));
    await screen.findByRole('link', { name: live.records[1].event_id });
    expect(screen.getByLabelText('Kode tahap kegiatan')).toHaveValue('');
    expect(new URL(String(mock.mock.calls.at(-1)![0]), 'https://127.0.0.1:5173').search).toBe(`?site_id=${sessionA.sites[0].site_id}`);
  });
  it('rejects a reversed date range before sending GET', async () => {
    const user = userEvent.setup(); const mock = vi.fn(async () => response(live)); vi.stubGlobal('fetch', mock); mount();
    await screen.findByLabelText('Ringkasan hitungan'); dates('2026-11-06', '2026-11-04');
    await user.click(screen.getByRole('button', { name: 'Terapkan filter' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Tanggal mulai tidak boleh setelah tanggal sampai');
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it.each(['2026-02-30', '20261105', '2026-13-01'])('rejects invalid date %s in the client without a request', async value => {
    const mock = vi.fn(); vi.stubGlobal('fetch', mock);
    await expect(readBackendDataQuality(new AbortController().signal, { operation_date_from: value })).rejects.toThrow('Tanggal kegiatan dapur');
    expect(mock).not.toHaveBeenCalled();
  });
  it('shows empty bounded-date results without replacing null dates or falling back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(empty))); mount();
    expect(await screen.findByText('Tidak ada kejadian pada lokasi dan filter aktif')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: live.records[0].event_id })).not.toBeInTheDocument();
  });
  it('a late filtered GET cannot replace the newer filter result', async () => {
    const user = userEvent.setup(); let finish!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const stage = new URL(url, 'https://127.0.0.1:5173').searchParams.get('stage_code');
      return stage === 'preparation' ? new Promise<Response>(resolve => { finish = resolve; }) : Promise.resolve(response(stage ? filtered : live));
    })); mount(); await screen.findByLabelText('Ringkasan hitungan');
    fireEvent.change(screen.getByLabelText('Kode tahap kegiatan'), { target: { value: 'preparation' } });
    await user.click(screen.getByRole('button', { name: 'Terapkan filter' }));
    expect(screen.queryByLabelText('Ringkasan hitungan')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Kode tahap kegiatan'), { target: { value: 'serving' } });
    await user.click(screen.getByRole('button', { name: 'Terapkan filter' }));
    await screen.findByLabelText('Ringkasan hitungan');
    await act(async () => { finish(response(live)); });
    expect(screen.getByLabelText('Filter aktif')).toHaveTextContent('serving');
    expect(screen.queryByRole('link', { name: live.records[1].event_id })).not.toBeInTheDocument();
  });
  it('site switching rejects a late response from the former site', async () => {
    const siteB = '22222222-2222-4222-8222-222222222223';
    await prepareSession({ ...sessionA, sites: [...sessionA.sites, { site_id: siteB, permissions: ['event.read'] }] });
    let finish!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => new URL(url, 'https://127.0.0.1:5173').searchParams.get('site_id') === siteB
      ? Promise.resolve(response(empty)) : new Promise<Response>(resolve => { finish = resolve; })));
    mount(); await waitFor(() => expect(finish).toBeTypeOf('function'));
    act(() => selectSite(siteB));
    await screen.findByText('Tidak ada kejadian pada lokasi dan filter aktif');
    await act(async () => { finish(response(live)); });
    expect(screen.queryByRole('link', { name: live.records[0].event_id })).not.toBeInTheDocument();
  });
  it('logout closes private results even when a pending response arrives afterwards', async () => {
    let finish!: (r: Response) => void; vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    mount(); await waitFor(() => expect(finish).toBeTypeOf('function'));
    act(() => invalidateAuth());
    await act(async () => { finish(response(live)); });
    expect(screen.getByRole('heading', { name: 'Masuk ke FWI' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Ringkasan hitungan')).not.toBeInTheDocument();
  });
});
