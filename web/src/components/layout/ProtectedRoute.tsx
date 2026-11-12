import { LoaderCircle } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { hasRouteAccess } from '../../lib/route-access';
import { useAuthStore } from '../../stores/auth.store';

import type { RouteAccess } from '../../lib/route-access';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  access?: RouteAccess;
  children?: ReactNode;
}

export const RouteLoading = () => (
  <div
    className="flex min-h-screen items-center justify-center bg-brand-line/40"
    role="status"
    aria-label="Verificando sesión"
  >
    <div className="flex flex-col items-center gap-3 text-brand-primaryInk">
      <LoaderCircle className="h-8 w-8 animate-spin" aria-hidden="true" />
      <span className="text-sm font-medium">Verificando sesión...</span>
    </div>
  </div>
);

export const ProtectedRoute = ({
  access,
  children,
}: ProtectedRouteProps) => {
  const location = useLocation();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  }

  if (access && !hasRouteAccess(user, access)) {
    return <Navigate to="/forbidden" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
