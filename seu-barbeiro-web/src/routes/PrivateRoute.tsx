import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/auth-state'

export function PrivateRoute() {
  const { isAuthenticated, admin } = useAuth()
  const { pathname } = useLocation()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // O profissional só tem a agenda; as outras telas responderiam "acesso não permitido".
  if (admin?.role === 'PROFESSIONAL' && pathname !== '/operacao')
    return <Navigate to="/operacao" replace />
  return <Outlet />
}
