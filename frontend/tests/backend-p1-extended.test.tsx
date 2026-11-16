/** Candidate FR-102/103/104/203/204 pages: blocked yield, review-not-waste, N/A price, non-autonomous alerts. */
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { StrictMode, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SITE = "22222222-2222-4222-8222-222222222222";
const ORG = "11111111-1111-4111-8111-111111111111";
const BATCH_ID = "66666666-6666-4666-8666-666666666661";
const DELIVERY_ID = "77777777-7777-4777-8777-777777777771";
const SERVICE_ID = "88888888-8888-4888-8888-888888888881";
const COST_ID = "99999999-9999-4999-8999-999999999991";
const REC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const UAT_BATCH_ID = "8041ec63-b39d-42ef-ae78-3da8539554d2";
const savedBatch = (batchId: string, code: string) => ({
  batch_id: batchId, organization_id: ORG, site_id: SITE, recipe_id: BATCH_ID,
  recipe_code: code, recipe_version_no: 1, operation_date: "2026-11-05",
  planned_output: null, original_unit: "kg", mass_basis: "raw", recorded_at: "2026-11-05T00:00:00+08:00",
  io: [], yield_view: { status: "blocked", basis: null, value: null, input_total: null,
    primary_output_total: null, rework_total: null, reason: "no recorded primary output; yield blocked" },
});

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
  const evaluated = { kind: "saved", value: { site_id: SITE,
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
    note: "recommendations are explanations with provenance only" } };
  evaluateRecommendations.mockResolvedValue(evaluated);
  readRecommendations.mockResolvedValue(evaluated.value.alerts);
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

  it("reopens a saved batch from the URL after navigation and records IO on it", async () => {
    readBatch.mockResolvedValue(savedBatch(UAT_BATCH_ID, "RECIPE-UAT-REOPEN"));
    render(<MemoryRouter initialEntries={[`/backend-demo/production?batch=${UAT_BATCH_ID}`]}><BackendProductionPage /></MemoryRouter>);
    const user = userEvent.setup();
    expect(await screen.findByText(/RECIPE-UAT-REOPEN/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Jenis io"), "input");
    await user.type(screen.getByLabelText("Jumlah kg"), "12.5");
    await user.type(screen.getByLabelText("Waktu io"), "2026-11-05T08:00:00+08:00");
    await user.click(screen.getByRole("button", { name: /Catat IO/i }));
    await waitFor(() => expect(createBackendBatchIO).toHaveBeenCalledWith(UAT_BATCH_ID,
      expect.objectContaining({ io_kind: "input", quantity: "12.5" })));
    expect(createBackendBatch).not.toHaveBeenCalled();
  });

  it("opens a saved batch by UUID without creating a new batch", async () => {
    readBatch.mockResolvedValue(savedBatch(UAT_BATCH_ID, "RECIPE-UAT-MANUAL"));
    render(<MemoryRouter><BackendProductionPage /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/UUID batch tersimpan/i), UAT_BATCH_ID);
    await user.click(screen.getByRole("button", { name: /Buka batch tersimpan/i }));
    expect(await screen.findByText(/RECIPE-UAT-MANUAL/)).toBeInTheDocument();
    expect(readBatch).toHaveBeenCalledWith(UAT_BATCH_ID);
    expect(createBackendBatch).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID source lot reference before any POST", async () => {
    readBatch.mockResolvedValue(savedBatch(UAT_BATCH_ID, "RECIPE-UAT-LOT"));
    render(<MemoryRouter><BackendProductionPage /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/UUID batch tersimpan/i), UAT_BATCH_ID);
    await user.click(screen.getByRole("button", { name: /Buka batch tersimpan/i }));
    await screen.findByText(/RECIPE-UAT-LOT/);
    await user.selectOptions(screen.getByLabelText("Jenis io"), "input");
    await user.type(screen.getByLabelText("Lot sumber"), "LOT-UAT-02");
    await user.type(screen.getByLabelText("Jumlah kg"), "1");
    await user.type(screen.getByLabelText("Waktu io"), "2026-11-05T08:00:00+08:00");
    await user.click(screen.getByRole("button", { name: /Catat IO/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/UUID lot sumber tidak valid/);
    expect(createBackendBatchIO).not.toHaveBeenCalled();
  });

  it("shows the backend not-found message when an opened batch does not exist", async () => {
    readBatch.mockRejectedValueOnce(new Error("Objek tidak ditemukan (tanpa kebocoran informasi)."));
    render(<MemoryRouter><BackendProductionPage /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/UUID batch tersimpan/i), BATCH_ID);
    await user.click(screen.getByRole("button", { name: /Buka batch tersimpan/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Objek tidak ditemukan/);
    expect(screen.queryByLabelText("Jenis io")).not.toBeInTheDocument();
  });
});

describe("BackendDistributionPage (FR-103)", () => {
  it("shows needs_review for a 100 vs 95 mismatch, never an automatic waste event", async () => {
    render(<MemoryRouter><BackendDistributionPage /></MemoryRouter>);
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
    render(<MemoryRouter><BackendDistributionPage /></MemoryRouter>);
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
  const alertWith = (overrides: Record<string, unknown>) => ({
    recommendation_id: REC_ID, organization_id: ORG, site_id: SITE,
    rule_code: "event_coverage_insufficient", rule_version: "p2-rules-provisional-v0",
    target_type: "waste_event", target_ref: REC_ID,
    detected_issue: "coverage insufficient for analysis", coverage: "partial",
    recommended_action: "review the linked record with the site team; FWI never applies an automatic change",
    state: "open", ack_reason: null, ack_actor: null, ack_at: null,
    recorded_at: "2026-11-09T00:00:00+08:00", ...overrides,
  });

  it("stores a missing price as N/A and shows the blocked valuation", async () => {
    render(<MemoryRouter><BackendInsightsPage /></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/UUID scope/i), BATCH_ID);
    await user.type(screen.getByLabelText(/Sumber harga/i), "SYN-PRICE-A");
    await user.click(screen.getByRole("button", { name: /Simpan referensi/i }));
    expect(await screen.findByText(/N\/A \(tidak diketahui — tidak pernah dianggap Rp0\)/)).toBeInTheDocument();
    expect(screen.getByText(/Valuasi:/i)).toHaveTextContent("blocked");
    expect(screen.getByText(/allocation policy OPEN/)).toBeInTheDocument();
  });

  it("renders open alerts, insufficient-data outcomes, and records acknowledgement", async () => {
    render(<MemoryRouter><BackendInsightsPage /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Evaluasi rekomendasi/i }));
    expect(await screen.findByText(/dispatched and received quantities differ/)).toBeInTheDocument();
    expect(screen.getByText(/insufficient_data/)).toBeInTheDocument();
    expect(screen.getByText(/FWI never applies an automatic change/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Status alert'), 'open');
    await user.click(screen.getByRole('button', {name: 'Terapkan filter alert'}));
    await waitFor(() => expect(readRecommendations).toHaveBeenLastCalledWith(SITE, expect.any(AbortSignal), {state:'open'}));
    await user.click(await screen.findByRole('button', {name: 'Pilih alert ini'}));
    await user.type(screen.getByLabelText(/Alasan/i), "reviewed with the site team");
    await user.click(screen.getByRole("button", { name: /Catat tindakan/i }));
    await waitFor(() => expect(acknowledgeBackendRecommendation).toHaveBeenCalledWith(REC_ID,
      { state: "acknowledged", reason: "reviewed with the site team" }));
    expect(await screen.findByText(/acknowledged dengan alasan tercatat/i)).toBeInTheDocument();
    expect(evaluateRecommendations).toHaveBeenCalledTimes(1);
  });

  it("blocks an inverted recording-date range locally without a doomed request", async () => {
    render(<MemoryRouter><BackendInsightsPage /></MemoryRouter>);
    const user = userEvent.setup();
    await waitFor(() => expect(readRecommendations).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText(/Dari tanggal pencatatan/i), { target: { value: "2026-11-14" } });
    fireEvent.change(screen.getByLabelText(/Sampai tanggal pencatatan/i), { target: { value: "2026-11-13" } });
    await user.click(screen.getByRole("button", { name: /Terapkan filter alert/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Rentang tanggal tidak valid/);
    expect(readRecommendations).toHaveBeenCalledTimes(1);
    expect(readRecommendations).toHaveBeenLastCalledWith(SITE, expect.any(AbortSignal), {});
    fireEvent.change(screen.getByLabelText(/Dari tanggal pencatatan/i), { target: { value: "2026-11-10" } });
    await user.click(screen.getByRole("button", { name: /Terapkan filter alert/i }));
    await waitFor(() => expect(readRecommendations).toHaveBeenCalledTimes(2));
    expect(readRecommendations).toHaveBeenLastCalledWith(SITE, expect.any(AbortSignal),
      { recorded_from: "2026-11-10", recorded_to: "2026-11-13" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("links a waste_event alert source to the existing event detail route", async () => {
    const EVENT_ID = "33333333-3333-4333-8333-333333333331";
    readRecommendations.mockResolvedValue([alertWith({ target_type: "waste_event", target_ref: EVENT_ID })]);
    render(<MemoryRouter><BackendInsightsPage /></MemoryRouter>);
    const link = await screen.findByRole("link", { name: EVENT_ID });
    expect(link).toHaveAttribute("href", `/backend-demo/events/${EVENT_ID}`);
  });

  it("keeps a waste_event source without a valid UUID as plain text", async () => {
    readRecommendations.mockResolvedValue([alertWith({ target_type: "waste_event", target_ref: "bukan-uuid" })]);
    render(<MemoryRouter><BackendInsightsPage /></MemoryRouter>);
    await screen.findByText("coverage insufficient for analysis");
    expect(screen.getAllByText(/bukan-uuid/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "bukan-uuid" })).not.toBeInTheDocument();
  });

  it("links a delivery source to the existing distribution page", async () => {
    readRecommendations.mockResolvedValue([alertWith({ target_type: "delivery", target_ref: DELIVERY_ID })]);
    render(<MemoryRouter><BackendInsightsPage /></MemoryRouter>);
    await screen.findByText("coverage insufficient for analysis");
    expect(screen.getAllByText(new RegExp(DELIVERY_ID)).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: DELIVERY_ID })).toHaveAttribute("href", `/backend-distribution?delivery=${DELIVERY_ID}`);
  });

  it("renders global rules read-only without any mutation control (T-06/T-08)", async () => {
    render(<MemoryRouter><BackendInsightsPage /></MemoryRouter>);
    expect(await screen.findByText(/event_coverage_insufficient/)).toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aktifkan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nonaktifkan" })).not.toBeInTheDocument();
    expect(readAlertRules).toHaveBeenCalledTimes(1); // read kept for authorized users
  });
});


const RACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const RACE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const RACE_C = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function BatchRaceHarness() {
  const navigate = useNavigate(), location = useLocation();
  const [visible, setVisible] = useState(true);
  return <>
    <output aria-label="Lokasi batch uji">{location.search}</output>
    {[['A', RACE_A], ['B', RACE_B], ['C', RACE_C], ['kosong', ''], ['invalid', 'invalid']].map(([label, id]) =>
      <button key={label} onClick={() => navigate('/backend-production' + (id ? '?batch=' + id : ''))}>Navigasi {label}</button>)}
    <button onClick={() => setVisible(false)}>Tutup halaman batch</button>
    {visible && <BackendProductionPage />}
  </>;
}
function mountBatchRace(strict = false) {
  const tree = <MemoryRouter initialEntries={[`/backend-production?batch=${RACE_A}`]}><BatchRaceHarness /></MemoryRouter>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
function fillRaceIO(quantity = '1') {
  fireEvent.change(screen.getByLabelText('Jenis io'), { target: { value: 'input' } });
  fireEvent.change(screen.getByLabelText('Jumlah kg'), { target: { value: quantity } });
  fireEvent.change(screen.getByLabelText('Waktu io'), { target: { value: '2026-11-16T08:00:00+08:00' } });
}

describe('production batch request ordering (T1 P1 regression)', () => {
  beforeEach(() => {
    readBatch.mockReset().mockImplementation(id => Promise.resolve(savedBatch(id, id === RACE_A ? 'RACE-A' : 'RACE-B')));
    createBackendBatchIO.mockReset().mockResolvedValue({ kind: 'saved', value: { io_id: BATCH_ID } });
    createBackendBatch.mockReset().mockResolvedValue({ kind: 'saved', value: { batch_id: RACE_C } });
  });

  it.each(['success', 'error'])('keeps B and posts IO only to B when late A settles with %s', async outcome => {
    const a = deferred<ReturnType<typeof savedBatch>>(), b = deferred<ReturnType<typeof savedBatch>>();
    readBatch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
    mountBatchRace();
    await waitFor(() => expect(readBatch).toHaveBeenCalledWith(RACE_A));
    fireEvent.click(screen.getByRole('button', { name: 'Navigasi B' }));
    await waitFor(() => expect(readBatch).toHaveBeenCalledWith(RACE_B));
    await act(async () => b.resolve(savedBatch(RACE_B, 'RACE-B')));
    expect(screen.getByText(/resep RACE-B/)).toBeInTheDocument();
    await act(async () => outcome === 'success' ? a.resolve(savedBatch(RACE_A, 'RACE-A-OLD')) : a.reject(new Error('stale A error')));
    expect(screen.queryByText(/RACE-A-OLD|stale A error/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Lokasi batch uji')).toHaveTextContent('?batch=' + RACE_B);
    expect(screen.getByLabelText(/UUID batch tersimpan/)).toHaveValue(RACE_B);
    fillRaceIO();fireEvent.click(screen.getByRole('button', { name: 'Catat IO' }));
    await waitFor(() => expect(createBackendBatchIO).toHaveBeenCalledTimes(1));
    expect(createBackendBatchIO).toHaveBeenCalledWith(RACE_B, expect.objectContaining({ quantity: '1' }));
    expect(createBackendBatch).not.toHaveBeenCalled();
  });

  it('ignores stale error/finally while B is still loading', async () => {
    const a = deferred<ReturnType<typeof savedBatch>>(), b = deferred<ReturnType<typeof savedBatch>>();
    readBatch.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
    mountBatchRace();fireEvent.click(screen.getByRole('button', { name: 'Navigasi B' }));
    await waitFor(() => expect(readBatch).toHaveBeenCalledTimes(2));
    await act(async () => a.reject(new Error('stale A error')));
    expect(screen.queryByText('stale A error')).not.toBeInTheDocument();
    expect(screen.getByText('Memuat batch…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Buka batch tersimpan' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Catat IO' })).not.toBeInTheDocument();
    await act(async () => b.resolve(savedBatch(RACE_B, 'RACE-B')));
    expect(screen.getByRole('button', { name: 'Buka batch tersimpan' })).toBeEnabled();
  });

  it('only accepts the newest request across A to B to A, even for the same batch ID', async () => {
    const a1 = deferred<ReturnType<typeof savedBatch>>(), b = deferred<ReturnType<typeof savedBatch>>(), a2 = deferred<ReturnType<typeof savedBatch>>();
    readBatch.mockImplementationOnce(() => a1.promise).mockImplementationOnce(() => b.promise).mockImplementationOnce(() => a2.promise);
    mountBatchRace();fireEvent.click(screen.getByRole('button', { name: 'Navigasi B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Navigasi A' }));
    await waitFor(() => expect(readBatch).toHaveBeenCalledTimes(3));
    await act(async () => a2.resolve(savedBatch(RACE_A, 'RACE-A-CURRENT')));
    await act(async () => b.reject(new Error('stale B error')));
    await act(async () => a1.resolve(savedBatch(RACE_A, 'RACE-A-OLD')));
    expect(screen.getByText(/resep RACE-A-CURRENT/)).toBeInTheDocument();
    expect(screen.queryByText(/RACE-A-OLD|stale B error/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Lokasi batch uji')).toHaveTextContent('?batch=' + RACE_A);
  });

  it('rejects a response with a different batch identity and closes IO', async () => {
    readBatch.mockResolvedValue(savedBatch(RACE_B, 'WRONG-RESPONSE'));
    mountBatchRace();
    expect(await screen.findByRole('alert')).toHaveTextContent('Respons batch tidak sesuai target');
    expect(screen.queryByText(/WRONG-RESPONSE/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Catat IO' })).not.toBeInTheDocument();
    expect(createBackendBatchIO).not.toHaveBeenCalled();
  });

  it.each(['kosong', 'invalid'])('closes the old target when URL becomes %s before A returns', async destination => {
    const a = deferred<ReturnType<typeof savedBatch>>();readBatch.mockImplementationOnce(() => a.promise);
    mountBatchRace();fireEvent.click(screen.getByRole('button', { name: 'Navigasi ' + destination }));
    await act(async () => a.resolve(savedBatch(RACE_A, 'RACE-A-OLD')));
    expect(screen.queryByText(/RACE-A-OLD/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Catat IO' })).not.toBeInTheDocument();
    expect(readBatch).toHaveBeenCalledTimes(1);expect(createBackendBatchIO).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Lokasi batch uji').textContent).toBe(destination === 'invalid' ? '?batch=invalid' : '');
  });

  it('does not reopen A or reset B draft after an in-flight IO POST to A settles', async () => {
    const post = deferred<{ kind: string; value: { io_id: string } }>();createBackendBatchIO.mockImplementationOnce(() => post.promise);
    mountBatchRace();await screen.findByText(/resep RACE-A/);fillRaceIO();
    fireEvent.click(screen.getByRole('button', { name: 'Catat IO' }));
    expect(createBackendBatchIO).toHaveBeenCalledWith(RACE_A, expect.any(Object));
    fireEvent.click(screen.getByRole('button', { name: 'Navigasi B' }));await screen.findByText(/resep RACE-B/);fillRaceIO('2');
    await act(async () => post.resolve({ kind: 'saved', value: { io_id: BATCH_ID } }));
    expect(screen.getByText(/resep RACE-B/)).toBeInTheDocument();
    expect(screen.getByLabelText('Jumlah kg')).toHaveValue('2');
    expect(readBatch).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/IO tersimpan/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Catat IO' }));
    await waitFor(() => expect(createBackendBatchIO).toHaveBeenCalledTimes(2));
    expect(createBackendBatchIO.mock.calls.map(call => call[0])).toEqual([RACE_A, RACE_B]);
    expect(createBackendBatchIO.mock.calls[1][1].quantity).toBe('2');
    expect(readBatch.mock.calls.filter(call => call[0] === RACE_A)).toHaveLength(1);
  });

  it('does not replace B when an older create-batch POST acknowledgement arrives', async () => {
    const post = deferred<{ kind: string; value: { batch_id: string } }>();createBackendBatch.mockImplementationOnce(() => post.promise);
    mountBatchRace();await screen.findByText(/resep RACE-A/);
    fireEvent.change(screen.getByLabelText('UUID resep'), { target: { value: BATCH_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Buat batch' }));expect(createBackendBatch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Navigasi B' }));await screen.findByText(/resep RACE-B/);
    await act(async () => post.resolve({ kind: 'saved', value: { batch_id: RACE_C } }));
    expect(readBatch).not.toHaveBeenCalledWith(RACE_C);
    expect(screen.getByText(/resep RACE-B/)).toBeInTheDocument();
    expect(screen.getByLabelText('Lokasi batch uji')).toHaveTextContent('?batch=' + RACE_B);
  });

  it('ignores a pending manual reopen after the production page unmounts', async () => {
    const b = deferred<ReturnType<typeof savedBatch>>();readBatch.mockImplementationOnce(() => Promise.resolve(savedBatch(RACE_A, 'RACE-A'))).mockImplementationOnce(() => b.promise);
    mountBatchRace();await screen.findByText(/resep RACE-A/);
    fireEvent.change(screen.getByLabelText(/UUID batch tersimpan/), { target: { value: RACE_B } });
    fireEvent.click(screen.getByRole('button', { name: 'Buka batch tersimpan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tutup halaman batch' }));
    await act(async () => b.resolve(savedBatch(RACE_B, 'RACE-B-OLD')));
    expect(screen.getByLabelText('Lokasi batch uji')).toHaveTextContent('?batch=' + RACE_A);
    expect(createBackendBatchIO).not.toHaveBeenCalled();
  });

  it('restarts the current read after StrictMode cleanup and ignores the first result', async () => {
    const first = deferred<ReturnType<typeof savedBatch>>();
    readBatch.mockImplementationOnce(() => first.promise).mockResolvedValue(savedBatch(RACE_A, 'RACE-A-CURRENT'));
    mountBatchRace(true);await screen.findByText(/resep RACE-A-CURRENT/);
    expect(readBatch).toHaveBeenCalledTimes(2);
    await act(async () => first.resolve(savedBatch(RACE_A, 'RACE-A-OLD')));
    expect(screen.queryByText(/RACE-A-OLD/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buka batch tersimpan' })).toBeEnabled();
  });
});
