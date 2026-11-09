import { NavLink, Outlet, useLocation } from "react-router";
import { DEMO_BANNER, HELD_KPIS } from "@/domain/types";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/backend-operations", label: "Operasi P1 (kandidat)" },
  { to: "/backend-production", label: "Produksi (kandidat)" },
  { to: "/backend-distribution", label: "Distribusi (kandidat)" },
  { to: "/backend-insights", label: "Insight (kandidat)" },
  { to: "/", label: "Dashboard Mutu Data", end: true },
  { to: "/events", label: "Ledger Event" },
  { to: "/capture", label: "Capture Cepat" },
  { to: "/review", label: "Pratinjau Review & Audit" },
  { to: "/export", label: "Pratinjau Ekspor CSV" },
  { to: "/demo/data-quality", label: "Mutu Data (fixture)" },
  { to: "/demo/master-data", label: "Master Data (fixture)" },
  { to: "/demo/evidence", label: "Bukti (fixture)" },
  { to: "/demo/export", label: "Ekspor (belum tersedia)" },
  { to: "/backend-demo", label: "Detail Backend (read-only)" },
  { to: "/backend-demo/ledger", label: "Ledger Backend (live)" },
  { to: "/backend-demo/data-quality", label: "Mutu Data Backend (live)" },
  { to: "/backend-demo/master", label: "Master Data Backend (live)" },
  { to: "/backend-demo/evidence", label: "Bukti Backend (live)" },
  { to: "/backend-demo/review", label: "Review Backend (proposal)" },
  { to: "/backend-demo/export", label: "Ekspor Backend (CSV live)" },
  { to: "/backend-demo/capture", label: "Capture Backend (sintetis)" },
];

export default function AppLayout() {
  const location = useLocation();
  const backendMode = location.pathname.startsWith("/backend-demo");
  const p1Mode = ["/backend-operations", "/backend-production", "/backend-distribution", "/backend-insights"].includes(location.pathname);
  const backendCapture = location.pathname.startsWith("/backend-demo/capture");
  const fixtureMode = location.pathname.startsWith("/demo/");
  const exportUnavailable = location.pathname === "/demo/export";
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Lompat ke konten utama
      </a>

      <p
        role="note"
        aria-label="Peringatan data demo"
        className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900"
      >
        {DEMO_BANNER}
      </p>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold tracking-tight">
              FoodWaste Intelligence <span className="font-normal text-slate-500">— demo sintetis</span>
            </p>
            <p
              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
            >
              {p1Mode ? "Sumber: API backend P1/P2 kandidat sintetis" : backendCapture ? "Sumber: API backend sintetis (write demo)" : backendMode ? "Sumber: API backend (read-only)"
                : exportUnavailable ? "Ekspor backend: belum tersedia" : fixtureMode ? "Sumber: fixture sintetis (read-only)" : "Sumber: DemoStore in-memory"}
            </p>
          </div>
          <nav aria-label="Navigasi utama" className="overflow-x-auto">
            <ul className="flex min-w-max gap-1 pb-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    aria-current={location.pathname === item.to ? "page" : undefined}
                    className={({ isActive }) =>
                      cn(
                        "inline-flex items-center rounded-md px-3 py-2 text-sm font-medium min-h-11",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700",
                        isActive
                          ? "bg-sky-700 text-white"
                          : "text-slate-700 hover:bg-slate-100",
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs leading-relaxed text-slate-500 sm:px-6">
        <p>
          {backendCapture ? "Capture melalui API FastAPI/PostgreSQL sintetis lokal. Tidak ada fallback ke DemoStore."
            : backendMode ? "Halaman ini membaca API FastAPI/PostgreSQL lokal. Kegagalan API tidak diganti data in-memory."
            : exportUnavailable ? "Ekspor backend belum tersedia. Tidak ada permintaan ekspor atau unduhan berkas."
            : fixtureMode ? "Fixture sintetis terpisah dari API backend dan DemoStore; bukan data tersimpan atau fallback saat backend gagal. Filter bukan otorisasi."
            : "Sumber DemoStore in-memory: data sementara di browser, direset saat reload; tidak disimpan ke backend."}
          {" "}Demo sintetis terisolasi; backend memerlukan sesi sintetis HTTPS. Evidence storage belum tersedia; dashboard/ledger in-memory tidak memakai sesi backend.
        </p>
        <p>
          KPI {HELD_KPIS.join(", ")} berstatus HELD dan tidak dihitung di UI ini. Bukan sistem
          resmi BGN; tidak ada integrasi API pemerintah.
        </p>
      </footer>
    </div>
  );
}
