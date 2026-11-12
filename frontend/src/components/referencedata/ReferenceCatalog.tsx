/**
 * FR-002 reference-data catalog — main composition component.
 *
 * Presentational + fixture-backed only: no backend API calls, no auth
 * policy, no database access. Data source is injected so a later task
 * can swap synthetic fixtures for a real adapter without touching the UI.
 *
 * State variants (loading/denied/unavailable) are driven by props —
 * wiring them to real request lifecycles happens at integration time.
 */

import { useMemo, useState } from "react";

import { DEMO_BANNER } from "@/domain/types";
import type { ReferenceItem } from "@/data/referencedata/types";
import { emptyReferenceFilters } from "@/data/referencedata/types";
import type { ReferenceFilterState } from "@/data/referencedata/types";
import {
  applyReferenceFilters,
  categorySummary,
  groupByCategory,
  totalCounts,
} from "@/data/referencedata/catalog";
import { REFERENCE_CATEGORY_LABELS } from "@/data/referencedata/types";
import { ReferenceFilters } from "./ReferenceFilters";
import { ReferenceItemCard } from "./ReferenceItemCard";
import { ReferenceDetail } from "./ReferenceDetail";
import { RefDeniedState, RefEmptyState, RefLoadingState, RefUnavailableState } from "./states";
import { Badge } from "@/components/ui/Badge";

export type CatalogAvailability = "ready" | "loading" | "denied" | "unavailable";

interface ReferenceCatalogProps {
  /** Reference items (synthetic fixtures or future backend data). */
  items: readonly ReferenceItem[];
  availability?: CatalogAvailability;
  onRetry?: () => void;
  deniedReason?: string;
  unavailableDetail?: string;
}

export function ReferenceCatalog({
  items,
  availability = "ready",
  onRetry,
  deniedReason,
  unavailableDetail,
}: ReferenceCatalogProps) {
  const [filters, setFilters] = useState<ReferenceFilterState>(emptyReferenceFilters);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const filtered = useMemo(() => applyReferenceFilters(items, filters), [items, filters]);
  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);
  const counts = useMemo(() => totalCounts(items), [items]);
  const summary = useMemo(() => categorySummary(items), [items]);

  if (availability === "loading") return <RefLoadingState />;
  if (availability === "denied") return <RefDeniedState reason={deniedReason} />;
  if (availability === "unavailable") return <RefUnavailableState detail={unavailableDetail} onRetry={onRetry} />;

  const selectedItem = selectedCode ? filtered.find((item) => item.code === selectedCode) ?? null : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Katalog Data Referensi</h1>
        <p className="mt-1 text-sm text-slate-600">
          Master data minimal (FR-002): item pangan, kategori, unit, tahap, metode dan alasan — dengan kode stabil, versi dan pemilik perubahan.
        </p>
        <p className="mt-1 text-xs font-medium uppercase text-amber-700">{DEMO_BANNER}</p>
      </header>

      {/* Summary tiles */}
      <section aria-label="Ringkasan data referensi" role="region">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">Total item</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{counts.total}</p>
          </li>
          <li className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">Item aktif</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-700">{counts.active}</p>
          </li>
          <li className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">Item nonaktif</p>
            <p className="text-2xl font-bold tabular-nums text-slate-500">{counts.inactive}</p>
          </li>
          {summary.map((s) => (
            <li key={s.category} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900">{s.totalCount}</p>
              <p className="text-xs text-slate-400">
                {s.activeCount} aktif · {s.inactiveCount} nonaktif
              </p>
            </li>
          ))}
        </ul>
      </section>

      <ReferenceFilters filters={filters} onChange={setFilters} />

      {/* Catalog list grouped by category */}
      <section aria-label="Daftar item referensi" role="region" className="space-y-6">
        {filtered.length === 0 ? (
          <RefEmptyState
            description="Tidak ada item referensi yang cocok dengan filter saat ini. Ubah filter untuk melihat item lain."
          />
        ) : (
          Array.from(grouped.entries()).map(([category, catItems]) => (
            <div key={category}>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">
                {REFERENCE_CATEGORY_LABELS[category]}
                <Badge tone="neutral" className="ml-2">{catItems.length}</Badge>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catItems.map((item) => (
                  <ReferenceItemCard
                    key={item.code}
                    item={item}
                    selected={selectedCode === item.code}
                    onSelect={(code) => setSelectedCode(code === selectedCode ? null : code)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Detail drilldown */}
      {selectedItem && (
        <section aria-label={`Detail drilldown ${selectedItem.code}`} role="region">
          <ReferenceDetail item={selectedItem} />
        </section>
      )}

      <p className="text-xs text-slate-500">
        Semua item berasal dari fixture sintetis di dalam aplikasi — bukan data referensi lapangan,
        bukan integrasi resmi BGN/SPPG, dan bukan vocabulary final.
      </p>
    </div>
  );
}
