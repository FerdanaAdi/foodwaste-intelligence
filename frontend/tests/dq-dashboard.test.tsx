import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DataQualityDashboard } from "@/components/dataquality/DataQualityDashboard";
import { dqFixtures } from "@/data/dataquality/fixtures";

beforeEach(() => {
  // Every render starts from the same synthetic fixture set.
  render(<DataQualityDashboard data={dqFixtures} />);
});

describe("DataQualityDashboard — composition and summary", () => {
  it("renders the FR-007 header with an explicit synthetic/demo banner", () => {
    expect(screen.getByRole("heading", { name: "Dashboard Mutu Data" })).toBeInTheDocument();
    expect(screen.getByText("SYNTHETIC / DEMO — NOT OFFICIAL BGN SYSTEM")).toBeInTheDocument();
  });

  it("shows count-only summary tiles without mass totals or KPI values", () => {
    const summary = screen.getByRole("region", { name: /Ringkasan mutu data/ });
    expect(within(summary).getByText("Jumlah event")).toBeInTheDocument();
    expect(within(summary).getByText("Jumlah pengukuran")).toBeInTheDocument();
    expect(within(summary).getByText("Records missing / tidak diukur")).toBeInTheDocument();
    // Renamed needs-attention tile: no "blocked" claim, correct fixture count
    // (needs_review 1 + flagged 1) rendered as its value.
    const attentionTile = within(summary).getByText("Record perlu tinjauan (needs attention)").closest("div.card") ??
      within(summary).getByText("Record perlu tinjauan (needs attention)").closest("li");
    expect(attentionTile).not.toBeNull();
    expect(within(attentionTile as HTMLElement).queryByText(/blocked/i)).not.toBeInTheDocument();
    expect(within(attentionTile as HTMLElement).getByText("2")).toBeInTheDocument();
    // Every rendered tile value is a bare count digit — no mass values.
    const values = within(summary).getAllByText(/^\d+$/);
    expect(values.length).toBeGreaterThanOrEqual(6);
    for (const value of values) {
      expect(value.className).toContain("tabular-nums");
      expect(value.textContent).not.toMatch(/kg/i);
    }
    expect(within(summary).queryByText(/OP-08|FI-02|NI-03/)).not.toBeInTheDocument();
  });

  it("states that unvalidated is not approval and no auto-KPI applies", () => {
    expect(screen.getByText(/Belum divalidasi bukan berarti disetujui/)).toBeInTheDocument();
    expect(screen.getAllByText(/tanpa KPI otomatis/).length).toBeGreaterThanOrEqual(1);
  });
});

describe("DataQualityDashboard — filters", () => {
  it("exposes labeled demo filters for site, stage and statuses", () => {
    expect(screen.getByLabelText("Site")).toBeInTheDocument();
    expect(screen.getByLabelText("Tahap")).toBeInTheDocument();
    expect(screen.getByLabelText("Status observasi")).toBeInTheDocument();
    expect(screen.getByLabelText("Status validasi")).toBeInTheDocument();
    expect(screen.getByLabelText("Tanggal operasi dari")).toBeInTheDocument();
    expect(screen.getByLabelText("Tanggal operasi sampai")).toBeInTheDocument();
    expect(screen.getByText(/Filter \(demo — data sintetis\)/)).toBeInTheDocument();
  });

  it("filters records by site and keeps repeat measurements under their event", async () => {
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Site"), "SITE-DQ-01");
    const list = screen.getByRole("region", { name: /Daftar dan detail record/ });
    expect(within(list).getAllByText("EVT-DQ-2026-0001").length).toBeGreaterThan(0);
    expect(within(list).queryByText("EVT-DQ-2026-0004")).not.toBeInTheDocument();
    // Both repeated measurements stay attached to the same single event.
    expect(within(list).getAllByText("M-DQ-0001").length).toBe(1);
    expect(within(list).getAllByText("M-DQ-0002").length).toBe(1);
  });

  it("shows the empty state when no records match the filter", async () => {
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Site"), "SITE-DQ-02");
    await user.selectOptions(screen.getByLabelText("Tahap"), "storage");
    expect(screen.getByRole("status")).toHaveTextContent(/Tidak ada record yang cocok/);
  });

  it("resets filters via the reset control", async () => {
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Site"), "SITE-DQ-01");
    expect(screen.queryByText("EVT-DQ-2026-0004")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset filter" }));
    expect(screen.getByText("EVT-DQ-2026-0004")).toBeInTheDocument();
  });
});

describe("DataQualityDashboard — drilldown", () => {
  it("opens the detail for a selected event with verbatim per-record values", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "EVT-DQ-2026-0001" }));
    const detail = screen.getByRole("region", { name: /Detail drilldown EVT-DQ-2026-0001/ });
    // Repeated measurements listed separately, never summed.
    expect(within(detail).getByText("M-DQ-0001")).toBeInTheDocument();
    expect(within(detail).getByText("M-DQ-0002")).toBeInTheDocument();
    // Original numeric strings verbatim.
    expect(within(detail).getByLabelText("Gross: 2.20 kg")).toBeInTheDocument();
    expect(within(detail).getByLabelText("Net: 1.85 kg")).toBeInTheDocument();
    expect(within(detail).getAllByText(/tidak dijumlahkan dan tidak saling menggantikan/).length).toBe(2);
  });

  it("marks measured zero and missing distinctly in the drilldown", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "EVT-DQ-2026-0004" }));
    const detail = screen.getByRole("region", { name: /Detail drilldown EVT-DQ-2026-0004/ });
    expect(within(detail).getByLabelText("Net: 0 kg")).toBeInTheDocument();
    expect(within(detail).getByLabelText("Gross: Tidak dicatat (measured zero)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "EVT-DQ-2026-0005" }));
    const missing = screen.getByRole("region", { name: /Detail drilldown EVT-DQ-2026-0005/ });
    expect(within(missing).getByLabelText("Net: Tidak ada (missing)")).toBeInTheDocument();
    expect(within(missing).getByLabelText("Net: Tidak diukur")).toBeInTheDocument();
  });

  it("keeps the unmeasured-event message explicit in the detail", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "EVT-DQ-2026-0003" }));
    expect(screen.getByText(/Belum ada pengukuran/)).toBeInTheDocument();
    expect(screen.getByText(/bukan nol terukur/)).toBeInTheDocument();
  });
});

