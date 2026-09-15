import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import PublicRoute from './components/layout/PublicRoute';
import LoginPage from './pages/auth/LoginPage';
import CatalogPage from './pages/catalog/CatalogPage';
import ClientsPage from './pages/clients/ClientsPage';
import DashboardPage from './pages/DashboardPage';
import ForbiddenPage from './pages/ForbiddenPage';
import ModulePage from './pages/ModulePage';
import NotFoundPage from './pages/NotFoundPage';
import QuotationCreatePage from './pages/quotations/QuotationCreatePage';
import QuotationDetailPage from './pages/quotations/QuotationDetailPage';
import QuotationsPage from './pages/quotations/QuotationsPage';
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
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/work-orders" element={<WorkOrdersPage />} />
        <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
        <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
        <Route path="/quotations" element={<QuotationsPage />} />
        <Route path="/quotations/new" element={<QuotationCreatePage />} />
        <Route path="/quotations/:id" element={<QuotationDetailPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/vehicles" element={<VehiclesPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route
          path="/users"
          element={
            <ProtectedRoute allowedRoles={['admin', 'desarrollador']}>
              <ModulePage
                title="Usuarios"
                description="Administración de usuarios, roles, estado y permisos de acceso."
              />
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
