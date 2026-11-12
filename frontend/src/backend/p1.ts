/** Provisional P1/P2 candidate client. Strict reads; one-intent POSTs that never retry. */
import { isUUID } from './contract';
import { assertCurrent, authSnapshot, permits, protectedJson } from './auth';

export type WriteResult<T> =
  | { kind: 'saved'; value: T }
  | { kind: 'rejected'; message: string }
  | { kind: 'unknown'; message: string };

export type Receipt = { receipt_id: string; organization_id: string; site_id: string;
  source_ref: string; received_at: string; note: string | null; recorded_at: string };
export type Lot = { lot_id: string; receipt_id: string; organization_id: string; site_id: string;
  lot_ref: string; item_code: string; item_version: string | null; quantity: string;
  original_unit: string; mass_basis: string; recorded_at: string };
export type Movement = { movement_id: string; lot_id: string; movement_type: string;
  direction: 'in' | 'out'; quantity: string; target_ref: string | null; occurred_at: string; recorded_at: string };
export type LotDetail = Lot & { observed_stock: string; stock_note: string; movements: Movement[] };
export type KpiEntry = { kpi_code: string; formula_version: string; description: string;
  design_status: 'design_pass' | 'conditional' | 'held'; data_readiness_gate: string;
  source_doc_revision: string; effective_at: string; change_reason: string | null; recorded_at: string };
export type KpiPreview = { kpi_code: string; formula_version: string; design_status: string;
  status: string; reason: string; note: string };
export type Disposition = { disposition_id: string; event_id: string; organization_id: string;
  site_id: string; outcome_type: string; quantity: string; original_unit: string; mass_basis: string;
  occurred_at: string; food_safety_status: string; handover_ref: string | null; recorded_at: string;
  allocation_status: string; allocation_note: string };
export type DeliveryResidual = { delivery_id: string; dispatch_quantity: string;
  received_quantity: string | null; difference: string | null; reconciliation_status: string };
export type BasisAggregation = { status: string; reason: string; eligible_mass: string | null;
  eligible_event_count: number; raw_observed_mass: string | null; raw_observation_count: number; unresolved_event_count: number };
export type BasisStat = { mass_basis: string; event_count: number; measurement_count: number;
  observed_measurement_count: number; measured_zero_count: number; estimated_measurement_count: number;
  missing_count: number; not_measured_count: number; aggregation: BasisAggregation };
export type TrendsView = { site_id: string; date_from: string; date_to: string;
  calculation_version: string; note: string; event_counts: Record<string, number>;
  mass_reporting: { status: string; reason: string; reportable_mass: null };
  per_basis: BasisStat[]; completeness: Record<string, number>;
  delivery_residuals: DeliveryResidual[]; mixed_basis_ratio: { status: string; reason: string } };
export type LinkOutput = { link_id: string; organization_id: string; site_id: string;
  source_type: string; source_id: string; target_type: string; target_id: string;
  relation_code: string; quantity: string | null; original_unit: string | null;
  mass_basis: string | null; occurred_at: string; note: string | null; recorded_at: string };
export type RecipeLine = { line_id: string; recipe_id: string; line_no: number; item_code: string;
  quantity: string; original_unit: string; mass_basis: string };
export type Recipe = { recipe_id: string; organization_id: string; site_id: string; menu_id: string | null;
  recipe_code: string; version_no: number; recorded_at: string; lines: RecipeLine[] };
export type BatchIO = { io_id: string; batch_id: string; source_lot_id: string | null;
  io_kind: 'input' | 'output_primary' | 'output_rework'; quantity: string; original_unit: string;
  mass_basis: string; occurred_at: string; recorded_at: string };
export type YieldView = { status: string; basis: string | null; value: string | null;
  input_total: string | null; primary_output_total: string | null; rework_total: string | null;
  reason: string | null };
export type BatchDetail = { batch_id: string; organization_id: string; site_id: string; recipe_id: string;
  recipe_code: string; recipe_version_no: number; operation_date: string; planned_output: string | null;
  original_unit: string; mass_basis: string; recorded_at: string; io: BatchIO[]; yield_view: YieldView };
export type Delivery = { delivery_id: string; organization_id: string; site_id: string; run_id: string | null;
  from_site_id: string; to_site_id: string; dispatch_quantity: string; received_quantity: string | null;
  original_unit: string; mass_basis: string; dispatched_at: string; received_at: string | null;
  recorded_at: string; reconciliation_status: string };
export type Service = { service_id: string; organization_id: string; site_id: string;
  delivery_id: string | null; served_count: number | null; served_mass: string | null;
  original_unit: string | null; mass_basis: string | null; leftover_event_id: string | null;
  sampling_frame: string | null; sample_size: number | null; sampling_method: string | null;
  coverage: string | null; recorded_at: string; sampling_coverage_status: string; estimate_note: string };
