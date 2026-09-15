import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import PublicRoute from './components/layout/PublicRoute';
import LoginPage from './pages/auth/LoginPage';
import CatalogPage from './pages/catalog/CatalogPage';
import ClientsPage from './pages/clients/ClientsPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import ForbiddenPage from './pages/ForbiddenPage';
import NotFoundPage from './pages/NotFoundPage';
import QuotationCreatePage from './pages/quotations/QuotationCreatePage';
import QuotationDetailPage from './pages/quotations/QuotationDetailPage';
import QuotationsPage from './pages/quotations/QuotationsPage';
import UsersPage from './pages/users/UsersPage';
import VehiclesPage from './pages/vehicles/VehiclesPage';
import WorkOrderCreatePage from './pages/work-orders/WorkOrderCreatePage';
import WorkOrderDetailPage from './pages/work-orders/WorkOrderDetailPage';
import WorkOrdersPage from './pages/work-orders/WorkOrdersPage';

export const App = () => (
  <Routes>
    <Route element={<PublicRoute />}>
      <Route path="/login" element={<LoginPage />} />
    </Route>

    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ProtectedRoute requiredAnyPermission={[{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }]}><DashboardPage /></ProtectedRoute>} />
        <Route path="/work-orders" element={<ProtectedRoute requiredAnyPermission={[{ modulo: 'taller', accion: 'read' }]}><WorkOrdersPage /></ProtectedRoute>} />
        <Route path="/work-orders/new" element={<ProtectedRoute requiredAnyPermission={[{ modulo: 'taller', accion: 'create' }]}><WorkOrderCreatePage /></ProtectedRoute>} />
        <Route path="/work-orders/:id" element={<ProtectedRoute requiredAnyPermission={[{ modulo: 'taller', accion: 'read' }]}><WorkOrderDetailPage /></ProtectedRoute>} />
        <Route path="/quotations" element={<ProtectedRoute requiredAnyPermission={[{ modulo: 'comercial', accion: 'read' }]}><QuotationsPage /></ProtectedRoute>} />
        <Route path="/quotations/new" element={<ProtectedRoute requiredAnyPermission={[{ modulo: 'comercial', accion: 'create' }]}><QuotationCreatePage /></ProtectedRoute>} />
        <Route path="/quotations/:id" element={<ProtectedRoute requiredAnyPermission={[{ modulo: 'comercial', accion: 'read' }]}><QuotationDetailPage /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute requiredAnyPermission={[{ modulo: 'comercial', accion: 'read' }, { modulo: 'taller', accion: 'read' }]}><ClientsPage /></ProtectedRoute>} />
        <Route path="/vehicles" element={<ProtectedRoute requiredAnyPermission={[{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }]}><VehiclesPage /></ProtectedRoute>} />
        <Route path="/catalog" element={<ProtectedRoute requiredAnyPermission={[{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }]}><CatalogPage /></ProtectedRoute>} />
        <Route
          path="/users"
          element={
            <ProtectedRoute requiredAnyPermission={[{ modulo: 'admin', accion: 'read' }]}>
              <UsersPage />
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
