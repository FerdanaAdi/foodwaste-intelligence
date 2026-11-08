/**
 * Evidence & provenance panel composition (FR-005, read-only).
 *
 * Presentational + fixture/injected-data only: no upload, no object
 * storage, no backend calls, no client-side permission claims. The
 * `accessState` prop is a server-driven fact that a future authenticated
 * integration passes in; this package never derives permissions itself.
 */

import { useMemo, useState } from "react";

import { DEMO_BANNER } from "@/domain/types";
import type { EvidenceMetadata, EvidenceTargetKind } from "@/data/evidence/types";
import { EvidenceList } from "./EvidenceList";
import { EvidenceDetail } from "./EvidenceDetail";
import {
  EvidenceDeniedState,
  EvidenceEmptyState,
  EvidenceLoadingState,
  EvidenceUnavailableState,
} from "./states";

export type EvidenceAccessState = "ready" | "loading" | "denied" | "unavailable";

interface EvidencePanelProps {
  /** Evidence metadata records to present (filtered by the caller). */
  items: readonly EvidenceMetadata[];
  /** Which record the panel is attached to, for the header/empty note. */
  targetKind: EvidenceTargetKind;
  targetId: string;
  accessState?: EvidenceAccessState;
  onRetry?: () => void;
  deniedReason?: string;
  unavailableDetail?: string;
}

export function EvidencePanel({
  items,
  targetKind,
  targetId,
  accessState = "ready",
  onRetry,
  deniedReason,
  unavailableDetail,
}: EvidencePanelProps) {
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const selected = useMemo(
    () => items.find((e) => e.evidenceId === selectedEvidenceId) ?? null,
    [items, selectedEvidenceId],
  );

  if (accessState === "loading") return <EvidenceLoadingState />;
  if (accessState === "denied") return <EvidenceDeniedState reason={deniedReason} />;
  if (accessState === "unavailable") return <EvidenceUnavailableState detail={unavailableDetail} onRetry={onRetry} />;

  return (
    <section aria-label={`Bukti untuk ${targetKind} ${targetId}`} className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">
          Bukti &amp; provenance — {targetKind} <span className="font-mono">{targetId}</span>
        </h2>
        <p className="mt-0.5 text-xs font-medium uppercase text-amber-700">{DEMO_BANNER}</p>
      </div>

      {items.length === 0 ? (
        <EvidenceEmptyState />
      ) : (
        <>
          <EvidenceList
            items={items}
            selectedEvidenceId={selectedEvidenceId}
            onSelect={(id) => setSelectedEvidenceId(id === selectedEvidenceId ? null : id)}
          />
          {selected && <EvidenceDetail item={selected} />}
        </>
      )}

      <p className="text-xs text-slate-500">
        Bukti (evidence) adalah konsep terpisah dari pengukuran dan validasi. Ketiadaan metadata bukti bukan berarti
        pengukuran nol dan tidak mengubah nilai tercatat.
      </p>
    </section>
  );
}
