import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { useAuthStore } from '@/store/auth.store';
import Layout from '@/components/Layout';
import { RoleRoute, HomeRedirect } from '@/components/RoleRoute';
import LoginPage from '@/pages/auth/LoginPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import SpacesPage from '@/pages/spaces/SpacesPage';
import CrmPage from '@/pages/crm/CrmPage';
import ProposalsPage from '@/pages/proposals/ProposalsPage';
import ApprovalsPage from '@/pages/approvals/ApprovalsPage';
import ContractsPage from '@/pages/contracts/ContractsPage';
import FitoutPage from '@/pages/fitout/FitoutPage';
import FitoutSettingsPage from '@/pages/fitout/FitoutSettingsPage';
import FitoutDailyReportPage from '@/pages/fitout/FitoutDailyReportPage';
import FitoutGanttPage from '@/pages/fitout/FitoutGanttPage';
import FitoutDashboardPage from '@/pages/fitout/FitoutDashboardPage';
import TicketsPage from '@/pages/tickets/TicketsPage';
import SalesPage from '@/pages/sales/SalesPage';
import BillingPage from '@/pages/billing/BillingPage';
import SapPage from '@/pages/sap/SapPage';
import AiPage from '@/pages/ai/AiPage';
import ReportsPage from '@/pages/reports/ReportsPage';
import AnalyticsDashboard from '@/pages/analytics/AnalyticsDashboard';
import AdminPage from '@/pages/admin/AdminPage';
import TenantPortalPage from '@/pages/tenant-portal/TenantPortalPage';
import AnnouncementsPage from '@/pages/announcements/AnnouncementsPage';
import CrossMallDashboard from '@/pages/cross-mall/CrossMallDashboard';
import TenantsPage from '@/pages/tenants/TenantsPage';
import AuditLogPage from '@/pages/audit-log/AuditLogPage';
import DealPipelinePage from '@/pages/deals/DealPipelinePage';
import BookingsPage from '@/pages/bookings/BookingsPage';
import { Navigate } from 'react-router-dom';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token, isHydrated } = useAuthStore();
  if (!isHydrated) return null;
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppHydrator({ children }: { children: React.ReactNode }) {
  const { hydrate, isHydrated } = useAuthStore();
  useEffect(() => { hydrate(); }, []);
  if (!isHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppHydrator>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={<RoleRoute><DashboardPage /></RoleRoute>} />
          <Route path="spaces" element={<RoleRoute><SpacesPage /></RoleRoute>} />
          <Route path="crm" element={<RoleRoute><CrmPage /></RoleRoute>} />
          <Route path="deal-pipeline" element={<RoleRoute><DealPipelinePage /></RoleRoute>} />
          <Route path="tenants" element={<RoleRoute><TenantsPage /></RoleRoute>} />
          <Route path="bookings" element={<RoleRoute><BookingsPage /></RoleRoute>} />
          <Route path="proposals" element={<RoleRoute><ProposalsPage /></RoleRoute>} />
          <Route path="approvals" element={<RoleRoute><ApprovalsPage /></RoleRoute>} />
          <Route path="contracts" element={<RoleRoute><ContractsPage /></RoleRoute>} />
          <Route path="fitout" element={<RoleRoute><FitoutPage /></RoleRoute>} />
          <Route path="fitout/settings" element={<RoleRoute><FitoutSettingsPage /></RoleRoute>} />
          <Route path="fitout/:projectId/daily-report" element={<RoleRoute><FitoutDailyReportPage /></RoleRoute>} />
          <Route path="fitout/:projectId/gantt" element={<RoleRoute><FitoutGanttPage /></RoleRoute>} />
          <Route path="fitout/dashboard" element={<RoleRoute><FitoutDashboardPage /></RoleRoute>} />
          <Route path="tickets" element={<RoleRoute><TicketsPage /></RoleRoute>} />
          <Route path="sales" element={<RoleRoute><SalesPage /></RoleRoute>} />
          <Route path="billing" element={<RoleRoute><BillingPage /></RoleRoute>} />
          <Route path="sap" element={<RoleRoute><SapPage /></RoleRoute>} />
          <Route path="ai" element={<RoleRoute><AiPage /></RoleRoute>} />
          <Route path="reports" element={<RoleRoute><ReportsPage /></RoleRoute>} />
          <Route path="analytics" element={<RoleRoute><AnalyticsDashboard /></RoleRoute>} />
          <Route path="admin" element={<RoleRoute><AdminPage /></RoleRoute>} />
          <Route path="tenant-portal" element={<RoleRoute><TenantPortalPage /></RoleRoute>} />
          <Route path="announcements" element={<RoleRoute><AnnouncementsPage /></RoleRoute>} />
          <Route path="cross-mall" element={<RoleRoute><CrossMallDashboard /></RoleRoute>} />
          <Route path="audit-log" element={<RoleRoute><AuditLogPage /></RoleRoute>} />
        </Route>
      </Routes>
      </AppHydrator>
      <Toaster />
    </BrowserRouter>
  );
}