export type LineageView = { object_type: string; object_id: string; links: LinkOutput[];
  distinct_source_event_count: number; note: string };
export type CostReference = { cost_reference_id: string; organization_id: string; site_id: string;
  scope_type: string; scope_ref: string; currency: string; amount: string | null; unit_basis: string;
  price_source: string; price_date: string | null; method_version: string; recorded_at: string;
  price_availability: string; note: string };
export type ValuationBlocked = { status: string; reason: string; method_version: string;
  price_availability: string; note: string };
export type Recommendation = { recommendation_id: string; organization_id: string; site_id: string;
  rule_code: string; rule_version: string; target_type: string; target_ref: string; detected_issue: string;
  coverage: string; recommended_action: string; state: string; ack_reason: string | null;
  ack_actor: string | null; ack_at: string | null; recorded_at: string };
export type Insufficient = { rule_code: string; target_type: string; target_ref: string; reason: string;
  state: string };
export type EvaluateView = { site_id: string; rule_version: string; alerts: Recommendation[];
  insufficient: Insufficient[]; note: string };
export type AlertRule = { rule_code: string; description: string; disabled: boolean };

const DECIMAL_TEXT = /^\+?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const STATUS_DETAIL: Record<number, string> = {
  400: 'Permintaan tidak valid.', 403: 'Akses ditolak untuk site/izin aktif.',
  404: 'Objek tidak ditemukan (tanpa kebocoran informasi).',
  409: 'Konflik data; kemungkinan duplikat atau replay intent.',
  422: 'Server menolak isi permintaan.', 503: 'Layanan backend tidak tersedia.',
};

function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error('Respons backend tidak sesuai kontrak P1 kandidat.');
}
function recordOf(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function uuidField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  requireValue(typeof value === 'string' && isUUID(value));
  return value;
}
function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  requireValue(typeof value === 'string' && value.length > 0);
  return value;
}
function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  requireValue(value === null || typeof value === 'string');
  return value as string | null;
}
function decimalField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  requireValue(typeof value === 'string' && DECIMAL_TEXT.test(value));
  return value;
}
function optionalDecimal(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  requireValue(value === null || (typeof value === 'string' && DECIMAL_TEXT.test(value)));
  return value as string | null;
}
function optionalId(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  requireValue(value === null || (typeof value === 'string' && isUUID(value)));
  return value as string | null;
}
function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return value;
}

function parseReceipt(value: unknown): Receipt {
  const record = recordOf(value);
  return {
    receipt_id: uuidField(record, 'receipt_id'), organization_id: uuidField(record, 'organization_id'),
    site_id: uuidField(record, 'site_id'), source_ref: stringField(record, 'source_ref'),
    received_at: stringField(record, 'received_at'), note: optionalString(record, 'note'),
    recorded_at: stringField(record, 'recorded_at'),
  };
}

function parseMovement(value: unknown): Movement {
  const record = recordOf(value);
  const direction = record.direction;
  requireValue(direction === 'in' || direction === 'out');
  return {
    movement_id: uuidField(record, 'movement_id'), lot_id: uuidField(record, 'lot_id'),
    movement_type: stringField(record, 'movement_type'),
    direction: direction as 'in' | 'out',
    quantity: decimalField(record, 'quantity'),
    target_ref: optionalString(record, 'target_ref'), occurred_at: stringField(record, 'occurred_at'),
    recorded_at: stringField(record, 'recorded_at'),
  };
}

function parseLotDetail(value: unknown): LotDetail {
  const record = recordOf(value);
  const movements = record.movements;
  requireValue(Array.isArray(movements));
  return {
    lot_id: uuidField(record, 'lot_id'), receipt_id: uuidField(record, 'receipt_id'),
    organization_id: uuidField(record, 'organization_id'), site_id: uuidField(record, 'site_id'),
    lot_ref: stringField(record, 'lot_ref'), item_code: stringField(record, 'item_code'),
    item_version: optionalString(record, 'item_version'), quantity: decimalField(record, 'quantity'),
    original_unit: stringField(record, 'original_unit'), mass_basis: stringField(record, 'mass_basis'),
    recorded_at: stringField(record, 'recorded_at'), observed_stock: decimalField(record, 'observed_stock'),
    stock_note: stringField(record, 'stock_note'),
    movements: movements.map(parseMovement),
  };
}

export function parseReceipts(value: unknown): Receipt[] {
  requireValue(Array.isArray(value));
  const ids = new Set<string>();
  return value.map(item => {
    const receipt = parseReceipt(item);
    requireValue(!ids.has(receipt.receipt_id));
    ids.add(receipt.receipt_id);
    return receipt;
  });
}

