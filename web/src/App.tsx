import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import PublicRoute from './components/layout/PublicRoute';
import DashboardPage from './pages/DashboardPage';
import ForbiddenPage from './pages/ForbiddenPage';
import LoginPage from './pages/LoginPage';
import ModulePage from './pages/ModulePage';
import NotFoundPage from './pages/NotFoundPage';

export const App = () => (
  <Routes>
    <Route element={<PublicRoute />}>
      <Route path="/login" element={<LoginPage />} />
    </Route>

    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/work-orders"
          element={
            <ModulePage
              title="Órdenes de trabajo"
              description="Gestión operativa de ingresos, trabajos, estados y entrega de vehículos."
            />
          }
        />
        <Route
          path="/quotations"
          element={
            <ModulePage
              title="Cotizaciones"
              description="Presupuestos, conversión a órdenes de trabajo y seguimiento de pagos."
            />
          }
        />
        <Route
          path="/clients"
          element={
            <ModulePage
              title="Clientes"
              description="Registro de personas, empresas y sus antecedentes de contacto."
            />
          }
        />
        <Route
          path="/vehicles"
          element={
            <ModulePage
              title="Vehículos"
              description="Consulta de vehículos, propietarios e historial asociado."
            />
          }
        />
        <Route
          path="/catalog"
          element={
            <ModulePage
              title="Catálogo"
              description="Servicios estándar, trabajos específicos, repuestos y stock."
            />
          }
        />
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
