/** Synthetic local development write client. Never retries a POST. */
import { BACKEND_MASS_BASES, BACKEND_STATUSES, isAwareTimestamp, isISODate, isUUID, parseEvent, parseMeasurements } from "./contract";
import type { BackendEvent, BackendMeasurement } from "./contract";
import { assertCurrent, authSnapshot, permits, protectedJson } from './auth';

export const SYNTHETIC_ORG_ID = "11111111-1111-4111-8111-111111111111";
export const SYNTHETIC_SITE_ID = "22222222-2222-4222-8222-222222222222";
export const WRITE_TIMEOUT_MS = 10000;
export const CAPTURE_JOURNAL_KEY = "fwi-int-005:synthetic-capture:pending";

export type EventInput = {
  organization_id: string; site_id: string;
  event_type: "at_risk_surplus" | "actual_loss_discard";
  occurred_at: string;
  stage_code?: string; process_step?: string; operation_date?: string;
};
export type MeasurementInput = {
  gross: string | null; tare: string | null; net: string | null;
  original_unit: "kg"; mass_basis: (typeof BACKEND_MASS_BASES)[number];
  observation_status: (typeof BACKEND_STATUSES)[number];
  measurement_method: string; provenance: string; measured_at: string;
  original_value_lexeme?: string; instrument_ref?: string; sample_context?: string;
};
export type WriteResult<T> =
  | { kind: "saved"; value: T }
  | { kind: "rejected"; message: string }
  | { kind: "unknown"; message: string };

const DECIMAL_TEXT = /^\d+(?:\.\d+)?$/;
// Compare numerical representations without binary floating-point mass arithmetic.
function decimalKey(value: string): string {
  const [coefficient, exponent = "0"] = value.toLowerCase().replace(/^\+/, "").split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = (whole + fraction).replace(/^0+/, "");
  if (!digits) return "0";
  const significant = digits.replace(/0+$/, "");
  return `${significant}e${BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - significant.length)}`;
}
function sameInstant(a: string, b: string): boolean {
  // Date is used only for timestamp seconds, never for mass or decimal digits.
  const seconds = (value: string) => Date.parse(value.replace(/\.\d+/, ""));
  const fraction = (value: string) => (/\.(\d+)/.exec(value)?.[1] ?? "").padEnd(6, "0");
  return seconds(a) === seconds(b) && fraction(a) === fraction(b);
}
function meaningful(value: string) { return value.trim().length > 0 && value.length <= 1000; }

export function eventErrors(value: EventInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isUUID(value.organization_id) || !isUUID(value.site_id))
    errors.site = "UUID organisasi/site sintetis wajib valid; izin tetap diperiksa backend.";
  if (value.event_type !== "at_risk_surplus" && value.event_type !== "actual_loss_discard")
    errors.event_type = "Pilih jenis event backend demo.";
  if (!isAwareTimestamp(value.occurred_at)) errors.occurred_at = "Gunakan waktu ISO dengan zona waktu, misalnya 2026-11-06T12:00:00+08:00.";
  if (value.operation_date !== undefined && value.operation_date !== "" && !isISODate(value.operation_date))
    errors.operation_date = "Tanggal operasi berformat YYYY-MM-DD; tidak dihitung otomatis dari waktu kejadian.";
  return errors;
}

export function measurementErrors(value: MeasurementInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (value.original_unit !== "kg") errors.original_unit = "Unit demo harus kg.";
  if (!BACKEND_MASS_BASES.some(v => v === value.mass_basis)) errors.mass_basis = "Pilih basis massa provisional.";
  if (!BACKEND_STATUSES.some(v => v === value.observation_status)) errors.observation_status = "Pilih status pengukuran.";
  if (!meaningful(value.measurement_method)) errors.measurement_method = "Metode wajib dinyatakan (maks. 1000 karakter).";
  if (!meaningful(value.provenance)) errors.provenance = "Provenance sintetis wajib dinyatakan (maks. 1000 karakter).";
  if (!isAwareTimestamp(value.measured_at)) errors.measured_at = "Waktu ukur harus memiliki offset eksplisit.";
  const absent = value.observation_status === "missing" || value.observation_status === "not_measured";
  for (const field of ["gross", "tare", "net"] as const) {
    const mass = value[field];
    if (absent ? mass !== null : mass === null || !DECIMAL_TEXT.test(mass)) {
      errors[field] = absent ? "Missing/not_measured harus null, bukan nol." : "Wajib angka desimal tak negatif; jangan memakai pemisah ribuan.";
    }
  }
  if (value.observation_status === "measured_zero" && value.net !== null && !/^0+(?:\.0+)?$/.test(value.net))
    errors.net = "Measured-zero memerlukan net nol yang benar-benar diukur.";
  // Exact gross-tare-net arithmetic belongs to the backend Decimal domain validator.
  return errors;
}

/** A rejected response means the server explicitly refused the request without creating a record.
 *  All ambiguous conditions (including 5xx and malformed 201) remain UNKNOWN. */
