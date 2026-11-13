import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDomainFetch, prepareSession } from './backend-auth-fixture';
import { MemoryRouter } from "react-router";
import App from "@/App";

const namespaces = [
  { namespace: "stage", label: "tahap operasional (contoh provisional)", code_count: 0 },
  { namespace: "unit", label: "satuan (contoh provisional)", code_count: 0 },
];
const references = [{
  reference_id: "55555555-5555-4555-8555-555555555551", namespace: "stage", code: "synthetic_stage_example",
  version: 2, status: "inactive", label: "Contoh tahap sintetis v2", definition: null,
  supersedes_version: 1, changed_by: "synthetic-fixture", changed_at: "2026-11-09T00:00:00+00:00",
  note: null, recorded_at: "2026-11-09T00:00:00+00:00",
}];
function response(value: unknown, status = 200) { return { status, ok: status >= 200 && status < 300, json: async () => value } as Response; }
function mount() { installDomainFetch(fetch); return render(<MemoryRouter initialEntries={["/backend-demo/master"]}><App /></MemoryRouter>); }
beforeEach(async () => { sessionStorage.clear(); await prepareSession(); });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("FR-002 backend master page", () => {
  it("shows provisional namespaces and empty-registry state honestly", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.endsWith("namespaces") ? namespaces : [])));
    mount();
    expect(await screen.findByText(/Master Data — LIVE BACKEND/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Registry kosong untuk filter ini/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /stage \(0\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /kpi/ })).not.toBeInTheDocument();
  });

  it("lists persisted references with version provenance", async () => {
    const active = { ...references[0]!, status: "active", version: 2, supersedes_version: 1 };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.endsWith("namespaces") ? namespaces : [active])));
    mount();
    expect(await screen.findByText("synthetic_stage_example")).toBeInTheDocument();
    expect(screen.getByText(/v2 \(menggantikan v1\)/)).toBeInTheDocument();
    expect(screen.getByText("synthetic-fixture")).toBeInTheDocument();
  });

  it("inactive rows are hidden until explicitly included", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.endsWith("namespaces") ? namespaces : references)));
    mount();
    // Latest overall version is inactive → hidden by default, empty state shown.
    await waitFor(() => expect(screen.getByText(/Registry kosong untuk filter ini/)).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox"));
    expect(await screen.findByText("synthetic_stage_example")).toBeInTheDocument();
    expect(screen.getByText(/menggantikan v1/)).toBeInTheDocument();
  });

  it("backend failure shows error state without fixture catalog fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("x", 503)));
    mount();
    expect(await screen.findByText(/Layanan tidak tersedia/)).toBeInTheDocument();
    expect(screen.queryByText("synthetic_stage_example")).not.toBeInTheDocument();
  });
});

it('reads complete version history and sends supported inactive/namespace filters',async()=>{
 const user=userEvent.setup();const old={...references[0],reference_id:'55555555-5555-4555-8555-555555555552',version:1,status:'active',supersedes_version:null,label:'Version1 original'};
 const calls=vi.fn(async(url:string)=>response(url.endsWith('namespaces')?namespaces:url.includes('/history?')?{namespace:old.namespace,code:old.code,versions:[old,references[0]]}:references));
 vi.stubGlobal('fetch',calls);mount();await screen.findByText(/Registry kosong untuk filter ini/);
 await user.click(screen.getByRole('checkbox'));await user.click(await screen.findByRole('button',{name:/Lihat riwayat stage/}));
 expect(await screen.findByText('Versi 1: Version1 original')).toBeInTheDocument();
 expect(screen.getByText('Versi 2: Contoh tahap sintetis v2')).toBeInTheDocument();
 expect(calls.mock.calls.some(c=>c[0].includes('include_inactive=true'))).toBe(true);
 expect(calls.mock.calls.some(c=>c[0].includes('/history?namespace=stage&code=synthetic_stage_example'))).toBe(true);
});