function parseDisposition(value: unknown): Disposition {
  const record = recordOf(value);
  return {
    disposition_id: uuidField(record, 'disposition_id'), event_id: uuidField(record, 'event_id'),
    organization_id: uuidField(record, 'organization_id'), site_id: uuidField(record, 'site_id'),
    outcome_type: stringField(record, 'outcome_type'), quantity: decimalField(record, 'quantity'),
    original_unit: stringField(record, 'original_unit'), mass_basis: stringField(record, 'mass_basis'),
    occurred_at: stringField(record, 'occurred_at'),
    food_safety_status: stringField(record, 'food_safety_status'),
    handover_ref: optionalString(record, 'handover_ref'), recorded_at: stringField(record, 'recorded_at'),
    allocation_status: stringField(record, 'allocation_status'),
    allocation_note: stringField(record, 'allocation_note'),
  };
}

export function parseKpiEntries(value: unknown): KpiEntry[] {
  requireValue(Array.isArray(value));
  return value.map(item => {
    const record = recordOf(item);
    const status = record.design_status;
    requireValue(status === 'design_pass' || status === 'conditional' || status === 'held');
    return {
      kpi_code: stringField(record, 'kpi_code'), formula_version: stringField(record, 'formula_version'),
      description: stringField(record, 'description'), design_status: status,
      data_readiness_gate: stringField(record, 'data_readiness_gate'),
      source_doc_revision: stringField(record, 'source_doc_revision'),
      effective_at: stringField(record, 'effective_at'), change_reason: optionalString(record, 'change_reason'),
      recorded_at: stringField(record, 'recorded_at'),
    };
  });
}

/** A value-free preview: any numeric result key makes the response invalid. */
export function parseKpiPreview(value: unknown): KpiPreview {
  const record = recordOf(value);
  requireValue(!('value' in record) && !('result' in record) && !('numeric_result' in record));
  return {
    kpi_code: stringField(record, 'kpi_code'), formula_version: stringField(record, 'formula_version'),
    design_status: stringField(record, 'design_status'), status: stringField(record, 'status'),
    reason: stringField(record, 'reason'), note: stringField(record, 'note'),
  };
}

export function parseTrends(value: unknown): TrendsView {
  const record = recordOf(value);
  const massReporting = recordOf(record.mass_reporting);
  requireValue(massReporting.reportable_mass === null);
  const perBasis = record.per_basis;
  const residuals = record.delivery_residuals;
  const mixed = recordOf(record.mixed_basis_ratio);
  requireValue(Array.isArray(perBasis) && Array.isArray(residuals));
  requireValue(typeof mixed.status === 'string' && typeof mixed.reason === 'string');
  return {
    site_id: uuidField(record, 'site_id'), date_from: stringField(record, 'date_from'),
    date_to: stringField(record, 'date_to'), calculation_version: stringField(record, 'calculation_version'),
    note: stringField(record, 'note'), event_counts: record.event_counts as Record<string, number>,
    mass_reporting: { status: stringField(massReporting, 'status'), reason: stringField(massReporting, 'reason'), reportable_mass: null },
    per_basis: perBasis.map(item => {
        const stat = recordOf(item);
        const agg = recordOf(stat.aggregation);
        requireValue(typeof agg.status === 'string' && typeof agg.reason === 'string');
        requireValue(typeof agg.eligible_event_count === 'number' &&
          typeof agg.unresolved_event_count === 'number');
        return {
          mass_basis: stringField(stat, 'mass_basis'),
          event_count: numberField(stat, 'event_count'),
          measurement_count: numberField(stat, 'measurement_count'),
          observed_measurement_count: numberField(stat, 'observed_measurement_count'),
          measured_zero_count: numberField(stat, 'measured_zero_count'),
          estimated_measurement_count: numberField(stat, 'estimated_measurement_count'),
          missing_count: numberField(stat, 'missing_count'),
          not_measured_count: numberField(stat, 'not_measured_count'),
          aggregation: { status: agg.status as string, reason: agg.reason as string,
            eligible_mass: optionalDecimal(agg, 'eligible_mass'),
            eligible_event_count: agg.eligible_event_count as number,
            raw_observed_mass: optionalDecimal(agg, 'raw_observed_mass'),
            raw_observation_count: numberField(agg, 'raw_observation_count'),
            unresolved_event_count: agg.unresolved_event_count as number },
        };
      }),
    completeness: record.completeness as Record<string, number>,
    delivery_residuals: residuals.map(item => {
      const residual = recordOf(item);
      return {
        delivery_id: uuidField(residual, 'delivery_id'),
        dispatch_quantity: decimalField(residual, 'dispatch_quantity'),
        received_quantity: optionalDecimal(residual, 'received_quantity'),
        difference: optionalDecimal(residual, 'difference'),
        reconciliation_status: stringField(residual, 'reconciliation_status'),
      };
    }),
    mixed_basis_ratio: { status: mixed.status as string, reason: mixed.reason as string },
  };
}

