/** Synthetic local development write client. Never retries a POST. */
import { BACKEND_MASS_BASES, BACKEND_STATUSES, isAwareTimestamp, isUUID, parseEvent, parseMeasurements } from "./contract";
import type { BackendEvent, BackendMeasurement } from "./contract";

export const SYNTHETIC_ORG_ID = "11111111-1111-4111-8111-111111111111";
export const SYNTHETIC_SITE_ID = "22222222-2222-4222-8222-222222222222";
export const WRITE_TIMEOUT_MS = 10000;
export const CAPTURE_JOURNAL_KEY = "fwi-int-005:synthetic-capture:pending";

export type EventInput = {
  organization_id: string; site_id: string;
  event_type: "at_risk_surplus" | "actual_loss_discard";
  occurred_at: string;
};
export type MeasurementInput = {
  gross: string | null; tare: string | null; net: string | null;
  original_unit: "kg"; mass_basis: (typeof BACKEND_MASS_BASES)[number];
  observation_status: (typeof BACKEND_STATUSES)[number];
  measurement_method: string; provenance: string; measured_at: string;
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
  if (value.organization_id !== SYNTHETIC_ORG_ID || value.site_id !== SYNTHETIC_SITE_ID)
    errors.site = "Hanya pasangan organisasi/site fixture sintetis yang didukung.";
  if (value.event_type !== "at_risk_surplus" && value.event_type !== "actual_loss_discard")
    errors.event_type = "Pilih jenis event backend demo.";
  if (!isAwareTimestamp(value.occurred_at)) errors.occurred_at = "Gunakan waktu ISO dengan zona waktu, misalnya 2026-11-06T12:00:00+08:00.";
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.signal, credentials: "omit",
      redirect: "error", cache: "no-store",
    });
    if (response.status === 422 || response.status === 400 || response.status === 404) {
      return { kind: "rejected", message: `Server menolak operasi (HTTP ${response.status}). Periksa input atau konteks fixture.` };
    }
    if (response.status !== 201) {
      return { kind: "unknown", message: `HTTP ${response.status}; hasil commit tidak dapat dipastikan. Jangan kirim ulang.` };
    }
    // Even 201 is UNKNOWN when the response cannot be parsed and associated with the request.
    let raw: unknown;
    try { raw = await response.json() as unknown; return { kind: "saved", value: parse(raw) }; }
    catch { return { kind: "unknown", message: "Respons 201 tidak valid; hasil commit belum dapat dipastikan." }; }
  } catch {
    return { kind: "unknown", message: "Respons POST tidak diterima (jaringan/timeout); mungkin sudah commit. Jangan kirim ulang." };
  } finally { clearTimeout(timeout); }
}

export async function createBackendEvent(body: EventInput): Promise<WriteResult<BackendEvent>> {
  if (Object.keys(eventErrors(body)).length) return { kind: "rejected", message: "Validasi event gagal." };
  return postOnce("/demo/v0.1/events", body, raw => {
    if (typeof raw !== "object" || raw === null || !("event_id" in raw) || typeof raw.event_id !== "string" || !isUUID(raw.event_id)) throw Error("missing server id");
    const event = parseEvent(raw, raw.event_id);
    if (event.organization_id !== body.organization_id || event.site_id !== body.site_id || event.event_type !== body.event_type || !sameInstant(event.occurred_at, body.occurred_at)) throw Error("mismatched event");
    return event;
  });
}

export async function createBackendMeasurement(eventId: string, body: MeasurementInput): Promise<WriteResult<BackendMeasurement>> {
  if (!isUUID(eventId) || Object.keys(measurementErrors(body)).length) return { kind: "rejected", message: "Validasi measurement gagal." };
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
    const raw = sessionStorage.getItem(CAPTURE_JOURNAL_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return { operation: "event", eventId: null, state: "unknown" };
    const obj = value as Record<string, unknown>;
    if ((obj.operation !== "event" && obj.operation !== "measurement") ||
        (obj.eventId !== null && (typeof obj.eventId !== "string" || !isUUID(obj.eventId))) ||
        (obj.state !== "pending" && obj.state !== "unknown"))
      return { operation: "event", eventId: null, state: "unknown" };
    return { operation: obj.operation, eventId: obj.eventId as string | null, state: "unknown" };
  } catch { return { operation: "event", eventId: null, state: "unknown" }; }
}
export function saveCaptureJournal(journal: CaptureJournal): void {
  sessionStorage.setItem(CAPTURE_JOURNAL_KEY, JSON.stringify(journal));
}
export function clearCaptureJournal(): void { sessionStorage.removeItem(CAPTURE_JOURNAL_KEY); }
