/**
 * Demo-only filters for the data-quality dashboard (FR-007:
 * site / periode / tahap + status). Purely client-side over synthetic
 * fixtures; nothing here implies backend querying or authorization.
 */

import { emptyFilters, OBSERVATION_STATUS_OPTIONS, VALIDATION_STATUS_OPTIONS } from "@/data/dataquality/summary";
import type { DataQualityFilterState, SiteOption } from "@/data/dataquality/summary";

interface DataQualityFiltersProps {
  filters: DataQualityFilterState;
  onChange: (next: DataQualityFilterState) => void;
  sites: SiteOption[];
  stages: string[];
  disabled?: boolean;
}

const selectClass =
  "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

export function DataQualityFilters({ filters, onChange, sites, stages, disabled }: DataQualityFiltersProps) {
  const set = (patch: Partial<DataQualityFilterState>) => onChange({ ...filters, ...patch });
  return (
    <section aria-label="Filter dashboard mutu data (demo)" className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs font-medium uppercase text-slate-500">Filter (demo — data sintetis)</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="dq-filter-site" className="block text-sm font-medium text-slate-700">
            Site
          </label>
          <select
            id="dq-filter-site"
            className={selectClass}
            disabled={disabled}
            value={filters.siteId}
            onChange={(e) => set({ siteId: e.target.value })}
          >
            <option value="">Semua site</option>
            {sites.map((s) => (
              <option key={s.siteId} value={s.siteId}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="dq-filter-stage" className="block text-sm font-medium text-slate-700">
            Tahap
          </label>
          <select
            id="dq-filter-stage"
            className={selectClass}
            disabled={disabled}
            value={filters.stage}
            onChange={(e) => set({ stage: e.target.value })}
          >
            <option value="">Semua tahap</option>
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="dq-filter-observation" className="block text-sm font-medium text-slate-700">
            Status observasi
          </label>
          <select
            id="dq-filter-observation"
            className={selectClass}
            disabled={disabled}
            value={filters.observationStatus}
            onChange={(e) => set({ observationStatus: e.target.value as DataQualityFilterState["observationStatus"] })}
          >
            <option value="">Semua status</option>
            {OBSERVATION_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="dq-filter-validation" className="block text-sm font-medium text-slate-700">
            Status validasi
          </label>
          <select
            id="dq-filter-validation"
            className={selectClass}
            disabled={disabled}
            value={filters.validationStatus}
            onChange={(e) => set({ validationStatus: e.target.value as DataQualityFilterState["validationStatus"] })}
          >
            <option value="">Semua validasi</option>
            {VALIDATION_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="dq-filter-from" className="block text-sm font-medium text-slate-700">
            Tanggal operasi dari
          </label>
          <input
            id="dq-filter-from"
            type="date"
            className={selectClass}
            disabled={disabled}
            value={filters.operationFrom}
            onChange={(e) => set({ operationFrom: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="dq-filter-to" className="block text-sm font-medium text-slate-700">
            Tanggal operasi sampai
          </label>
          <input
            id="dq-filter-to"
            type="date"
            className={selectClass}
            disabled={disabled}
            value={filters.operationTo}
            onChange={(e) => set({ operationTo: e.target.value })}
          />
        </div>
      </div>
      <button
        type="button"
        className="mt-3 text-sm text-sky-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        onClick={() => onChange(emptyFilters)}
      >
        Reset filter
      </button>
    </section>
  );
}
