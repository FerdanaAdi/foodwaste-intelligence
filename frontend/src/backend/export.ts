/** PROVISIONAL frontend export integration contract candidate (FWI-EXPORT-UI-01B).
 *
 * Mirrors the FWI-EXPORT-01A pure serializer contract (format
 * `fwi-synthetic-export-v0.1`, independent review PENDING). No backend export
 * route, permission vocabulary or HTTP response shape exists at this baseline,
 * so this module defines ONLY:
 *  - the typed frontend request/metadata contract validated fail-closed, and
 *  - a synthetic in-memory adapter for tests and local demonstration.
 * No live backend integration is claimed. The date-range filter semantics are
 * OPEN (see FWI-EXPORT-01A "Before full FR-008 acceptance"); `operation_date`
 * is source-only and NOT persisted, so it is never a filter basis here.
 */
import { isAwareTimestamp, isUUID } from "./contract";

export const EXPORT_FORMAT = "fwi-synthetic-export-v0.1";
export const EXPORT_NULL_TOKEN = "\\N";

/** Exact serializer column order (FWI-EXPORT-01A export_csv.py). */
export const EVENT_EXPORT_COLUMNS = [
  "event_id", "organization_id", "site_id", "event_type",
  "operation_date", "occurred_at", "recorded_at", "export_label",
] as const;
export const MEASUREMENT_EXPORT_COLUMNS = [
  "measurement_id", "event_id", "site_id", "measured_at",
  "recorded_at", "gross", "tare", "net", "original_unit",
  "mass_basis", "measurement_method", "observation_status",
  "validation_status", "provenance", "export_label",
] as const;

/** Filter basis must name an actually persisted timestamp. `operation_date` is
 *  explicitly excluded: it is source-only with no baseline persistence support. */
export const EXPORT_DATE_BASES = ["occurred_at", "measured_at"] as const;
export type ExportDateBasis = (typeof EXPORT_DATE_BASES)[number];

export interface ExportRequest {
  /** Explicit caller site scope; nonempty; every entry must be a UUID. */
  site_ids: string[];
  /** Optional inclusive calendar-date bounds (YYYY-MM-DD) or null. */
  date_from: string | null;
  date_to: string | null;
  date_basis: ExportDateBasis;
}

export interface ExportEscapedCell {
  file: "events.csv" | "measurements.csv";
  record_id: string;
  column: string;
  prefix: string;
}

export interface ExportFileMeta {
  columns: string[];
  sha256: string;
}

export interface ExportSourceOnlyField {
  provided: number;
  baseline_persistence_support: boolean;
}

/** Runtime-validated mirror of the serializer metadata object. */
export interface ExportMetadata {
  format: string;
  status: string;
  synthetic_only: boolean;
  generated_at: string;
  scope_site_ids: string[];
  authorization_enforced: boolean;
  ordering: string;
  counts: { events: number; measurements: number };
  row_semantics: string;
  csv: { encoding: string; delimiter: string; quote_all: boolean; line_ending: string; null_token: string };
  source_only_fields: Record<string, ExportSourceOnlyField>;
  decimal_fidelity: string;
  measurement_selection: string;
  spreadsheet_safety: string;
  escaped_cells: ExportEscapedCell[];
  restore_source_text: string;
  held_kpis: string[];
  files: Record<string, ExportFileMeta>;
}

export interface ConfirmedExport {
  metadata: ExportMetadata;
  /** Byte-exact payloads; CSV bytes include the UTF-8 BOM, as serialized. */
  files: { events_csv: Uint8Array; measurements_csv: Uint8Array; metadata_json: Uint8Array };
}

/** Server-decided outcome. There is no client-side authorization fallback. */
export type ExportOutcome =
  | { kind: "confirmed"; export: ConfirmedExport }
  | { kind: "denied"; message: string }
  | { kind: "unavailable"; message: string };

/** Integration seam for the future approved authenticated endpoint. The real
 *  adapter is supplied later; nothing here names a route or permission. */
export interface ExportAdapter {
  requestExport(request: ExportRequest, signal: AbortSignal): Promise<ExportOutcome>;
}

const SOURCE_ONLY_FIELDS = ["events.operation_date", "measurements.validation_status"] as const;
const HELD_KPIS = ["OP-08", "FI-02", "NI-03"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function failClosed(): never {
  throw new Error("Metadata ekspor tidak memenuhi kontrak fwi-synthetic-export-v0.1.");
}
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) failClosed();
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) failClosed();
}
function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Fail-closed metadata validation. Unknown/missing fields reject the whole
 *  export rather than silently dropping source data — matching the serializer. */
