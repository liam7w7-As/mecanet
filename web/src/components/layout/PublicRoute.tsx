import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { RouteLoading } from './ProtectedRoute';
import { getPostLoginPath, getSessionHomePath } from '../../lib/session-navigation';
import { useAuthStore } from '../../stores/auth.store';

export const PublicRoute = () => {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();
  const from: unknown = location.state?.from;

  if (isLoading) {
    return <RouteLoading />;
  }

  const destination = user ? getPostLoginPath(user, typeof from === 'string' ? from : undefined) : getSessionHomePath(user);
  return isAuthenticated ? <Navigate to={destination} replace /> : <Outlet />;
};

export default PublicRoute;
