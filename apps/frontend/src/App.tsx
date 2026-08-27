import { Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/toaster";
import { useAuthStore } from "@/store/auth.store";
import Layout from "@/components/Layout";
import { RoleRoute, HomeRedirect } from "@/components/RoleRoute";
import { Navigate } from "react-router-dom";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { ContentLoading } from "@/components/ui/content-loading";
import {
  LoginPage,
  ActivateInvitationPage,
  DashboardPage,
  SpacesPage,
  CrmPage,
  CrmOverviewPage,
  ProposalsPage,
  ApprovalsPage,
  ContractsPage,
  ServiceContractsPage,
  InventoryPage,
  WorkOrdersPage,
  PatrolPage,
  ParkingPage,
  FitoutPage,
  FitoutApprovalsPage,
  FitoutSettingsPage,
  FitoutDailyReportPage,
  FitoutGanttPage,
  FitoutDashboardPage,
  TicketsPage,
  SalesPage,
  BillingPage,
  BillingAddInPage,
  SapPage,
  AiPage,
  CodebaseChatPage,
  ReportsPage,
  AnalyticsDashboard,
  AdminPage,
  TenantPortalPage,
  AnnouncementsPage,
  CrossMallDashboard,
  TenantsPage,
  AuditLogPage,
  DealPipelinePage,
  BookingsPage,
  SalesPipelineStatsPage,
  ParkingReportPage,
  ParkingTransactionPage,
  ProfilePage,
  NotFoundPage,
} from "@/routes/lazyPages";

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
  if (!isHydrated) return <ContentLoading />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AppHydrator>
            <Suspense fallback={<ContentLoading />}>
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
                    path="fitout-approvals"
                    element={
                      <RoleRoute>
                        <FitoutApprovalsPage />
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
