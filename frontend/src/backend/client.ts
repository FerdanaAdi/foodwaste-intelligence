import { isUUID, isISODate, parseEvent, parseMeasurements } from "./contract";
import { assertCurrent, authSnapshot, AuthFailure, protectedJson } from './auth';

export const REQUEST_TIMEOUT_MS = 10000;
async function get(path: string, signal: AbortSignal): Promise<unknown> {
  const context = authSnapshot();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Batas waktu permintaan backend terlampaui."));
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    const value = await Promise.race([timeout, (async () => {
      const { response, value } = await protectedJson(path, { method: 'GET' }, controller.signal);
      if (!response.ok) {
        if (response.status === 404) throw new Error("404: Event backend tidak ditemukan.");
        if (response.status === 503) throw new Error("503: Layanan backend tidak tersedia.");
        throw new Error(`Backend gagal merespons (HTTP ${response.status}).`);
      }
      return value;
    })()]);
    assertCurrent(context);
    return value;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Koneksi jaringan backend gagal.");
    if (error instanceof SyntaxError) throw new Error("Respons backend bukan JSON yang valid.");
    throw error;
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener("abort", cancel);
  }
}
function eventPath(id: string): string {
  if (!isUUID(id)) throw new Error("Event ID harus berupa UUID.");
  return `/demo/v0.1/events/${id}`;
}
export async function readBackendEvent(id: string, signal: AbortSignal) {
  const event = parseEvent(await get(eventPath(id), signal), id);
  if (event.site_id !== authSnapshot().site) throw new AuthFailure(403, 'Event tidak berada pada site aktif.');
  return event;
}
export async function readBackendMeasurements(id: string, signal: AbortSignal) {
  return parseMeasurements(await get(`${eventPath(id)}/measurements`, signal), id);
}

export type LedgerFilters = {
  event_type?: string; stage_code?: string;
  operation_date_from?: string; operation_date_to?: string; page?: number;
};
export interface LedgerPage {
  events: import("./contract").BackendEvent[];
  total: number; page: number; page_size: number;
}
function parseLedger(value: unknown): LedgerPage {
  if (typeof value !== "object" || value === null) throw new Error("Respons ledger tidak sesuai kontrak.");
  const record = value as Record<string, unknown>;
  const total = record.total, page = record.page, page_size = record.page_size;
  if (!Array.isArray(record.events) || typeof total !== "number" || !Number.isInteger(total) || total < 0 ||
      typeof page !== "number" || !Number.isInteger(page) || page < 1 ||
      typeof page_size !== "number" || !Number.isInteger(page_size) || page_size < 1)
    throw new Error("Respons ledger tidak sesuai kontrak.");
  return { events: record.events.map(item => parseEvent(item, (item as { event_id?: string }).event_id ?? "")),
           total, page, page_size };
}
/** Authorised site ledger listing; the server re-checks site scope on every request. */
export async function listBackendEvents(filters: LedgerFilters, signal: AbortSignal): Promise<LedgerPage> {
  const site = authSnapshot().site;
  if (!isUUID(site)) throw new AuthFailure(403, 'Site aktif tidak valid.');
  const params = new URLSearchParams({ site_id: site });
  if (filters.event_type) params.set('event_type', filters.event_type);
  if (filters.stage_code) params.set('stage_code', filters.stage_code);
  for (const key of ['operation_date_from', 'operation_date_to'] as const) {
    const value = filters[key];
    if (value) {
      if (!isISODate(value)) throw new Error(`${key} harus berformat YYYY-MM-DD.`);
      params.set(key, value);
    }
  }
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  return parseLedger(await get(`/demo/v0.1/events?${params.toString()}`, signal));
}

