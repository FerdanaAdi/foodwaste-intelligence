/**
 * Filters for the FR-002 reference-data catalog.
 *
 * Text search, category filter, and active/inactive filter.
 * Same responsive grid pattern as DQ-01 DataQualityFilters.
 */

import type { ReferenceCategory, ReferenceFilterState } from "@/data/referencedata/types";
import { REFERENCE_CATEGORIES, REFERENCE_CATEGORY_LABELS } from "@/data/referencedata/types";
import { Button } from "@/components/ui/Button";

interface ReferenceFiltersProps {
  filters: ReferenceFilterState;
  onChange: (filters: ReferenceFilterState) => void;
}

export function ReferenceFilters({ filters, onChange }: ReferenceFiltersProps) {
  const update = (patch: Partial<ReferenceFilterState>) =>
    onChange({ ...filters, ...patch });

  const hasFilters = filters.searchText !== "" || filters.category !== "" || filters.activeFilter !== "";

  return (
    <section
      aria-label="Filter katalog data referensi"
      role="region"
      className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-6"
    >
      <p className="mb-3 text-sm font-medium text-slate-700">
        Filter (demo — data sintetis)
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Text search */}
        <div>
          <label htmlFor="ref-search" className="block text-xs font-medium text-slate-600">
            Cari
          </label>
          <input
            id="ref-search"
            type="search"
            value={filters.searchText}
            onChange={(e) => update({ searchText: e.target.value })}
            placeholder="Kode, nama, atau deskripsi…"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Category filter */}
        <div>
          <label htmlFor="ref-category" className="block text-xs font-medium text-slate-600">
            Kategori
          </label>
          <select
            id="ref-category"
            value={filters.category}
            onChange={(e) => update({ category: e.target.value as "" | ReferenceCategory })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">Semua kategori</option>
            {REFERENCE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {REFERENCE_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        {/* Active status filter */}
        <div>
          <label htmlFor="ref-active" className="block text-xs font-medium text-slate-600">
            Status
          </label>
          <select
            id="ref-active"
            value={filters.activeFilter}
            onChange={(e) => update({ activeFilter: e.target.value as "" | "active" | "inactive" })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </div>
      </div>

      {hasFilters && (
        <div className="mt-3">
          <Button
            variant="secondary"
            onClick={() => onChange({ searchText: "", category: "", activeFilter: "" })}
          >
            Reset filter
          </Button>
        </div>
      )}
    </section>
  );
}
