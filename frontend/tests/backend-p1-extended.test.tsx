/** Candidate FR-102/103/104/203/204 pages: blocked yield, review-not-waste, N/A price, non-autonomous alerts. */
import { MemoryRouter } from "react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SITE = "22222222-2222-4222-8222-222222222222";
const ORG = "11111111-1111-4111-8111-111111111111";
const BATCH_ID = "66666666-6666-4666-8666-666666666661";
const DELIVERY_ID = "77777777-7777-4777-8777-777777777771";
const SERVICE_ID = "88888888-8888-4888-8888-888888888881";
const COST_ID = "99999999-9999-4999-8999-999999999991";
const REC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

const authState = {
  phase: "ready", message: "", generation: 1, intents: null, site: SITE,
  session: { principal_id: "55555555-5555-4555-8555-555555555551", auth_context_id: "55555555-5555-4555-8555-555555555552",
    csrf_token: "a".repeat(64), sites: [{ site_id: SITE,
      permissions: ["menu.create", "recipe.create", "batch.create", "link.create", "delivery.create",
        "service.create", "costref.create", "alert.ack", "alert.read"] }] },
};

vi.mock("@/backend/auth", () => ({
  authSnapshot: () => authState,
  subscribeAuth: () => () => undefined,
  permits: () => true,
}));

const readBatch = vi.fn();
const readLineage = vi.fn();
const createBackendMenu = vi.fn();
const createBackendRecipe = vi.fn();
const createBackendBatch = vi.fn();
const createBackendBatchIO = vi.fn();
const createBackendLink = vi.fn();
const createBackendDelivery = vi.fn();
const recordBackendReceiving = vi.fn();
const createBackendService = vi.fn();
const createBackendCostReference = vi.fn();
const readCostValuation = vi.fn();
const readRecommendations = vi.fn();
const evaluateRecommendations = vi.fn();
const acknowledgeBackendRecommendation = vi.fn();
const readAlertRules = vi.fn();

vi.mock("@/backend/p1", () => ({
  readBatch: (...a: unknown[]) => readBatch(...a),
  readLineage: (...a: unknown[]) => readLineage(...a),
  createBackendMenu: (...a: unknown[]) => createBackendMenu(...a),
  createBackendRecipe: (...a: unknown[]) => createBackendRecipe(...a),
  createBackendBatch: (...a: unknown[]) => createBackendBatch(...a),
  createBackendBatchIO: (...a: unknown[]) => createBackendBatchIO(...a),
  createBackendLink: (...a: unknown[]) => createBackendLink(...a),
  createBackendDelivery: (...a: unknown[]) => createBackendDelivery(...a),
  recordBackendReceiving: (...a: unknown[]) => recordBackendReceiving(...a),
  createBackendService: (...a: unknown[]) => createBackendService(...a),
  createBackendCostReference: (...a: unknown[]) => createBackendCostReference(...a),
  readCostValuation: (...a: unknown[]) => readCostValuation(...a),
  readRecommendations: (...a: unknown[]) => readRecommendations(...a),
  evaluateRecommendations: (...a: unknown[]) => evaluateRecommendations(...a),
  acknowledgeBackendRecommendation: (...a: unknown[]) => acknowledgeBackendRecommendation(...a),
  readAlertRules: (...a: unknown[]) => readAlertRules(...a),
}));

import BackendProductionPage from "@/pages/BackendProductionPage";
import BackendDistributionPage from "@/pages/BackendDistributionPage";
import BackendInsightsPage from "@/pages/BackendInsightsPage";

