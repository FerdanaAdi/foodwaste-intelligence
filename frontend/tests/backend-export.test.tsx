import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import BackendExportPage from "@/pages/BackendExportPage";
import {
  createSyntheticExportAdapter, exportRequestErrors, parseExportMetadata,
  type ExportAdapter, type ExportMetadata, type ExportOutcome,
} from "@/backend/export";

const FIXTURE_SITE = "22222222-2222-4222-8222-222222222222";
const createObjectURL = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;

function mountPage(adapter?: ExportAdapter) {
  return render(
    <MemoryRouter initialEntries={["/backend-demo/export"]}>
      {adapter ? <BackendExportPage adapter={adapter} /> : <BackendExportPage />}
    </MemoryRouter>,
  );
}

async function requestExport(user: ReturnType<typeof userEvent.setup>, basis = "occurred_at") {
  // The date basis is deliberately explicit; no default filter basis exists.
  await user.selectOptions(screen.getByLabelText(/Basis tanggal filter/), basis);
  await user.click(screen.getByRole("button", { name: "Minta konfirmasi ekspor" }));
}

function brokenAdapter(metadata: unknown): ExportAdapter {
  return { requestExport: async (): Promise<ExportOutcome> => ({ kind: "confirmed", export: { metadata: metadata as ExportMetadata, files: { events_csv: new Uint8Array(), measurements_csv: new Uint8Array(), metadata_json: new Uint8Array() } } }) };
}

afterEach(() => { vi.restoreAllMocks(); createObjectURL.mockClear(); });

