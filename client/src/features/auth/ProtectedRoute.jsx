import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { BrandLoader } from '../../ui/BrandLoader.jsx';

const roleHome = {
  super_admin: '/super-admin',
  admin: '/admin',
  faculty: '/faculty',
  moderator: '/moderator',
  student: '/student',
  proctor: '/proctor',
};

export function ProtectedRoute({ roles }) {
  const location = useLocation();
  const { user, isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return <BrandLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles?.length && !roles.includes(user.role)) {
    return <Navigate to={roleHome[user.role] || '/login'} replace />;
  }

  return <Outlet />;
}
