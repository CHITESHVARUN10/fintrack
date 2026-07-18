import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { FamilyMember, User } from '../types'
import { apiClient } from '../services/apiClient'
import { memberService } from '../services/api'

interface AuthContextValue {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  members: FamilyMember[]
  activeMemberId: string
  setActiveMemberId: (id: string) => void
  activeMember: FamilyMember
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  removeMember: (id: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// Backend user documents come back with Mongo `_id`; the frontend `User` type
// uses `id`. Normalize so all call sites keep working unchanged.
function normalizeUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = (r.id ?? r._id) as string | undefined
  if (!id) return null
  return {
    id: String(id),
    name: (r.name as string) ?? '',
    email: (r.email as string) ?? '',
    role: (r.role as User['role']) ?? 'member',
    familyAccountId: r.familyAccountId ? String(r.familyAccountId) : '',
    isActive: (r.isActive as boolean) ?? true,
    createdAt: (r.createdAt as string) ?? '',
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string>('')

  // Check the session once on mount via GET /api/auth/me, then load the
  // family member list (admin only; non-admins just see themselves).
  useEffect(() => {
    let cancelled = false
    apiClient
      .get('/auth/me')
      .then((res) => {
        if (cancelled) return
        const u = normalizeUser(res.data?.user ?? res.data)
        setUser(u)
        if (u) {
          setActiveMemberId(u.id)
          if (u.role === 'admin') {
            memberService
              .list()
              .then((list) => {
                if (!cancelled) setMembers(list)
              })
              .catch(() => {
                if (!cancelled) setMembers([u as FamilyMember])
              })
          } else {
            setMembers([u as FamilyMember])
          }
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = async (email: string, password: string) => {
    const res = await apiClient.post('/auth/login', { email, password })
    const u = normalizeUser(res.data?.user ?? res.data)
    setUser(u)
    if (u) {
      setActiveMemberId(u.id)
      if (u.role === 'admin') {
        const list = await memberService.list().catch(() => [u as FamilyMember])
        setMembers(list)
      } else {
        setMembers([u as FamilyMember])
      }
    }
  }

  const register = async (name: string, email: string, password: string) => {
    // Backend register does not create a session, so auto-login afterwards.
    await apiClient.post('/auth/register', { name, email, password })
    await login(email, password)
  }

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout')
    } finally {
      setUser(null)
      setMembers([])
      setActiveMemberId('')
      window.location.href = '/'
    }
  }

  const removeMember = async (id: string) => {
    await apiClient.delete(`/members/${id}`)
    setMembers((prev) => prev.filter((m) => m.id !== id))
  }

  const activeMember =
    members.find((m) => m.id === activeMemberId) ??
    (user as FamilyMember | null) ??
    members[0]

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        members,
        activeMemberId,
        setActiveMemberId,
        activeMember,
        isAdmin: user?.role === 'admin',
        login,
        register,
        logout,
        removeMember,
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