async function readJson<T>(path: string, parse: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
  const auth = authSnapshot();
  assertCurrent(auth);
  const { response, value } = await protectedJson(path, {}, signal);
  assertCurrent(auth);
  if (!response.ok) {
    throw new Error(STATUS_DETAIL[response.status] ?? `HTTP ${response.status}; data tidak dibaca.`);
  }
  return parse(value);
}

export function readReceipts(siteId: string, signal?: AbortSignal): Promise<Receipt[]> {
  return readJson(`/p1/v0.1/receipts?site_id=${encodeURIComponent(siteId)}`, parseReceipts, signal);
}
export function readLot(lotId: string, signal?: AbortSignal): Promise<LotDetail> {
  return readJson(`/p1/v0.1/lots/${encodeURIComponent(lotId)}`, parseLotDetail, signal);
}
export function readDispositions(eventId: string, signal?: AbortSignal): Promise<Disposition[]> {
  return readJson(`/p1/v0.1/events/${encodeURIComponent(eventId)}/dispositions`, value => {
    requireValue(Array.isArray(value));
    return value.map(parseDisposition);
  }, signal);
}
export function readKpiCatalogue(signal?: AbortSignal): Promise<KpiEntry[]> {
  return readJson('/p2/v0.1/kpi', parseKpiEntries, signal);
}
export function readKpiPreview(code: string, basis: { numerator_basis?: string; denominator_basis?: string } = {},
                               signal?: AbortSignal): Promise<KpiPreview> {
  const query = new URLSearchParams();
  if (basis.numerator_basis) query.set('numerator_basis', basis.numerator_basis);
  if (basis.denominator_basis) query.set('denominator_basis', basis.denominator_basis);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return readJson(`/p2/v0.1/kpi/${encodeURIComponent(code)}/preview${suffix}`, parseKpiPreview, signal);
}
export function readTrends(siteId: string, dateFrom: string, dateTo: string,
                           signal?: AbortSignal): Promise<TrendsView> {
  const query = `site_id=${encodeURIComponent(siteId)}&date_from=${encodeURIComponent(dateFrom)}` +
    `&date_to=${encodeURIComponent(dateTo)}`;
  return readJson(`/p1/v0.1/trends?${query}`, parseTrends, signal);
}

/** One single-use 'p1' intent plus one domain POST; never retried automatically. */
async function p1PostOnce<T>(path: string, permission: string, body: Record<string, unknown>,
                             parse: (value: unknown) => T, eventId: string | null = null,
                             expectedStatus = 201): Promise<WriteResult<T>> {
  const auth = authSnapshot();
  if (!permits(permission) || body.site_id !== auth.site)
    return { kind: 'rejected', message: 'Tidak ada izin untuk operasi/site aktif.' };
  try {
    const registration = await protectedJson('/auth/intents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'p1', site_id: auth.site, event_id: eventId }),
    });
    assertCurrent(auth);
    if (registration.response.status !== 201)
      return { kind: 'unknown', message: 'Registrasi intent belum terkonfirmasi; domain POST tidak dikirim.' };
    const intent = registration.value as { intent_id: string; state: string };
    if (!intent || !isUUID(intent.intent_id) || intent.state !== 'registered')
      return { kind: 'unknown', message: 'Respons intent tidak valid; tidak ada domain POST dikirim.' };
    const { response, value: raw } = await protectedJson(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FWI-Intent': intent.intent_id },
      body: JSON.stringify(body),
    });
    assertCurrent(auth);
    if ([400, 404, 409, 422].includes(response.status)) {
      const detail = recordOf(raw).detail;
      return { kind: 'rejected', message: `Server menolak operasi (HTTP ${response.status}): ` +
        (typeof detail === 'string' && detail ? detail : STATUS_DETAIL[response.status] ?? 'periksa input.') };
    }
    if (response.status !== expectedStatus)
      return { kind: 'unknown', message: `HTTP ${response.status}; hasil commit tidak dapat dipastikan. Jangan kirim ulang.` };
    try { return { kind: 'saved', value: parse(raw) }; }
    catch { return { kind: 'unknown', message: 'Respons sukses tidak valid; hasil commit belum dapat dipastikan.' }; }
  } catch {
    return { kind: 'unknown', message: 'Respons POST tidak diterima (jaringan/timeout); mungkin sudah commit. Jangan kirim ulang.' };
  }
}

export type ReceiptInput = { source_ref: string; received_at: string; note: string };
export type LotInput = { lot_ref: string; item_code: string; item_version: string; quantity: string; mass_basis: string };
export type MovementInput = { movement_type: string; direction: 'in' | 'out'; quantity: string; target_ref: string; occurred_at: string };
export type DispositionInput = { outcome_type: string; quantity: string; mass_basis: string;
  occurred_at: string; food_safety_status: string; handover_ref: string };

const SYNTHETIC_ORG_ID = '11111111-1111-4111-8111-111111111111';

