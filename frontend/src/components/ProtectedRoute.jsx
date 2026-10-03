import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children, rolRequerido }) {
  const token = localStorage.getItem('sfl_token');
  const usuario = JSON.parse(localStorage.getItem('sfl_user') || 'null');
  if (!token || !usuario) return <Navigate to="/admin" replace />;
  if (rolRequerido && usuario.rol !== rolRequerido && usuario.rol !== 'super_admin') {
    return <Navigate to="/admin/panel" replace />;
  }
  return children;
}
