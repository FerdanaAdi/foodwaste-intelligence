/**
 * Component tests for FR-002 reference-data catalog UI.
 *
 * Tests rendering, interaction, state variants and accessibility.
 * Pattern follows dq-dashboard.test.tsx.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReferenceCatalog } from "@/components/referencedata/ReferenceCatalog";
import { ReferenceSelector, MultiReferenceSelector } from "@/components/referencedata/ReferenceSelector";
import { referenceFixtures } from "@/data/referencedata/fixtures";

describe("ReferenceCatalog — composition and summary", () => {
  beforeEach(() => {
    render(<ReferenceCatalog items={referenceFixtures} />);
  });

  it("renders the FR-002 header with an explicit synthetic/demo banner", () => {
    expect(screen.getByRole("heading", { name: "Katalog Data Referensi" })).toBeInTheDocument();
    expect(screen.getByText("SYNTHETIC / DEMO — NOT OFFICIAL BGN SYSTEM")).toBeInTheDocument();
  });

  it("shows count-only summary tiles without mass totals or KPI values", () => {
    const summary = screen.getByRole("region", { name: /Ringkasan data referensi/ });
    expect(within(summary).getByText("Total item")).toBeInTheDocument();
    expect(within(summary).getByText("Item aktif")).toBeInTheDocument();
    expect(within(summary).getByText("Item nonaktif")).toBeInTheDocument();
    // Values are bare count digits with tabular-nums
    const values = within(summary).getAllByText(/^\d+$/);
    expect(values.length).toBeGreaterThanOrEqual(3);
    for (const value of values) {
      expect(value.className).toContain("tabular-nums");
      expect(value.textContent).not.toMatch(/kg/i);
    }
    // No HELD KPIs
    expect(within(summary).queryByText(/OP-08|FI-02|NI-03/)).not.toBeInTheDocument();
  });

  it("renders category group headings", () => {
    // Category labels also appear in summary tiles and filter options, so
    // assert on the actual group headings (h2) by role. Their accessible
    // names include the item-count badge (e.g. "Item pangan 5").
    expect(screen.getByRole("heading", { name: /^Item pangan/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Kategori material/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Unit pengukuran/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Tahap proses/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Metode pengukuran/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Alasan kehilangan/ })).toBeInTheDocument();
  });

  it("renders item cards with code, name, version and status badges", () => {
    expect(screen.getByText("FI-001")).toBeInTheDocument();
    expect(screen.getByText(/Nasi putih/)).toBeInTheDocument();
    // Active and inactive badges; scoped to the list region because the
    // status filter's <option> also carries the exact text "Nonaktif".
    const list = screen.getByRole("region", { name: /Daftar item referensi/ });
    const badges = within(list).getAllByText("Aktif");
    expect(badges.length).toBeGreaterThan(0);
    const inactiveBadges = within(list).getAllByText("Nonaktif");
    expect(inactiveBadges.length).toBe(3); // FI-005, UN-003, LR-006
  });

  it("shows the synthetic-data disclaimer footer", () => {
    expect(screen.getByText(/fixture sintetis/)).toBeInTheDocument();
    expect(screen.getByText(/bukan data referensi lapangan/)).toBeInTheDocument();
  });
});

describe("ReferenceCatalog — filters", () => {
  beforeEach(() => {
    render(<ReferenceCatalog items={referenceFixtures} />);
  });

  it("exposes labeled demo filters for search, category, and status", () => {
    expect(screen.getByLabelText("Cari")).toBeInTheDocument();
    expect(screen.getByLabelText("Kategori")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByText(/Filter \(demo — data sintetis\)/)).toBeInTheDocument();
  });

  it("filters items by category", async () => {
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Kategori"), "unit");
    const list = screen.getByRole("region", { name: /Daftar item referensi/ });
    expect(within(list).getByText("UN-001")).toBeInTheDocument();
    expect(within(list).getByText("UN-002")).toBeInTheDocument();
    // Food items should not be visible
    expect(within(list).queryByText("FI-001")).not.toBeInTheDocument();
  });

  it("filters items by active status", async () => {
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Status"), "inactive");
    const list = screen.getByRole("region", { name: /Daftar item referensi/ });
    expect(within(list).getByText("FI-005")).toBeInTheDocument();
    expect(within(list).getByText("UN-003")).toBeInTheDocument();
    expect(within(list).getByText("LR-006")).toBeInTheDocument();
    // Active items should not be visible
    expect(within(list).queryByText("FI-001")).not.toBeInTheDocument();
  });

  it("searches items by text", async () => {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Cari"), "bayam");
    const list = screen.getByRole("region", { name: /Daftar item referensi/ });
    expect(within(list).getByText("FI-002")).toBeInTheDocument();
    expect(within(list).queryByText("FI-001")).not.toBeInTheDocument();
  });

  it("shows the empty state when no items match the filter", async () => {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Cari"), "xyz-no-match-at-all");
    expect(screen.getByRole("status")).toHaveTextContent(/Tidak ada item referensi yang cocok/);
  });

  it("resets filters via the reset control", async () => {
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Kategori"), "unit");
    expect(screen.queryByText("FI-001")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset filter" }));
    expect(screen.getByText("FI-001")).toBeInTheDocument();
  });
});

describe("ReferenceCatalog — drilldown", () => {
  beforeEach(() => {
    render(<ReferenceCatalog items={referenceFixtures} />);
  });

  it("opens the detail view when an item card is clicked", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "FI-001" }));
    const detail = screen.getByRole("region", { name: /Detail drilldown FI-001/ });
    expect(detail).toBeInTheDocument();
    expect(within(detail).getByText(/Nasi putih/)).toBeInTheDocument();
    expect(within(detail).getByText("demo-admin")).toBeInTheDocument();
  });

  it("shows metadata entries in the detail view when available", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "UN-001" }));
    const detail = screen.getByRole("region", { name: /Detail item referensi UN-001/ });
    expect(within(detail).getByText("Metadata tambahan")).toBeInTheDocument();
    expect(within(detail).getByText("kg")).toBeInTheDocument();
  });

  it("toggles the detail view off when clicking the same item", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "FI-001" }));
    expect(screen.getByRole("region", { name: /Detail drilldown FI-001/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "FI-001" }));
    expect(screen.queryByRole("region", { name: /Detail drilldown FI-001/ })).not.toBeInTheDocument();
  });

  it("shows the synthetic-data disclaimer in detail view", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "FI-001" }));
    const detail = screen.getByRole("region", { name: /Detail item referensi FI-001/ });
    expect(within(detail).getByText(/Data sintetis untuk demo/)).toBeInTheDocument();
  });
});

describe("ReferenceCatalog — availability states", () => {
  it("renders a polite loading state without item content", () => {
    const { unmount } = render(<ReferenceCatalog items={referenceFixtures} availability="loading" />);
    expect(screen.getByRole("status")).toHaveTextContent("Memuat data referensi…");
    unmount();
  });

  it("renders an access-denied alert that discloses no authorization internals", () => {
    const { unmount } = render(<ReferenceCatalog items={referenceFixtures} availability="denied" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Akses ditolak");
    unmount();
  });

  it("renders an unavailable alert with retry and shows no fabricated data", async () => {
    const onRetry = vi.fn();
    const { unmount } = render(
      <ReferenceCatalog items={referenceFixtures} availability="unavailable" onRetry={onRetry} />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Layanan data referensi tidak tersedia");
    expect(alert).toHaveTextContent(/menghindari data palsu/);
    await userEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("ReferenceCatalog — mobile-first structure", () => {
  it("uses mobile-first single column with sm/lg breakpoints for summary tiles", () => {
    render(<ReferenceCatalog items={referenceFixtures} />);
    const summary = screen.getByRole("region", { name: /Ringkasan data referensi/ });
    const tileGrid = summary.querySelector("ul");
    expect(tileGrid).toHaveClass("grid-cols-1");
    expect(tileGrid).toHaveClass("sm:grid-cols-2");
    expect(tileGrid).toHaveClass("lg:grid-cols-3");
  });

  it("uses mobile-first responsive grid for filter inputs", () => {
    render(<ReferenceCatalog items={referenceFixtures} />);
    const filters = screen.getByRole("region", { name: /Filter katalog data referensi/ });
    const filterGrid = filters.querySelector("div.grid");
    expect(filterGrid).toHaveClass("grid-cols-1");
    expect(filterGrid).toHaveClass("sm:grid-cols-2");
    expect(filterGrid).toHaveClass("lg:grid-cols-3");
  });
});

describe("ReferenceSelector — reusable selector component", () => {
  it("renders a labeled select for a given category with active items only", () => {
    const onChange = vi.fn();
    render(
      <ReferenceSelector
        items={referenceFixtures}
        category="food_item"
        value=""
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText("Item pangan");
    expect(select).toBeInTheDocument();
    // Should have options: placeholder + 4 active food items (FI-005 inactive excluded)
    const options = within(select).getAllByRole("option");
    expect(options).toHaveLength(5); // 1 placeholder + 4 active
  });

  it("includes inactive items when showInactive is true", () => {
    render(
      <ReferenceSelector
        items={referenceFixtures}
        category="food_item"
        value=""
        onChange={vi.fn()}
        showInactive
      />,
    );
    const select = screen.getByLabelText("Item pangan");
    const options = within(select).getAllByRole("option");
    expect(options).toHaveLength(6); // 1 placeholder + 5 items
  });

  it("calls onChange when selection changes", async () => {
    const onChange = vi.fn();
    render(
      <ReferenceSelector
        items={referenceFixtures}
        category="food_item"
        value=""
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Item pangan"), "FI-001");
    expect(onChange).toHaveBeenCalledWith("FI-001");
  });

  it("shows empty message when no items in category", () => {
    render(
      <ReferenceSelector
        items={[]}
        category="food_item"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Tidak ada item aktif dalam kategori ini/)).toBeInTheDocument();
  });
});

describe("MultiReferenceSelector — multiple category selectors", () => {
  it("renders selectors for each requested category", () => {
    render(
      <MultiReferenceSelector
        items={referenceFixtures}
        categories={["unit", "stage"]}
        values={{}}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Unit pengukuran")).toBeInTheDocument();
    expect(screen.getByLabelText("Tahap proses")).toBeInTheDocument();
  });
});
