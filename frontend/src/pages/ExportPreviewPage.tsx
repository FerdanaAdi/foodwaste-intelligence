import { useMemo, useState } from "react";
import { useDemoStore } from "@/data/demoStoreContext";
import { buildCsv, buildExportRows, downloadCsv } from "@/data/export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function ExportPreviewPage() {
  const store = useDemoStore();
  const rows = useMemo(() => buildExportRows(store), [store]);
  const csv = useMemo(() => buildCsv(store), [store]);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Pratinjau Ekspor CSV</h1>
        <p className="mt-1 text-sm text-slate-600">
          Baris demo sintetis yang traceable: event ID, measurement ID, unit, mass basis,
          metode, dan provenance. <strong>Tidak ada baris total</strong> — agregasi antar
          mass basis tidak dilakukan karena tidak terdukung secara metodologis.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => downloadCsv(store)}>Unduh CSV demo</Button>
        <Button variant="secondary" onClick={handleCopy}>
          {copied ? "Tersalin ✓" : "Salin isi CSV"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} baris measurement (fiktif)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <caption className="sr-only">Pratinjau baris ekspor CSV demo</caption>
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2">event_id</th>
                  <th scope="col" className="px-3 py-2">measurement_id</th>
                  <th scope="col" className="px-3 py-2">unit</th>
                  <th scope="col" className="px-3 py-2">mass_basis</th>
                  <th scope="col" className="px-3 py-2">status</th>
                  <th scope="col" className="px-3 py-2">estimation</th>
                  <th scope="col" className="px-3 py-2">net</th>
                  <th scope="col" className="px-3 py-2">method</th>
                  <th scope="col" className="px-3 py-2">provenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.measurementId}>
                    <td className="px-3 py-2 font-mono">{r.eventId}</td>
                    <td className="px-3 py-2 font-mono">{r.measurementId}</td>
                    <td className="px-3 py-2">{r.unit}</td>
                    <td className="px-3 py-2">{r.massBasis}</td>
                    <td className="px-3 py-2">{r.observationStatus}</td>
                    <td className="px-3 py-2">{r.estimationStatus}</td>
                    <td className="px-3 py-2 tabular-nums">{r.net}</td>
                    <td className="px-3 py-2">{r.method}</td>
                    <td className="px-3 py-2">{r.provenance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Isi CSV (pratinjau teks)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre
            aria-label="Isi pratinjau CSV"
            className="max-h-72 overflow-auto rounded bg-slate-900 p-4 text-xs leading-relaxed text-slate-100"
          >
            {csv}
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            Data in-memory; hasil unduhan adalah snapshot demo saat ini dan direset saat reload.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
