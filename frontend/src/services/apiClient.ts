// Central Axios instance for all backend API calls.
// Session cookies are sent on every request via withCredentials.
// All API calls in the project must go through this instance.

import axios from 'axios'

// Local dev: relative '/api' goes through the Vite proxy (see vite.config.ts).
// Hosted (Vercel): set VITE_API_URL to the backend origin, e.g.
// https://fintrack-viqo.onrender.com — calls then go to '<origin>/api'.
const apiBase = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api'

export const apiClient = axios.create({
  baseURL: apiBase,
  withCredentials: true,
})

// ---- Session expiry: fail loudly, not silently ----
// If the session cookie dies (expired, DB switch) while the AuthContext
// still holds a user, every page request 401s quietly and pages render
// blank/dead UI. This interceptor broadcasts so AuthProvider can drop the
// ghost session and AuthGuard routes the user back to /login.
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const url: string | undefined = err.config?.url
    if (err.response?.status === 401 && url && !url.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('fintrack:session-expired'))
    }
    return Promise.reject(err)
  },
)

// ---- Auth: admin invite + invite acceptance (Phase 2) ----
export async function inviteMember(payload: {
  email: string
  name?: string
}) {
  return apiClient.post('/auth/invite', payload)
}

export async function acceptInvite(
  token: string,
  payload: { password: string; name?: string },
) {
  return apiClient.post(`/auth/accept-invite/${token}`, payload)
}

export default apiClient
