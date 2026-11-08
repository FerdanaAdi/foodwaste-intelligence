import { isUUID, parseEvent, parseMeasurements } from "./contract";
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
