import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../../services/apiClient'
import { toApiError } from '../../lib/apiError'

type SharedMonth = { month: string; shared: boolean; count: number; privateCount: number }

function monthName(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

export function MonthSharing() {
  const [months, setMonths] = useState<SharedMonth[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const { data } = await apiClient.get<{ months: SharedMonth[] }>('/families/me/sharing', { signal })
      setMonths(data.months)
      setError('')
    } catch (caught) {
      if (!signal?.aborted) setError(toApiError(caught).response?.data.error ?? 'Could not load month sharing.')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => load(controller.signal))
    return () => controller.abort()
  }, [load])

  async function toggle(month: SharedMonth) {
    if (busy) return
    const shared = !month.shared
    setBusy(month.month)
    setError('')
    setMessage('')
    try {
      await apiClient.put(`/families/me/sharing/${month.month}`, { shared })
      setMonths(current => current?.map(row => row.month === month.month ? { ...row, shared } : row) ?? [])
      setMessage(`${monthName(month.month)} is now ${shared ? 'shared with your family' : 'hidden from your family'}.`)
    } catch (caught) {
      setError(toApiError(caught).response?.data.error ?? 'Could not update sharing. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section id="sharing" className="fw-section" style={{ scrollMarginTop: 16 }}>
      <h2 className="fw-h2">Month sharing</h2>
      <div className="fw-card fw-stack">
        <p>Your ledger is private by default. Sharing a month makes its family-visible entries available to your household. Private entries stay hidden.</p>
        {error && <div role="alert" className="fw-status fw-status--error">{error}</div>}
        {message && <p role="status">{message}</p>}
        {months === null && (error
          ? <button className="fw-btn fw-btn--white" onClick={() => void load()}>Retry</button>
          : <p role="status">Loading month sharing…</p>)}
        {months?.length === 0 && <p>No months to share yet. Add or import an entry to get started.</p>}
        {months?.map(month => (
          <div key={month.month} className="fw-rowbox" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong>{monthName(month.month)}</strong>
              <div className="fw-muted">{month.count} {month.count === 1 ? 'entry' : 'entries'} · {month.privateCount} private</div>
            </div>
            <button type="button" className="fw-btn fw-btn--sm fw-btn--white"
              disabled={!!busy} onClick={() => void toggle(month)}
              aria-label={`${month.shared ? 'Stop sharing' : 'Share'} ${monthName(month.month)}`}>
              {busy === month.month ? 'Saving…' : month.shared ? 'Stop sharing' : 'Share month'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
