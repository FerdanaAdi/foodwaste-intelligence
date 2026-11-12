import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDomainFetch, prepareSession, sessionA } from './backend-auth-fixture';
import { MemoryRouter } from "react-router";
import App from "@/App";
import { authSnapshot, invalidateAuth, selectSite } from '@/backend/auth';
import { fetchAuthorizedExport } from '@/backend/export-live';

function csvResponse(body: string) {
  return { status: 200, ok: true,
    headers: new Map([["X-FWI-Principal", sessionA.principal_id], ["X-FWI-Auth-Context", sessionA.auth_context_id], ["Content-Type", "text/csv; charset=utf-8"],
      ["Content-Disposition", 'attachment; filename="fwi-events-site-x.csv"'],
      ["X-FWI-Export-Scope-Site", "22222222-2222-4222-8222-222222222222"],
      ["X-FWI-Export-Events", "1"], ["X-FWI-Export-Measurements", "2"],
      ["X-FWI-Export-Format", "fwi-synthetic-export-v0.1"],
      ["Cache-Control", "no-store"]]) as unknown as Headers,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer };
}
function mount() { installDomainFetch(fetch); return render(<MemoryRouter initialEntries={["/backend-demo/export"]}><App /></MemoryRouter>); }
beforeEach(async () => { sessionStorage.clear(); await prepareSession(); });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("FR-008 backend export live page", () => {
  it("fetches the export with scope headers and offers a download", async () => {
    const user = userEvent.setup();
    const csv = "event_id,export_label\nabc,SYNTHETIC/DEMO";
    const fetchMock = vi.fn(async (_url?: unknown, _options?: unknown) => csvResponse(csv));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await user.click(screen.getByRole("button", { name: /Ambil ekspor dari server/ }));
    expect(await screen.findByText(/fwi-synthetic-export-v0.1/)).toBeInTheDocument();
    expect(screen.getByText(/1 event/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unduh fwi-events-site-x.csv/ })).toBeInTheDocument();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("site_id=22222222-2222-4222-8222-222222222222");
    expect(url).toContain("dataset=events");
  });

  it("marks XLSX as unavailable and never offers it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => csvResponse("x")));
    mount();
    expect(await screen.findByText(/XLSX belum tersedia/)).toBeInTheDocument();
    const datasetSelect = screen.getByLabelText(/Dataset/);
    expect(Array.from((datasetSelect as HTMLSelectElement).options).map(o => o.value))
      .toEqual(["events", "measurements", "metadata"]);
  });

  it("denied or failed export shows an error without fixture fallback", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => binaryResponse(404)));
    mount();
    await user.click(screen.getByRole("button", { name: /Ambil ekspor dari server/ }));
    expect(await screen.findByText(/Layanan tidak tersedia|ditolak/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unduh/ })).not.toBeInTheDocument();
  });
});


function binaryResponse(status = 200, headers: Record<string, string> = {}, body = 'synthetic') {
  const response = new Response(body, { status, headers: {
    'X-FWI-Principal': sessionA.principal_id, 'X-FWI-Auth-Context': sessionA.auth_context_id,
    'X-FWI-Export-Scope-Site': sessionA.sites[0].site_id,
    'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment',
    'X-FWI-Export-Events': '1', 'X-FWI-Export-Measurements': '2',
    'X-FWI-Export-Format': 'fwi-synthetic-export-v0.1', ...headers,
  } });
  // The existing domain adapter spreads fixtures; native status/ok/body readers live on the prototype.
  return { status: response.status, ok: response.ok, headers: response.headers,
    arrayBuffer: response.arrayBuffer.bind(response) } as Response;
}
function exportRequest(dataset: 'events' | 'measurements' | 'metadata' = 'events') {
  return fetchAuthorizedExport(dataset, {}, new AbortController().signal);
}
const siteB = '33333333-3333-4333-8333-333333333333';

