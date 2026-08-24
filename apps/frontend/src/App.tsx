import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/toaster";
import { useAuthStore } from "@/store/auth.store";
import Layout from "@/components/Layout";
import { RoleRoute, HomeRedirect } from "@/components/RoleRoute";
import { Navigate } from "react-router-dom";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const ActivateInvitationPage = lazy(() => import("@/pages/auth/ActivateInvitationPage"));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const SpacesPage = lazy(() => import("@/pages/spaces/SpacesPage"));
const CrmPage = lazy(() => import("@/pages/crm/CrmPage"));
const CrmOverviewPage = lazy(() => import("@/pages/crm/CrmOverviewPage"));
const ProposalsPage = lazy(() => import("@/pages/proposals/ProposalsPage"));
const ApprovalsPage = lazy(() => import("@/pages/approvals/ApprovalsPage"));
const ContractsPage = lazy(() => import("@/pages/contracts/ContractsPage"));
const ServiceContractsPage = lazy(
  () => import("@/pages/service-contracts/ServiceContractsPage"),
);
const InventoryPage = lazy(() => import("@/pages/inventory/InventoryPage"));
const WorkOrdersPage = lazy(() => import("@/pages/work-orders/WorkOrdersPage"));
const PatrolPage = lazy(() => import("@/pages/patrol/PatrolPage"));
const ParkingPage = lazy(() => import("@/pages/parking/ParkingPage"));
const FitoutPage = lazy(() => import("@/pages/fitout/FitoutPage"));
const FitoutSettingsPage = lazy(
  () => import("@/pages/fitout/FitoutSettingsPage"),
);
const FitoutDailyReportPage = lazy(
  () => import("@/pages/fitout/FitoutDailyReportPage"),
);
const FitoutGanttPage = lazy(() => import("@/pages/fitout/FitoutGanttPage"));
const FitoutDashboardPage = lazy(
  () => import("@/pages/fitout/FitoutDashboardPage"),
);
const TicketsPage = lazy(() => import("@/pages/tickets/TicketsPage"));
const SalesPage = lazy(() => import("@/pages/sales/SalesPage"));
const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
const BillingAddInPage = lazy(() => import("@/pages/billing-addin/BillingAddInPage"));
const SapPage = lazy(() => import("@/pages/sap/SapPage"));
const AiPage = lazy(() => import("@/pages/ai/AiPage"));
const CodebaseChatPage = lazy(() => import("@/pages/ai/CodebaseChatPage"));
const ReportsPage = lazy(() => import("@/pages/reports/ReportsPage"));
const AnalyticsDashboard = lazy(
  () => import("@/pages/analytics/AnalyticsDashboard"),
);
const AdminPage = lazy(() => import("@/pages/admin/AdminPage"));
const TenantPortalPage = lazy(
  () => import("@/pages/tenant-portal/TenantPortalPage"),
);
const AnnouncementsPage = lazy(
  () => import("@/pages/announcements/AnnouncementsPage"),
);
const CrossMallDashboard = lazy(
  () => import("@/pages/cross-mall/CrossMallDashboard"),
);
const TenantsPage = lazy(() => import("@/pages/tenants/TenantsPage"));
const AuditLogPage = lazy(() => import("@/pages/audit-log/AuditLogPage"));
const DealPipelinePage = lazy(() => import("@/pages/deals/DealPipelinePage"));
const BookingsPage = lazy(() => import("@/pages/bookings/BookingsPage"));
const SalesPipelineStatsPage = lazy(
  () => import("@/pages/pipeline-stats/SalesPipelineStatsPage"),
);
const ParkingReportPage = lazy(
  () => import("@/pages/parking-dashboard/ParkingReportPage"),
);
const ParkingTransactionPage = lazy(
  () => import("@/pages/parking-dashboard/ParkingTransactionPage"),
);
const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

