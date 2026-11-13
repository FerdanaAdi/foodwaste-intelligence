import { NavLink, Outlet, useLocation } from "react-router";
import { DEMO_BANNER, HELD_KPIS } from "@/domain/types";
const OTHER_ITEMS = [
  { to: "/backend-demo/memberships", label: "Administrasi Akses Lokasi" },
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

  { to: "/backend-demo/data-quality", label: "Mutu Data Backend (live)" },
  { to: "/backend-demo/master", label: "Master Data Backend (live)" },
  { to: "/backend-demo/evidence", label: "Bukti Backend (live)" },

  { to: "/backend-demo/export", label: "Ekspor Backend (CSV live)" },

];

const MAIN_ITEMS = [
 { to: '/backend-demo/capture', label: 'Catat Kejadian', symbol: '＋' },
 { to: '/backend-demo/ledger', label: 'Lihat Riwayat', symbol: '≡' },
 { to: '/backend-demo/review', label: 'Ajukan Pemeriksaan', symbol: '✓' },
 { to: '/backend-demo/evidence', label: 'Bukti metadata', symbol: '◇' },
];
export default function AppLayout() {
 const { pathname } = useLocation();
 const backendMode = pathname.startsWith('/backend-demo') || ['/backend-operations','/backend-production','/backend-distribution','/backend-insights'].includes(pathname);
 const fixtureMode = pathname.startsWith('/demo/');
 return <div className="fwi-app">
  <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Lompat ke konten utama</a>
  <aside className="fwi-sidebar"><div className="fwi-brand"><span aria-hidden="true">♧</span><div><strong>FWI.</strong><small>FOODWASTE INTELLIGENCE</small></div></div>
   <div className="fwi-nav-label">RUANG PENCATATAN</div><nav aria-label="Navigasi utama" className="fwi-primary-nav">{MAIN_ITEMS.map(item => <NavLink key={item.to} to={item.to}><span aria-hidden="true">{item.symbol}</span>　{item.label}</NavLink>)}</nav>
   <details><summary>Operasional, analisis &amp; sumber lain</summary><nav aria-label="Modul lainnya">{OTHER_ITEMS.map(item => <NavLink key={item.to} to={item.to} end={'end' in item && item.end}>{item.label}</NavLink>)}</nav></details>
   <div className="fwi-held">Catatan yang jelas.<br/>Keputusan yang dapat ditelusuri.<br/><br/>KPI {HELD_KPIS.join(', ')} tetap HELD.</div>
  </aside>
  <div className="fwi-shell"><header className="fwi-topbar"><strong>Ruang pencatatan / FWI</strong><span className="fwi-source">{backendMode?'Sumber: API backend sintetis':fixtureMode?'Sumber: fixture sintetis (read-only)':'Sumber: DemoStore in-memory'}</span></header>
   <p role="note" aria-label="Peringatan data demo" className="fwi-banner">{DEMO_BANNER} · Engineering candidate, bukan produksi</p>
   <main id="main-content" className="fwi-main"><Outlet /></main>
   <footer className="fwi-footer"><p>{backendMode?'API FastAPI/PostgreSQL lokal berizin. Tidak ada fallback ke DemoStore.':fixtureMode?'Fixture sintetis bukan data backend tersimpan. Filter bukan otorisasi.':'Data sementara DemoStore, direset saat reload; tidak disimpan ke backend.'}</p><p>Evidence metadata bukan berkas fisik. Usulan koreksi belum diterapkan. KPI {HELD_KPIS.join(', ')} tetap HELD tanpa angka. Bukan sistem resmi BGN.</p></footer>
  </div>
 </div>;
}
