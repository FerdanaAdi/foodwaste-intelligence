/**
 * Read-only evidence list (FR-005 / AC-10 metadata view).
 *
 * Renders metadata only: reference, target record, kind/source, creator,
 * time, provenance, verification and availability. No previews, no
 * download links, no URLs constructed from storage references, and no
 * client-side permission logic — actual authorization is server-side.
 */

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import type { EvidenceMetadata } from "@/data/evidence/types";
import {
  EVIDENCE_AVAILABILITY_LABELS,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_TARGET_LABELS,
  EVIDENCE_VERIFICATION_LABELS,
} from "@/data/evidence/types";

const kindTone: Record<EvidenceMetadata["kind"], BadgeTone> = {
  attachment: "info",
  reference: "neutral",
};

const verificationTone: Record<EvidenceMetadata["verification"], BadgeTone> = {
  unverified: "neutral",
  needs_review: "warn",
  verified: "ok",
};

const availabilityTone: Record<EvidenceMetadata["availability"], BadgeTone> = {
  available: "ok",
  unavailable: "warn",
  expired: "danger",
  unknown: "neutral",
};

interface EvidenceListProps {
  items: readonly EvidenceMetadata[];
  /** Called with the evidenceId when the user requests the detail view. */
  onSelect?: (evidenceId: string) => void;
  selectedEvidenceId?: string | null;
}

export function EvidenceList({ items, onSelect, selectedEvidenceId }: EvidenceListProps) {
  return (
    <ul aria-label="Daftar metadata bukti" className="space-y-3">
      {items.map((e) => (
        <li key={e.evidenceId} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={selectedEvidenceId === e.evidenceId}
              className="font-mono text-xs font-semibold text-sky-800 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
              onClick={() => onSelect?.(e.evidenceId)}
            >
              {e.evidenceId}
            </button>
            <Badge tone={kindTone[e.kind]}>{EVIDENCE_KIND_LABELS[e.kind]}</Badge>
            <Badge tone={verificationTone[e.verification]}>
              {EVIDENCE_VERIFICATION_LABELS[e.verification]}
            </Badge>
            <Badge tone={availabilityTone[e.availability]}>
              {EVIDENCE_AVAILABILITY_LABELS[e.availability]}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-slate-900">{e.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {EVIDENCE_TARGET_LABELS[e.targetKind]}: <span className="font-mono">{e.targetId}</span> · Sumber:{" "}
            {e.source}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Dicatat oleh {e.createdBy} · {formatDateTime(e.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}
