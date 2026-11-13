import { useMemo } from "react";
import { Route, Routes } from "react-router";
import { DemoStoreContext } from "./data/demoStoreContext";
import { createDemoStore } from "./data/demoStore";
import AppLayout from "./components/layout/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import EventLedgerPage from "./pages/EventLedgerPage";
import EventDetailPage from "./pages/EventDetailPage";
import QuickCapturePage from "./pages/QuickCapturePage";
import ReviewAuditPage from "./pages/ReviewAuditPage";
import ExportPreviewPage from "./pages/ExportPreviewPage";
import BackendEventDetailPage from "./pages/BackendEventDetailPage";
import BackendCapturePage from "./pages/BackendCapturePage";
import BackendLedgerPage from "./pages/BackendLedgerPage";
import BackendDataQualityPage from "./pages/BackendDataQualityPage";
import BackendMembershipPage from "./pages/BackendMembershipPage";
import BackendMasterPage from "./pages/BackendMasterPage";
import BackendEvidencePage from "./pages/BackendEvidencePage";
import BackendReviewPage from "./pages/BackendReviewPage";
import BackendExportLivePage from "./pages/BackendExportLivePage";
import BackendOperationsPage from "./pages/BackendOperationsPage";
import BackendProductionPage from "./pages/BackendProductionPage";
import BackendDistributionPage from "./pages/BackendDistributionPage";
import BackendInsightsPage from "./pages/BackendInsightsPage";
import BackendAuthBoundary from "./components/layout/BackendAuthBoundary";
import { DataQualityDashboard } from "./components/dataquality/DataQualityDashboard";
import { dqFixtures } from "./data/dataquality/fixtures";
import { ReferenceCatalog } from "./components/referencedata/ReferenceCatalog";
import { referenceFixtures } from "./data/referencedata/fixtures";
import { EvidencePanel } from "./components/evidence/EvidencePanel";
import { evidenceFixtures } from "./data/evidence/fixtures";

export default function App() {
  const store = useMemo(() => createDemoStore(), []);
  return (
    <DemoStoreContext.Provider value={store}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route element={<BackendAuthBoundary />}>
            <Route path="/backend-demo" element={<BackendEventDetailPage />} />
            <Route path="/backend-demo/ledger" element={<BackendLedgerPage />} />
            <Route path="/backend-demo/data-quality" element={<BackendDataQualityPage />} />
            <Route path="/backend-demo/memberships" element={<BackendMembershipPage />} />
            <Route path="/backend-demo/master" element={<BackendMasterPage />} />
            <Route path="/backend-demo/evidence" element={<BackendEvidencePage />} />
            <Route path="/backend-demo/review" element={<BackendReviewPage />} />
            <Route path="/backend-demo/export" element={<BackendExportLivePage />} />
            <Route path="/backend-demo/capture" element={<BackendCapturePage />} />
            <Route path="/backend-demo/events/:eventId" element={<BackendEventDetailPage />} />
            <Route path="/backend-operations" element={<BackendOperationsPage />} />
            <Route path="/backend-production" element={<BackendProductionPage />} />
            <Route path="/backend-distribution" element={<BackendDistributionPage />} />
            <Route path="/backend-insights" element={<BackendInsightsPage />} />
          </Route>
          <Route path="/demo/data-quality" element={<DataQualityDashboard data={dqFixtures} />} />
          <Route path="/demo/master-data" element={<ReferenceCatalog items={referenceFixtures} />} />
          <Route path="/demo/evidence" element={
            <div className="space-y-6">
              <h1 className="text-2xl font-bold">Bukti &amp; provenance — fixture sintetis</h1>
              <p>Metadata contoh saja; bukan bukti backend atau ketersediaan berkas nyata. Verifikasi bukti bukan persetujuan pengukuran.</p>
              {evidenceFixtures.filter((item, index, items) => items.findIndex((other) =>
                other.targetKind === item.targetKind && other.targetId === item.targetId) === index).map((target) => (
                <EvidencePanel key={`${target.targetKind}:${target.targetId}`}
                  targetKind={target.targetKind} targetId={target.targetId}
                  items={evidenceFixtures.filter((item) => item.targetKind === target.targetKind && item.targetId === target.targetId)} />
              ))}
            </div>
          } />
          <Route path="/demo/export" element={
            <section role="status" className="space-y-3 rounded border bg-white p-4">
              <h1 className="text-2xl font-bold">Ekspor CSV — belum tersedia</h1>
              <p>Kandidat Export UI dan serializer tersedia, tetapi belum ada layanan ekspor backend terotorisasi. Halaman ini tidak meminta atau mengunduh berkas.</p>
              <p>authorization_enforced=false; pemeriksaan integritas bukan izin akses. Simulasi unduhan kandidat tidak diaktifkan di aplikasi ini.</p>
              <p>Kontrak izin, audit, revocation dan delivery tetap OPEN; XLSX belum didukung.</p>
            </section>
          } />
          <Route path="/" element={<DashboardPage />} />
          <Route path="/events" element={<EventLedgerPage />} />
          <Route path="/events/:eventId" element={<EventDetailPage />} />
          <Route path="/capture" element={<QuickCapturePage />} />
          <Route path="/review" element={<ReviewAuditPage />} />
          <Route path="/export" element={<ExportPreviewPage />} />
        </Route>
      </Routes>
    </DemoStoreContext.Provider>
  );
}
