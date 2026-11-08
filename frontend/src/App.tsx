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
import BackendAuthBoundary from "./components/layout/BackendAuthBoundary";

export default function App() {
  const store = useMemo(() => createDemoStore(), []);
  return (
    <DemoStoreContext.Provider value={store}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route element={<BackendAuthBoundary />}>
            <Route path="/backend-demo" element={<BackendEventDetailPage />} />
            <Route path="/backend-demo/capture" element={<BackendCapturePage />} />
            <Route path="/backend-demo/events/:eventId" element={<BackendEventDetailPage />} />
          </Route>
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
