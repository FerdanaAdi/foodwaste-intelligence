/**
 * Read-only evidence detail (FR-005 / AC-10).
 *
 * Full metadata view. The actual artifact is NEVER opened, previewed, or
 * linked here: storage references stay opaque, no URL is constructed or
 * guessed, and opening the artifact is a server-side authorized action
 * handled by a future integration task. Verification labels describe the
 * evidence review state only — they are not measurement approval.
 */

import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/utils";
import type { EvidenceMetadata } from "@/data/evidence/types";
import {
  EVIDENCE_AVAILABILITY_LABELS,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_TARGET_LABELS,
  EVIDENCE_VERIFICATION_LABELS,
} from "@/data/evidence/types";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="text-xs font-medium text-slate-500 sm:w-44 sm:flex-shrink-0">{label}</dt>
      <dd className="break-words text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export function EvidenceDetail({ item }: { item: EvidenceMetadata }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Detail bukti <span className="font-mono">{item.evidenceId}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{EVIDENCE_KIND_LABELS[item.kind]}</Badge>
          <Badge>{EVIDENCE_VERIFICATION_LABELS[item.verification]}</Badge>
          <Badge>{EVIDENCE_AVAILABILITY_LABELS[item.availability]}</Badge>
        </div>

        <dl className="space-y-2">
          <DetailRow label="Judul" value={item.title} />
          <DetailRow label="Terkait record" value={`${EVIDENCE_TARGET_LABELS[item.targetKind]} ${item.targetId}`} />
          <DetailRow label="Sumber" value={item.source} />
          {item.method && <DetailRow label="Metode" value={item.method} />}
          {item.provenance && <DetailRow label="Provenance" value={item.provenance} />}
          <DetailRow label="Dicatat oleh" value={item.createdBy} />
          <DetailRow label="Waktu pencatatan" value={formatDateTime(item.createdAt)} />
          {item.verifiedBy && (
            <DetailRow
              label="Diverifikasi oleh"
              value={`${item.verifiedBy} · ${item.verifiedAt ? formatDateTime(item.verifiedAt) : "waktu tidak tercatat"}`}
            />
          )}
        </dl>

        {item.note && <p className="text-xs text-slate-500">{item.note}</p>}

        {item.kind === "attachment" ? (
          <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            Ini tampilan <strong>metadata</strong> bukti. Paket UI ini tidak membuka, memuat, atau menampilkan isi
            berkas, dan tidak membuat tautan unduhan. Pembukaan berkas aktual dilakukan server dengan otorisasi
            tersendiri (AC-10).
          </p>
        ) : (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Ini <strong>referensi metadata saja</strong> — tidak ada berkas tersimpan untuk item ini; keterangan
            sumber ditampilkan apa adanya.
          </p>
        )}
        <p className="text-xs text-slate-400">
          Status verifikasi hanya menggambarkan pemeriksaan metadata/berkas — bukan persetujuan formal dan bukan
          validasi terhadap nilai pengukuran terkait.
        </p>
      </CardContent>
    </Card>
  );
}
