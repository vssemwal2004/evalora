import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

const roleHome = {
  super_admin: '/super-admin',
  admin: '/admin',
  student: '/student',
  proctor: '/proctor',
};

export function ProtectedRoute({ roles }) {
  const location = useLocation();
  const { user, isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100">
        <div className="panel px-5 py-4 text-sm font-semibold text-slate-700">Loading Evalora session...</div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles?.length && !roles.includes(user.role)) {
    return <Navigate to={roleHome[user.role] || '/login'} replace />;
  }

  return <Outlet />;
}