beforeEach(() => {
  vi.clearAllMocks();
  readBatch.mockResolvedValue({
    batch_id: BATCH_ID, organization_id: ORG, site_id: SITE, recipe_id: BATCH_ID,
    recipe_code: "RECIPE-SYN-1", recipe_version_no: 1, operation_date: "2026-11-05",
    planned_output: null, original_unit: "kg", mass_basis: "raw", recorded_at: "2026-11-05T00:00:00+08:00",
    io: [{ io_id: BATCH_ID, batch_id: BATCH_ID, source_lot_id: null, io_kind: "input", quantity: "80.00",
      original_unit: "kg", mass_basis: "raw", occurred_at: "2026-11-05T08:00:00+08:00",
      recorded_at: "2026-11-05T08:01:00+08:00" }],
    yield_view: { status: "blocked", basis: null, value: null, input_total: null,
      primary_output_total: null, rework_total: null,
      reason: "no recorded primary output; yield blocked" },
  });
  readLineage.mockResolvedValue({ object_type: "batch", object_id: BATCH_ID, links: [],
    distinct_source_event_count: 0, note: "links are relationships, not waste generations" });
  createBackendMenu.mockResolvedValue({ kind: "saved", value: { menu_id: BATCH_ID, menu_code: "MENU-SYN-1" } });
  createBackendRecipe.mockResolvedValue({ kind: "saved", value: { recipe_id: BATCH_ID, organization_id: ORG,
    site_id: SITE, menu_id: null, recipe_code: "RECIPE-SYN-1", version_no: 1,
    recorded_at: "2026-11-05T00:00:00+08:00",
    lines: [{ line_id: BATCH_ID, recipe_id: BATCH_ID, line_no: 1, item_code: "ITEM-SYN-VEG",
      quantity: "80.00", original_unit: "kg", mass_basis: "raw" }] } });
  createBackendBatch.mockResolvedValue({ kind: "saved", value: { batch_id: BATCH_ID, recipe_id: BATCH_ID } });
  createBackendBatchIO.mockResolvedValue({ kind: "saved", value: { io_id: BATCH_ID, batch_id: BATCH_ID } });
  createBackendLink.mockResolvedValue({ kind: "saved", value: { link_id: BATCH_ID, relation_code: "input_to" } });
  createBackendDelivery.mockResolvedValue({ kind: "saved", value: { delivery_id: DELIVERY_ID,
    organization_id: ORG, site_id: SITE, run_id: null, from_site_id: SITE, to_site_id: SITE,
    dispatch_quantity: "100.00", received_quantity: null, original_unit: "kg", mass_basis: "as_served",
    dispatched_at: "2026-11-05T06:00:00+08:00", received_at: null, recorded_at: "2026-11-05T06:01:00+08:00",
    reconciliation_status: "not_received" } });
  recordBackendReceiving.mockResolvedValue({ kind: "saved", value: { delivery_id: DELIVERY_ID,
    organization_id: ORG, site_id: SITE, run_id: null, from_site_id: SITE, to_site_id: SITE,
    dispatch_quantity: "100.00", received_quantity: "95.00", original_unit: "kg", mass_basis: "as_served",
    dispatched_at: "2026-11-05T06:00:00+08:00", received_at: "2026-11-05T09:00:00+08:00",
    recorded_at: "2026-11-05T06:01:00+08:00", reconciliation_status: "needs_review" } });
  createBackendService.mockResolvedValue({ kind: "saved", value: { service_id: SERVICE_ID,
    organization_id: ORG, site_id: SITE, delivery_id: null, served_count: 190, served_mass: null,
    original_unit: null, mass_basis: null, leftover_event_id: null, sampling_frame: null, sample_size: 5,
    sampling_method: "visual_tray", coverage: null, recorded_at: "2026-11-05T10:00:00+08:00",
    sampling_coverage_status: "unframed_sample",
    estimate_note: "no population estimate is computed; expansion requires an approved sampling design (EXT-OD-07 OPEN)" } });
  createBackendCostReference.mockResolvedValue({ kind: "saved", value: { cost_reference_id: COST_ID,
    organization_id: ORG, site_id: SITE, scope_type: "batch", scope_ref: BATCH_ID, currency: "IDR",
    amount: null, unit_basis: "kg_raw", price_source: "SYN-PRICE-A", price_date: null,
    method_version: "managerial-est-v0", recorded_at: "2026-11-09T00:00:00+08:00",
    price_availability: "not_available", note: "missing price stays N/A (P2-AC-05)" } });
  readCostValuation.mockResolvedValue({ status: "blocked" as const, reason: "allocation policy OPEN (EXT-OD-10)",
    method_version: "managerial-est-v0", price_availability: "not_available", note: "no numeric result" });
  readAlertRules.mockResolvedValue([
    { rule_code: "delivery_reconciliation_review", description: "difference needs review", disabled: false },
    { rule_code: "event_coverage_insufficient", description: "coverage insufficient", disabled: true },
  ]);
  evaluateRecommendations.mockResolvedValue({ kind: "saved", value: { site_id: SITE,
    rule_version: "p2-rules-provisional-v0",
    alerts: [{ recommendation_id: REC_ID, organization_id: ORG, site_id: SITE,
      rule_code: "delivery_reconciliation_review", rule_version: "p2-rules-provisional-v0",
      target_type: "delivery", target_ref: DELIVERY_ID,
      detected_issue: "dispatched and received quantities differ", coverage: "complete",
      recommended_action: "review the linked record with the site team; FWI never applies an automatic change",
      state: "open", ack_reason: null, ack_actor: null, ack_at: null,
      recorded_at: "2026-11-09T00:00:00+08:00" }],
    insufficient: [{ rule_code: "allocation_exceeds_reference", target_type: "disposition",
      target_ref: BATCH_ID, reason: "no compatible reference measurement exists", state: "insufficient_data" }],
    note: "recommendations are explanations with provenance only" } });
  acknowledgeBackendRecommendation.mockResolvedValue({ kind: "saved", value: {
    recommendation_id: REC_ID, organization_id: ORG, site_id: SITE,
    rule_code: "delivery_reconciliation_review", rule_version: "p2-rules-provisional-v0",
    target_type: "delivery", target_ref: DELIVERY_ID, detected_issue: "difference", coverage: "complete",
    recommended_action: "review only", state: "acknowledged",
    ack_reason: "reviewed with the site team", ack_actor: "55555555-5555-4555-8555-555555555551",
    ack_at: "2026-11-09T01:00:00+08:00", recorded_at: "2026-11-09T00:00:00+08:00" } });
});

