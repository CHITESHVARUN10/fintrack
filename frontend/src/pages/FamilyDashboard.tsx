import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FamilyAnalytics } from '../types/api'
import type { FamilyMember } from '../types'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { analyticsService, familyService } from '../services/api'
import { apiClient } from '../services/apiClient'
import { formatCurrency } from '../lib/format'
import { AreaTrend } from '../components/charts/ChartKit'
import { compactINR } from '../components/charts/chartTheme'
import { TickDonut, VerticalBars } from '../components/family/WorkspaceCharts'
import { CATEGORY_SERIES, LINE_COLORS, MODE_COLORS } from '../components/family/workspaceTheme'
import './family-workspace.css'

const MODES = ['UPI', 'BANK', 'CASH', 'CARD', 'OTHER'] as const

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function monthStartISO() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

function shortDayLabel(iso: string) {
  return iso.slice(5)
}

export function FamilyDashboard() {
  const [from, setFrom] = useState(monthStartISO)
  const [to, setTo] = useState(todayISO)
  // Chips express exclusion (a filter is active only when it is unchecked),
  // so an empty selection means "everything" and the UI stays honest after a
  // reset. The request only sends a parameter when something is excluded.
  const [excludedMembers, setExcludedMembers] = useState<string[]>([])
  const [excludedModes, setExcludedModes] = useState<string[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [data, setData] = useState<FamilyAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  // Household roster comes from the family endpoint, not the analytics
  // payload: filtering a member out of the chart must not remove their chip.
  useEffect(() => {
    apiClient
      .get('/families/me')
      .then((r) => {
        const familyId = r.data?.family?._id
        if (!familyId) return null
        return familyService.members(familyId).then((d) => setMembers(d.members || []))
      })
      .catch(() => {})
  }, [])

  const memberOptions = useMemo(() => {
    if (members.length) {
      return members.map((m) => ({ id: m.id, name: m.name || m.email || 'Member' }))
    }
    return (data?.byMember || []).map((m) => ({
      id: m.memberId,
      name: m.name || m.memberName || 'Member',
    }))
  }, [members, data])

  // Load once on mount so the page is populated before the user hits Apply.
  // `loading` already starts true, so the effect only reports the result.
  useEffect(() => {
    const seq = ++requestSeq.current
    analyticsService
      .family({ from: monthStartISO(), to: todayISO() })
      .then((res) => {
        if (seq === requestSeq.current) {
          setData(res)
          setError(null)
        }
      })
      .catch(() => {
        if (seq === requestSeq.current) setError('Could not load family analytics for this range.')
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false)
      })
  }, [])

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    const params: Record<string, string> = {}
    if (from) params.from = from
    if (to) params.to = to
    // The API accepts an allow-list; derive it from what is not excluded.
    if (excludedMembers.length) {
      const allowed = memberOptions.map((m) => m.id).filter((id) => !excludedMembers.includes(id))
      if (allowed.length) params.members = allowed.join(',')
    }
    if (excludedModes.length) {
      const allowed = MODES.filter((m) => !excludedModes.includes(m))
      if (allowed.length) params.modes = allowed.join(',')
    }
    try {
      const res = await analyticsService.family(params)
      if (seq !== requestSeq.current) return
      setData(res)
    } catch {
      if (seq === requestSeq.current) setError('Could not load family analytics for this range.')
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [from, to, excludedMembers, excludedModes, memberOptions])

  const reset = async () => {
    const start = monthStartISO()
    const end = todayISO()
    setFrom(start)
    setTo(end)
    setExcludedMembers([])
    setExcludedModes([])
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const res = await analyticsService.family({ from: start, to: end })
      if (seq === requestSeq.current) setData(res)
    } catch {
      if (seq === requestSeq.current) setError('Could not load family analytics for this range.')
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }

  const summary = data?.summary
  const totalSpend = (summary?.actualExpenditurePaise || 0) / 100

  const memberSlices = useMemo(
    () => (data?.byMemberShare || []).map((m) => ({ label: m.name || m.memberName || 'Member', value: m.spend })),
    [data],
  )
  const categorySlices = useMemo(
    () => (data?.byCategoryShare || data?.byCategory || []).map((c) => ({ label: c.category, value: c.spend })),
    [data],
  )
  const vendorSlices = useMemo(
    () => (data?.byVendorShare || data?.topVendors || []).map((v) => ({ label: v.vendor, value: v.spend })),
    [data],
  )
  const modeSlices = useMemo(
    () =>
      (data?.byModeShare || data?.byMode || []).map((m) => ({
        label: m.mode,
        value: m.spend,
        color: MODE_COLORS[m.mode] ?? undefined,
      })),
    [data],
  )

  const memberBars = useMemo(
    () =>
      (data?.byMember || []).map((m, i) => ({
        label: m.name || m.memberName || 'Member',
        value: m.spend,
        color: CATEGORY_SERIES[i % CATEGORY_SERIES.length],
      })),
    [data],
  )

  // Heatmap tiers use the range's own quantiles, so the scale adapts to the
  // data instead of hardcoding rupee brackets.
  const heatBands = useMemo(() => {
    const vals = (data?.heatmap || [])
      .map((h) => h.spendPaise)
      .filter((v) => v > 0)
      .sort((a, b) => a - b)
    const q = (pct: number) => {
      if (!vals.length) return 0
      const idx = Math.ceil(pct * vals.length) - 1
      return vals[Math.max(0, Math.min(vals.length - 1, idx))]
    }
    return { q20: q(0.2), q40: q(0.4), q60: q(0.6), q80: q(0.8) }
  }, [data])

  const highestDate = data?.highestDay?.date

  return (
    <div className="fw-page">
      <PageHeader
        title="Family Dashboard"
        subtitle="Power-BI style analytics over actual expenditure. Filter by time, members, mode."
      />

      {error && (
        <div className="fw-status fw-status--error" role="alert">
          {error}
        </div>
      )}

      <div className="fw-flow">
        <div className="fw-card fw-filterbar">
          <label className="fw-field fw-field--date">
            <span className="fw-label">From</span>
            <input className="fw-input fw-mono" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="fw-field fw-field--date">
            <span className="fw-label">To</span>
            <input className="fw-input fw-mono" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>

          <div className="fw-field" style={{ flex: '1 1 220px' }}>
            <span className="fw-label">Members</span>
            <div className="fw-chips">
              {memberOptions.length === 0 && (
                <span className="fw-muted" style={{ fontSize: 12 }}>
                  No household members found
                </span>
              )}
              {memberOptions.map((m) => {
                const active = !excludedMembers.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setExcludedMembers((prev) =>
                        active ? [...prev, m.id] : prev.filter((x) => x !== m.id),
                      )
                    }
                    className={`fw-chip${active ? ' is-active' : ''}`}
                  >
                    {m.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="fw-field" style={{ flex: '1 1 260px' }}>
            <span className="fw-label">Mode</span>
            <div className="fw-chips">
              {MODES.map((mode) => {
                const active = !excludedModes.includes(mode)
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setExcludedModes((prev) => (active ? [...prev, mode] : prev.filter((x) => x !== mode)))
                    }
                    className={`fw-chip${active ? ' is-active' : ''}`}
                  >
                    {mode}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="fw-filterbar__actions">
            <button type="button" className="fw-btn" onClick={load} disabled={loading}>
              {loading ? 'LOADING…' : 'APPLY'}
            </button>
            <button type="button" className="fw-btn fw-btn--white" onClick={reset} disabled={loading}>
              RESET
            </button>
          </div>
        </div>

        {loading && !data && <LoadingBlock label="Loading family analytics…" />}

        {data && (
          <>
            <div className="fw-grid-4">
              <div className="fw-card fw-kpi">
                <span className="fw-label" style={{ color: 'var(--text-secondary)' }}>
                  Actual spend
                </span>
                <div>
                  <div className="fw-kpi__value">{formatCurrency(totalSpend)}</div>
                  <div className="fw-kpi__sub">{data.totalCount} txns</div>
                </div>
              </div>
              <div className="fw-card fw-kpi">
                <span className="fw-label" style={{ color: 'var(--text-secondary)' }}>
                  Avg / day
                </span>
                <div>
                  <div className="fw-kpi__value">{formatCurrency(data.avgDaily || 0)}</div>
                  <div className="fw-kpi__sub">over range</div>
                </div>
              </div>
              <div className="fw-card fw-kpi">
                <span className="fw-label" style={{ color: 'var(--text-secondary)' }}>
                  Transfers
                </span>
                <div>
                  <div className="fw-kpi__value">
                    {formatCurrency((summary?.internalTransfersPaise || 0) / 100)}
                  </div>
                  <div className="fw-kpi__sub">not spend</div>
                </div>
              </div>
              <div className="fw-card fw-kpi">
                <span className="fw-label" style={{ color: 'var(--text-secondary)' }}>
                  Highest day
                </span>
                <div className="fw-kpi__high">
                  {data.highestDay && data.highestDay.spendPaise > 0
                    ? `${data.highestDay.date} — ${formatCurrency(data.highestDay.spend)}`
                    : '—'}
                </div>
              </div>
            </div>

            <div className="fw-grid-3">
              <div className="fw-card fw-stack" style={{ gap: 8 }}>
                <h2 className="fw-card-title">Member share</h2>
                <TickDonut
                  slices={memberSlices}
                  total={totalSpend}
                  centerLabel="Spent"
                  emptyLabel="No member spend in this range."
                  footer={`Total ${formatCurrency(totalSpend)} shared across ${memberSlices.filter((m) => m.value > 0).length} member${memberSlices.filter((m) => m.value > 0).length === 1 ? '' : 's'}`}
                />
              </div>

              <div className="fw-card fw-stack" style={{ gap: 8 }}>
                <h2 className="fw-card-title">Category share</h2>
                <TickDonut
                  slices={categorySlices}
                  total={totalSpend}
                  centerLabel="Spent"
                  emptyLabel="No category spend in this range."
                />
              </div>

              <div className="fw-card fw-stack" style={{ gap: 8 }}>
                <h2 className="fw-card-title">Vendor share</h2>
                <TickDonut
                  slices={vendorSlices}
                  total={totalSpend}
                  centerLabel="Spent"
                  emptyLabel="No vendor spend in this range."
                />
              </div>
            </div>

            <div className="fw-card fw-stack">
              <div className="fw-split">
                <h2 className="fw-card-title" style={{ fontSize: 14.5 }}>
                  Monthly area (income vs expense)
                </h2>
                <div className="fw-legend">
                  <span className="fw-legend-item">
                    <span className="fw-swatch" style={{ background: 'var(--nb-teal)' }} />
                    Income
                  </span>
                  <span className="fw-legend-item">
                    <span className="fw-swatch" style={{ background: 'var(--nb-pink)' }} />
                    Expense
                  </span>
                </div>
              </div>
              {(data.monthlyArea || []).length === 0 ? (
                <div className="fw-empty">No monthly data in this range.</div>
              ) : (
                <AreaTrend
                  data={data.monthlyArea}
                  xKey="month"
                  height={240}
                  legend={false}
                  series={[
                    { key: 'income', name: 'Income', color: LINE_COLORS.income, fill: 'var(--nb-teal)' },
                    { key: 'expense', name: 'Expense', color: LINE_COLORS.expense, fill: 'var(--nb-pink)' },
                  ]}
                  valueFormat={compactINR}
                />
              )}
            </div>

            <div className="fw-grid-2">
              <div className="fw-card fw-stack">
                <div className="fw-split">
                  <h2 className="fw-card-title">Spend over time</h2>
                  {data.highestDay && data.highestDay.spendPaise > 0 && (
                    <span className="fw-tag fw-tag--accent">
                      PEAK {shortDayLabel(data.highestDay.date)} · {formatCurrency(data.highestDay.spend)}
                    </span>
                  )}
                </div>
                {(data.timeSeries || []).length === 0 ? (
                  <div className="fw-empty">No spend in range.</div>
                ) : (
                  <AreaTrend
                    data={data.timeSeries}
                    xKey="date"
                    height={230}
                    legend={false}
                    series={[{ key: 'spend', name: 'Spend', color: LINE_COLORS.spend, fill: 'var(--nb-yellow)' }]}
                    valueFormat={compactINR}
                  />
                )}
              </div>

              <div className="fw-card fw-stack">
                <h2 className="fw-card-title">By category</h2>
                {categorySlices.length === 0 ? (
                  <div className="fw-empty">No category data in this range.</div>
                ) : (
                  <div className="fw-stack" style={{ gap: 13 }}>
                    {categorySlices
                      .slice()
                      .sort((a, b) => b.value - a.value)
                      .map((c) => {
                        const max = Math.max(1, ...categorySlices.map((s) => s.value))
                        return (
                          <div key={c.label} className="fw-catbar">
                            <div className="fw-catbar__meta">
                              <span>{c.label}</span>
                              <span>{compactINR(c.value)}</span>
                            </div>
                            <div className="fw-catbar__track">
                              <div
                                className="fw-catbar__fill"
                                style={{ width: `${Math.round((c.value / max) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>

            <div className="fw-grid-2">
              <div className="fw-card">
                <h2 className="fw-card-title" style={{ marginBottom: 10 }}>
                  By member
                </h2>
                <VerticalBars data={memberBars} height={220} />
              </div>

              <div className="fw-card fw-stack" style={{ gap: 10 }}>
                <h2 className="fw-card-title">Top vendors</h2>
                {(data.topVendors || []).length === 0 ? (
                  <div className="fw-empty">No vendors in this range.</div>
                ) : (
                  data.topVendors.slice(0, 8).map((v, i) => (
                    <div key={v.vendor} className="fw-ranked">
                      <span>
                        {i + 1}. {v.vendor}
                      </span>
                      <span>
                        {formatCurrency(v.spend)} <span className="fw-ranked__muted">×{v.count}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="fw-grid-2">
              <div className="fw-card fw-stack" style={{ gap: 8 }}>
                <h2 className="fw-card-title">By mode</h2>
                <TickDonut
                  slices={modeSlices}
                  total={totalSpend}
                  centerLabel="Spent"
                  legendColumns={3}
                  emptyLabel="No mode data in this range."
                />
              </div>

              <div className="fw-card fw-stack" style={{ gap: 10 }}>
                <h2 className="fw-card-title">Member × vendor (top)</h2>
                {(data.byMemberByVendor || []).length === 0 ? (
                  <div className="fw-empty">No member-vendor pairs in this range.</div>
                ) : (
                  data.byMemberByVendor.slice(0, 8).map((r) => (
                    <div key={`${r.memberId}-${r.vendor}`} className="fw-ranked">
                      <span>
                        {r.memberName} → {r.vendor}
                      </span>
                      <span>
                        {formatCurrency(r.spend)} <span className="fw-ranked__muted">×{r.count}</span>
                      </span>
                    </div>
                  ))
                )}
                <p className="fw-muted" style={{ fontSize: 11 }}>
                  Shows how much each user spent on each vendor.
                </p>
              </div>
            </div>

            <div className="fw-card">
              <div className="fw-split">
                <h2 className="fw-card-title" style={{ fontSize: 14.5 }}>
                  Daily heatmap
                </h2>
                <span className="fw-mono" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  darker = higher spend
                </span>
              </div>

              {(data.heatmap || []).length === 0 ? (
                <div className="fw-empty">No days in this range.</div>
              ) : (
                <>
                  <div className="fw-heat">
                    {data.heatmap.map((h) => {
                      const v = h.spendPaise
                      const { q20, q40, q60 } = heatBands
                      const level = v === 0 ? 0 : v <= q20 ? 1 : v <= q40 ? 2 : v <= q60 ? 3 : 4
                      return (
                        <button
                          key={h.date}
                          type="button"
                          className={`fw-heat__cell lvl-${level}`}
                          title={`${h.date}: ${v ? formatCurrency(h.spend) : 'no spend'}${h.date === highestDate && v > 0 ? ' — highest day' : ''}`}
                          aria-label={`${h.date}: ${v ? formatCurrency(h.spend) : 'no spend'}`}
                        >
                          <span className="fw-heat__day">{shortDayLabel(h.date)}</span>
                          <span className="fw-heat__amt">{v ? compactINR(h.spend) : '—'}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="fw-scale">
                    <span>SCALE</span>
                    <span className="fw-swatch" style={{ background: 'var(--bg-card)' }} /> 0
                    <span className="fw-swatch" style={{ background: 'var(--heat-2)' }} />
                    <span className="fw-swatch" style={{ background: 'var(--heat-3)' }} />
                    <span className="fw-swatch" style={{ background: 'var(--heat-4)' }} />
                    <span className="fw-swatch" style={{ background: 'var(--heat-6)' }} /> max
                    <span className="fw-muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
                      Empty days shown at the lowest step — not gaps
                    </span>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {!data && !loading && !error && (
          <div className="fw-card">
            <div className="fw-empty">
              No family analytics yet. Apply a range once your household has transactions.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