export async function createBackendReceipt(input: ReceiptInput): Promise<WriteResult<Receipt>> {
  const body = { organization_id: SYNTHETIC_ORG_ID, site_id: authSnapshot().site,
    source_ref: input.source_ref, received_at: input.received_at, note: input.note || null };
  return p1PostOnce('/p1/v0.1/receipts', 'receipt.create', body, parseReceipt);
}

function parseReceiptLot(value: unknown): Lot {
  const record = recordOf(value);
  return {
    lot_id: uuidField(record, 'lot_id'), receipt_id: uuidField(record, 'receipt_id'),
    organization_id: uuidField(record, 'organization_id'), site_id: uuidField(record, 'site_id'),
    lot_ref: stringField(record, 'lot_ref'), item_code: stringField(record, 'item_code'),
    item_version: optionalString(record, 'item_version'), quantity: decimalField(record, 'quantity'),
    original_unit: stringField(record, 'original_unit'), mass_basis: stringField(record, 'mass_basis'),
    recorded_at: stringField(record, 'recorded_at'),
  };
}

export async function createBackendLot(receiptId: string, input: LotInput): Promise<WriteResult<Lot>> {
  const body = { ...input, item_version: input.item_version || null, original_unit: 'kg' };
  return p1PostOnce(`/p1/v0.1/receipts/${encodeURIComponent(receiptId)}/lots`, 'receipt.create', body,
    parseReceiptLot, null);
}

export async function createBackendMovement(lotId: string, input: MovementInput): Promise<WriteResult<Movement>> {
  const body = { ...input, target_ref: input.target_ref || null };
  return p1PostOnce(`/p1/v0.1/lots/${encodeURIComponent(lotId)}/movements`, 'movement.create', body,
    parseMovement, null);
}

export async function createBackendDisposition(eventId: string,
                                               input: DispositionInput): Promise<WriteResult<Disposition>> {
  const body = { organization_id: SYNTHETIC_ORG_ID, site_id: authSnapshot().site, event_id: eventId,
    outcome_type: input.outcome_type, quantity: input.quantity, original_unit: 'kg',
    mass_basis: input.mass_basis, occurred_at: input.occurred_at,
    food_safety_status: input.food_safety_status, handover_ref: input.handover_ref || null };
  return p1PostOnce('/p1/v0.1/dispositions', 'disposition.create', body, parseDisposition, eventId);
}

// ---------------------------------------------------------------- FR-102/103/104/203/204

function parseRecipe(value: unknown): Recipe {
  const record = recordOf(value);
  const lines = record.lines;
  requireValue(Array.isArray(lines));
  return {
    recipe_id: uuidField(record, 'recipe_id'), organization_id: uuidField(record, 'organization_id'),
    site_id: uuidField(record, 'site_id'), menu_id: optionalId(record, 'menu_id'),
    recipe_code: stringField(record, 'recipe_code'), version_no: numberField(record, 'version_no'),
    recorded_at: stringField(record, 'recorded_at'),
    lines: lines.map(item => {
      const line = recordOf(item);
      return { line_id: uuidField(line, 'line_id'), recipe_id: uuidField(line, 'recipe_id'),
        line_no: numberField(line, 'line_no'), item_code: stringField(line, 'item_code'),
        quantity: decimalField(line, 'quantity'), original_unit: stringField(line, 'original_unit'),
        mass_basis: stringField(line, 'mass_basis') };
    }),
  };
}

function parseBatchDetail(value: unknown): BatchDetail {
  const record = recordOf(value);
  const io = record.io;
  const yieldRecord = recordOf(record.yield_view);
  requireValue(Array.isArray(io));
  requireValue(yieldRecord.status === 'computed' || yieldRecord.status === 'blocked');
  requireValue(yieldRecord.value === null
    || (typeof yieldRecord.value === 'string' && DECIMAL_TEXT.test(yieldRecord.value)));
  return {
    batch_id: uuidField(record, 'batch_id'), organization_id: uuidField(record, 'organization_id'),
    site_id: uuidField(record, 'site_id'), recipe_id: uuidField(record, 'recipe_id'),
    recipe_code: stringField(record, 'recipe_code'), recipe_version_no: numberField(record, 'recipe_version_no'),
    operation_date: stringField(record, 'operation_date'), planned_output: optionalDecimal(record, 'planned_output'),
    original_unit: stringField(record, 'original_unit'), mass_basis: stringField(record, 'mass_basis'),
    recorded_at: stringField(record, 'recorded_at'),
    io: io.map(item => {
      const entry = recordOf(item);
      const kind = entry.io_kind;
      requireValue(kind === 'input' || kind === 'output_primary' || kind === 'output_rework');
      return { io_id: uuidField(entry, 'io_id'), batch_id: uuidField(entry, 'batch_id'),
        source_lot_id: optionalId(entry, 'source_lot_id'), io_kind: kind, quantity: decimalField(entry, 'quantity'),
        original_unit: stringField(entry, 'original_unit'), mass_basis: stringField(entry, 'mass_basis'),
        occurred_at: stringField(entry, 'occurred_at'), recorded_at: stringField(entry, 'recorded_at') };
    }),
    yield_view: { status: stringField(yieldRecord, 'status'), basis: optionalString(yieldRecord, 'basis'),
      value: optionalDecimal(yieldRecord, 'value'), input_total: optionalDecimal(yieldRecord, 'input_total'),
      primary_output_total: optionalDecimal(yieldRecord, 'primary_output_total'),
      rework_total: optionalDecimal(yieldRecord, 'rework_total'), reason: optionalString(yieldRecord, 'reason') },
  };
}

