import { useEffect, useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { apiClient } from '../services/apiClient'

export function Budgets() {
  const [items, setItems] = useState<any[]>([])
  const [form, setForm] = useState({ scope:'FAMILY', category:'', period:'MONTHLY', amount:'' })
  const [err, setErr] = useState<string|null>(null)

  function load(){ apiClient.get('/budgets').then(r=> setItems(r.data.items||r.data||[])).catch(()=>{}) }
  useEffect(()=>{ load() }, [])

  async function submit(e: React.FormEvent){
    e.preventDefault(); setErr(null)
    const amountPaise = Math.round(Number(form.amount||0)*100)
    if(!amountPaise) return
    try { await apiClient.post('/budgets', { scope: form.scope, category: form.category || undefined, period: form.period, amountPaise }); load(); setForm({ scope:'FAMILY', category:'', period:'MONTHLY', amount:'' }) } catch(ex:any){ setErr(ex.response?.data?.error||ex.message)}
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Budgets" subtitle="Family / category / member budgets. Spend is actual expenditure only." />
      {err && <div className="brutal-thin bg-error-container p-sm mb-md text-sm break-words">{err}</div>}
      <form onSubmit={submit} className="brutal bg-white p-md flex flex-wrap gap-sm mb-md items-end min-w-0 [&>label]:min-w-0 [&_input]:max-w-full [&_select]:max-w-full">
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Scope<select value={form.scope} onChange={e=> setForm({...form, scope:e.target.value})} className="brutal-thin px-sm py-xs"><option>FAMILY</option><option>CATEGORY</option><option>MEMBER</option></select></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Category<input value={form.category} onChange={e=> setForm({...form, category:e.target.value})} className="brutal-thin px-sm py-xs" placeholder="Groceries" /></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Period<select value={form.period} onChange={e=> setForm({...form, period:e.target.value})} className="brutal-thin px-sm py-xs"><option>MONTHLY</option><option>WEEKLY</option><option>YEARLY</option></select></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Amount ₹<input value={form.amount} onChange={e=> setForm({...form, amount:e.target.value})} className="brutal-thin px-sm py-xs" placeholder="10000" /></label>
        <button type="submit" className="brutal bg-brand-yellow px-md py-xs font-bold uppercase">Save Budget</button>
      </form>
      {items.length===0 ? <div className="brutal bg-white p-md text-sm">No budgets yet.</div> : (
        <div className="brutal bg-white overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap"><thead className="bg-on-surface text-white"><tr><th className="text-left px-sm py-xs">Scope</th><th className="text-left px-sm py-xs">Category</th><th className="text-left px-sm py-xs">Period</th><th className="text-left px-sm py-xs">Budget</th><th className="text-left px-sm py-xs">Spent</th></tr></thead><tbody>{items.map((b:any)=> <tr key={b._id} className="border-t-2 border-on-surface/20"><td className="px-sm py-xs">{b.scope}</td><td className="px-sm py-xs">{b.category||'—'}</td><td className="px-sm py-xs">{b.period}</td><td className="px-sm py-xs">{(b.amountPaise/100).toLocaleString('en-IN')}</td><td className="px-sm py-xs">{((b.spentPaise||0)/100).toLocaleString('en-IN')}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  )
}
