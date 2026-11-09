import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDomainFetch, prepareSession } from './backend-auth-fixture';
import { MemoryRouter } from "react-router";
import App from "@/App";

function csvResponse(body: string) {
  return { status: 200, ok: true,
    headers: new Map([["Content-Type", "text/csv; charset=utf-8"],
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
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404, ok: false, headers: new Map() as unknown as Headers })));
    mount();
    await user.click(screen.getByRole("button", { name: /Ambil ekspor dari server/ }));
    expect(await screen.findByText(/Layanan tidak tersedia|ditolak/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unduh/ })).not.toBeInTheDocument();
  });
});
