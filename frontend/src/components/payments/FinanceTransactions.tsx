import { useEffect, useId, useState } from 'react'
import { formatCurrency } from '../../lib/format'
import { toApiError } from '../../lib/apiError'
import { apiClient } from '../../services/apiClient'
import { PaymentsEmpty, PaymentsLoading, PaymentsModal, PaymentsNotice } from './PaymentsKit'

const purposes = {
  fd: { deposit: 'Deposit funding', maturity: 'Maturity payout' },
  stock: { purchase: 'Stock purchase', dividend: 'Dividend received' },
  income: { receipt: 'Income received' },
}

type Kind = keyof typeof purposes
type Party = { name?: string; upiId?: string }
type Entry = {
  _id: string
  amountPaise: number
  type: string
  occurredAt: string
  sender?: Party
  recipient?: Party
  productName?: string
  suggested?: boolean
  financeLink?: { role: string }
}

export function FinanceTransactions({
  kind, id, name, onClose,
}: {
  kind: Kind
  id: string
  name: string
  onClose: () => void
}) {
  const path = `/${kind === 'income' ? 'income' : 'investments'}/${id}/transactions`
  const roles: Record<string, string> = purposes[kind]
  const [view, setView] = useState('linked')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [mutationError, setMutationError] = useState('')
  const [status, setStatus] = useState('')
  const [response, setResponse] = useState<{
    key: string; items: Entry[]; hasMore: boolean; canManage: boolean; error?: string
  }>()
  const searchId = useId()
  const filterKey = JSON.stringify([view, query, page, revision])
  const rows = response?.key === filterKey ? response : undefined
  const linked = view === 'linked'

  useEffect(() => {
    const controller = new AbortController()
    apiClient.get(path, {
      signal: controller.signal,
      params: { view: linked ? 'linked' : 'available', role: view, q: query || undefined, page },
    }).then(({ data }) => {
      if (!controller.signal.aborted) setResponse({ ...data, key: filterKey })
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setResponse({
        key: filterKey, items: [], hasMore: false, canManage: false,
        error: toApiError(err).response?.data?.error ?? 'Could not load transactions.',
      })
    })
    return () => controller.abort()
  }, [path, linked, view, query, page, filterKey])

  function selectView(next: string) {
    setView(next)
    setPage(1)
    setSearch('')
    setQuery('')
    setMutationError('')
    setStatus('')
  }

  async function changeLink(entry: Entry) {
    setBusy(true)
    setMutationError('')
    setStatus('')
    try {
      if (linked) await apiClient.delete(`${path}/${entry._id}`)
      else await apiClient.put(`${path}/${entry._id}`, { role: view })
      setStatus(linked ? 'Transaction unlinked.' : 'Transaction linked.')
      setPage(1)
      setRevision(current => current + 1)
    } catch (err: unknown) {
      setMutationError(toApiError(err).response?.data?.error ?? 'Could not update the link. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PaymentsModal open onClose={onClose} title={`Transactions · ${name}`} wide>
      <div className="pmt-stack">
        <div className="pmt-field">
          <label className="pmt-label" htmlFor={`${searchId}-view`}>Show transactions</label>
          <select id={`${searchId}-view`} className="pmt-select" value={view}
            onChange={event => selectView(event.target.value)} disabled={busy}>
            <option value="linked">Linked transactions</option>
            {response?.canManage && Object.entries(roles).map(([key, label]) => (
              <option key={key} value={key}>Link {label.toLowerCase()}</option>
            ))}
          </select>
        </div>
        {kind === 'income' && !linked && (
          <p className="pmt-sub">Link a payment to teach FinStack who pays you. Similar payments will be suggested here.</p>
        )}
        {!linked && (
          <form className="pmt-ledger-search" onSubmit={event => {
            event.preventDefault()
            setPage(1)
            setQuery(search.trim())
          }}>
            <label className="pmt-field" htmlFor={searchId}>
              <span className="pmt-label">Find a transaction</span>
              <input id={searchId} className="pmt-input" type="search" value={search}
                onChange={event => setSearch(event.target.value)} placeholder="Counterparty or item" />
            </label>
            <button type="submit" className="pmt-btn pmt-btn-white" disabled={busy}>Search</button>
          </form>
        )}
        {status && <PaymentsNotice>{status}</PaymentsNotice>}
        {mutationError && <PaymentsNotice tone="error">{mutationError}</PaymentsNotice>}
        {!rows ? <PaymentsLoading rows={2} /> : rows.error ? (
          <PaymentsNotice tone="error">
            {rows.error}{' '}
            <button type="button" className="pmt-btn pmt-btn-sm pmt-btn-white" onClick={() => setRevision(current => current + 1)}>Retry</button>
          </PaymentsNotice>
        ) : rows.items.length === 0 ? (
          <PaymentsEmpty title={linked ? 'No linked transactions yet' : 'No matching transactions'}>
            {linked && rows.canManage ? 'Choose a purpose above to find and link an existing ledger entry.' : undefined}
          </PaymentsEmpty>
        ) : (
          <ul className="pmt-ledger-list">
            {rows.items.map(entry => {
              const party = entry.type === 'INCOME' ? entry.sender : entry.recipient
              const other = entry.type === 'INCOME' ? entry.recipient : entry.sender
              const label = party?.name || party?.upiId || other?.name || other?.upiId || entry.productName || 'Ledger entry'
              const linkRole = entry.financeLink?.role
              return (
                <li key={entry._id} className="pmt-ledger-row">
                  <div>
                    <strong>{label}</strong>
                    <div className="pmt-tiny">
                      {entry.occurredAt.slice(0, 10)} · {formatCurrency(entry.amountPaise / 100)}
                      {linkRole && roles[linkRole] ? ` · ${roles[linkRole]}` : ''}
                    </div>
                    {entry.suggested && <span className="pmt-tag pmt-tag-yellow">Suggested match</span>}
                  </div>
                  {rows.canManage && (
                    <button type="button" className={`pmt-btn pmt-btn-sm${linked ? ' pmt-btn-white' : ''}`}
                      disabled={busy} onClick={() => void changeLink(entry)}
                      aria-label={`${linked ? 'Unlink' : 'Link'} ${label}, ${formatCurrency(entry.amountPaise / 100)}`}>
                      {linked ? 'Unlink' : 'Link'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {(page > 1 || rows?.hasMore) && (
          <div className="pmt-row">
            <button type="button" className="pmt-btn pmt-btn-white" disabled={page === 1 || busy || !rows}
              onClick={() => setPage(current => current - 1)}>Previous</button>
            <span className="pmt-tiny">Page {page}</span>
            <button type="button" className="pmt-btn pmt-btn-white" disabled={!rows?.hasMore || busy}
              onClick={() => setPage(current => current + 1)}>Next</button>
          </div>
        )}
      </div>
    </PaymentsModal>
  )
}