function parseDelivery(value: unknown): Delivery {
  const record = recordOf(value);
  const status = record.reconciliation_status;
  requireValue(status === 'not_received' || status === 'match' || status === 'needs_review');
  return {
    delivery_id: uuidField(record, 'delivery_id'), organization_id: uuidField(record, 'organization_id'),
    site_id: uuidField(record, 'site_id'), run_id: optionalId(record, 'run_id'),
    from_site_id: uuidField(record, 'from_site_id'), to_site_id: uuidField(record, 'to_site_id'),
    dispatch_quantity: decimalField(record, 'dispatch_quantity'),
    received_quantity: optionalDecimal(record, 'received_quantity'),
    original_unit: stringField(record, 'original_unit'), mass_basis: stringField(record, 'mass_basis'),
    dispatched_at: stringField(record, 'dispatched_at'), received_at: optionalString(record, 'received_at'),
    recorded_at: stringField(record, 'recorded_at'), reconciliation_status: status,
  };
}

function parseService(value: unknown): Service {
  const record = recordOf(value);
  const coverageStatus = record.sampling_coverage_status;
  requireValue(coverageStatus === 'framed' || coverageStatus === 'unframed_sample'
    || coverageStatus === 'not_sampled');
  const count = record.served_count;
  requireValue(count === null || (typeof count === 'number' && Number.isInteger(count) && count >= 0));
  return {
    service_id: uuidField(record, 'service_id'), organization_id: uuidField(record, 'organization_id'),
    site_id: uuidField(record, 'site_id'), delivery_id: optionalId(record, 'delivery_id'),
    served_count: count as number | null, served_mass: optionalDecimal(record, 'served_mass'),
    original_unit: optionalString(record, 'original_unit'), mass_basis: optionalString(record, 'mass_basis'),
    leftover_event_id: optionalId(record, 'leftover_event_id'),
    sampling_frame: optionalString(record, 'sampling_frame'),
    sample_size: record.sample_size === null ? null : numberField(record, 'sample_size'),
    sampling_method: optionalString(record, 'sampling_method'), coverage: optionalDecimal(record, 'coverage'),
    recorded_at: stringField(record, 'recorded_at'), sampling_coverage_status: coverageStatus,
    estimate_note: stringField(record, 'estimate_note'),
  };
}

function parseLineage(value: unknown): LineageView {
  const record = recordOf(value);
  const links = record.links;
  requireValue(Array.isArray(links));
  return {
    object_type: stringField(record, 'object_type'), object_id: uuidField(record, 'object_id'),
    links: links.map(item => {
      const link = recordOf(item);
      return { link_id: uuidField(link, 'link_id'), organization_id: uuidField(link, 'organization_id'),
        site_id: uuidField(link, 'site_id'), source_type: stringField(link, 'source_type'),
        source_id: uuidField(link, 'source_id'), target_type: stringField(link, 'target_type'),
        target_id: uuidField(link, 'target_id'), relation_code: stringField(link, 'relation_code'),
        quantity: optionalDecimal(link, 'quantity'), original_unit: optionalString(link, 'original_unit'),
        mass_basis: optionalString(link, 'mass_basis'), occurred_at: stringField(link, 'occurred_at'),
        note: optionalString(link, 'note'), recorded_at: stringField(link, 'recorded_at') };
    }),
    distinct_source_event_count: numberField(record, 'distinct_source_event_count'),
    note: stringField(record, 'note'),
  };
}

function parseCostReference(value: unknown): CostReference {
  const record = recordOf(value);
  const availability = record.price_availability;
  requireValue(availability === 'available' || availability === 'not_available');
  return {
    cost_reference_id: uuidField(record, 'cost_reference_id'),
    organization_id: uuidField(record, 'organization_id'), site_id: uuidField(record, 'site_id'),
    scope_type: stringField(record, 'scope_type'), scope_ref: uuidField(record, 'scope_ref'),
    currency: stringField(record, 'currency'), amount: optionalDecimal(record, 'amount'),
    unit_basis: stringField(record, 'unit_basis'), price_source: stringField(record, 'price_source'),
    price_date: optionalString(record, 'price_date'), method_version: stringField(record, 'method_version'),
    recorded_at: stringField(record, 'recorded_at'), price_availability: availability,
    note: stringField(record, 'note'),
  };
}

