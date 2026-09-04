import { useEffect, useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { analyticsService, familyService } from '../services/api'
import { apiClient } from '../services/apiClient'
import { Icon } from '../components/ui/Icon'
import { formatCurrency } from '../lib/format'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend, Cell, PieChart, Pie,
} from 'recharts'

const CAT_COLORS = ['#FFE500','#2EC4B6','#E8487F','#7B61FF','#FF7A45','#FFB347','#6BCB77','#4D96FF']

function brutalTooltipStyle(): any {
  return {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 0,
    boxShadow: '4px 4px 0 0 var(--shadow)',
    fontFamily: 'Space Grotesk',
    fontWeight: 700,
    color: 'var(--text-primary)',
  }
}
// Only show outer label for slices >=5% to avoid collision; small slices rely on legend/tooltip
function pieLabelThreshold(props: any, threshold = 5) {
  const pct = props.payload?.sharePct ?? (props.percent != null ? props.percent * 100 : 0)
  if (pct < threshold) return null
  const name = props.name ?? props.payload?.name ?? props.category ?? props.vendor ?? props.mode ?? ''
  const label = String(name).slice(0, 14)
  return `${label} ${pct.toFixed(0)}%`
}

export function FamilyDashboard(){
  const [from, setFrom] = useState(()=> new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10))
  const [to, setTo] = useState(()=> new Date().toISOString().slice(0,10))
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [members, setMembers] = useState<any[]>([])
  const [selMembers, setSelMembers] = useState<string[]>([])
  const [selModes, setSelModes] = useState<string[]>([])

  useEffect(()=>{
    apiClient.get('/families/me').then(r=> {
      const fid = r.data?.family?._id
      if (!fid) return null
      return familyService.members(fid).then((d:any)=> {
        const raw = d.members||[]
        // Normalize _id -> id so selection logic doesn't break (both buttons sharing undefined id was the bug)
        const normalized = raw.map((m:any)=> ({ ...m, id: String(m.id ?? m._id ?? ''), _id: String(m._id ?? m.id ?? '') }))
        setMembers(normalized)
      })
    }).catch(()=>{})
  },[])

  function load(){
    setLoading(true)
    const params: Record<string,string> = {}
    if(from) params.from=from
    if(to) params.to=to
    if(selMembers.length) params.members=selMembers.join(',')
    if(selModes.length) params.modes=selModes.join(',')
    analyticsService.family(params).then(setData).finally(()=> setLoading(false))
  }
  useEffect(()=>{ load() },[])

  const s = data?.summary

  return (
    <div className="flex flex-col gap-md">
      <PageHeader title="Family Dashboard" subtitle="Power-BI style analytics over actual expenditure. Filter by time, members, mode." />
      <div className="brutal bg-white p-md flex flex-wrap gap-sm items-end">
        <label className="flex flex-col text-xs font-bold uppercase gap-1">From<input type="date" value={from} onChange={e=> setFrom(e.target.value)} className="brutal-thin px-sm py-xs" /></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">To<input type="date" value={to} onChange={e=> setTo(e.target.value)} className="brutal-thin px-sm py-xs" /></label>
        <div className="flex flex-col text-xs font-bold uppercase gap-1">Members
          <div className="flex flex-wrap gap-xs">
            {members.map((m:any)=> {
              const active = selMembers.includes(m.id)
              return <button key={m.id} onClick={()=> setSelMembers(p=> active? p.filter(x=> x!==m.id): [...p,m.id])} className={`brutal-thin px-sm py-xs text-xs font-bold uppercase ${active?'bg-brand-yellow':'bg-white'}`}>{m.name}</button>
            })}
            {members.length===0 && <span className="text-xs normal-case opacity-60">No family</span>}
          </div>
        </div>
        <div className="flex flex-col text-xs font-bold uppercase gap-1">Mode
          <div className="flex gap-xs flex-wrap">{['UPI','BANK','CASH','CARD','OTHER'].map(m=> {
            const active = selModes.includes(m)
            return <button key={m} onClick={()=> setSelModes(p=> active? p.filter(x=> x!==m): [...p,m])} className={`brutal-thin px-xs py-xs text-xs font-bold ${active?'bg-brand-yellow':'bg-white'}`}>{m}</button>
          })}</div>
        </div>
        <button onClick={load} className="brutal bg-brand-yellow px-md py-xs font-bold uppercase">{loading?'Loading…':'Apply'}</button>
        {(selMembers.length||selModes.length) ? <button onClick={async()=>{ setSelMembers([]); setSelModes([]); setLoading(true); try{ const res=await analyticsService.family({ from, to }); setData(res); } finally { setLoading(false);} }} className="brutal bg-white px-md py-xs font-bold uppercase text-xs">Clear</button>: null}
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Actual Spend</div><div className="text-xl font-bold">{formatCurrency((s.actualExpenditurePaise||0)/100)}</div><div className="text-xs text-on-surface-variant">{data.totalCount} txns</div></div>
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Avg / day</div><div className="text-xl font-bold">{formatCurrency(data.avgDaily||0)}</div><div className="text-xs text-on-surface-variant">over range</div></div>
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Transfers</div><div className="text-xl font-bold">{formatCurrency((s.internalTransfersPaise||0)/100)}</div><div className="text-xs text-on-surface-variant">not spend</div></div>
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Highest Day</div><div className="text-sm font-bold">{data.highestDay ? `${data.highestDay.date} — ${formatCurrency(data.highestDay.spend)}` : '—'}</div></div>
          </div>

          {/* 100% share pies — member / category / vendor */}
          <div className="grid lg:grid-cols-3 gap-md">
            <div className="brutal bg-white p-md">
              <h3 className="font-bold uppercase mb-sm">Member Share (100%)</h3>
              {(data.byMemberShare||[]).length===0 ? <div className="text-sm opacity-60">No data.</div> : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.byMemberShare} dataKey="spend" nameKey="name" cx="50%" cy="50%" innerRadius="45%" outerRadius="80%" paddingAngle={2} stroke="var(--border)" strokeWidth={2} label={(props:any)=> pieLabelThreshold(props,5)}>
                        {data.byMemberShare.map((_:any,i:number)=> <Cell key={i} fill={CAT_COLORS[i%CAT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={brutalTooltipStyle()} formatter={(v:any, _n:any, p:any)=> [`${formatCurrency(v)} (${p.payload.sharePct.toFixed(1)}%)`, p.payload.name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="text-xs opacity-60 mt-sm">Total {formatCurrency((s.actualExpenditurePaise||0)/100)} shared across {data.byMemberShare?.length||0} members</div>
            </div>
            <div className="brutal bg-white p-md">
              <h3 className="font-bold uppercase mb-sm">Category Share (100%)</h3>
              {(data.byCategoryShare||[]).length===0 ? <div className="text-sm opacity-60">No data.</div> : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.byCategoryShare} dataKey="spend" nameKey="category" cx="50%" cy="50%" innerRadius="45%" outerRadius="80%" paddingAngle={2} stroke="var(--border)" strokeWidth={2} label={(props:any)=> pieLabelThreshold(props,5)}>
                        {data.byCategoryShare.map((_:any,i:number)=> <Cell key={i} fill={CAT_COLORS[i%CAT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={brutalTooltipStyle()} formatter={(v:any, _n:any, p:any)=> [`${formatCurrency(v)} (${p.payload.sharePct.toFixed(1)}%)`, p.payload.category]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="brutal bg-white p-md">
              <h3 className="font-bold uppercase mb-sm">Vendor Share (100%)</h3>
              {(data.byVendorShare||[]).length===0 ? <div className="text-sm opacity-60">No vendors.</div> : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.byVendorShare} dataKey="spend" nameKey="vendor" cx="50%" cy="50%" innerRadius="45%" outerRadius="80%" paddingAngle={2} stroke="var(--border)" strokeWidth={2} label={(props:any)=> pieLabelThreshold(props,5)}>
                        {data.byVendorShare.map((_:any,i:number)=> <Cell key={i} fill={CAT_COLORS[i%CAT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={brutalTooltipStyle()} formatter={(v:any, _n:any, p:any)=> [`${formatCurrency(v)} (${p.payload.sharePct.toFixed(1)}%)`, p.payload.vendor]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="brutal bg-white p-md">
            <h3 className="font-bold uppercase mb-sm flex items-center gap-sm"><Icon name="stacked_bar_chart" /> Monthly Area (Income vs Expense)</h3>
            {(data.monthlyArea||[]).length===0 ? <div className="text-sm opacity-60">No monthly data.</div> : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.monthlyArea} margin={{ top:8, right:8, left:-8, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill:'var(--chart-axis-text)', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'var(--border)', strokeWidth:3 }} />
                    <YAxis tick={{ fill:'var(--chart-axis-text)', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'var(--border)', strokeWidth:3 }} />
                    <Tooltip contentStyle={brutalTooltipStyle()} />
                    <Legend wrapperStyle={{ fontWeight:700, fontSize:12 }} />
                    <Area type="monotone" dataKey="expense" name="Expense ₹" stroke="var(--border)" strokeWidth={3} fill="var(--chart-1)" fillOpacity={0.22} />
                    <Area type="monotone" dataKey="income" name="Income ₹" stroke="var(--border)" strokeWidth={3} fill="var(--chart-2)" fillOpacity={0.22} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-md">
            <div className="brutal bg-white p-md">
              <h3 className="font-bold uppercase mb-sm flex items-center gap-sm"><Icon name="show_chart" /> Spend Over Time</h3>
              {(data.timeSeries||[]).length===0 ? <div className="text-sm opacity-60">No spend in range.</div> : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.timeSeries} margin={{ top:8, right:8, left:-8, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill:'var(--chart-axis-text)', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'var(--border)', strokeWidth:3 }} tickLine={{ stroke:'var(--border)', strokeWidth:3 }} />
                      <YAxis tick={{ fill:'var(--chart-axis-text)', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'var(--border)', strokeWidth:3 }} tickLine={{ stroke:'var(--border)', strokeWidth:3 }} />
                      <Tooltip contentStyle={brutalTooltipStyle()} />
                      <Area type="monotone" dataKey="spend" name="Spend ₹" stroke="var(--border)" strokeWidth={3} fill="var(--chart-1)" fillOpacity={0.22} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="brutal bg-white p-md">
              <h3 className="font-bold uppercase mb-sm">By Category</h3>
              {(data.byCategory||[]).length===0 ? <div className="text-sm opacity-60">No data.</div> : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byCategory} layout="vertical" margin={{ left: 40, right: 8 }}>
                      <CartesianGrid strokeDasharray="0" stroke="var(--border)" />
                      <XAxis type="number" tick={{ fill:'var(--chart-axis-text)', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'var(--border)', strokeWidth:3 }} />
                      <YAxis type="category" dataKey="category" tick={{ fill:'var(--chart-axis-text)', fontWeight:700, fontSize:10 }} width={90} axisLine={{ stroke:'var(--border)', strokeWidth:3 }} />
                      <Tooltip contentStyle={brutalTooltipStyle()} />
                      <Bar dataKey="spend" name="Spend ₹" stroke="var(--border)" strokeWidth={2}>
                        {data.byCategory.map((_:any,i:number)=> <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="brutal bg-white p-md">
              <h3 className="font-bold uppercase mb-sm">By Member</h3>
              {(data.byMember||[]).length===0 ? <div className="text-sm opacity-60">No data.</div> : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byMember}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill:'var(--chart-axis-text)', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'var(--border)', strokeWidth:3 }} />
                      <YAxis tick={{ fill:'var(--chart-axis-text)', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'var(--border)', strokeWidth:3 }} />
                      <Tooltip contentStyle={brutalTooltipStyle()} />
                      <Legend wrapperStyle={{ fontWeight:700, fontSize:12 }} />
                      <Bar dataKey="spend" name="Spend ₹" fill="var(--chart-1)" stroke="var(--border)" strokeWidth={3} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="brutal bg-white p-md">
              <h3 className="font-bold uppercase mb-sm">Top Vendors</h3>
              {(data.topVendors||[]).length===0 ? <div className="text-sm opacity-60">No vendors.</div> : (
                <div className="flex flex-col gap-xs">
                  {data.topVendors.map((v:any,i:number)=> (
                    <div key={v.vendor} className="flex justify-between items-center brutal-thin px-sm py-xs bg-surface-container-low">
                      <span className="text-xs font-bold truncate pr-sm">{i+1}. {v.vendor}</span>
                      <span className="text-xs font-bold whitespace-nowrap">{formatCurrency(v.spend)} <span className="opacity-60">×{v.count}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-md">
            <div className="brutal bg-white p-md">
              <h3 className="font-bold uppercase mb-sm">By Mode</h3>
              {(data.byModeShare||data.byMode||[]).length===0 ? <div className="text-sm opacity-60">No mode data.</div> : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.byModeShare||data.byMode} dataKey="spend" nameKey="mode" cx="50%" cy="50%" innerRadius="45%" outerRadius="80%" paddingAngle={2} stroke="var(--border)" strokeWidth={2} label={(props:any)=> pieLabelThreshold(props,5)}>
                        {(data.byModeShare||data.byMode).map((_:any,i:number)=> <Cell key={i} fill={CAT_COLORS[i%CAT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={brutalTooltipStyle()} formatter={(v:any,_n:any,p:any)=> [`${formatCurrency(v)}${p.payload.sharePct? ` (${p.payload.sharePct.toFixed(1)}%)`:''}`, p.payload.mode]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="brutal bg-white p-md">
              <h3 className="font-bold uppercase mb-sm">Member × Vendor (top)</h3>
              {(data.byMemberByVendor||[]).length===0 ? <div className="text-sm opacity-60">No data.</div> : (
                <div className="flex flex-col gap-xs max-h-[260px] overflow-auto">
                  {data.byMemberByVendor.slice(0,20).map((r:any)=> (
                    <div key={`${r.memberId}-${r.vendor}`} className="flex justify-between items-center brutal-thin px-sm py-xs bg-surface-container-low">
                      <span className="text-xs font-bold truncate pr-sm">{r.memberName} → {r.vendor}</span>
                      <span className="text-xs font-bold whitespace-nowrap">{formatCurrency(r.spend)} <span className="opacity-60">×{r.count}</span></span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs opacity-60 mt-sm">Shows how much each user spent on each vendor.</div>
            </div>
          </div>

          <div className="brutal bg-white p-md">
            <h3 className="font-bold uppercase mb-sm flex items-center gap-sm"><Icon name="calendar_month" /> Daily Heatmap <span className="text-xs normal-case opacity-60 ml-auto">darker = higher spend</span></h3>
            {(data.heatmap||[]).length===0 ? <div className="text-sm opacity-60">No days.</div> : (
              <>
                <div className="grid gap-xs" style={{ gridTemplateColumns: `repeat(${Math.min(14, data.heatmap.length)}, minmax(0,1fr))` }}>
                  {(() => {
                    const vals = data.heatmap.map((h:any)=> h.spendPaise).filter((v:number)=> v>0).sort((a:number,b:number)=> a-b)
                    // quantile breaks for 5-step palette (p20,p40,p60,p80) else fallback to linear
                    const q = (arr:number[], pct:number)=> {
                      if(!arr.length) return 0
                      const idx = Math.ceil(pct*arr.length)-1
                      return arr[Math.max(0, Math.min(arr.length-1, idx))]
                    }
                    const q20=q(vals,0.2), q40=q(vals,0.4), q60=q(vals,0.6), q80=q(vals,0.8)
                    const palette = [
                      { bg:'#ffffff', fg:'#1e1c10' }, // 0
                      { bg:'#fff7a0', fg:'#1e1c10' }, // q0-q20
                      { bg:'#ffe500', fg:'#1e1c10' }, // q20-q40
                      { bg:'#d4a017', fg:'white' },
                      { bg:'#6b6a5e', fg:'white' },
                      { bg:'#1e1c10', fg:'white' }, // q80-max
                    ]
                    const hiDate = data.highestDay?.date
                    return data.heatmap.map((h:any)=> {
                      const v=h.spendPaise
                      let level=0
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
                <div className="flex items-center gap-xs mt-sm text-xs font-bold uppercase">
                  <span className="opacity-60">Scale</span>
                  <span className="brutal-thin w-4 h-4" style={{background:'#ffffff'}} /> 0
                  <span className="brutal-thin w-4 h-4" style={{background:'#fff7a0'}} />
                  <span className="brutal-thin w-4 h-4" style={{background:'#ffe500'}} />
                  <span className="brutal-thin w-4 h-4" style={{background:'#d4a017'}} />
                  <span className="brutal-thin w-4 h-4" style={{background:'#6b6a5e'}} />
                  <span className="brutal-thin w-4 h-4" style={{background:'#1e1c10'}} /> max
                  <span className="ml-auto text-[11px] normal-case opacity-60">Empty days shown as white — not gaps</span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
