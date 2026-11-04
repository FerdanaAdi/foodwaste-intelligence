import { Link } from "react-router";
import { useDemoStore } from "@/data/demoStoreContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DEMO_BANNER } from "@/domain/types";

export default function DashboardPage() {
  const store = useDemoStore();
  const counts = store.qualityCounts();

  const tiles = [
    {
      label: "Jumlah event",
      value: counts.eventCount,
      hint: "Kejadian waste tercatat (fiktif)",
      to: "/events",
    },
    {
      label: "Jumlah pengukuran",
      value: counts.measurementCount,
      hint: "Measurement records, termasuk rasio berulang per event",
      to: "/events",
    },
    {
      label: "Records missing / tidak diukur",
      value: counts.missingCount,
      hint: "Missing ≠ nol; tidak dihitung sebagai 0 kg",
      to: "/events?status=missing",
    },
    {
      label: "Tandau review",
      value: counts.reviewFlagCount,
      hint: "Perlu review atau ditandai reviewer",
      to: "/review",
    },
    {
      label: "Event tanpa pengukuran",
      value: counts.unmeasuredEventCount,
      hint: "Event tercatat tapi belum ada measurement",
      to: "/events",
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard Mutu Data</h1>
        <p className="mt-1 text-sm text-slate-600">
          Hitungan status data dari store demo sintetis — tanpa total massa, tanpa KPI.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link
              to={tile.to}
              className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle>{tile.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold tabular-nums">{tile.value}</p>
                  <p className="mt-1 text-sm text-slate-500">{tile.hint}</p>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader>
          <CardTitle>Batas demo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>{DEMO_BANNER}</p>
          <p>
            Angka di atas adalah hitungan record demo (fiktif), bukan perkiraan food waste nyata.
            KPI OP-08, FI-02, dan NI-03 berstatus HELD dan tidak dihitung.
          </p>
          <p>Data in-memory direset saat halaman dimuat ulang; belum ada backend/PostgreSQL.</p>
        </CardContent>
      </Card>
    </div>
  );
}
