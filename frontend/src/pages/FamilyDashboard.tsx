import { useEffect, useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { analyticsService, familyService } from '../services/api'
import { apiClient } from '../services/apiClient'
import { Icon } from '../components/ui/Icon'
import { formatCurrency } from '../lib/format'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend,
} from 'recharts'

const CAT_COLORS = ['#FFE500','#1e1c10','#00fcfb','#FF6B6B','#9b5de5','#00bbf9','#f72585','#43aa8b']

function brutalTooltipStyle(): any {
  return {
    border: '3px solid #1e1c10',
    borderRadius: 0,
    boxShadow: '4px 4px 0 0 #1e1c10',
    fontFamily: 'Space Grotesk',
    fontWeight: 700,
  }
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
    apiClient.get('/families/me').then(r=> r.data?.family?._id ? familyService.members(r.data.family._id).then((d:any)=> setMembers(d.members||[])) : null).catch(()=>{})
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
        {(selMembers.length||selModes.length) ? <button onClick={()=>{ setSelMembers([]); setSelModes([])}} className="brutal bg-white px-md py-xs font-bold uppercase text-xs">Clear</button>: null}
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Actual Spend</div><div className="text-xl font-bold">{formatCurrency((s.actualExpenditurePaise||0)/100)}</div><div className="text-xs text-on-surface-variant">{data.totalCount} txns</div></div>
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Avg / day</div><div className="text-xl font-bold">{formatCurrency(data.avgDaily||0)}</div><div className="text-xs text-on-surface-variant">over range</div></div>
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Transfers</div><div className="text-xl font-bold">{formatCurrency((s.internalTransfersPaise||0)/100)}</div><div className="text-xs text-on-surface-variant">not spend</div></div>
            <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Highest Day</div><div className="text-sm font-bold">{data.highestDay ? `${data.highestDay.date} — ${formatCurrency(data.highestDay.spend)}` : '—'}</div></div>
          </div>

          <div className="grid lg:grid-cols-2 gap-md">
            <div className="brutal bg-white p-md">
              <h3 className="font-bold uppercase mb-sm flex items-center gap-sm"><Icon name="show_chart" /> Spend Over Time</h3>
              {(data.timeSeries||[]).length===0 ? <div className="text-sm opacity-60">No spend in range.</div> : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.timeSeries} margin={{ top:8, right:8, left:-8, bottom:0 }}>
                      <CartesianGrid strokeDasharray="0" stroke="#1e1c10" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill:'#1e1c10', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'#1e1c10', strokeWidth:3 }} tickLine={{ stroke:'#1e1c10', strokeWidth:3 }} />
                      <YAxis tick={{ fill:'#1e1c10', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'#1e1c10', strokeWidth:3 }} tickLine={{ stroke:'#1e1c10', strokeWidth:3 }} />
                      <Tooltip contentStyle={brutalTooltipStyle()} />
                      <Area type="monotone" dataKey="spend" name="Spend ₹" stroke="#1e1c10" strokeWidth={3} fill="#FFE500" />
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
                      <CartesianGrid strokeDasharray="0" stroke="#1e1c10" />
                      <XAxis type="number" tick={{ fill:'#1e1c10', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'#1e1c10', strokeWidth:3 }} />
                      <YAxis type="category" dataKey="category" tick={{ fill:'#1e1c10', fontWeight:700, fontSize:10 }} width={90} axisLine={{ stroke:'#1e1c10', strokeWidth:3 }} />
                      <Tooltip contentStyle={brutalTooltipStyle()} />
                      <Bar dataKey="spend" name="Spend ₹" fill="#1e1c10" stroke="#1e1c10" strokeWidth={2} />
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
                      <CartesianGrid strokeDasharray="0" stroke="#1e1c10" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill:'#1e1c10', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'#1e1c10', strokeWidth:3 }} />
                      <YAxis tick={{ fill:'#1e1c10', fontWeight:700, fontSize:10 }} axisLine={{ stroke:'#1e1c10', strokeWidth:3 }} />
                      <Tooltip contentStyle={brutalTooltipStyle()} />
                      <Legend wrapperStyle={{ fontWeight:700, fontSize:12 }} />
                      <Bar dataKey="spend" name="Spend ₹" fill="#FFE500" stroke="#1e1c10" strokeWidth={3} />
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

          <div className="brutal bg-white p-md">
            <h3 className="font-bold uppercase mb-sm flex items-center gap-sm"><Icon name="calendar_month" /> Daily Heatmap</h3>
            {(data.heatmap||[]).length===0 ? <div className="text-sm opacity-60">No days.</div> : (
              <div className="grid grid-cols-7 md:grid-cols-14 gap-xs">
                {(() => {
                  const max = Math.max(...data.heatmap.map((h:any)=> h.spendPaise), 1)
                  return data.heatmap.map((h:any)=> {
                    const intensity = h.spendPaise / max
                    const bg = intensity>0.66? '#1e1c10' : intensity>0.33? '#6b6a5e' : '#e9e2cf'
                    const fg = intensity>0.33? 'white':'#1e1c10'
                    const isMax = data.highestDay && h.date===data.highestDay.date
                    return <div key={h.date} title={`${h.date}: ${formatCurrency(h.spend)}`} className={`brutal-thin p-xs text-center text-xs font-bold ${isMax?'border-brand-yellow':''}`} style={{ background:bg, color: fg }}>{h.date.slice(5)}<div className="opacity-80">{formatCurrency(h.spend)}</div></div>
                  })
                })()}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
