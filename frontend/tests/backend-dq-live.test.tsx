import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDomainFetch, prepareSession } from './backend-auth-fixture';
import { MemoryRouter } from "react-router";
import App from "@/App";

const live = {
  summary: {
    event_count: 2, measurement_count: 3,
    observation_counts: { observed: 1, measured_zero: 1, estimated: 1, missing: 0, not_measured: 0 },
    validation_counts: { unvalidated: 0, needs_review: 0, flagged: 0 },
    missing_count: 0, needs_attention_count: 0, unmeasured_event_count: 1, estimated_count: 1,
  },
  records: [{ event_id: "33333333-3333-4333-8333-333333333331", event_type: "at_risk_surplus",
              occurred_at: "2026-11-04T07:00:00+08:00", measurement_ids: ["44444444-4444-4444-8444-444444444441"],
              observation_statuses: ["observed"] }],
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
