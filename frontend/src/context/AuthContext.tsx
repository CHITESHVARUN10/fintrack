import { createContext, useContext, useState, type ReactNode } from 'react'
import { currentUser, members } from '../data/mock'
import type { FamilyMember, User } from '../types'

interface AuthContextValue {
  user: User
  isAuthenticated: boolean
  members: FamilyMember[]
  activeMemberId: string
  setActiveMemberId: (id: string) => void
  activeMember: FamilyMember
  isAdmin: boolean
  login: (email: string, _password: string) => Promise<void>
  register: (name: string, email: string, _password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user] = useState<User>(currentUser)
  const [activeMemberId, setActiveMemberId] = useState<string>(currentUser.id)

  const login = async () => {
    // Mock: ignore credentials, pretend success.
    await new Promise((r) => setTimeout(r, 300))
  }

  const register = async () => {
    await new Promise((r) => setTimeout(r, 300))
  }

  const logout = () => {
    // Mock: no-op. Real impl would clear session + redirect.
    window.location.href = '/login'
  }

  const activeMember =
    members.find((m) => m.id === activeMemberId) ?? members[0]

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: true,
        members,
        activeMemberId,
        setActiveMemberId,
        activeMember,
        isAdmin: user.role === 'admin',
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
