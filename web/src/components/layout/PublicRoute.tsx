import { Navigate, Outlet } from 'react-router-dom';

import { RouteLoading } from './ProtectedRoute';
import { useAuthStore } from '../../stores/auth.store';

export const PublicRoute = () => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <RouteLoading />;
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />;
};

export default PublicRoute;
