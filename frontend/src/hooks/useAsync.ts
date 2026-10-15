import { useEffect, useState } from 'react'

// Tiny data-fetching hook for the mock service layer.
// Keeps loading/error/data state so pages stay declarative.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (!active) return undefined
      setLoading(true)
      setError(null)
      return fn()
    })
      .then((res) => { if (active && res !== undefined) setData(res) })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}
