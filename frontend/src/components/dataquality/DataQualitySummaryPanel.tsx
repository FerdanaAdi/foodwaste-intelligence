/**
 * Data-quality summary tiles (FR-007 / UI-02). Counts only — the
 * component renders no mass totals and no KPI values.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { OBSERVATION_STATUS_LABELS, VALIDATION_STATUS_LABELS } from "@/domain/types";
import type { DataQualitySummary } from "@/data/dataquality/summary";
import { DEMO_BANNER } from "@/domain/types";

interface TileSpec {
  label: string;
  value: number;
  hint: string;
}

function tilesFor(s: DataQualitySummary): TileSpec[] {
  return [
    {
      label: "Jumlah event",
      value: s.eventCount,
      hint: "Kejadian waste tercatat (identitas event, bukan pengukuran)",
    },
    {
      label: "Jumlah pengukuran",
      value: s.measurementCount,
      hint: "Record measurement 0..n per event; pengukuran ulang bukan event baru",
    },
    {
      label: "Records missing / tidak diukur",
      value: s.missingCount,
      hint: "Missing ≠ nol terukur; tidak dihitung sebagai 0 kg",
    },
    {
      label: "Record perlu tinjauan (needs attention)",
      value: s.needsAttentionCount,
      hint: "needs_review + flagged — memerlukan perhatian/validasi sebelum digunakan lebih lanjut",
    },
    {
      label: "Event tanpa pengukuran",
      value: s.unmeasuredEventCount,
      hint: "Event tetap tercatat tanpa nilai massa",
    },
    {
      label: "Pengukuran estimasi",
      value: s.estimatedCount,
      hint: "Estimasi ≠ hasil timbangan langsung",
    },
  ];
}

function ObservationBreakdown({ summary }: { summary: DataQualitySummary }) {
  const statuses = Object.entries(summary.observationCounts) as Array<
    [keyof typeof OBSERVATION_STATUS_LABELS, number]
  >;
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {statuses.map(([status, count]) => (
        <li key={status} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
          <span className="block text-xs uppercase text-slate-500">{OBSERVATION_STATUS_LABELS[status]}</span>
          <span aria-label={`${OBSERVATION_STATUS_LABELS[status]}: ${count} record`} className="text-lg font-semibold tabular-nums">
            {count}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DataQualitySummaryPanel({ summary }: { summary: DataQualitySummary }) {
  return (
    <section aria-label="Ringkasan mutu data (hitungan saja)" className="space-y-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tilesFor(summary).map((tile) => (
          <li key={tile.label}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>{tile.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{tile.value}</p>
                <p className="mt-1 text-xs text-slate-500">{tile.hint}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader>
          <CardTitle>Rincian status observasi</CardTitle>
        </CardHeader>
        <CardContent>
          <ObservationBreakdown summary={summary} />
          <p className="mt-3 text-xs text-slate-500">
            Status validasi saat ini: {VALIDATION_STATUS_LABELS.unvalidated} {summary.validationCounts.unvalidated} ·{" "}
            {VALIDATION_STATUS_LABELS.needs_review} {summary.validationCounts.needs_review} ·{" "}
            {VALIDATION_STATUS_LABELS.flagged} {summary.validationCounts.flagged}. Belum divalidasi bukan berarti
            disetujui.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-slate-500">
        {DEMO_BANNER} — hitungan status data saja: tanpa total massa, tanpa agregasi lintas basis, tanpa KPI otomatis.
        Angka di atas bukan temuan lapangan yang tervalidasi.
      </p>
    </section>
  );
}