export function parseExportMetadata(value: unknown): ExportMetadata {
  const meta = record(value);
  exactKeys(meta, ["format", "status", "synthetic_only", "generated_at", "scope_site_ids", "authorization_enforced",
    "ordering", "counts", "row_semantics", "csv", "source_only_fields", "decimal_fidelity", "measurement_selection",
    "spreadsheet_safety", "escaped_cells", "restore_source_text", "held_kpis", "files"]);
  if (meta.format !== EXPORT_FORMAT || !nonemptyString(meta.status) || meta.synthetic_only !== true) failClosed();
  if (!isAwareTimestamp(meta.generated_at) || meta.authorization_enforced !== false) failClosed();
  const scope = meta.scope_site_ids;
  if (!Array.isArray(scope) || scope.length === 0 || !scope.every(id => typeof id === "string" && UUID_PATTERN.test(id))) failClosed();
  for (const key of ["ordering", "row_semantics", "decimal_fidelity", "measurement_selection", "spreadsheet_safety", "restore_source_text"]) {
    if (!nonemptyString(meta[key])) failClosed();
  }
  const counts = record(meta.counts);
  exactKeys(counts, ["events", "measurements"]);
  if (!isInteger(counts.events) || !isInteger(counts.measurements)) failClosed();
  const csv = record(meta.csv);
  exactKeys(csv, ["encoding", "delimiter", "quote_all", "line_ending", "null_token"]);
  if (csv.encoding !== "UTF-8 with BOM" || csv.delimiter !== "," || csv.quote_all !== true
    || csv.line_ending !== "CRLF" || csv.null_token !== EXPORT_NULL_TOKEN) failClosed();
  const sourceOnly = record(meta.source_only_fields);
  exactKeys(sourceOnly, SOURCE_ONLY_FIELDS);
  for (const key of SOURCE_ONLY_FIELDS) {
    const field = record(sourceOnly[key]);
    exactKeys(field, ["provided", "baseline_persistence_support"]);
    if (!isInteger(field.provided) || typeof field.baseline_persistence_support !== "boolean") failClosed();
  }
  if (!Array.isArray(meta.escaped_cells)) failClosed();
  for (const cell of meta.escaped_cells) {
    const entry = record(cell);
    if (entry.file !== "events.csv" && entry.file !== "measurements.csv") failClosed();
    if (!nonemptyString(entry.record_id) || !nonemptyString(entry.column) || entry.prefix !== "'") failClosed();
    const columns = entry.file === "events.csv" ? EVENT_EXPORT_COLUMNS : MEASUREMENT_EXPORT_COLUMNS;
    if (!columns.some(column => column === entry.column)) failClosed();
  }
  if (!Array.isArray(meta.held_kpis) || meta.held_kpis.length !== HELD_KPIS.length
    || HELD_KPIS.some((kpi, index) => (meta.held_kpis as unknown[])[index] !== kpi)) failClosed();
  const files = record(meta.files);
  exactKeys(files, ["events.csv", "measurements.csv"]);
  const expectedColumns: Record<string, readonly string[]> = { "events.csv": EVENT_EXPORT_COLUMNS, "measurements.csv": MEASUREMENT_EXPORT_COLUMNS };
  for (const name of ["events.csv", "measurements.csv"] as const) {
    const file = record(files[name]);
    exactKeys(file, ["columns", "sha256"]);
    if (!Array.isArray(file.columns) || file.columns.length !== expectedColumns[name].length
      || expectedColumns[name].some((column, index) => (file.columns as unknown[])[index] !== column)) failClosed();
    if (typeof file.sha256 !== "string" || !SHA256_PATTERN.test(file.sha256)) failClosed();
  }
  return meta as unknown as ExportMetadata;
}

/** Client-side request guard used before any adapter call. */
export function exportRequestErrors(request: ExportRequest): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Array.isArray(request.site_ids) || request.site_ids.length === 0
    || !request.site_ids.every(id => isUUID(id))) errors.site_ids = "Pilih minimal satu site UUID yang valid.";
  for (const key of ["date_from", "date_to"] as const) {
    const value = request[key];
    if (value !== null && !DATE_PATTERN.test(value)) errors[key] = "Tanggal harus dalam format YYYY-MM-DD atau kosong.";
  }
  if (request.date_from !== null && request.date_to !== null && request.date_from > request.date_to) {
    errors.date_to = "Tanggal akhir tidak boleh mendahului tanggal awal.";
  }
  if (!EXPORT_DATE_BASES.some(basis => basis === request.date_basis)) {
    errors.date_basis = "Basis tanggal filter wajib dipilih secara eksplisit.";
  }
  return errors;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
function csvLine(values: readonly (string | null)[]): string {
  return values.map(value => value === null ? csvField(EXPORT_NULL_TOKEN) : csvField(value)).join(",") + "\r\n";
}

export type SyntheticExportScenario = "confirmed" | "empty" | "denied" | "unavailable";

