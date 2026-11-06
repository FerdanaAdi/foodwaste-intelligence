/** PROVISIONAL backend demo wire contract. Independent of DemoStore domain types. */
export const BACKEND_MASS_BASES = ["raw", "after_preparation", "cooked", "ready_to_eat", "as_served", "other_documented"] as const;
export const BACKEND_STATUSES = ["observed", "estimated", "missing", "measured_zero", "not_measured"] as const;
export interface BackendEvent {
  event_id: string;
  organization_id: string;
  site_id: string;
  event_type: "at_risk_surplus" | "actual_loss_discard";
  occurred_at: string;
  recorded_at: string;
}
export interface BackendMeasurement {
  measurement_id: string;
  event_id: string;
  gross: string | null;
  tare: string | null;
  net: string | null;
  original_unit: "kg";
  mass_basis: (typeof BACKEND_MASS_BASES)[number];
  observation_status: (typeof BACKEND_STATUSES)[number];
  provenance: string;
  measurement_method: string;
  measured_at: string;
  recorded_at: string;
}
export const isUUID = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error("Respons backend tidak sesuai kontrak demo.");
}
function object(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function uuid(value: unknown): asserts value is string {
  requireValue(typeof value === "string" && isUUID(value));
}
/** Validate calendar, clock, and explicit timezone at runtime; preserve original text. */
export function isAwareTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59
    && (match[7] === "Z" || (Number(match[8]) <= 23 && Number(match[9]) <= 59));
}
export function parseEvent(value: unknown, expectedId: string): BackendEvent {
  const record = object(value);
  for (const key of ["event_id", "organization_id", "site_id"]) uuid(record[key]);
  requireValue(record.event_id === expectedId);
  requireValue(record.event_type === "at_risk_surplus" || record.event_type === "actual_loss_discard");
  requireValue(isAwareTimestamp(record.occurred_at) && isAwareTimestamp(record.recorded_at));
  return record as unknown as BackendEvent;
}
export function parseMeasurements(value: unknown, expectedId: string): BackendMeasurement[] {
  requireValue(Array.isArray(value));
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    const record = object(item);
    uuid(record.measurement_id);
    uuid(record.event_id);
    requireValue(record.event_id === expectedId && !ids.has(record.measurement_id));
    ids.add(record.measurement_id);
    requireValue(record.original_unit === "kg");
    requireValue(BACKEND_MASS_BASES.some(basis => basis === record.mass_basis));
    requireValue(BACKEND_STATUSES.some(status => status === record.observation_status));
    for (const key of ["measurement_method", "provenance"]) {
      requireValue(typeof record[key] === "string" && record[key].trim().length > 0);
    }
    requireValue(isAwareTimestamp(record.measured_at) && isAwareTimestamp(record.recorded_at));
    const absent = record.observation_status === "missing" || record.observation_status === "not_measured";
    for (const key of ["gross", "tare", "net"]) {
      const mass = record[key];
      // No binary float conversion, arithmetic, quantization, or inferred values.
      requireValue(absent ? mass === null : typeof mass === "string" && /^\+?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(mass));
    }
    if (record.observation_status === "measured_zero") {
      requireValue(typeof record.net === "string" && /^\+?0+(?:\.0+)?(?:[eE][+-]?\d+)?$/.test(record.net));
    }
    return record as unknown as BackendMeasurement;
  });
}
