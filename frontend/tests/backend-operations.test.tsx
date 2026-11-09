/** Candidate P1 operations page: display states, HELD KPI value-freeness, blocked mixed ratio. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SITE = "22222222-2222-4222-8222-222222222222";
const ORG = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "33333333-3333-4333-8333-333333333331";
const LOT_ID = "44444444-4444-4444-8444-444444444441";

const authState = {
  phase: "ready", message: "", generation: 1, intents: null, site: SITE,
  session: { principal_id: "55555555-5555-4555-8555-555555555551", auth_context_id: "55555555-5555-4555-8555-555555555552",
    csrf_token: "a".repeat(64), sites: [{ site_id: SITE, permissions: ["receipt.create", "movement.create", "disposition.create", "kpi.read"] }] },
};

vi.mock("@/backend/auth", () => ({
  authSnapshot: () => authState,
  subscribeAuth: () => () => undefined,
  permits: () => true,
}));

const readReceipts = vi.fn();
const readLot = vi.fn();
const readKpiCatalogue = vi.fn();
const readKpiPreview = vi.fn();
const readTrends = vi.fn();
const readDispositions = vi.fn();
const createBackendReceipt = vi.fn();
const createBackendLot = vi.fn();
const createBackendMovement = vi.fn();
const createBackendDisposition = vi.fn();

vi.mock("@/backend/p1", () => ({
  readReceipts: (...args: unknown[]) => readReceipts(...args),
  readLot: (...args: unknown[]) => readLot(...args),
  readKpiCatalogue: (...args: unknown[]) => readKpiCatalogue(...args),
  readKpiPreview: (...args: unknown[]) => readKpiPreview(...args),
  readTrends: (...args: unknown[]) => readTrends(...args),
  readDispositions: (...args: unknown[]) => readDispositions(...args),
  createBackendReceipt: (...args: unknown[]) => createBackendReceipt(...args),
  createBackendLot: (...args: unknown[]) => createBackendLot(...args),
  createBackendMovement: (...args: unknown[]) => createBackendMovement(...args),
  createBackendDisposition: (...args: unknown[]) => createBackendDisposition(...args),
}));

import BackendOperationsPage from "@/pages/BackendOperationsPage";

const receipt = { receipt_id: RECEIPT_ID, organization_id: ORG, site_id: SITE, source_ref: "RCV-SYN-101",
  received_at: "2026-11-05T07:30:00+08:00", note: null, recorded_at: "2026-11-05T07:31:00+08:00" };

const kpiEntries = [
  { kpi_code: "OP-03", formula_version: "unavailable-pending-FWI-03", description: "code and design status only",
    design_status: "design_pass", data_readiness_gate: "pending FWI-03 gate definitions",
    source_doc_revision: "FWI-03 v1.3 via PRD v0.1 section 11", effective_at: "2026-11-09",
    change_reason: null, recorded_at: "2026-11-09T00:00:00+08:00" },
  { kpi_code: "OP-08", formula_version: "unavailable-pending-FWI-03", description: "code and design status only",
    design_status: "held", data_readiness_gate: "pending FWI-03 gate definitions",
    source_doc_revision: "FWI-03 v1.3 via PRD v0.1 section 11", effective_at: "2026-11-09",
    change_reason: null, recorded_at: "2026-11-09T00:00:00+08:00" },
];

const trendsView = {
  site_id: SITE, date_from: "2026-11-04", date_to: "2026-11-06",
  calculation_version: "p1-trends-provisional-v0",
  note: "descriptive operational view per mass basis and status",
  event_counts: { actual_loss_discard: 1 },
  mass_reporting: { status: "policy_unresolved", reason: "OD-P1-02 OPEN", reportable_mass: null },
  per_basis: [{ mass_basis: "cooked", event_count: 1, measurement_count: 1,
    observed_measurement_count: 1, measured_zero_count: 0, estimated_measurement_count: 0,
    missing_count: 0, not_measured_count: 0,
    aggregation: { status: "policy_unresolved", reason: "OD-P1-02 OPEN: raw observation is not approved reporting mass",
      eligible_mass: null, eligible_event_count: 0, raw_observed_mass: "2.0", raw_observation_count: 1, unresolved_event_count: 0 } }],
  completeness: { events_total: 1, events_with_measurement: 1, events_without_measurement: 0 },
  delivery_residuals: [{ delivery_id: RECEIPT_ID, dispatch_quantity: "100.00", received_quantity: "95.00",
    difference: "5.00", reconciliation_status: "needs_review" }],
  mixed_basis_ratio: { status: "blocked", reason: "mixed raw/cooked ratio is not authorized (DR-11/DR-12); per-basis totals only" },
};

beforeEach(() => {
  vi.clearAllMocks();
  readReceipts.mockResolvedValue([]);
  readLot.mockResolvedValue({
    ...receipt, lot_id: LOT_ID, receipt_id: RECEIPT_ID, lot_ref: "LOT-SYN-1", item_code: "ITEM-SYN-VEG",
    item_version: "v1", quantity: "100.00", original_unit: "kg", mass_basis: "raw",
    observed_stock: "25.00", stock_note: "provisional observed stock (EXT-OD-05 OPEN)", movements: [],
  });
  readKpiCatalogue.mockResolvedValue(kpiEntries);
  readKpiPreview.mockResolvedValue({ kpi_code: "OP-08", formula_version: "unavailable-pending-FWI-03",
    design_status: "held", status: "held_blocked",
    reason: "KPI HELD per FWI-03; calculation disabled on every path", note: "internal non-official preview" });
  readTrends.mockResolvedValue(trendsView);
  readDispositions.mockResolvedValue([]);
  createBackendReceipt.mockResolvedValue({ kind: "saved", value: { ...receipt, source_ref: "RCV-SYN-202" } });
  createBackendLot.mockResolvedValue({ kind: "saved", value: {} });
  createBackendMovement.mockResolvedValue({ kind: "saved", value: {} });
  createBackendDisposition.mockResolvedValue({ kind: "saved", value: {
    disposition_id: RECEIPT_ID, event_id: RECEIPT_ID, organization_id: ORG, site_id: SITE,
    outcome_type: "compost", quantity: "1.00", original_unit: "kg", mass_basis: "cooked",
    occurred_at: "2026-11-05T10:00:00+08:00", food_safety_status: "not_assessed", handover_ref: null,
    recorded_at: "2026-11-05T10:01:00+08:00", allocation_status: "within_reference", allocation_note: "descriptive" } });
});

function renderPage() {
  return render(<BackendOperationsPage />);
}

describe("BackendOperationsPage (P1 candidate)", () => {
  it("renders the receipt list after loading", async () => {
    readReceipts.mockResolvedValue([receipt]);
    renderPage();
    expect(await screen.findByText("RCV-SYN-101")).toBeInTheDocument();
    expect(readReceipts).toHaveBeenCalledWith(SITE, expect.anything());
  });

  it("shows an explicit empty state, never a measured zero", async () => {
    readReceipts.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Belum ada penerimaan")).toBeInTheDocument();
    expect(screen.getByText(/status kosong bukan nol terukur/i)).toBeInTheDocument();
  });

  it("shows a service-unavailable state when reads fail", async () => {
    readReceipts.mockRejectedValue(new Error("Layanan backend tidak tersedia."));
    renderPage();
    expect(await screen.findByText("Layanan tidak tersedia")).toBeInTheDocument();
    expect(screen.getByText("Layanan backend tidak tersedia.")).toBeInTheDocument();
  });

  it("displays HELD KPI status without any numeric result", async () => {
    renderPage();
    expect(await screen.findByText("OP-08")).toBeInTheDocument();
    expect(screen.getByText("HELD — dihitung dinonaktifkan")).toBeInTheDocument();
    const user = userEvent.setup();
    const heldRow = screen.getByText("OP-08").closest("tr")!;
    await user.click(heldRow.querySelector("button")!);
    const reason = await screen.findByText("KPI HELD per FWI-03; calculation disabled on every path");
    const panel = reason.parentElement!;
    expect(panel).toHaveTextContent("held_blocked");
    // No numeric KPI value anywhere in the preview panel.
    expect(panel.textContent).not.toMatch(/=\s*\d/);
  });

  it("records a receipt through the intent write path and reports success", async () => {
    readReceipts.mockResolvedValue([]);
    renderPage();
    const user = userEvent.setup();
    await screen.findByLabelText(/Ref\. penerimaan/i);
    await user.type(screen.getByLabelText(/Ref\. penerimaan/i), "RCV-SYN-202");
    await user.type(screen.getByLabelText(/Diterima pada/i), "2026-11-05T08:00:00+08:00");
    await user.click(screen.getByRole("button", { name: /Catat penerimaan/i }));
    await waitFor(() => expect(createBackendReceipt).toHaveBeenCalledWith({
      source_ref: "RCV-SYN-202", received_at: "2026-11-05T08:00:00+08:00", note: "" }));
    expect(await screen.findByText(/Penerimaan tersimpan/)).toBeInTheDocument();
    expect(screen.getByText(/tidak menghasilkan event limbah/)).toBeInTheDocument();
  });

  it("warns that rescue-like outcomes are gated before submitting", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/Outcome provisional/i), "redistribution_handover");
    await user.selectOptions(screen.getByLabelText(/Status food safety/i), "not_assessed");
    expect(await screen.findByText(/Safety gate:/i)).toBeInTheDocument();
    expect(screen.getByText(/ditolak server \(HTTP 422\)/)).toBeInTheDocument();
  });

  it("renders trends as descriptive with blocked mixed ratio and residual for review", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Muat tren/i }));
    expect(await screen.findByText(/Rasio campuran raw\/cooked:/i)).toBeInTheDocument();
    expect(screen.getByText(/blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/needs_review/)).toBeInTheDocument();
    // single-observation mass is shown with its coverage label; counts stay separate
    expect(screen.getAllByText(/massa pelaporan belum tersedia/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2.0 kg/)).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Event" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Measurement" })).toBeInTheDocument();
    // No single "total waste" percentage is presented.
    expect(screen.queryByText(/total waste/i)).not.toBeInTheDocument();
  });
});


it("shows missing scope mass without a fabricated zero when no measurement exists", async () => {
  readTrends.mockResolvedValue({ ...trendsView, per_basis: [],
    mass_reporting: { status: 'incomplete_observation', reason: 'Event belum memiliki observasi', reportable_mass: null },
    completeness: { events_total: 1, events_with_measurement: 0, events_without_measurement: 1, measurements_total: 0 } });
  renderPage();
  await userEvent.setup().click(screen.getByRole('button', { name: /Muat tren/i }));
  expect(await screen.findByText(/Event belum memiliki observasi/)).toBeInTheDocument();
  expect(screen.queryByText(/0 kg/)).not.toBeInTheDocument();
});