export interface SyntheticExportAdapterOptions {
  /** Simulated latency before the outcome resolves; default 0. */
  delayMs?: number;
  /** Aware generation timestamp stamped into metadata; default fixed fixture. */
  generatedAt?: string;
}

/** In-memory adapter for tests and local demonstration ONLY. It never touches
 *  the network, never claims authorization, and always labels payloads
 *  SYNTHETIC/DEMO. Default page scenario stays "unavailable" because no export
 *  route exists at this baseline. */
export function createSyntheticExportAdapter(
  scenario: SyntheticExportScenario,
  options: SyntheticExportAdapterOptions = {},
): ExportAdapter {
  const delayMs = options.delayMs ?? 0;
  const generatedAt = options.generatedAt ?? "2026-11-08T00:00:00+00:00";
  return {
    async requestExport(request: ExportRequest, signal: AbortSignal): Promise<ExportOutcome> {
      if (Object.keys(exportRequestErrors(request)).length) {
        throw new Error("Permintaan ekspor tidak valid; adaptor sintetis menolak memprosesnya.");
      }
      await new Promise<void>(resolve => setTimeout(resolve, delayMs));
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (scenario === "denied") {
        return { kind: "denied", message: "Permintaan ekspor ditolak untuk cakupan site yang diminta (skenario sintetis). Tidak ada berkas yang dihasilkan. Keputusan otorisasi selalu berada di server." };
      }
      if (scenario === "unavailable") {
        return { kind: "unavailable", message: "Layanan ekspor belum tersedia atau tidak dapat dihubungi (skenario sintetis). Belum ada route ekspor backend yang disetujui pada baseline ini." };
      }
      const siteId = request.site_ids[0];
      const events: (string | null)[][] = [];
      const measurements: (string | null)[][] = [];
      if (scenario === "confirmed") {
        events.push([
          "33333333-3333-4333-8333-333333333301", "11111111-1111-4111-8111-111111111111", siteId,
          "actual_loss_discard", null, "2026-11-06T12:00:00+08:00", "2026-11-06T12:05:00+08:00", "SYNTHETIC/DEMO",
        ]);
        measurements.push([
          "44444444-4444-4444-8444-444444444401", "33333333-3333-4333-8333-333333333301", siteId,
          "2026-11-06T12:02:00+08:00", "2026-11-06T12:05:00+08:00", "0.4", "0.1", "0.3", "kg",
          "as_served", "digital_scale_synthetic", "observed", null, "synthetic test source", "SYNTHETIC/DEMO",
        ]);
      }
      const eventsCsv = new TextEncoder().encode(
        "\uFEFF" + csvLine([...EVENT_EXPORT_COLUMNS]) + events.map(row => csvLine(row)).join(""),
      );
      const measurementsCsv = new TextEncoder().encode(
        "\uFEFF" + csvLine([...MEASUREMENT_EXPORT_COLUMNS]) + measurements.map(row => csvLine(row)).join(""),
      );
      const metadata = parseExportMetadata({
        format: EXPORT_FORMAT,
        status: "PROVISIONAL",
        synthetic_only: true,
        generated_at: generatedAt,
        scope_site_ids: [...request.site_ids].sort(),
        authorization_enforced: false,
        ordering: "event_id / measurement_id ascending; not reporting priority",
        counts: { events: events.length, measurements: measurements.length },
        row_semantics: "one row per identity in each file; never sum repeated measurements as generation",
        csv: { encoding: "UTF-8 with BOM", delimiter: ",", quote_all: true, line_ending: "CRLF", null_token: EXPORT_NULL_TOKEN },
        source_only_fields: {
          "events.operation_date": { provided: 0, baseline_persistence_support: false },
          "measurements.validation_status": { provided: 0, baseline_persistence_support: false },
        },
        decimal_fidelity: "input str unchanged; Decimal uses str; database cannot recover original input lexemes",
        measurement_selection: "all supplied; no canonical/latest selection or aggregation",
        spreadsheet_safety: "apostrophe-prefix dangerous cells; import as text; no universal save/reopen guarantee",
        escaped_cells: [],
        restore_source_text: "at escaped_cells coordinates remove one prefix to recover literal text; ONLY unescaped null_token means None",
        held_kpis: [...HELD_KPIS],
        files: {
          "events.csv": { columns: [...EVENT_EXPORT_COLUMNS], sha256: await sha256Hex(eventsCsv) },
          "measurements.csv": { columns: [...MEASUREMENT_EXPORT_COLUMNS], sha256: await sha256Hex(measurementsCsv) },
        },
      });
      return {
        kind: "confirmed",
        export: {
          metadata,
          files: {
            events_csv: eventsCsv,
            measurements_csv: measurementsCsv,
            metadata_json: new TextEncoder().encode(JSON.stringify(metadata, null, 2) + "\n"),
          },
        },
      };
    },
  };
}
