import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { LoadingBlock } from '../ui/PageHeader'

export function AuthGuard({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth()

  if (loading) {
    return <LoadingBlock label="Checking your session…" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
