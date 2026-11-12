import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDomainFetch, prepareSession } from './backend-auth-fixture';
import { MemoryRouter } from "react-router";
import App from "@/App";
import fixture from "./fixtures/backend-detail.json";

const event = { ...fixture.event, event_type: "at_risk_surplus", stage_code: "preparation",
  operation_date: "2026-11-04", organization_id: "11111111-1111-4111-8111-111111111111",
  site_id: "22222222-2222-4222-8222-222222222222" };
function response(value: unknown, status = 200) { return { status, ok: status >= 200 && status < 300, json: async () => value } as Response; }
function mount() { installDomainFetch(fetch); return render(<MemoryRouter initialEntries={["/backend-demo/ledger"]}><App /></MemoryRouter>); }
beforeEach(async () => { sessionStorage.clear(); await prepareSession(); });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("FR-003 backend ledger page", () => {
  it("lists authorized events with total and live-source label", async () => {
    const fetchMock = vi.fn(async () => response({ events: [event], total: 1, page: 1, page_size: 20 }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    expect(await screen.findByText(/Riwayat Kejadian Sisa Pangan/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/1 dari 1 kejadian/));
    expect(screen.getByRole("link", { name: "Lihat rincian" })).toHaveAttribute("href", `/backend-demo/events/${event.event_id}`);
    expect(screen.getByText("preparation")).toBeInTheDocument();
    expect(screen.getByText("2026-11-04")).toBeInTheDocument();
  });

  it("site scope travels to the server on every request", async () => {
    const fetchMock = vi.fn(async (_url?: unknown, _options?: unknown) => response({ events: [], total: 0, page: 1, page_size: 20 }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("site_id=22222222-2222-4222-8222-222222222222");
    expect(await screen.findByText(/Belum ada kejadian yang cocok dengan pilihan ini/)).toBeInTheDocument();
  });

  it("applies supported filters and rejects malformed dates before request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url?: unknown, _options?: unknown) => response({ events: [], total: 0, page: 1, page_size: 20 }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await user.type(screen.getByLabelText(/Tanggal kegiatan dapur dari/), "04-11-2026");
    await user.click(screen.getByRole("button", { name: "Terapkan filter" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/YYYY-MM-DD/);
    await user.clear(screen.getByLabelText(/Tanggal kegiatan dapur dari/));
    await user.selectOptions(screen.getByLabelText(/Jenis kejadian/), "actual_loss_discard");
    await user.type(screen.getByLabelText(/Tanggal kegiatan dapur dari/), "2026-11-04");
    await user.click(screen.getByRole("button", { name: "Terapkan filter" }));
    await waitFor(() => {
      const url = String(fetchMock.mock.calls.at(-1)![0]);
      expect(url).toContain("event_type=actual_loss_discard");
      expect(url).toContain("operation_date_from=2026-11-04");
    });
  });

  it("backend failure shows an error state, never a fixture fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ detail: "x" }, 503)));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(/503|tidak tersedia|gagal/i);
    expect(screen.queryByText("preparation")).not.toBeInTheDocument();
  });
});