describe('export authentication lifecycle', () => {
  it.each([401, 403])('%s closes the current session without fixture fallback or retry', async status => {
    const mock = vi.fn(async () => binaryResponse(status)); vi.stubGlobal('fetch', mock);
    await expect(exportRequest()).rejects.toMatchObject({ status });
    expect(authSnapshot().session).toBeNull(); expect(mock).toHaveBeenCalledTimes(1);
  });
  it('concealed 404 rejects delivery while retaining the verified session', async () => {
    const before = authSnapshot(); vi.stubGlobal('fetch', vi.fn(async () => binaryResponse(404)));
    await expect(exportRequest()).rejects.toThrow('404'); expect(authSnapshot()).toBe(before);
  });
  it('accepts matching identity and keeps same-origin, no-store and redirect rejection', async () => {
    const mock = vi.fn(async () => binaryResponse()); vi.stubGlobal('fetch', mock);
    expect(new TextDecoder().decode((await exportRequest()).bytes)).toBe('synthetic');
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]).toEqual([expect.stringContaining('/demo/v0.1/export?'),
      expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal) })]);
  });
  it.each(['X-FWI-Principal', 'X-FWI-Auth-Context'])('rejects missing %s and closes current authentication', async name => {
    const response = binaryResponse(); response.headers.delete(name);
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await expect(exportRequest()).rejects.toThrow(); expect(authSnapshot().session).toBeNull();
  });
  it.each(['X-FWI-Principal', 'X-FWI-Auth-Context'])('rejects mismatched %s', async name => {
    vi.stubGlobal('fetch', vi.fn(async () => binaryResponse(200, { [name]: siteB })));
    await expect(exportRequest()).rejects.toThrow(); expect(authSnapshot().session).toBeNull();
  });
  it('rejects foreign export scope even with matching session identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => binaryResponse(200, { 'X-FWI-Export-Scope-Site': siteB })));
    await expect(exportRequest()).rejects.toThrow('Scope ekspor');
  });
  it.each([200, 401, 403])('old response %s cannot deliver or invalidate a newer session', async status => {
    let resolve!: (r: Response) => void;
    const mock = vi.fn(() => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal('fetch', mock);
    const pending = exportRequest(); const rejection = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    const next = { ...sessionA, auth_context_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };
    await prepareSession(next); const current = authSnapshot();
    resolve(binaryResponse(status)); await rejection;
    expect(authSnapshot()).toBe(current); expect(authSnapshot().session?.auth_context_id).toBe(next.auth_context_id);
  });
  it.each(['headers', 'body'])('site change rejects delayed export %s without closing the new site', async stage => {
    await prepareSession({ ...sessionA, sites: [...sessionA.sites, { site_id: siteB, permissions: ['event.read'] }] });
    let resolve!: (value: Response | ArrayBuffer) => void;
    const response = binaryResponse();
    if (stage === 'body') response.arrayBuffer = () => new Promise<ArrayBuffer>(done => { resolve = done as typeof resolve; });
    const mock = vi.fn(() => stage === 'headers' ? new Promise<Response>(done => { resolve = done as typeof resolve; }) : Promise.resolve(response));
    vi.stubGlobal('fetch', mock); const pending = exportRequest(); const rejection = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    selectSite(siteB); const current = authSnapshot();
    resolve(stage === 'headers' ? response : new ArrayBuffer(0)); await rejection;
    expect(authSnapshot()).toBe(current); expect(authSnapshot().site).toBe(siteB);
  });
  it('logout invalidation rejects a pending delivery', async () => {
    let resolve!: (r: Response) => void; vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    const pending = exportRequest(); const rejection = expect(pending).rejects.toThrow();
    invalidateAuth(); resolve(binaryResponse()); await rejection;
    expect(authSnapshot().phase).toBe('anonymous');
  });
});

