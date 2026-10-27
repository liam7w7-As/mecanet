import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import PublicRoute from './components/layout/PublicRoute';
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
import WorkOrderWorksheetPage from './pages/work-orders/WorkOrderWorksheetPage';
import WorkshopDailyReportPage from './pages/work-orders/WorkshopDailyReportPage';

export const App = () => (
  <Routes>
    <Route element={<PublicRoute />}>
      <Route path="/login" element={<LoginPage />} />
    </Route>

    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute
              requiredAnyPermission={[
                { modulo: 'taller', accion: 'read' },
                { modulo: 'comercial', accion: 'read' },
              ]}
            >
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/work-orders"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'taller', accion: 'read' }]}>
              <WorkOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/work-orders/new"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'taller', accion: 'create' }]}>
              <WorkOrderCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/work-orders/mine"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'taller', accion: 'read' }]}>
              <MyWorkOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/work-orders/daily-report"
          element={
            <ProtectedRoute allowedRoles={['desarrollador', 'admin', 'jefe']}>
              <WorkshopDailyReportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/work-orders/:id/ficha"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'taller', accion: 'read' }]}>
              <WorkOrderWorksheetPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/work-orders/:id"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'taller', accion: 'read' }]}>
              <WorkOrderDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotations"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'comercial', accion: 'read' }]}>
              <QuotationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotations/new"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'comercial', accion: 'create' }]}>
              <QuotationCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotations/:quotationId/convert-to-ot"
          element={
            <ProtectedRoute requiredAnyPermission={[
              { modulo: 'comercial', accion: 'update' },
              { modulo: 'taller', accion: 'create' },
            ]}>
              <WorkOrderCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotations/:id"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'comercial', accion: 'read' }]}>
              <QuotationDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchases"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'compras', accion: 'read' }]}>
              <PurchasesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchases/new"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'compras', accion: 'create' }]}>
              <PurchaseCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchases/:id"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'compras', accion: 'read' }]}>
              <PurchaseDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/finance"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'finanzas', accion: 'read' }]}>
              <FinancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute requiredAnyPermission={[
              { modulo: 'finanzas', accion: 'read' },
              { modulo: 'comercial', accion: 'read' },
              { modulo: 'taller', accion: 'read' },
              { modulo: 'almacen', accion: 'read' },
              { modulo: 'admin', accion: 'read' },
            ]}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients"
          element={
            <ProtectedRoute
              requiredAnyPermission={[
                { modulo: 'comercial', accion: 'read' },
                { modulo: 'taller', accion: 'read' },
              ]}
            >
              <ClientsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vehicles"
          element={
            <ProtectedRoute
              requiredAnyPermission={[
                { modulo: 'taller', accion: 'read' },
                { modulo: 'comercial', accion: 'read' },
                { modulo: 'flota', accion: 'read' },
              ]}
            >
              <VehiclesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vehicles/:id"
          element={
            <ProtectedRoute
              requiredAnyPermission={[
                { modulo: 'taller', accion: 'read' },
                { modulo: 'comercial', accion: 'read' },
              ]}
            >
              <VehicleDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalog"
          element={
            <ProtectedRoute
              requiredAnyPermission={[
                { modulo: 'taller', accion: 'read' },
                { modulo: 'comercial', accion: 'read' },
              ]}
            >
              <CatalogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/warehouses"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'almacen', accion: 'read' }]}>
              <WarehousesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'admin', accion: 'read' }]}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'admin', accion: 'read' }]}>
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