function parseRecommendation(value: unknown): Recommendation {
  const record = recordOf(value);
  const state = record.state;
  requireValue(state === 'open' || state === 'acknowledged' || state === 'dismissed');
  return {
    recommendation_id: uuidField(record, 'recommendation_id'),
    organization_id: uuidField(record, 'organization_id'), site_id: uuidField(record, 'site_id'),
    rule_code: stringField(record, 'rule_code'), rule_version: stringField(record, 'rule_version'),
    target_type: stringField(record, 'target_type'), target_ref: uuidField(record, 'target_ref'),
    detected_issue: stringField(record, 'detected_issue'), coverage: stringField(record, 'coverage'),
    recommended_action: stringField(record, 'recommended_action'), state: state,
    ack_reason: optionalString(record, 'ack_reason'), ack_actor: optionalId(record, 'ack_actor'),
    ack_at: optionalString(record, 'ack_at'), recorded_at: stringField(record, 'recorded_at'),
  };
}

function parseEvaluate(value: unknown): EvaluateView {
  const record = recordOf(value);
  const alerts = record.alerts;
  const insufficient = record.insufficient;
  requireValue(Array.isArray(alerts) && Array.isArray(insufficient));
  return {
    site_id: uuidField(record, 'site_id'), rule_version: stringField(record, 'rule_version'),
    alerts: alerts.map(parseRecommendation),
    insufficient: insufficient.map(item => {
      const entry = recordOf(item);
      requireValue(entry.state === 'insufficient_data');
      return { rule_code: stringField(entry, 'rule_code'), target_type: stringField(entry, 'target_type'),
        target_ref: uuidField(entry, 'target_ref'), reason: stringField(entry, 'reason'),
        state: 'insufficient_data' as const };
    }),
    note: stringField(record, 'note'),
  };
}

export function parseAlertRules(value: unknown): AlertRule[] {
  requireValue(Array.isArray(value));
  return value.map(item => {
    const record = recordOf(item);
    requireValue(typeof record.disabled === 'boolean');
    return { rule_code: stringField(record, 'rule_code'), description: stringField(record, 'description'),
      disabled: record.disabled as boolean };
  });
}

export async function createBackendMenu(input: { menu_code: string; name: string,
}): Promise<WriteResult<{ menu_id: string; menu_code: string }>> {
  const body = { organization_id: SYNTHETIC_ORG_ID, site_id: authSnapshot().site, ...input };
  return p1PostOnce('/p1/v0.1/menus', 'menu.create', body, value => {
    const record = recordOf(value);
    return { menu_id: uuidField(record, 'menu_id'), menu_code: stringField(record, 'menu_code') };
  });
}

export async function createBackendRecipe(input: {
  recipe_code: string; version_no: string; menu_id: string;
  lines: { item_code: string; quantity: string; mass_basis: string }[],
}): Promise<WriteResult<Recipe>> {
  const body = { organization_id: SYNTHETIC_ORG_ID, site_id: authSnapshot().site,
    recipe_code: input.recipe_code, version_no: Number(input.version_no),
    menu_id: input.menu_id || null,
    lines: input.lines.map(line => ({ ...line, original_unit: 'kg' })) };
  return p1PostOnce('/p1/v0.1/recipes', 'recipe.create', body, parseRecipe);
}

export async function createBackendBatch(input: {
  recipe_id: string; operation_date: string; planned_output: string; mass_basis: string,
}): Promise<WriteResult<{ batch_id: string; recipe_id: string }>> {
  const body = { organization_id: SYNTHETIC_ORG_ID, site_id: authSnapshot().site, ...input,
    planned_output: input.planned_output || null, original_unit: 'kg' };
  return p1PostOnce('/p1/v0.1/batches', 'batch.create', body, value => {
    const record = recordOf(value);
    return { batch_id: uuidField(record, 'batch_id'), recipe_id: uuidField(record, 'recipe_id') };
  });
}

export async function createBackendBatchIO(batchId: string, input: {
  io_kind: string; quantity: string; mass_basis: string; source_lot_id: string; occurred_at: string,
}): Promise<WriteResult<{ io_id: string; batch_id: string }>> {
  const body = { ...input, source_lot_id: input.source_lot_id || null, original_unit: 'kg' };
  return p1PostOnce(`/p1/v0.1/batches/${encodeURIComponent(batchId)}/io`, 'batch.create', body, value => {
    const record = recordOf(value);
    return { io_id: uuidField(record, 'io_id'), batch_id: uuidField(record, 'batch_id') };
  });
}

export function readBatch(batchId: string, signal?: AbortSignal): Promise<BatchDetail> {
  return readJson(`/p1/v0.1/batches/${encodeURIComponent(batchId)}`, parseBatchDetail, signal);
}