async function postOnce<T>(path: string, body: EventInput | MeasurementInput, parse: (value: unknown) => T): Promise<WriteResult<T>> {
  const kind = path.endsWith('/measurements') ? 'measurement' : 'event';
  const auth = authSnapshot();
  if (!permits(kind + '.create') || ('site_id' in body && body.site_id !== auth.site))
    return { kind: 'rejected', message: 'Tidak ada izin untuk operasi/site aktif.' };
  try {
    saveCaptureJournal({ operation: kind, eventId: null, state: 'pending' });
    const registration = await protectedJson('/auth/intents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        kind, site_id: auth.site, event_id: kind === 'measurement' ? path.split('/')[4] : null,
      }),
    });
    assertCurrent(auth);
    if (registration.response.status !== 201) return { kind: 'unknown', message: 'Registrasi intent belum terkonfirmasi; domain POST tidak dikirim.' };
    const intent = registration.value as { intent_id: string; state: string };
    if (!intent || !isUUID(intent.intent_id) || intent.state !== 'registered') throw Error('invalid intent response');
    sessionStorage.setItem(CAPTURE_JOURNAL_KEY, intent.intent_id);
    const { response, value: raw } = await protectedJson(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FWI-Intent': intent.intent_id }, body: JSON.stringify(body),
    });
    assertCurrent(auth);
    if (response.status === 422 || response.status === 400 || response.status === 404) {
      return { kind: "rejected", message: `Server menolak operasi (HTTP ${response.status}). Periksa input atau konteks fixture.` };
    }
    if (response.status !== 201) {
      return { kind: "unknown", message: `HTTP ${response.status}; hasil commit tidak dapat dipastikan. Jangan kirim ulang.` };
    }
    // Even 201 is UNKNOWN when the response cannot be parsed and associated with the request.
    try { return { kind: "saved", value: parse(raw) }; }
    catch { return { kind: "unknown", message: "Respons 201 tidak valid; hasil commit belum dapat dipastikan." }; }
  } catch {
    return { kind: "unknown", message: "Respons POST tidak diterima (jaringan/timeout); mungkin sudah commit. Jangan kirim ulang." };
  }
}

export async function createBackendEvent(input: EventInput): Promise<WriteResult<BackendEvent>> {
  // Optional fields are omitted entirely when blank; the server never receives empty strings.
  const { stage_code, process_step, operation_date, ...rest } = input;
  const body: EventInput = rest;
  if (stage_code?.trim()) body.stage_code = stage_code.trim();
  if (process_step?.trim()) body.process_step = process_step.trim();
  if (operation_date) body.operation_date = operation_date;
  if (Object.keys(eventErrors(body)).length) return { kind: "rejected", message: "Validasi event gagal." };
  return postOnce("/demo/v0.1/events", body, raw => {
    if (typeof raw !== "object" || raw === null || !("event_id" in raw) || typeof raw.event_id !== "string" || !isUUID(raw.event_id)) throw Error("missing server id");
    const event = parseEvent(raw, raw.event_id);
    if (event.organization_id !== body.organization_id || event.site_id !== body.site_id || event.event_type !== body.event_type || !sameInstant(event.occurred_at, body.occurred_at)) throw Error("mismatched event");
    return event;
  });
}

export async function createBackendMeasurement(eventId: string, input: MeasurementInput): Promise<WriteResult<BackendMeasurement>> {
  if (!isUUID(eventId) || Object.keys(measurementErrors(input)).length) return { kind: "rejected", message: "Validasi measurement gagal." };
  const { original_value_lexeme, instrument_ref, sample_context, ...rest } = input;
  const body: MeasurementInput = rest;
  if (original_value_lexeme?.trim()) body.original_value_lexeme = original_value_lexeme.trim();
  if (instrument_ref?.trim()) body.instrument_ref = instrument_ref.trim();
  if (sample_context?.trim()) body.sample_context = sample_context.trim();
  return postOnce(`/demo/v0.1/events/${eventId}/measurements`, body, raw => {
    // Use the existing strict runtime parser with event relation and measurement identity.
    const [measurement] = parseMeasurements([raw], eventId);
    for (const field of ["gross", "tare", "net"] as const) {
      const actual = measurement[field], expected = body[field];
      if (actual === null || expected === null ? actual !== expected : decimalKey(actual) !== decimalKey(expected)) throw Error("mismatched mass");
    }
    if (measurement.original_unit !== body.original_unit || measurement.mass_basis !== body.mass_basis ||
        measurement.observation_status !== body.observation_status || measurement.measurement_method !== body.measurement_method ||
        measurement.provenance !== body.provenance || !sameInstant(measurement.measured_at, body.measured_at)) throw Error("mismatched measurement");
    return measurement;
  });
}

export type CaptureJournal = { operation: "event" | "measurement"; eventId: string | null; state: "pending" | "unknown" };
/** The journal intentionally has no request replay operation. PENDING after a reload is UNKNOWN. */
export function readCaptureJournal(): CaptureJournal | null {
  try {
    // Ownership comes from authorized recovery, never from a browser marker.
    if (authSnapshot().intents?.some(i => i.state === 'registered'))
      return { operation: 'event', eventId: null, state: 'unknown' };
    return null;
  } catch { return { operation: "event", eventId: null, state: "unknown" }; }
}
export function saveCaptureJournal(_journal: CaptureJournal): void {
  // Non-authorizing opaque marker only. Never store actor/site/event/payload/secrets.
  if (!sessionStorage.getItem(CAPTURE_JOURNAL_KEY)) sessionStorage.setItem(CAPTURE_JOURNAL_KEY, crypto.randomUUID());
}
export function clearCaptureJournal(): void { sessionStorage.removeItem(CAPTURE_JOURNAL_KEY); }
