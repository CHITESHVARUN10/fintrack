import { isAxiosError } from 'axios'

export interface ApiError extends Error {
  response?: { status?: number; data: { error?: string; message?: string; details?: string[] } }
}

export function toApiError(value: unknown): ApiError {
  if (isAxiosError<{ error?: string; message?: string; details?: string[] }>(value)) return value
  return value instanceof Error ? value : new Error(String(value))
}
