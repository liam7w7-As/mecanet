import { LoaderCircle } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../../stores/auth.store';

import type { Role } from '@unithor/shared';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
  children?: ReactNode;
}

export const RouteLoading = () => (
  <div
    className="flex min-h-screen items-center justify-center bg-brand-light"
    role="status"
    aria-label="Verificando sesión"
  >
    <div className="flex flex-col items-center gap-3 text-brand-blue">
      <LoaderCircle className="h-8 w-8 animate-spin" aria-hidden="true" />
      <span className="text-sm font-medium">Verificando sesión...</span>
    </div>
  </div>
);

export const ProtectedRoute = ({ allowedRoles, children }: ProtectedRouteProps) => {
  const location = useLocation();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