describe("DataQualityDashboard — availability states", () => {
  it("renders a polite loading state without record content", () => {
    const { unmount } = render(<DataQualityDashboard data={dqFixtures} availability="loading" />);
    expect(screen.getByRole("status")).toHaveTextContent("Memuat data mutu…");
    unmount();
  });

  it("renders an access-denied alert that discloses no authorization internals", () => {
    const { unmount } = render(<DataQualityDashboard data={dqFixtures} availability="denied" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Akses ditolak");
    unmount();
  });

  it("renders an unavailable alert with retry and shows no fabricated numbers", async () => {
    const onRetry = vi.fn();
    const { unmount } = render(<DataQualityDashboard data={dqFixtures} availability="unavailable" onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Layanan data tidak tersedia");
    expect(alert).toHaveTextContent(/menghindari nilai palsu/);
    await userEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("DataQualityDashboard — narrow/mobile structure", () => {
  it("uses mobile-first single column with sm/lg summary breakpoints", () => {
    const summary = screen.getByRole("region", { name: /Ringkasan mutu data/ });
    const tileGrid = summary.querySelector("ul");
    expect(tileGrid).toHaveClass("grid-cols-1");
    expect(tileGrid).toHaveClass("sm:grid-cols-2");
    expect(tileGrid).toHaveClass("lg:grid-cols-3");
    const filters = screen.getByRole("region", { name: /Filter dashboard mutu data/ });
    const filterGrid = filters.querySelector("div.grid");
    expect(filterGrid).toHaveClass("grid-cols-1");
    expect(filterGrid).toHaveClass("sm:grid-cols-2");
    expect(filterGrid).toHaveClass("lg:grid-cols-3");
  });
});

// CP7-F01: displayed absence must not be inferred from filtered observations.
describe("CP7-F01 — filtered versus unrecorded detail", () => {
  it.each(["measured_zero", "observed", "missing", "not_measured"] as const)(
    "keeps the unmeasured count truthful under %s filtering", async (status) => {
      const user = userEvent.setup();
      await user.selectOptions(screen.getByLabelText("Status observasi"), status);
      const tile = screen.getByText("Event tanpa pengukuran").closest("li")!;
      expect(within(tile).getByText("1")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "EVT-DQ-2026-0001" }));
      const detail = screen.getByRole("region", { name: /Detail drilldown EVT-DQ-2026-0001/ });
      expect(within(detail).queryByText(/Belum ada pengukuran/)).not.toBeInTheDocument();
      if (status === "observed") {
        expect(within(detail).getByText("M-DQ-0001")).toBeInTheDocument();
        expect(within(detail).getByText("M-DQ-0002")).toBeInTheDocument();
      } else {
        expect(within(detail).getByText("Tidak ada pengukuran yang cocok dengan filter.")).toBeInTheDocument();
        expect(within(detail).queryByLabelText("Net: 0 kg")).not.toBeInTheDocument();
        expect(within(detail).queryByText(/Tidak ada \(missing\)|Tidak diukur/)).not.toBeInTheDocument();
      }
      await user.click(screen.getByRole("button", { name: "EVT-DQ-2026-0003" }));
      const unrecorded = screen.getByRole("region", { name: /Detail drilldown EVT-DQ-2026-0003/ });
      expect(within(unrecorded).getByText(/Belum ada pengukuran/)).toBeInTheDocument();
      expect(within(unrecorded).queryByText("Tidak ada pengukuran yang cocok dengan filter.")).not.toBeInTheDocument();
    },
  );

  it("restores the same estimated observation after clearing the filter", async () => {
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Status observasi"), "measured_zero");
    await user.click(screen.getByRole("button", { name: "EVT-DQ-2026-0002" }));
    let detail = screen.getByRole("region", { name: /Detail drilldown EVT-DQ-2026-0002/ });
    expect(within(detail).getByText("Tidak ada pengukuran yang cocok dengan filter.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset filter" }));
    detail = screen.getByRole("region", { name: /Detail drilldown EVT-DQ-2026-0002/ });
    expect(within(detail).getByText("M-DQ-0003")).toBeInTheDocument();
    expect(within(detail).getByText("Estimasi — bukan hasil timbangan")).toBeInTheDocument();
    expect(within(detail).queryByText(/Belum ada pengukuran/)).not.toBeInTheDocument();
  });
});
