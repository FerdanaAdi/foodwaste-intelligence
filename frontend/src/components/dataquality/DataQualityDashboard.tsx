/**
 * Data-quality dashboard package composition (FR-007 / UI-02).
 *
 * Presentational + fixture-backed only: no backend API calls, no auth
 * policy, no database access. Data source is injected so a later task
 * can swap synthetic fixtures for a real adapter without touching the
 * UI. State variants (loading/denied/unavailable) are driven by props —
 * wiring them to real request lifecycles happens at integration time.
 */

import { useMemo, useState } from "react";

import { DEMO_BANNER } from "@/domain/types";
import type { DemoData } from "@/domain/types";
import {
  applyFilters,
  emptyFilters,
  siteOptions,
  stageOptions,
  summarizeRecords,
} from "@/data/dataquality/summary";
import type { DataQualityFilterState } from "@/data/dataquality/summary";
import { DataQualityFilters } from "./DataQualityFilters";
import { DataQualitySummaryPanel } from "./DataQualitySummaryPanel";
import { DataQualityRecordList } from "./DataQualityRecordList";
import { DataQualityDetail } from "./DataQualityDetail";
import { DqDeniedState, DqEmptyState, DqLoadingState, DqUnavailableState } from "./states";

export type DashboardAvailability = "ready" | "loading" | "denied" | "unavailable";

interface DataQualityDashboardProps {
  /** Synthetic demo dataset; replaced by a real adapter at integration. */
  data: DemoData;
  availability?: DashboardAvailability;
  onRetry?: () => void;
  deniedReason?: string;
  unavailableDetail?: string;
}

export function DataQualityDashboard({
  data,
  availability = "ready",
  onRetry,
  deniedReason,
  unavailableDetail,
}: DataQualityDashboardProps) {
  const [filters, setFilters] = useState<DataQualityFilterState>(emptyFilters);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const records = useMemo(() => applyFilters(data, filters), [data, filters]);
  const summary = useMemo(() => summarizeRecords(records), [records]);

  if (availability === "loading") return <DqLoadingState />;
  if (availability === "denied") return <DqDeniedState reason={deniedReason} />;
  if (availability === "unavailable") return <DqUnavailableState detail={unavailableDetail} onRetry={onRetry} />;

  const selectedRecord = selectedEventId ? (records.find((r) => r.event.eventId === selectedEventId) ?? null) : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard Mutu Data</h1>
        <p className="mt-1 text-sm text-slate-600">
          Hitungan status data (FR-007) dari data demo sintetis — tanpa total massa lintas basis dan tanpa KPI otomatis.
        </p>
        <p className="mt-1 text-xs font-medium uppercase text-amber-700">{DEMO_BANNER}</p>
      </header>

      <DataQualityFilters
        filters={filters}
        onChange={setFilters}
        sites={siteOptions(data.sites)}
        stages={stageOptions(data.events)}
      />

      <DataQualitySummaryPanel summary={summary} />

      <section aria-label="Daftar dan detail record" className="space-y-4">
        {records.length === 0 ? (
          <DqEmptyState
            description="Tidak ada event/measurement yang cocok dengan filter demo saat ini. Ubah filter untuk melihat record lain."
          />
        ) : (
          <>
            <DataQualityRecordList
              records={records}
              selectedEventId={selectedEventId}
              onSelectEvent={(eventId) => setSelectedEventId(eventId === selectedEventId ? null : eventId)}
            />
            {selectedRecord && <DataQualityDetail record={selectedRecord} />}
          </>
        )}
      </section>

      <p className="text-xs text-slate-500">
        Semua angka berasal dari fixture sintetis di dalam aplikasi — bukan data lapangan, bukan klaim validasi, dan
        bukan integrasi resmi BGN/SPPG.
      </p>
    </div>
  );
}