export async function createBackendDelivery(input: {
  to_site_id: string; dispatch_quantity: string; mass_basis: string; dispatched_at: string,
}): Promise<WriteResult<Delivery>> {
  const body = { organization_id: SYNTHETIC_ORG_ID, site_id: authSnapshot().site, run_id: null,
    from_site_id: authSnapshot().site, ...input, original_unit: 'kg' };
  return p1PostOnce('/p1/v0.1/deliveries', 'delivery.create', body, parseDelivery);
}

export async function recordBackendReceiving(deliveryId: string, input: {
  received_quantity: string; received_at: string,
}): Promise<WriteResult<Delivery>> {
  return p1PostOnce(`/p1/v0.1/deliveries/${encodeURIComponent(deliveryId)}/receiving`,
    'delivery.create', { ...input }, parseDelivery);
}

export async function createBackendService(input: {
  delivery_id: string; served_count: string; served_mass: string; mass_basis: string;
  sampling_frame: string; sample_size: string; sampling_method: string,
}): Promise<WriteResult<Service>> {
  const body = { organization_id: SYNTHETIC_ORG_ID, site_id: authSnapshot().site,
    delivery_id: input.delivery_id || null,
    served_count: input.served_count === '' ? null : Number(input.served_count),
    served_mass: input.served_mass || null,
    mass_basis: input.served_mass ? input.mass_basis : null,
    leftover_event_id: null, sampling_frame: input.sampling_frame || null,
    sample_size: input.sample_size === '' ? null : Number(input.sample_size),
    sampling_method: input.sampling_method || null, coverage: null };
  return p1PostOnce('/p1/v0.1/services', 'service.create', body, parseService);
}

export async function createBackendLink(input: {
  source_type: string; source_id: string; target_type: string; target_id: string;
  relation_code: string; quantity: string; mass_basis: string; occurred_at: string,
}): Promise<WriteResult<{ link_id: string; relation_code: string }>> {
  const body = { ...input, quantity: input.quantity || null,
    original_unit: input.quantity ? 'kg' : null, mass_basis: input.quantity ? input.mass_basis : null,
    note: null };
  return p1PostOnce('/p1/v0.1/links', 'link.create', body, value => {
    const record = recordOf(value);
    return { link_id: uuidField(record, 'link_id'), relation_code: stringField(record, 'relation_code') };
  });
}

export function readLineage(objectType: string, objectId: string, signal?: AbortSignal): Promise<LineageView> {
  return readJson(`/p1/v0.1/lineage/${encodeURIComponent(objectType)}/${encodeURIComponent(objectId)}`,
    parseLineage, signal);
}

export async function createBackendCostReference(input: {
  scope_type: string; scope_ref: string; currency: string; amount: string; unit_basis: string;
  price_source: string; price_date: string; method_version: string,
}): Promise<WriteResult<CostReference>> {
  const body = { organization_id: SYNTHETIC_ORG_ID, site_id: authSnapshot().site, ...input,
    amount: input.amount || null, price_date: input.price_date || null };
  return p1PostOnce('/p2/v0.1/cost-references', 'costref.create', body, parseCostReference);
}

export function readCostValuation(costReferenceId: string, signal?: AbortSignal): Promise<ValuationBlocked> {
  return readJson(`/p2/v0.1/cost-references/${encodeURIComponent(costReferenceId)}/valuation`,
    value => {
      const record = recordOf(value);
      requireValue(record.status === 'blocked');
      return { status: 'blocked' as const, reason: stringField(record, 'reason'),
        method_version: stringField(record, 'method_version'),
        price_availability: stringField(record, 'price_availability'), note: stringField(record, 'note') };
    }, signal);
}

export function readRecommendations(siteId: string, signal?: AbortSignal): Promise<Recommendation[]> {
  return readJson(`/p2/v0.1/recommendations?site_id=${encodeURIComponent(siteId)}`, value => {
    requireValue(Array.isArray(value));
    return value.map(parseRecommendation);
  }, signal);
}

export function evaluateRecommendations(): Promise<WriteResult<EvaluateView>> {
  const site = authSnapshot().site;
  return p1PostOnce(`/p2/v0.1/recommendations/evaluate?site_id=${encodeURIComponent(site)}`,
    'alert.ack', { site_id: site }, parseEvaluate, null, 200);
}

export async function acknowledgeBackendRecommendation(recommendationId: string, input: {
  state: 'acknowledged' | 'dismissed'; reason: string,
}): Promise<WriteResult<Recommendation>> {
  return p1PostOnce(`/p2/v0.1/recommendations/${encodeURIComponent(recommendationId)}/acknowledge`,
    'alert.ack', { ...input }, parseRecommendation);
}

export function readAlertRules(signal?: AbortSignal): Promise<AlertRule[]> {
  return readJson('/p2/v0.1/recommendations/rules', parseAlertRules, signal);
}
