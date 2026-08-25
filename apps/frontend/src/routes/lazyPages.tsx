import { lazy } from "react";

export const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
export const ActivateInvitationPage = lazy(
  () => import("@/pages/auth/ActivateInvitationPage"),
);
export const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
export const SpacesPage = lazy(() => import("@/pages/spaces/SpacesPage"));
export const CrmPage = lazy(() => import("@/pages/crm/CrmPage"));
export const CrmOverviewPage = lazy(() => import("@/pages/crm/CrmOverviewPage"));
export const ProposalsPage = lazy(() => import("@/pages/proposals/ProposalsPage"));
export const ApprovalsPage = lazy(() => import("@/pages/approvals/ApprovalsPage"));
export const ContractsPage = lazy(() => import("@/pages/contracts/ContractsPage"));
export const ServiceContractsPage = lazy(
  () => import("@/pages/service-contracts/ServiceContractsPage"),
);
export const InventoryPage = lazy(() => import("@/pages/inventory/InventoryPage"));
export const WorkOrdersPage = lazy(() => import("@/pages/work-orders/WorkOrdersPage"));
export const PatrolPage = lazy(() => import("@/pages/patrol/PatrolPage"));
export const ParkingPage = lazy(() => import("@/pages/parking/ParkingPage"));
export const FitoutPage = lazy(() => import("@/pages/fitout/FitoutPage"));
export const FitoutApprovalsPage = lazy(
  () => import("@/pages/fitout/FitoutApprovalsPage"),
);
export const FitoutSettingsPage = lazy(
  () => import("@/pages/fitout/FitoutSettingsPage"),
);
export const FitoutDailyReportPage = lazy(
  () => import("@/pages/fitout/FitoutDailyReportPage"),
);
export const FitoutGanttPage = lazy(() => import("@/pages/fitout/FitoutGanttPage"));
export const FitoutDashboardPage = lazy(
  () => import("@/pages/fitout/FitoutDashboardPage"),
);
export const TicketsPage = lazy(() => import("@/pages/tickets/TicketsPage"));
export const SalesPage = lazy(() => import("@/pages/sales/SalesPage"));
export const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
export const BillingAddInPage = lazy(
  () => import("@/pages/billing-addin/BillingAddInPage"),
);
export const SapPage = lazy(() => import("@/pages/sap/SapPage"));
export const AiPage = lazy(() => import("@/pages/ai/AiPage"));
export const CodebaseChatPage = lazy(() => import("@/pages/ai/CodebaseChatPage"));
export const ReportsPage = lazy(() => import("@/pages/reports/ReportsPage"));
export const AnalyticsDashboard = lazy(
  () => import("@/pages/analytics/AnalyticsDashboard"),
);
export const AdminPage = lazy(() => import("@/pages/admin/AdminPage"));
export const TenantPortalPage = lazy(
  () => import("@/pages/tenant-portal/TenantPortalPage"),
);
export const AnnouncementsPage = lazy(
  () => import("@/pages/announcements/AnnouncementsPage"),
);
export const CrossMallDashboard = lazy(
  () => import("@/pages/cross-mall/CrossMallDashboard"),
);
export const TenantsPage = lazy(() => import("@/pages/tenants/TenantsPage"));
export const AuditLogPage = lazy(() => import("@/pages/audit-log/AuditLogPage"));
export const DealPipelinePage = lazy(() => import("@/pages/deals/DealPipelinePage"));
export const BookingsPage = lazy(() => import("@/pages/bookings/BookingsPage"));
export const SalesPipelineStatsPage = lazy(
  () => import("@/pages/pipeline-stats/SalesPipelineStatsPage"),
);
export const ParkingReportPage = lazy(
  () => import("@/pages/parking-dashboard/ParkingReportPage"),
);
export const ParkingTransactionPage = lazy(
  () => import("@/pages/parking-dashboard/ParkingTransactionPage"),
);
export const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));
export const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));
