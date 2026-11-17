import type { ApiMember, FamilyAnalytics } from '../types/api'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { analyticsService, familyService } from '../services/api'
import { apiClient } from '../services/apiClient'
import { Icon } from '../components/ui/Icon'
import { formatCurrency } from '../lib/format'
import { AreaTrend, BarRank, ShareDonut } from '../components/charts/ChartKit'
import { CAT_COLORS, compactINR } from '../components/charts/chartTheme'

export function FamilyDashboard(){
  const [from, setFrom] = useState(()=> new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10))
  const [to, setTo] = useState(()=> new Date().toISOString().slice(0,10))
  const [data, setData] = useState<FamilyAnalytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [members, setMembers] = useState<ApiMember[]>([])
  const [selMembers, setSelMembers] = useState<string[]>([])
  const [selModes, setSelModes] = useState<string[]>([])

  useEffect(()=>{
    apiClient.get('/families/me').then(r=> {
      const fid = r.data?.family?._id
      if (!fid) return null
      return familyService.members(fid).then((d)=> {
        const raw = d.members||[]
        // Normalize _id -> id so selection logic doesn't break (both buttons sharing undefined id was the bug)
        const normalized = raw.map((m)=> ({ ...m, id: String(m.id ?? m._id ?? ''), _id: String(m._id ?? m.id ?? '') }))
        setMembers(normalized)
      })
    }).catch(()=>{})
  },[])

  const load = useCallback(() => {
    const params: Record<string,string> = {}
    if(from) params.from=from
    if(to) params.to=to
    if(selMembers.length) params.members=selMembers.join(',')
    if(selModes.length) params.modes=selModes.join(',')
    analyticsService.family(params).then(setData).finally(()=> setLoading(false))
  }, [from, to, selMembers, selModes])
  useEffect(()=>{ load() },[load])

  const s = data?.summary || { actualExpenditurePaise: 0, internalTransfersPaise: 0, cashWithdrawalsPaise: 0, totalMovementPaise: 0, cashRemainingPaise: 0, cashSpentPaise: 0, cashWithdrawnPaise: 0 }

  // Quantile bands for the heatmap palette — computed once per data change
  // rather than sorting inside JSX on every render.
  const heatBands = useMemo(() => {
    const vals = (data?.heatmap || []).map((h) => h.spendPaise).filter((v: number) => v > 0).sort((a: number, b: number) => a - b)
    const q = (pct: number) => {
      if (!vals.length) return 0
      const idx = Math.ceil(pct * vals.length) - 1
      return vals[Math.max(0, Math.min(vals.length - 1, idx))]
    }
    return { q20: q(0.2), q40: q(0.4), q60: q(0.6), q80: q(0.8) }
  }, [data])

  return (
    <div className="flex flex-col gap-md min-w-0">
      <PageHeader title="Family Dashboard" subtitle="Power-BI style analytics over actual expenditure. Filter by time, members, mode." />
      <div className="brutal bg-white p-md grid grid-cols-2 sm:flex sm:flex-wrap gap-sm items-end min-w-0 [&>label]:min-w-0 [&_input]:max-w-full">
        <label className="flex flex-col text-xs font-bold uppercase gap-1 min-w-0">From<input type="date" value={from} onChange={e=> setFrom(e.target.value)} className="brutal-thin px-sm py-xs max-w-full w-full" /></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1 min-w-0">To<input type="date" value={to} onChange={e=> setTo(e.target.value)} className="brutal-thin px-sm py-xs max-w-full w-full" /></label>
        <div className="col-span-2 sm:col-auto flex flex-col text-xs font-bold uppercase gap-1 min-w-0">Members
          <div className="flex flex-wrap gap-xs">
            {members.map((m)=> {
              const active = selMembers.includes(m.id)
              return <button key={m.id} onClick={()=> setSelMembers(p=> active? p.filter(x=> x!==m.id): [...p,m.id])} className={`brutal-thin px-sm py-xs text-xs font-bold uppercase ${active?'bg-brand-yellow':'bg-white'}`}>{m.name}</button>
            })}
            {members.length===0 && <span className="text-xs normal-case opacity-60">No family</span>}
          </div>
        </div>
        <div className="col-span-2 sm:col-auto flex flex-col text-xs font-bold uppercase gap-1 min-w-0">Mode
          <div className="flex gap-xs flex-wrap">{['UPI','BANK','CASH','CARD','OTHER'].map(m=> {
            const active = selModes.includes(m)
            return <button key={m} onClick={()=> setSelModes(p=> active? p.filter(x=> x!==m): [...p,m])} className={`brutal-thin px-xs py-xs text-xs font-bold ${active?'bg-brand-yellow':'bg-white'}`}>{m}</button>
          })}</div>
        </div>
        <div className="col-span-2 sm:col-auto flex gap-sm">
          <button onClick={load} className="brutal bg-brand-yellow px-md py-xs font-bold uppercase min-h-[44px] flex-1 sm:flex-none">{loading?'Loading…':'Apply'}</button>
          {(selMembers.length||selModes.length) ? <button onClick={async()=>{ setSelMembers([]); setSelModes([]); setLoading(true); try{ const res=await analyticsService.family({ from, to }); setData(res); } finally { setLoading(false);} }} className="brutal bg-white px-md py-xs font-bold uppercase text-xs min-h-[44px] flex-1 sm:flex-none">Clear</button>: null}
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-sm min-w-0">
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Actual Spend</div><div className="text-xl font-bold">{formatCurrency((s.actualExpenditurePaise||0)/100)}</div><div className="text-xs text-on-surface-variant">{data.totalCount} txns</div></div>
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Avg / day</div><div className="text-xl font-bold">{formatCurrency(data.avgDaily||0)}</div><div className="text-xs text-on-surface-variant">over range</div></div>
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Transfers</div><div className="text-xl font-bold">{formatCurrency((s.internalTransfersPaise||0)/100)}</div><div className="text-xs text-on-surface-variant">not spend</div></div>
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Highest Day</div><div className="text-sm font-bold">{data.highestDay ? `${data.highestDay.date} — ${formatCurrency(data.highestDay.spend)}` : '—'}</div></div>
          </div>

          {/* 100% share donuts — member / category / vendor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md min-w-0">
            <div className="brutal bg-white p-md min-w-0">
              <h3 className="font-bold uppercase mb-sm">Member Share</h3>
              {(data.byMemberShare||[]).length===0 ? <div className="text-sm opacity-60">No data.</div> : (
                <ShareDonut
                  data={data.byMemberShare.map((m)=> ({ label: m.name, value: m.spend }))}
                  height={230}
                  centerLabel="Spent"
                  colors={CAT_COLORS}
                  valueFormat={(n)=> formatCurrency(n)}
                />
              )}
              <div className="text-xs opacity-60 mt-sm">Total {formatCurrency((s.actualExpenditurePaise||0)/100)} shared across {data.byMemberShare?.length||0} members</div>
            </div>
            <div className="brutal bg-white p-md min-w-0">
              <h3 className="font-bold uppercase mb-sm">Category Share</h3>
              {(data.byCategoryShare||[]).length===0 ? <div className="text-sm opacity-60">No data.</div> : (
                <ShareDonut
                  data={data.byCategoryShare.map((c)=> ({ label: c.category, value: c.spend }))}
                  height={230}
                  centerLabel="Spent"
                  colors={CAT_COLORS}
                  valueFormat={(n)=> formatCurrency(n)}
                />
              )}
            </div>
            <div className="brutal bg-white p-md min-w-0">
              <h3 className="font-bold uppercase mb-sm">Vendor Share</h3>
              {(data.byVendorShare||[]).length===0 ? <div className="text-sm opacity-60">No vendors.</div> : (
                <ShareDonut
                  data={data.byVendorShare.map((v)=> ({ label: v.vendor, value: v.spend }))}
                  height={230}
                  centerLabel="Spent"
                  colors={CAT_COLORS}
                  valueFormat={(n)=> formatCurrency(n)}
                />
              )}
            </div>
          </div>

          <div className="brutal bg-white p-md min-w-0">
            <h3 className="font-bold uppercase mb-sm flex items-start gap-sm"><Icon name="stacked_bar_chart" className="text-xl shrink-0" /><span className="min-w-0">Monthly Area (Income vs Expense)</span></h3>
            {(data.monthlyArea||[]).length===0 ? <div className="text-sm opacity-60">No monthly data.</div> : (
              <AreaTrend
                data={data.monthlyArea}
                xKey="month"
                height={260}
                series={[
                  { key: 'income', name: 'Income', color: 'var(--chart-line-primary)', fill: 'var(--chart-2)' },
                  { key: 'expense', name: 'Expense', color: 'var(--chart-line-secondary)', fill: 'var(--chart-4)' },
                ]}
                valueFormat={compactINR}
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-md min-w-0">
            <div className="brutal bg-white p-md min-w-0">
              <h3 className="font-bold uppercase mb-sm flex items-start gap-sm"><Icon name="show_chart" className="text-xl shrink-0" /><span className="min-w-0">Spend Over Time</span></h3>
              {(data.timeSeries||[]).length===0 ? <div className="text-sm opacity-60">No spend in range.</div> : (
                <AreaTrend
                  data={data.timeSeries}
                  xKey="date"
                  height={280}
                  series={[{ key: 'spend', name: 'Spend', color: 'var(--chart-line-accent)', fill: 'var(--chart-1)' }]}
                  valueFormat={compactINR}
                />
              )}
            </div>
            <div className="brutal bg-white p-md min-w-0">
              <h3 className="font-bold uppercase mb-sm">By Category</h3>
              {(data.byCategory||[]).length===0 ? <div className="text-sm opacity-60">No data.</div> : (
                <BarRank
                  data={data.byCategory}
                  categoryKey="category"
                  valueKey="spend"
                  height={280}
                  horizontal
                  color="var(--chart-1)"
                  labelWidth={92}
                  valueFormat={compactINR}
                />
              )}
            </div>
            <div className="brutal bg-white p-md min-w-0">
              <h3 className="font-bold uppercase mb-sm">By Member</h3>
              {(data.byMember||[]).length===0 ? <div className="text-sm opacity-60">No data.</div> : (
                <BarRank
                  data={data.byMember}
                  categoryKey="name"
                  valueKey="spend"
                  height={260}
                  horizontal={false}
                  color="var(--chart-line-primary)"
                  valueFormat={compactINR}
                />
              )}
            </div>
            <div className="brutal bg-white p-md min-w-0">
              <h3 className="font-bold uppercase mb-sm">Top Vendors</h3>
              {(data.topVendors||[]).length===0 ? <div className="text-sm opacity-60">No vendors.</div> : (
                <div className="flex flex-col gap-xs min-w-0">
                  {data.topVendors.map((v, i)=> (
                    <div key={v.vendor} className="flex justify-between items-center gap-sm brutal-thin px-sm py-xs bg-surface-container-low min-w-0 nb-bar-row">
                      <span className="text-xs font-bold truncate pr-sm min-w-0">{i+1}. {v.vendor}</span>
                      <span className="text-xs font-bold whitespace-nowrap">{formatCurrency(v.spend)} <span className="opacity-60">×{v.count}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-md min-w-0">
            <div className="brutal bg-white p-md min-w-0">
              <h3 className="font-bold uppercase mb-sm">By Mode</h3>
              {(data.byModeShare||data.byMode||[]).length===0 ? <div className="text-sm opacity-60">No mode data.</div> : (
                <ShareDonut
                  data={(data.byModeShare||data.byMode).map((m)=> ({ label: m.mode, value: m.spend }))}
                  height={260}
                  centerLabel="Spent"
                  colors={CAT_COLORS}
                  valueFormat={(n)=> formatCurrency(n)}
                />
              )}
            </div>
            <div className="brutal bg-white p-md min-w-0">
              <h3 className="font-bold uppercase mb-sm">Member × Vendor (top)</h3>
              {(data.byMemberByVendor||[]).length===0 ? <div className="text-sm opacity-60">No data.</div> : (
                <div className="flex flex-col gap-xs max-h-[260px] overflow-auto min-w-0">
                  {data.byMemberByVendor.slice(0,20).map((r)=> (
                    <div key={`${r.memberId}-${r.vendor}`} className="flex justify-between items-center gap-sm brutal-thin px-sm py-xs bg-surface-container-low min-w-0">
                      <span className="text-xs font-bold truncate pr-sm min-w-0">{r.memberName} → {r.vendor}</span>
                      <span className="text-xs font-bold whitespace-nowrap">{formatCurrency(r.spend)} <span className="opacity-60">×{r.count}</span></span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs opacity-60 mt-sm">Shows how much each user spent on each vendor.</div>
            </div>
          </div>

          <div className="brutal bg-white p-md min-w-0">
            <h3 className="font-bold uppercase mb-sm flex flex-wrap items-center gap-sm"><Icon name="calendar_month" /> Daily Heatmap <span className="text-xs normal-case opacity-60 ml-auto">darker = higher spend</span></h3>
            {(data.heatmap||[]).length===0 ? <div className="text-sm opacity-60">No days.</div> : (
              <>
                <div className="overflow-x-auto min-w-0">
                <div className="grid gap-xs min-w-[560px]" style={{ gridTemplateColumns: `repeat(${Math.min(14, data.heatmap.length)}, minmax(0,1fr))` }}>
                  {(() => {
                    const { q20, q40, q60, q80 } = heatBands
                    const palette = [
                      { bg:'var(--heat-1)', fg:'var(--heat-ink)' },   // 0
                      { bg:'var(--heat-2)', fg:'var(--heat-ink)' },   // q0-q20
                      { bg:'var(--heat-3)', fg:'var(--heat-ink)' },   // q20-q40
                      { bg:'var(--heat-4)', fg:'var(--heat-inverse)' },
                      { bg:'var(--heat-5)', fg:'var(--heat-inverse)' },
                      { bg:'var(--heat-6)', fg:'var(--heat-inverse)' }, // q80-max
                    ]
                    const hiDate = data.highestDay?.date
                    return data.heatmap.map((h)=> {
                      const v=h.spendPaise
                      let level: number
                      if(v===0) level=0
                      else if(v<=q20) level=1
                      else if(v<=q40) level=2
                      else if(v<=q60) level=3
                      else if(v<=q80) level=4
                      else level=5
                      const { bg, fg } = palette[level]
                      const isMax = v>0 && h.date===hiDate
                      return <div key={h.date} title={`${h.date}: ₹${(v/100).toLocaleString('en-IN')} — ${v===0?'no spend':`level ${level}/5`}`} className={`brutal-thin p-xs text-center text-xs font-bold min-h-[44px] flex flex-col justify-center ${isMax?'ring-2 ring-brand-yellow':''}`} style={{ background:bg, color: fg }}>{h.date.slice(5)}<div className="opacity-80 text-[10px]">{v? formatCurrency(h.spend): '—'}</div></div>
                    })
                  })()}
                </div>
                </div>
                <div className="flex flex-wrap items-center gap-xs mt-sm text-xs font-bold uppercase">
                  <span className="opacity-60">Scale</span>
                  <span className="brutal-thin w-4 h-4" style={{background:'var(--heat-1)'}} /> 0
                  <span className="brutal-thin w-4 h-4" style={{background:'var(--heat-2)'}} />
                  <span className="brutal-thin w-4 h-4" style={{background:'var(--heat-3)'}} />
                  <span className="brutal-thin w-4 h-4" style={{background:'var(--heat-4)'}} />
                  <span className="brutal-thin w-4 h-4" style={{background:'var(--heat-5)'}} />
                  <span className="brutal-thin w-4 h-4" style={{background:'var(--heat-6)'}} /> max
                  <span className="ml-auto text-[11px] normal-case opacity-60">Empty days shown at lowest step — not gaps</span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
