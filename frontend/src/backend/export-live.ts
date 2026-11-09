/** Live authorized export client (FR-008). Session-bound GET, no-store; the
 *  server re-checks site scope per request, so no filter can widen it. */
import { authSnapshot } from './auth';
import { isUUID } from './contract';

export const EXPORT_DATASETS = ['events', 'measurements', 'metadata'] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];
export interface ExportFilters {
  event_type?: string; stage_code?: string;
  operation_date_from?: string; operation_date_to?: string;
}
export interface ExportDelivery {
  bytes: Uint8Array; mediaType: string; filename: string;
  events: number; measurements: number; format: string; scopeSite: string;
}

function header(response: Response, name: string): string {
  const value = response.headers.get(name);
  if (!value) throw new Error(`Respons export tanpa ${name}; tolak delivery.`);
  return value;
}

/** Fetch the export bytes for the ACTIVE authorized site. Filters travel to
 *  the server, which re-applies scope; failures surface honestly (no fallback). */
export async function fetchAuthorizedExport(dataset: ExportDataset, filters: ExportFilters, signal: AbortSignal): Promise<ExportDelivery> {
  const site = authSnapshot().site;
  if (!isUUID(site)) throw new Error('Site aktif tidak valid untuk ekspor.');
  const params = new URLSearchParams({ site_id: site, dataset });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const context = authSnapshot();
  const response = await fetch(`/demo/v0.1/export?${params.toString()}`, {
    credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal,
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error('404: Scope ekspor tidak ditemukan atau bukan milik site berizin.');
    if (response.status === 503) throw new Error('503: Layanan ekspor tidak tersedia.');
    throw new Error(`Permintaan ekspor ditolak (HTTP ${response.status}).`);
  }
  const scopeSite = header(response, 'X-FWI-Export-Scope-Site');
  if (scopeSite !== site) throw new Error('Scope ekspor tidak cocok dengan site aktif; delivery ditolak.');
  const disposition = header(response, 'Content-Disposition');
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `fwi-${dataset}.csv`;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (context !== authSnapshot()) throw new Error('Sesi berubah saat ekspor; delivery dibatalkan.');
  return { bytes, mediaType: response.headers.get('Content-Type') ?? 'application/octet-stream',
           filename, events: Number(header(response, 'X-FWI-Export-Events')),
           measurements: Number(header(response, 'X-FWI-Export-Measurements')),
           format: header(response, 'X-FWI-Export-Format'), scopeSite };
}

export function downloadExport(delivery: ExportDelivery): void {
  const url = URL.createObjectURL(new Blob([delivery.bytes as unknown as BlobPart], { type: delivery.mediaType }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = delivery.filename; anchor.rel = 'noopener';
  document.body.append(anchor); anchor.click(); anchor.remove();
  URL.revokeObjectURL(url);
}
