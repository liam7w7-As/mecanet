import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import PublicRoute from './components/layout/PublicRoute';
import { APP_ROUTES } from './lib/route-access';
import { getSessionHomePath } from './lib/session-navigation';
import LoginPage from './pages/auth/LoginPage';
import CatalogPage from './pages/catalog/CatalogPage';
import ClientsPage from './pages/clients/ClientsPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import FinancePage from './pages/finance/FinancePage';
import ForbiddenPage from './pages/ForbiddenPage';
import NotFoundPage from './pages/NotFoundPage';
import PurchaseCreatePage from './pages/purchases/PurchaseCreatePage';
import PurchaseDetailPage from './pages/purchases/PurchaseDetailPage';
import PurchasesPage from './pages/purchases/PurchasesPage';
import QuotationCreatePage from './pages/quotations/QuotationCreatePage';
import QuotationDetailPage from './pages/quotations/QuotationDetailPage';
import QuotationsPage from './pages/quotations/QuotationsPage';
import ReportsPage from './pages/reports/ReportsPage';
import SettingsPage from './pages/settings/SettingsPage';
import UsersPage from './pages/users/UsersPage';
import VehicleDetailPage from './pages/vehicles/VehicleDetailPage';
import VehiclesPage from './pages/vehicles/VehiclesPage';
import WarehousesPage from './pages/warehouses/WarehousesPage';
import MyWorkOrdersPage from './pages/work-orders/MyWorkOrdersPage';
import WorkOrderCreatePage from './pages/work-orders/WorkOrderCreatePage';
import WorkOrderDetailPage from './pages/work-orders/WorkOrderDetailPage';
import WorkOrdersPage from './pages/work-orders/WorkOrdersPage';
import WorkshopDailyReportPage from './pages/work-orders/WorkshopDailyReportPage';
import { useAuthStore } from './stores/auth.store';

const HomeRedirect = () => {
  const user = useAuthStore((state) => state.user);
  return <Navigate to={getSessionHomePath(user)} replace />;
};

const DashboardEntry = () => {
  const user = useAuthStore((state) => state.user);
  return user?.role === 'mecanico' ? <HomeRedirect /> : <DashboardPage />;
};

const WorksheetEntry = () => {
  const { id } = useParams();
  return <Navigate to={`/work-orders?manage=${Number(id)}`} replace />;
};

export const App = () => (
  <Routes>
    <Route element={<PublicRoute />}>
      <Route path="/login" element={<LoginPage />} />
    </Route>

    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route index element={<HomeRedirect />} />
        <Route
          path={APP_ROUTES.dashboard.path}
          element={
            <ProtectedRoute access={APP_ROUTES.dashboard}>
              <DashboardEntry />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.workOrders.path}
          element={
            <ProtectedRoute access={APP_ROUTES.workOrders}>
              <WorkOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.workOrderCreate.path}
          element={
            <ProtectedRoute access={APP_ROUTES.workOrderCreate}>
              <WorkOrderCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.myWorkOrders.path}
          element={
            <ProtectedRoute access={APP_ROUTES.myWorkOrders}>
              <MyWorkOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.dailyReport.path}
          element={
            <ProtectedRoute access={APP_ROUTES.dailyReport}>
              <WorkshopDailyReportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.worksheet.path}
          element={
            <ProtectedRoute access={APP_ROUTES.worksheet}>
              <WorksheetEntry />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.workOrderDetail.path}
          element={
            <ProtectedRoute access={APP_ROUTES.workOrderDetail}>
              <WorkOrderDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.quotations.path}
          element={
            <ProtectedRoute access={APP_ROUTES.quotations}>
              <QuotationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.quotationCreate.path}
          element={
            <ProtectedRoute access={APP_ROUTES.quotationCreate}>
              <QuotationCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.quotationConvert.path}
          element={
            <ProtectedRoute access={APP_ROUTES.quotationConvert}>
              <WorkOrderCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.quotationDetail.path}
          element={
            <ProtectedRoute access={APP_ROUTES.quotationDetail}>
              <QuotationDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.purchases.path}
          element={
            <ProtectedRoute access={APP_ROUTES.purchases}>
              <PurchasesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.purchaseCreate.path}
          element={
            <ProtectedRoute access={APP_ROUTES.purchaseCreate}>
              <PurchaseCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.purchaseDetail.path}
          element={
            <ProtectedRoute access={APP_ROUTES.purchaseDetail}>
              <PurchaseDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.finance.path}
          element={
            <ProtectedRoute access={APP_ROUTES.finance}>
              <FinancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.reports.path}
          element={
            <ProtectedRoute access={APP_ROUTES.reports}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.clients.path}
          element={
            <ProtectedRoute access={APP_ROUTES.clients}>
              <ClientsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.vehicles.path}
          element={
            <ProtectedRoute access={APP_ROUTES.vehicles}>
              <VehiclesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.vehicleDetail.path}
          element={
            <ProtectedRoute access={APP_ROUTES.vehicleDetail}>
              <VehicleDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.catalog.path}
          element={
            <ProtectedRoute access={APP_ROUTES.catalog}>
              <CatalogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.warehouses.path}
          element={
            <ProtectedRoute access={APP_ROUTES.warehouses}>
              <WarehousesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.users.path}
          element={
            <ProtectedRoute access={APP_ROUTES.users}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_ROUTES.settings.path}
          element={
            <ProtectedRoute access={APP_ROUTES.settings}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Route>
  </Routes>
);

export default App;