describe('export dataset format contract', () => {
  it.each(['events', 'measurements', 'metadata'] as const)('%s has matching content type and fallback suffix', async dataset => {
    const json = dataset === 'metadata';
    vi.stubGlobal('fetch', vi.fn(async () => binaryResponse(200, { 'Content-Type': json ? 'application/json' : 'text/csv; charset=utf-8' }, json ? '{"synthetic":true}' : 'event_id\nabc')));
    const delivery = await exportRequest(dataset);
    expect(delivery.filename).toBe(`fwi-${dataset}.${json ? 'json' : 'csv'}`);
    expect(delivery.mediaType).toMatch(json ? /application\/json/ : /text\/csv/);
    expect(new TextDecoder().decode(delivery.bytes)).toBe(json ? '{"synthetic":true}' : 'event_id\nabc');
  });
  it('shows the metadata JSON filename returned by the server', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => binaryResponse(200, {
      'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="fwi-metadata-site-a.json"',
    }, '{"synthetic":true}'))); mount();
    await user.selectOptions(screen.getByLabelText('Dataset'), 'metadata');
    await user.click(screen.getByRole('button', { name: /Ambil ekspor dari server/ }));
    expect(await screen.findByRole('button', { name: 'Unduh fwi-metadata-site-a.json' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Ekspor JSON/ })).toBeInTheDocument();
  });
  it('cannot switch the selected format while the response is pending', async () => {
    const user = userEvent.setup(); let resolve!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; }))); mount();
    await user.click(screen.getByRole('button', { name: /Ambil ekspor dari server/ }));
    expect(screen.getByLabelText('Dataset')).toBeDisabled();
    resolve(binaryResponse());
    expect(await screen.findByRole('button', { name: 'Unduh fwi-events.csv' })).toBeInTheDocument();
    expect(screen.getByLabelText('Dataset')).toBeEnabled();
  });
  it('labels metadata as JSON and CSV datasets as CSV', async () => {
    const user = userEvent.setup(); vi.stubGlobal('fetch', vi.fn(async () => binaryResponse())); mount();
    expect(screen.getByRole('heading', { name: /Ekspor CSV/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Kejadian (CSV)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Pengukuran (CSV)' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Dataset'), 'metadata');
    expect(screen.getByRole('heading', { name: /Ekspor JSON/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Metadata (JSON)' })).toBeInTheDocument();
  });
});


describe('M3-02 stage export filters and delivery invalidation', () => {
  it.each(['events', 'measurements', 'metadata'] as const)('%s transmits the exact stage and other filters together', async dataset => {
    const user = userEvent.setup();
    const mock = vi.fn(async (_url: string) => binaryResponse(200, { 'Content-Type': dataset === 'metadata' ? 'application/json' : 'text/csv' }));
    vi.stubGlobal('fetch', mock); mount();
    await user.selectOptions(screen.getByLabelText('Dataset'), dataset);
    await user.selectOptions(screen.getByLabelText('Jenis event'), 'at_risk_surplus');
    await user.click(screen.getByLabelText('Kode tahap kegiatan')); await user.paste('preparation');
    await user.click(screen.getByLabelText('Tanggal operasi dari')); await user.paste('2026-11-04');
    await user.click(screen.getByLabelText('Tanggal operasi sampai')); await user.paste('2026-11-05');
    await user.click(screen.getByRole('button', { name: 'Ambil ekspor dari server' }));
    await screen.findByRole('button', { name: `Unduh fwi-${dataset}.${dataset === 'metadata' ? 'json' : 'csv'}` });
    const query = new URL(String(mock.mock.calls[0]![0]), 'https://127.0.0.1:5173').searchParams;
    expect(Object.fromEntries(query)).toEqual({ site_id: sessionA.sites[0].site_id, dataset,
      event_type: 'at_risk_surplus', stage_code: 'preparation', operation_date_from: '2026-11-04', operation_date_to: '2026-11-05' });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('omits the stage parameter when the code input is empty', async () => {
    const user = userEvent.setup(); const mock = vi.fn(async (_url: string) => binaryResponse()); vi.stubGlobal('fetch', mock); mount();
    await user.click(screen.getByLabelText('Kode tahap kegiatan')); await user.paste('preparation');
    await user.clear(screen.getByLabelText('Kode tahap kegiatan'));
    await user.click(screen.getByRole('button', { name: 'Ambil ekspor dari server' }));
    await screen.findByRole('button', { name: 'Unduh fwi-events.csv' });
    expect(new URL(String(mock.mock.calls[0]![0]), 'https://127.0.0.1:5173').searchParams.has('stage_code')).toBe(false);
  });
  it.each(['Kode tahap kegiatan', 'Tanggal operasi dari', 'Tanggal operasi sampai', 'Jenis event', 'Dataset'])('editing %s removes the previous download without fetching automatically', async label => {
    const user = userEvent.setup(); const mock = vi.fn(async (_url: string) => binaryResponse()); vi.stubGlobal('fetch', mock); mount();
    await user.click(screen.getByRole('button', { name: 'Ambil ekspor dari server' }));
    await screen.findByRole('button', { name: 'Unduh fwi-events.csv' });
    if (label === 'Dataset') await user.selectOptions(screen.getByLabelText(label), 'metadata');
    else if (label === 'Jenis event') await user.selectOptions(screen.getByLabelText(label), 'actual_loss_discard');
    else { await user.click(screen.getByLabelText(label)); await user.paste(label === 'Kode tahap kegiatan' ? 'serving' : '2026-11-05'); }
    expect(screen.queryByRole('button', { name: /Unduh/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hasil ekspor')).not.toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('disables every dataset/filter control during a pending request', async () => {
    const user = userEvent.setup(); let resolve!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; }))); mount();
    await user.click(screen.getByRole('button', { name: 'Ambil ekspor dari server' }));
    const labels = ['Dataset', 'Jenis event', 'Kode tahap kegiatan', 'Tanggal operasi dari', 'Tanggal operasi sampai'];
    for (const label of labels) expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Menyiapkan ekspor…' })).toBeDisabled();
    resolve(binaryResponse()); await screen.findByRole('button', { name: 'Unduh fwi-events.csv' });
    for (const label of labels) expect(screen.getByLabelText(label)).toBeEnabled();
  });
  it.each(['logout', 'site'])('a late response after %s never reintroduces the old download', async transition => {
    await prepareSession({ ...sessionA, sites: [...sessionA.sites, { site_id: siteB, permissions: ['event.read'] }] });
    const user = userEvent.setup(); let resolve!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; }))); mount();
    await user.click(screen.getByRole('button', { name: 'Ambil ekspor dari server' }));
    act(() => { if (transition === 'logout') invalidateAuth(); else selectSite(siteB); });
    await act(async () => { resolve(binaryResponse()); });
    expect(screen.queryByRole('button', { name: /Unduh/ })).not.toBeInTheDocument();
    if (transition === 'logout') expect(screen.getByRole('heading', { name: 'Masuk ke FWI' })).toBeInTheDocument();
    else expect(authSnapshot().site).toBe(siteB);
  });
});