describe("BackendProductionPage (FR-102/104)", () => {
  it("shows the blocked yield reason instead of an invented factor", async () => {
    render(<MemoryRouter><BackendProductionPage /></MemoryRouter>);
    await userEvent.setup().type(screen.getByLabelText(/UUID resep/i), BATCH_ID);
    await userEvent.setup().click(screen.getByRole("button", { name: /Buat batch/i }));
    expect(await screen.findByText(/yield:/i)).toBeInTheDocument();
    expect(screen.getByText(/no recorded primary output; yield blocked/)).toBeInTheDocument();
    expect(screen.queryByText(/=\s*0\.9/)).not.toBeInTheDocument();
  });

  it("records a menu through the intent write path", async () => {
    render(<MemoryRouter><BackendProductionPage /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Kode menu/i), "MENU-SYN-1");
    await user.type(screen.getByLabelText(/^Nama/i), "Menu sintetis");
    await user.click(screen.getByRole("button", { name: /Simpan menu/i }));
    await waitFor(() => expect(createBackendMenu).toHaveBeenCalledWith({ menu_code: "MENU-SYN-1", name: "Menu sintetis" }));
    expect(await screen.findByText(/Menu tersimpan/)).toBeInTheDocument();
  });
});

describe("BackendDistributionPage (FR-103)", () => {
  it("shows needs_review for a 100 vs 95 mismatch, never an automatic waste event", async () => {
    render(<BackendDistributionPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/UUID site tujuan/i), SITE);
    await user.type(screen.getByLabelText(/Dispatch \(kg\)/i), "100");
    await user.type(screen.getByLabelText(/Dispatched at/i), "2026-11-05T06:00:00+08:00");
    await user.click(screen.getByRole("button", { name: /Catat delivery/i }));
    expect(await screen.findByText(/Delivery tersimpan/)).toBeInTheDocument();
    expect(screen.getByText("not_received")).toBeInTheDocument();
    await user.type(screen.getByLabelText("UUID delivery"), DELIVERY_ID);
    await user.type(screen.getByLabelText(/Received \(kg\)/i), "95");
    await user.type(screen.getByLabelText(/Received at/i), "2026-11-05T09:00:00+08:00");
    await user.click(screen.getByRole("button", { name: /Catat receiving/i }));
    expect(await screen.findByText(/Receiving dicatat/)).toBeInTheDocument();
    expect(screen.getByText(/perlu review, bukan waste otomatis/)).toBeInTheDocument();
    expect(readBatch).not.toHaveBeenCalled();
  });

  it("labels an unframed sample and never presents a population estimate", async () => {
    render(<BackendDistributionPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Served count/i), "190");
    await user.type(screen.getByLabelText(/Sample size/i), "5");
    await user.type(screen.getByLabelText(/Metode sampling/i), "visual_tray");
    await user.click(screen.getByRole("button", { name: /Catat meal service/i }));
    expect(await screen.findByText(/unframed_sample/)).toBeInTheDocument();
    expect(screen.getByText(/no population estimate is computed/)).toBeInTheDocument();
  });
});

describe("BackendInsightsPage (FR-203/204)", () => {
  it("stores a missing price as N/A and shows the blocked valuation", async () => {
    render(<BackendInsightsPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/UUID scope/i), BATCH_ID);
    await user.type(screen.getByLabelText(/Sumber harga/i), "SYN-PRICE-A");
    await user.click(screen.getByRole("button", { name: /Simpan referensi/i }));
    expect(await screen.findByText(/N\/A \(tidak diketahui — tidak pernah dianggap Rp0\)/)).toBeInTheDocument();
    expect(screen.getByText(/Valuasi:/i)).toHaveTextContent("blocked");
    expect(screen.getByText(/allocation policy OPEN/)).toBeInTheDocument();
  });

  it("renders open alerts, insufficient-data outcomes, and records acknowledgement", async () => {
    render(<BackendInsightsPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Evaluasi rekomendasi/i }));
    expect(await screen.findByText(/dispatched and received quantities differ/)).toBeInTheDocument();
    expect(screen.getByText(/insufficient_data/)).toBeInTheDocument();
    expect(screen.getByText(/FWI never applies an automatic change/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/UUID rekomendasi/i), REC_ID);
    await user.type(screen.getByLabelText(/Alasan/i), "reviewed with the site team");
    await user.click(screen.getByRole("button", { name: /Catat tindakan/i }));
    await waitFor(() => expect(acknowledgeBackendRecommendation).toHaveBeenCalledWith(REC_ID,
      { state: "acknowledged", reason: "reviewed with the site team" }));
    expect(await screen.findByText(/acknowledged dengan alasan tercatat/i)).toBeInTheDocument();
  });

  it("renders global rules read-only without any mutation control (T-06/T-08)", async () => {
    render(<BackendInsightsPage />);
    expect(await screen.findByText(/event_coverage_insufficient/)).toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aktifkan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nonaktifkan" })).not.toBeInTheDocument();
    expect(readAlertRules).toHaveBeenCalledTimes(1); // read kept for authorized users
  });
});