function AppLoading() {
  return (
    <div
      className="flex min-h-[50vh] items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-700" />
      <span className="sr-only">Đang tải nội dung</span>
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token, isHydrated } = useAuthStore();
  if (!isHydrated) return null;
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppHydrator({ children }: { children: React.ReactNode }) {
  const { hydrate, isHydrated } = useAuthStore();
  useEffect(() => {
    hydrate();
  }, []);
  if (!isHydrated) return <AppLoading />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AppHydrator>
            <Suspense fallback={<AppLoading />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/activate" element={<ActivateInvitationPage />} />
                <Route
                  path="/"
                  element={
                    <PrivateRoute>
                      <Layout />
                    </PrivateRoute>
                  }
                >
                  <Route index element={<HomeRedirect />} />
                  <Route
                    path="dashboard"
                    element={
                      <RoleRoute>
                        <DashboardPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="spaces"
                    element={
                      <RoleRoute>
                        <SpacesPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="crm"
                    element={
                      <RoleRoute>
                        <CrmPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="crm-overview"
                    element={
                      <RoleRoute>
                        <CrmOverviewPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="deal-pipeline"
                    element={
                      <RoleRoute>
                        <DealPipelinePage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="tenants"
                    element={
                      <RoleRoute>
                        <TenantsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="bookings"
                    element={
                      <RoleRoute>
                        <BookingsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="pipeline-stats"
                    element={
                      <RoleRoute>
                        <SalesPipelineStatsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="proposals"
                    element={
                      <RoleRoute>
                        <ProposalsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="approvals"
                    element={
                      <RoleRoute>
                        <ApprovalsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="contracts"
                    element={
                      <RoleRoute>
                        <ContractsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="service-contracts"
                    element={
                      <RoleRoute>
                        <ServiceContractsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="inventory"
                    element={
                      <RoleRoute>
                        <InventoryPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="work-orders"
                    element={
                      <RoleRoute>
                        <WorkOrdersPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="patrol"
                    element={
                      <RoleRoute>
                        <PatrolPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="parking"
                    element={
                      <RoleRoute>
                        <ParkingPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="fitout"
                    element={
                      <RoleRoute>
                        <FitoutPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="fitout/settings"
                    element={
                      <RoleRoute>
                        <FitoutSettingsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="fitout/:projectId/daily-report"
                    element={
                      <RoleRoute>
                        <FitoutDailyReportPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="fitout/:projectId/gantt"
                    element={
                      <RoleRoute>
                        <FitoutGanttPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="fitout/dashboard"
                    element={
                      <RoleRoute>
                        <FitoutDashboardPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="tickets"
                    element={
                      <RoleRoute>
                        <TicketsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="sales"
                    element={
                      <RoleRoute>
                        <SalesPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="billing"
                    element={
                      <RoleRoute>
                        <BillingPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="billing-addin"
                    element={
                      <RoleRoute>
                        <BillingAddInPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="sap"
                    element={
                      <RoleRoute>
                        <SapPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="ai"
                    element={
                      <RoleRoute>
                        <AiPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="ai/codebase"
                    element={
                      <RoleRoute>
                        <CodebaseChatPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="reports"
                    element={
                      <RoleRoute>
                        <ReportsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="analytics"
                    element={
                      <RoleRoute>
                        <AnalyticsDashboard />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="admin"
                    element={
                      <RoleRoute>
                        <AdminPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="tenant-portal"
                    element={
                      <RoleRoute>
                        <TenantPortalPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="announcements"
                    element={
                      <RoleRoute>
                        <AnnouncementsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="cross-mall"
                    element={
                      <RoleRoute>
                        <CrossMallDashboard />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="audit-log"
                    element={
                      <RoleRoute>
                        <AuditLogPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="parking-report"
                    element={
                      <RoleRoute>
                        <ParkingReportPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="parking-transaction"
                    element={
                      <RoleRoute>
                        <ParkingTransactionPage />
                      </RoleRoute>
                    }
                  />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </AppHydrator>
          <Toaster />
        </BrowserRouter>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