describe("FWI-EXPORT-UI-01B backend export candidate page", () => {
  it("denied outcome shows an explicit refusal with no download affordance", async () => {
    const user = userEvent.setup();
    mountPage(createSyntheticExportAdapter("denied"));
    await requestExport(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/ditolak/i);
    expect(screen.queryByRole("button", { name: /^Unduh / })).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("unavailable outcome offers a user-initiated retry only", async () => {
    const user = userEvent.setup();
    // Default page (no injected adapter) defaults to the honest "unavailable" scenario.
    mountPage();
    await requestExport(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/belum tersedia/i);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Coba minta ulang (dimulai pengguna)" }));
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(1));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("loading state is announced and disables the submit button", async () => {
    const user = userEvent.setup();
    mountPage(createSyntheticExportAdapter("confirmed", { delayMs: 40 }));
    await requestExport(user);
    expect(screen.getByRole("status")).toHaveTextContent(/Meminta keputusan ekspor/);
    expect(screen.getByRole("button", { name: "Minta konfirmasi ekspor" })).toBeDisabled();
    await screen.findByText(/Ekspor tersedia \(dikonfirmasi server\)/);
    expect(screen.getByRole("button", { name: "Minta konfirmasi ekspor" })).toBeEnabled();
  });

  it("confirmed export shows metadata and lineage, and downloads only on explicit user action", async () => {
    const user = userEvent.setup();
    mountPage(createSyntheticExportAdapter("confirmed"));
    await requestExport(user);
    const panel = await screen.findByRole("region", { name: "Metadata dan lineage ekspor" });
    expect(panel).toHaveTextContent("fwi-synthetic-export-v0.1");
    expect(panel).toHaveTextContent(FIXTURE_SITE);
    expect(panel).toHaveTextContent("1 event, 1 measurement");
    expect(panel).toHaveTextContent("false (tidak didukung)");
    expect(panel).toHaveTextContent("OP-08, FI-02, NI-03");
    expect(panel).toHaveTextContent(/[0-9a-f]{64}/);
    // No automatic download before the user acts.
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Unduh events.csv" }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Unduh measurements.csv" }));
    await user.click(screen.getByRole("button", { name: "Unduh metadata.json" }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
  });

  it("empty confirmed export is a distinct state while keeping metadata and valid header-only downloads", async () => {
    const user = userEvent.setup();
    mountPage(createSyntheticExportAdapter("empty"));
    await requestExport(user);
    const heading = await screen.findByText(/Ekspor kosong dikonfirmasi server/);
    expect(heading.closest("section")).toHaveTextContent(/0 event dan 0 measurement/);
    expect(screen.getByRole("region", { name: "Metadata dan lineage ekspor" })).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Unduh metadata.json" }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("metadata that violates the contract is rejected fail-closed with no download", async () => {
    const user = userEvent.setup();
    mountPage(brokenAdapter({ format: "fwi-synthetic-export-v0.1" }));
    await requestExport(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/fail-closed/i);
    expect(alert).toHaveTextContent(/kontrak fwi-synthetic-export-v0\.1/i);
    expect(screen.queryByRole("button", { name: /^Unduh / })).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("request guard requires an explicit site, date basis and consistent range", () => {
    expect(Object.keys(exportRequestErrors({ site_ids: [], date_from: null, date_to: null, date_basis: "occurred_at" }))).toContain("site_ids");
    expect(Object.keys(exportRequestErrors({ site_ids: [FIXTURE_SITE], date_from: null, date_to: null, date_basis: "" as never }))).toContain("date_basis");
    expect(Object.keys(exportRequestErrors({ site_ids: [FIXTURE_SITE], date_from: "2026-11-08", date_to: "2026-11-01", date_basis: "occurred_at" }))).toContain("date_to");
    expect(exportRequestErrors({ site_ids: [FIXTURE_SITE], date_from: null, date_to: null, date_basis: "measured_at" })).toEqual({});
  });

  it("submission without an explicit date basis or site is blocked with inline errors", async () => {
    const user = userEvent.setup();
    mountPage(createSyntheticExportAdapter("confirmed"));
    await user.click(screen.getByRole("button", { name: "Minta konfirmasi ekspor" }));
    expect(screen.getByText(/Basis tanggal filter wajib dipilih/)).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText(/Basis tanggal filter/), "occurred_at");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Minta konfirmasi ekspor" }));
    expect(screen.getByText(/Pilih minimal satu site UUID/)).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("parseExportMetadata fails closed on unknown fields, wrong columns and missing sha256", () => {
    const base = {
      format: "fwi-synthetic-export-v0.1", status: "PROVISIONAL", synthetic_only: true,
      generated_at: "2026-11-08T00:00:00+00:00", scope_site_ids: [FIXTURE_SITE], authorization_enforced: false,
      ordering: "x", counts: { events: 0, measurements: 0 }, row_semantics: "x",
      csv: { encoding: "UTF-8 with BOM", delimiter: ",", quote_all: true, line_ending: "CRLF", null_token: "\\N" },
      source_only_fields: {
        "events.operation_date": { provided: 0, baseline_persistence_support: false },
        "measurements.validation_status": { provided: 0, baseline_persistence_support: false },
      },
      decimal_fidelity: "x", measurement_selection: "x", spreadsheet_safety: "x",
      escaped_cells: [], restore_source_text: "x", held_kpis: ["OP-08", "FI-02", "NI-03"],
      files: {
        "events.csv": { columns: ["event_id", "organization_id", "site_id", "event_type", "operation_date", "occurred_at", "recorded_at", "export_label"], sha256: "a".repeat(64) },
        "measurements.csv": { columns: ["measurement_id", "event_id", "site_id", "measured_at", "recorded_at", "gross", "tare", "net", "original_unit", "mass_basis", "measurement_method", "observation_status", "validation_status", "provenance", "export_label"], sha256: "b".repeat(64) },
      },
    };
    const metadata = parseExportMetadata(base);
    expect(metadata.counts).toEqual({ events: 0, measurements: 0 });
    // Unknown extra field fails closed.
    expect(() => parseExportMetadata({ ...base, surprise: true })).toThrow(/kontrak/);
    // Missing sha256 fails closed.
    const noSha = structuredClone(base);
    (noSha.files["events.csv"] as Record<string, unknown>).sha256 = undefined as unknown as string;
    expect(() => parseExportMetadata(noSha)).toThrow(/kontrak/);
    // Wrong column order fails closed.
    const wrongColumns = structuredClone(base);
    (wrongColumns.files["events.csv"] as { columns: string[] }).columns = ["event_id", "site_id", "organization_id", "event_type", "operation_date", "occurred_at", "recorded_at", "export_label"];
    expect(() => parseExportMetadata(wrongColumns)).toThrow(/kontrak/);
    // Naive generated_at fails closed.
    expect(() => parseExportMetadata({ ...base, generated_at: "2026-11-08T00:00:00" })).toThrow(/kontrak/);
  });

  it("synthetic adapter rejects out-of-scope fabricated requests instead of silently exporting", async () => {
    const adapter = createSyntheticExportAdapter("confirmed");
    await expect(adapter.requestExport({ site_ids: [], date_from: null, date_to: null, date_basis: "occurred_at" }, new AbortController().signal))
      .rejects.toThrow(/tidak valid/);
  });

  it("a confirmed export payload decodes to BOM-prefixed header-only CSV for the empty scenario", async () => {
    const adapter = createSyntheticExportAdapter("empty");
    const outcome = await adapter.requestExport({ site_ids: [FIXTURE_SITE], date_from: null, date_to: null, date_basis: "measured_at" }, new AbortController().signal);
    if (outcome.kind !== "confirmed") throw new Error("expected confirmed");
    const confirmed = outcome.export;
    // Byte-level BOM check; TextDecoder strips the BOM by default.
    expect([...confirmed.files.events_csv.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
    const eventsCsv = new TextDecoder().decode(confirmed.files.events_csv);
    expect(eventsCsv).toContain('"event_id","organization_id","site_id","event_type","operation_date","occurred_at","recorded_at","export_label"');
    expect(confirmed.files.events_csv.byteLength).toBeGreaterThan(0);
    expect(confirmed.metadata.csv.null_token).toBe("\\N");
  });

  it("an unmount during an in-flight request aborts without any download", async () => {
    const mounted = mountPage(createSyntheticExportAdapter("confirmed", { delayMs: 50 }));
    fireEvent.click(screen.getByRole("button", { name: "Minta konfirmasi ekspor" }));
    mounted.unmount();
    await new Promise(resolve => setTimeout(resolve, 90));
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
