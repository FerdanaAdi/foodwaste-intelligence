import { NavLink, Outlet, useLocation } from "react-router";
import { DEMO_BANNER, HELD_KPIS } from "@/domain/types";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard Mutu Data", end: true },
  { to: "/events", label: "Ledger Event" },
  { to: "/capture", label: "Capture Cepat" },
  { to: "/review", label: "Pratinjau Review & Audit" },
  { to: "/export", label: "Pratinjau Ekspor CSV" },
];

export default function AppLayout() {
  const location = useLocation();
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
            <button
              type="button"
              disabled
              className="hidden cursor-not-allowed rounded border border-slate-200 px-2 py-1 text-xs text-slate-400 sm:block"
            >
              Backend belum terhubung
            </button>
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
          Data demo bersifat sementara di memori browser dan direset saat halaman dimuat ulang.
          Belum ada backend, PostgreSQL, autentikasi, maupun penyimpanan evidence yang terhubung.
        </p>
        <p>
          KPI {HELD_KPIS.join(", ")} berstatus HELD dan tidak dihitung di UI ini. Bukan sistem
          resmi BGN; tidak ada integrasi API pemerintah.
        </p>
      </footer>
    </div>
  );
}
