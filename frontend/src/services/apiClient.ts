// Central Axios instance for all backend API calls.
// Session cookies are sent on every request via withCredentials.
// All API calls in the project must go through this instance.

import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

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