export interface DataQualitySummary {
  event_count: number; measurement_count: number;
  observation_counts: Record<string, number>;
  validation_counts: Record<string, number>;
  missing_count: number; needs_attention_count: number;
  unmeasured_event_count: number; estimated_count: number;
}
export interface DataQualityRecord {
  event_id: string; event_type: string; occurred_at: string | null;
  measurement_ids: string[]; observation_statuses: string[];
}
export interface DataQualityLive {
  summary: DataQualitySummary; records: DataQualityRecord[];
}
function asInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error("Ringkasan mutu data tidak sesuai kontrak.");
  return value;
}
export type DataQualityFilters = Pick<LedgerFilters, 'stage_code' | 'operation_date_from' | 'operation_date_to'>;
export function validateDataQualityFilters(filters: DataQualityFilters): void {
  for (const key of ['operation_date_from', 'operation_date_to'] as const) {
    if (filters[key] && !isISODate(filters[key])) throw new Error('Tanggal kegiatan dapur harus berformat YYYY-MM-DD dan valid.');
  }
  if (filters.operation_date_from && filters.operation_date_to && filters.operation_date_from > filters.operation_date_to)
    throw new Error('Tanggal mulai tidak boleh setelah tanggal sampai.');
}
/** Count-only live summary; kitchen operation dates use the ledger date semantics. */
export async function readBackendDataQuality(signal: AbortSignal, filters: DataQualityFilters = {}): Promise<DataQualityLive> {
  const site = authSnapshot().site;
  if (!isUUID(site)) throw new AuthFailure(403, 'Site aktif tidak valid.');
  validateDataQualityFilters(filters);
  const params = new URLSearchParams({ site_id: site });
  for (const key of ['stage_code', 'operation_date_from', 'operation_date_to'] as const)
    if (filters[key]) params.set(key, filters[key]);
  const value = await get(`/demo/v0.1/data-quality?${params.toString()}`, signal) as Record<string, unknown>;
  if (typeof value !== "object" || value === null || typeof value.summary !== "object" || value.summary === null || !Array.isArray(value.records))
    throw new Error("Ringkasan mutu data tidak sesuai kontrak.");
  const summary = value.summary as Record<string, unknown>;
  const counts = summary.observation_counts, validation = summary.validation_counts;
  if (typeof counts !== "object" || counts === null || typeof validation !== "object" || validation === null)
    throw new Error("Ringkasan mutu data tidak sesuai kontrak.");
  const records = value.records.map(item => {
    if (typeof item !== "object" || item === null) throw new Error("Drill-down mutu data tidak sesuai kontrak.");
    const record = item as Record<string, unknown>;
    for (const id of [record.event_id, ...record.measurement_ids as unknown[]]) if (typeof id !== "string" || !isUUID(id)) throw new Error("Identitas drill-down tidak valid.");
    return { event_id: record.event_id as string, event_type: String(record.event_type),
             occurred_at: record.occurred_at === null ? null : String(record.occurred_at),
             measurement_ids: record.measurement_ids as string[],
             observation_statuses: (record.observation_statuses as unknown[]).map(String) };
  });
  return { summary: { event_count: asInt(summary.event_count), measurement_count: asInt(summary.measurement_count),
      observation_counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, asInt(v)])),
      validation_counts: Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, asInt(v)])),
      missing_count: asInt(summary.missing_count), needs_attention_count: asInt(summary.needs_attention_count),
      unmeasured_event_count: asInt(summary.unmeasured_event_count), estimated_count: asInt(summary.estimated_count) },
    records };
}

export interface MasterNamespace { namespace: string; label: string; code_count: number; }
export interface MasterReference {
  reference_id: string; namespace: string; code: string; version: number;
  status: string; label: string; definition: string | null;
  supersedes_version: number | null; changed_by: string; changed_at: string;
  note: string | null; recorded_at: string;
}
/** Read-only master catalog: provisional namespaces + latest visible versions. */
export async function readBackendMaster(signal: AbortSignal, filters: { namespace?: string; includeInactive?: boolean } = {}): Promise<{ namespaces: MasterNamespace[]; references: MasterReference[] }> {
  const namespacesValue = await get('/demo/v0.1/master/namespaces', signal);
  const params = new URLSearchParams();
  if (filters.namespace) params.set('namespace', filters.namespace);
  if (filters.includeInactive) params.set('include_inactive', 'true');
  const referencesValue = await get('/demo/v0.1/master/references' + (params.size ? '?' + params.toString() : ''), signal);
  if (!Array.isArray(namespacesValue) || !Array.isArray(referencesValue))
    throw new Error("Katalog master tidak sesuai kontrak.");
  const namespaces = namespacesValue.map(item => {
    const row = item as Record<string, unknown>;
    if (typeof row.namespace !== "string" || typeof row.label !== "string" || typeof row.code_count !== "number")
      throw new Error("Katalog master tidak sesuai kontrak.");
    return row as unknown as MasterNamespace;
  });
  const references = referencesValue.map(item => {
    const row = item as Record<string, unknown>;
    if (typeof row.reference_id !== "string" || !isUUID(row.reference_id) || typeof row.namespace !== "string" ||
        typeof row.code !== "string" || typeof row.version !== "number" || row.version < 1 ||
        (row.status !== "active" && row.status !== "inactive") || typeof row.label !== "string" ||
        typeof row.changed_by !== "string" || typeof row.changed_at !== "string" || typeof row.recorded_at !== "string")
      throw new Error("Referensi master tidak sesuai kontrak.");
    return row as unknown as MasterReference;
  });
  return { namespaces, references };
}

export async function readBackendMasterHistory(namespace: string, code: string, signal: AbortSignal): Promise<MasterReference[]> {
  const params = new URLSearchParams({namespace,code});
  const value = await get('/demo/v0.1/master/references/history?' + params.toString(),signal) as {namespace?:string;code?:string;versions?:MasterReference[]};
  if (!value || value.namespace !== namespace || value.code !== code || !Array.isArray(value.versions) ||
      value.versions.some((r,i,rows) => !r || r.namespace !== namespace || r.code !== code || !isUUID(r.reference_id) ||
        !Number.isInteger(r.version) || r.version < 1 || (i > 0 && rows[i-1].version >= r.version) ||
        !['active','inactive'].includes(r.status) || typeof r.label !== 'string' || typeof r.changed_by !== 'string'))
    throw new Error('Riwayat master tidak sesuai target/kontrak.');
  return value.versions;
}
