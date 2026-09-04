import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { apiClient } from '../services/apiClient'
import { familyService } from '../services/api'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar } from 'recharts'

type Tx = { _id:string; amountPaise:number; category?:string; subcategory?:string; productName?:string; lineItems?: any[]; occurredAt:string; type:string; mode:string; recipient?:{name?:string}; status:string; createdBy?: any }

const ALL_CATS = ['Groceries','Food','Electricity','Rent','Transportation','Shopping','Medical','Education','Entertainment','Bills','Household','Other']
const CAT_COLORS = ['#FFE500','#2EC4B6','#E8487F','#7B61FF','#FF7A45','#FFB347','#6BCB77','#4D96FF','#FFD500','#6b6a5e','#ffbe0b','#3a86ff']

export function VendorDetail(){
  const { id } = useParams()
  const nav = useNavigate()
  const [vendor, setVendor] = useState<any>(null)
  const [txs, setTxs] = useState<Tx[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [catEditId, setCatEditId] = useState<string|null>(null)
  const [catVal, setCatVal] = useState('')
  const [subVal, setSubVal] = useState('')
  const [prodVal, setProdVal] = useState('')

  // filters
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [memberId, setMemberId] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [page, setPage] = useState(0)
  const limit=50

  // vendor edit
  const [editMode, setEditMode] = useState(false)
  const [eLabel, setELabel] = useState('')
  const [eUpi, setEUpi] = useState('')
  const [eDesc, setEDesc] = useState('')
  const [eNotes, setENotes] = useState('')
  const [ePhone, setEPhone] = useState('')
  const [eAliases, setEAliases] = useState('')
  const [eContactMode, setEContactMode] = useState('')
  const [eCats, setECats] = useState<string[]>([])
  const [eCustomCat, setECustomCat] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string|null>(null)

  // products
  const [newProdName, setNewProdName] = useState('')
  const [newProdCat, setNewProdCat] = useState('Food')
  const [newProdSub, setNewProdSub] = useState('')
  const [newProdAmt, setNewProdAmt] = useState('')
  const [prodBusy, setProdBusy] = useState(false)

  function fetchMembers(){
    apiClient.get('/families/me').then(r=> r.data?.family?._id ? familyService.members(r.data.family._id).then((d:any)=> setMembers(d.members||[])) : null).catch(()=>{})
  }
  useEffect(()=> { fetchMembers() }, [])

  async function load(){
    setLoading(true)
    try{
      const params:any={ limit, skip: page*limit }
      if(from) params.from=from
      if(to) params.to=to
      if(memberId) params.memberId=memberId
      if(filterCat) params.category=filterCat
      const r:any = await apiClient.get(`/vendors/${id}/transactions`, { params })
      setVendor(r.data.vendor); setTxs(r.data.transactions||[]); setSummary({ totalPaise: r.data.totalPaise, byCategory: r.data.byCategory, bySubcategory: r.data.bySubcategory, byProduct: r.data.byProduct, byMember: r.data.byMember, monthlyBuckets: r.data.monthlyBuckets, count: r.data.count })
      // init edit fields on first load
      if(!editMode){
        setELabel(r.data.vendor.label||'')
        setEUpi(r.data.vendor.upiId||'')
        setEDesc(r.data.vendor.description||'')
        setENotes(r.data.vendor.notes||'')
        setEPhone(r.data.vendor.contact?.phone||'')
        setEAliases((r.data.vendor.aliases||[]).join(', '))
        setEContactMode(r.data.vendor.contact?.preferredMode||'')
        setECats(r.data.vendor.offerings?.map((o:any)=> o.category) || (r.data.vendor.primaryCategory?[r.data.vendor.primaryCategory]:[]))
        setNewProdCat(r.data.vendor.primaryCategory||'Food')
      }
    } finally { setLoading(false) }
  }
  useEffect(()=>{ if(id) load() }, [id, page, from, to, memberId, filterCat])

  async function saveCat(txId:string){
    try{
      await apiClient.patch(`/transactions/${txId}`, { category: catVal, subcategory: subVal||undefined, productName: prodVal||undefined })
      setCatEditId(null); load()
      setNotice('Transaction updated — vendor will learn')
      setTimeout(()=> setNotice(null),2000)
    } catch(e:any){ setNotice(e?.response?.data?.error||'Save failed'); setTimeout(()=> setNotice(null),2000) }
  }

  async function saveVendor(){
    if(!id) return
    if(!eCats.length){ setNotice('Pick at least one category'); setTimeout(()=> setNotice(null),2000); return }
    setSaving(true)
    try{
      await apiClient.put(`/recipients/${id}`, {
        label: eLabel.trim(),
        upiId: eUpi.trim() || undefined,
        description: eDesc.trim(),
        notes: eNotes.trim(),
        aliases: eAliases.split(',').map(s=> s.trim()).filter(Boolean),
        contact: { phone: ePhone.trim()||undefined, preferredMode: eContactMode||undefined },
        categories: eCats,
      })
      setEditMode(false); load()
      setNotice('Vendor saved')
      setTimeout(()=> setNotice(null),2000)
    } catch(e:any){ setNotice(e?.response?.data?.error||'Save failed'); setTimeout(()=> setNotice(null),2500) }
    finally{ setSaving(false) }
  }

  async function addProduct(){
    if(!newProdName.trim()){ setNotice('Product name required'); setTimeout(()=> setNotice(null),2000); return }
    setProdBusy(true)
    try{
      const amt = newProdAmt ? Math.round(Number(newProdAmt)*100) : undefined
      await apiClient.post(`/recipients/${id}/products`, { name: newProdName.trim(), category: newProdCat, subcategory: newProdSub.trim()||undefined, typicalAmountPaise: amt })
      setNewProdName(''); setNewProdSub(''); setNewProdAmt('')
      load()
      setNotice(`Product ${newProdName.trim()} added`)
      setTimeout(()=> setNotice(null),2000)
    } catch(e:any){ setNotice(e?.response?.data?.error||'Add failed'); setTimeout(()=> setNotice(null),2500) }
    finally{ setProdBusy(false) }
  }
  async function delProduct(pid:string){
    if(!confirm('Delete product? Price mapping will be removed.')) return
    setProdBusy(true)
    try{
      await apiClient.delete(`/recipients/${id}/products/${pid}`)
      load()
    } finally { setProdBusy(false) }
  }

  const byCategoryData = summary?.byCategory ? Object.entries(summary.byCategory).map(([k,v]:any)=> ({ name:k, value: Math.round((v as number)/100) })) : []
  const byProductData = summary?.byProduct ? Object.entries(summary.byProduct).map(([k,v]:any)=> ({ name:k, value: Math.round((v as number)/100) })) : []
  const monthlyData = summary?.monthlyBuckets || []

  return (
    <div>
      <button onClick={()=> nav('/vendors')} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase mb-md">← Back to Vendors</button>
      <PageHeader title={vendor?.label || 'Vendor'} subtitle={vendor ? `${vendor.vendorKey} · ${vendor.upiId||'no UPI'} · default ${vendor.primaryCategory||vendor.category||'Other'} · ${vendor.contact?.preferredMode||''}` : 'Loading…'} />
      {notice && <div className="brutal-thin bg-brand-yellow p-sm mb-md text-sm font-bold">{notice}</div>}

      {vendor && (
        <div className="brutal bg-white p-md mb-md">
          {!editMode ? (
            <>
              <div className="flex flex-wrap gap-sm items-center mb-sm">
                <span className="font-bold text-lg">{vendor.label}</span>
                <span className="text-xs brutal-thin px-xs py-0.5 bg-surface-container-low">{vendor.vendorKey}</span>
                {vendor.upiId && <span className="text-xs brutal-thin px-xs py-0.5 bg-brand-yellow">{vendor.upiId}</span>}
                <span className="ml-auto text-xs brutal-thin px-sm py-0.5 bg-brand-yellow font-bold uppercase">{vendor.primaryCategory}</span>
              </div>
              {vendor.description && <div className="text-sm mb-xs">{vendor.description}</div>}
              <div className="text-xs opacity-80 mb-xs">Offers: {(vendor.offerings||[]).map((o:any)=> `${o.category}×${o.hits}${o.subcategories?.length? ` (${o.subcategories.join(', ')})`:''}`).join(' · ') || vendor.primaryCategory}</div>
              {(vendor.products||[]).length>0 && <div className="text-xs mb-xs">Sells: {(vendor.products||[]).map((p:any)=> `${p.name} ${p.typicalAmountPaise? `₹${(p.typicalAmountPaise/100).toFixed(0)}`:''} · ${p.category}${p.subcategory? `/${p.subcategory}`:''} ×${p.hits}`).join(' · ')}</div>}
              {(vendor.aliases||[]).length>0 && <div className="text-xs opacity-60 mb-xs">Aliases: {vendor.aliases.join(', ')}</div>}
              {(vendor.contact?.phone || vendor.contact?.address) && <div className="text-xs opacity-60 mb-xs">Contact: {vendor.contact.phone||''} {vendor.contact.address? `· ${vendor.contact.address}`:''} {vendor.contact.preferredMode? `· ${vendor.contact.preferredMode}`:''}</div>}
              {vendor.notes && <div className="text-xs opacity-60 mb-xs">Notes: {vendor.notes}</div>}
              <div className="text-xs opacity-60 mb-sm">Hits {vendor.hits} · Last seen {vendor.lastSeen? new Date(vendor.lastSeen).toLocaleString('en-IN') : '—'} {vendor.createdBy? `· by ${vendor.createdBy}`:''}</div>
              <button onClick={()=> setEditMode(true)} className="brutal bg-brand-yellow px-md py-xs font-bold uppercase text-sm">Edit Vendor</button>
            </>
          ) : (
            <div className="flex flex-col gap-sm">
              <h3 className="font-bold uppercase">Edit Vendor</h3>
              <div className="grid md:grid-cols-2 gap-sm">
                <label className="flex flex-col text-xs font-bold uppercase gap-1">Label <input value={eLabel} onChange={e=> setELabel(e.target.value)} className="brutal-thin px-sm py-xs bg-white" /></label>
                <label className="flex flex-col text-xs font-bold uppercase gap-1">UPI ID <input value={eUpi} onChange={e=> setEUpi(e.target.value)} className="brutal-thin px-sm py-xs bg-white" /></label>
                <label className="flex flex-col text-xs font-bold uppercase gap-1">Phone <input value={ePhone} onChange={e=> setEPhone(e.target.value)} className="brutal-thin px-sm py-xs bg-white" /></label>
                <label className="flex flex-col text-xs font-bold uppercase gap-1">Mode <select value={eContactMode} onChange={e=> setEContactMode(e.target.value)} className="brutal-thin px-sm py-xs bg-white"><option value="">—</option>{['UPI','BANK','CASH','CARD','OTHER'].map(m=> <option key={m} value={m}>{m}</option>)}</select></label>
              </div>
              <label className="flex flex-col text-xs font-bold uppercase gap-1">Description <input value={eDesc} onChange={e=> setEDesc(e.target.value)} className="brutal-thin px-sm py-xs bg-white" /></label>
              <label className="flex flex-col text-xs font-bold uppercase gap-1">Aliases (comma separated) <input value={eAliases} onChange={e=> setEAliases(e.target.value)} placeholder="dairy guy, milk guy" className="brutal-thin px-sm py-xs bg-white" /></label>
              <label className="flex flex-col text-xs font-bold uppercase gap-1">Notes <input value={eNotes} onChange={e=> setENotes(e.target.value)} className="brutal-thin px-sm py-xs bg-white" /></label>
              <div className="flex flex-col gap-sm">
                <span className="text-xs font-bold uppercase">Categories (what this vendor offers)</span>
                <div className="flex flex-wrap gap-xs">{ALL_CATS.filter(c=> c!=='Other').map(c=> <button key={c} onClick={()=> setECats(p=> p.includes(c)? p.filter(x=> x!==c): [...p,c])} className={`brutal-thin px-xs py-xs text-xs font-bold uppercase ${eCats.includes(c)? 'bg-brand-yellow':'bg-white'}`}>{c}</button>)}</div>
                <div className="flex gap-xs">
                  <input value={eCustomCat} onChange={e=> setECustomCat(e.target.value)} onKeyDown={e=> e.key==='Enter' && (()=>{ const c=eCustomCat.trim(); if(!c) return; const n=c[0].toUpperCase()+c.slice(1).toLowerCase(); if(!eCats.includes(n)) setECats(p=> [...p,n]); setECustomCat('')} )()} placeholder="Custom category" className="brutal-thin px-sm py-xs text-xs flex-1 bg-white" />
                  <button onClick={()=>{ const c=eCustomCat.trim(); if(!c) return; const n=c[0].toUpperCase()+c.slice(1).toLowerCase(); if(!eCats.includes(n)) setECats(p=> [...p,n]); setECustomCat('')}} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">+ Add</button>
                </div>
              </div>
              <div className="flex gap-sm">
                <button onClick={saveVendor} disabled={saving} className="brutal bg-brand-yellow px-md py-xs font-bold uppercase text-sm">{saving?'Saving…':'Save'}</button>
                <button onClick={()=> setEditMode(false)} className="brutal bg-white px-md py-xs font-bold uppercase text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Products */}
      {vendor && (
        <div className="brutal bg-white p-md mb-md">
          <h3 className="font-bold uppercase mb-sm">What this vendor sells — products (free form)</h3>
          <div className="text-xs opacity-60 mb-sm">Add products with typical amount to enable amount → product suggestions, e.g. 40 → paneer. Keep category as transaction category.</div>
          <div className="flex flex-wrap gap-sm mb-sm">
            {(vendor.products||[]).length===0 ? <span className="text-sm opacity-60">No products yet — add below.</span> : vendor.products.map((p:any)=> (
              <span key={p._id} className="brutal-thin bg-surface-container-low px-sm py-xs text-xs flex items-center gap-sm">
                <span className="font-bold">{p.name}</span>
                <span className="opacity-60">{p.category}{p.subcategory? `/${p.subcategory}`:''}</span>
                {p.typicalAmountPaise && <span className="brutal-thin px-xs py-0.5 bg-brand-yellow">₹{(p.typicalAmountPaise/100).toFixed(0)}</span>}
                <span className="opacity-60">×{p.hits}</span>
                <button onClick={()=> delProduct(p._id)} className="ml-xs font-bold">×</button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-sm items-end">
            <label className="flex flex-col text-xs font-bold uppercase gap-1">Name <input value={newProdName} onChange={e=> setNewProdName(e.target.value)} placeholder="paneer" className="brutal-thin px-sm py-xs bg-white" /></label>
            <label className="flex flex-col text-xs font-bold uppercase gap-1">Category <select value={newProdCat} onChange={e=> setNewProdCat(e.target.value)} className="brutal-thin px-sm py-xs bg-white">{ALL_CATS.map(c=> <option key={c} value={c}>{c}</option>)}</select></label>
            <label className="flex flex-col text-xs font-bold uppercase gap-1">Subcategory <input value={newProdSub} onChange={e=> setNewProdSub(e.target.value)} placeholder="Protein" className="brutal-thin px-sm py-xs bg-white" /></label>
            <label className="flex flex-col text-xs font-bold uppercase gap-1">Typical ₹ <input type="number" value={newProdAmt} onChange={e=> setNewProdAmt(e.target.value)} placeholder="40" className="brutal-thin px-sm py-xs bg-white w-24" /></label>
            <button onClick={addProduct} disabled={prodBusy} className="brutal bg-brand-yellow px-md py-xs font-bold uppercase text-sm">{prodBusy?'Saving…':'+ Add product'}</button>
          </div>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-sm mb-md">
          <div className="brutal bg-brand-yellow p-sm"><div className="text-xs uppercase font-bold">Transactions</div><div className="text-xl font-bold">{summary.count}</div><div className="text-xs opacity-60">{txs.length} on page</div></div>
          <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold">Total spend</div><div className="text-xl font-bold">₹{(summary.totalPaise/100).toLocaleString('en-IN')}</div><div className="text-xs opacity-60">EXPENSE only</div></div>
          <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold">Avg per txn</div><div className="text-xl font-bold">₹{summary.count? ((summary.totalPaise/100)/summary.count).toFixed(0):0}</div></div>
          <div className="brutal bg-white p-sm md:col-span-1"><div className="text-xs uppercase font-bold">By member</div><div className="text-xs">{summary.byMember?.length? summary.byMember.map((m:any)=> `${m.name} ₹${m.spend.toFixed(0)} ×${m.count}`).join(' · ') : '—'}</div></div>
        </div>
      )}

      {/* Graphs */}
      {summary && (
        <div className="grid lg:grid-cols-3 gap-md mb-md">
          <div className="brutal bg-white p-md">
            <h3 className="font-bold uppercase mb-sm text-xs">Spend Trend (monthly)</h3>
            {monthlyData.length===0 ? <div className="text-xs opacity-60">No trend.</div> : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="3 3"/>
                    <XAxis dataKey="month" tick={{fill:'var(--chart-axis-text)', fontSize:10, fontWeight:700}} axisLine={{stroke:'var(--border)'}} tickLine={{stroke:'var(--border)'}} />
                    <YAxis tick={{fill:'var(--chart-axis-text)', fontSize:10, fontWeight:700}} axisLine={{stroke:'var(--border)'}} />
                    <Tooltip contentStyle={{background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:0, boxShadow:'0 4px 16px rgba(0,0,0,0.3)', color:'var(--text-primary)'}} />
                    <Area type="monotone" dataKey="spend" stroke="var(--border)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.22} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="brutal bg-white p-md">
            <h3 className="font-bold uppercase mb-sm text-xs">By Category</h3>
            {byCategoryData.length===0 ? <div className="text-xs opacity-60">No data.</div> : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCategoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(props:any)=> { const total = byCategoryData.reduce((s:any,v:any)=>s+v.value,0); const pct = total? props.payload.value/total*100:0; return pct<5? null : `${props.payload.name} ${pct.toFixed(0)}%`; }}>
                      {byCategoryData.map((_:any,i:number)=> <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} stroke="var(--border)" strokeWidth={1.5}/>)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="brutal bg-white p-md">
            <h3 className="font-bold uppercase mb-sm text-xs">By Product</h3>
            {byProductData.length===0 ? <div className="text-xs opacity-60">No product spend — transactions have no productName yet.</div> : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byProductData.slice(0,6)} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3"/>
                    <XAxis type="number" tick={{fill:'var(--chart-axis-text)', fontSize:10}} axisLine={{stroke:'var(--border)'}} />
                    <YAxis type="category" dataKey="name" tick={{fill:'var(--chart-axis-text)', fontSize:10, fontWeight:700}} width={90} axisLine={{stroke:'var(--border)'}} />
                    <Tooltip />
                    <Bar dataKey="value" fill="var(--chart-1)" stroke="var(--border)" strokeWidth={1}>
                      {byProductData.slice(0,6).map((_:any,i:number)=> <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="brutal bg-white p-sm mb-md flex flex-wrap gap-sm items-end">
        <label className="flex flex-col text-xs font-bold uppercase gap-1">From <input type="date" value={from} onChange={e=> {setFrom(e.target.value); setPage(0)}} className="brutal-thin px-sm py-xs" /></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">To <input type="date" value={to} onChange={e=> {setTo(e.target.value); setPage(0)}} className="brutal-thin px-sm py-xs" /></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Member <select value={memberId} onChange={e=> {setMemberId(e.target.value); setPage(0)}} className="brutal-thin px-sm py-xs bg-white"><option value="">All members</option>{members.map((m:any)=> <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Category <select value={filterCat} onChange={e=> {setFilterCat(e.target.value); setPage(0)}} className="brutal-thin px-sm py-xs bg-white"><option value="">All</option>{ALL_CATS.map(c=> <option key={c} value={c}>{c}</option>)}</select></label>
        <button onClick={()=> {setFrom(''); setTo(''); setMemberId(''); setFilterCat(''); setPage(0)}} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">Clear</button>
        <span className="text-xs opacity-60 ml-auto">{summary?.count||0} total · page {page+1}</span>
      </div>

      {loading ? <div className="brutal bg-white p-md text-sm">Loading…</div> : txs.length===0 ? <div className="brutal bg-white p-md text-sm">No transactions for this vendor with current filters. It fills once payments with matching name/UPI arrive from CSV/screenshots.</div> : (
        <div className="brutal bg-white overflow-hidden mb-md">
          <table className="w-full text-sm">
            <thead className="bg-on-surface text-white"><tr><th className="text-left px-sm py-xs">Date</th><th className="text-left px-sm py-xs">Amount</th><th className="text-left px-sm py-xs">Category</th><th className="text-left px-sm py-xs">Product</th><th className="text-left px-sm py-xs">By</th><th className="text-left px-sm py-xs">Mode</th><th className="text-left px-sm py-xs">Status</th><th className="text-left px-sm py-xs">Action</th></tr></thead>
            <tbody>
              {txs.map(t=> {
                const madeBy = t.createdBy?.name || (typeof t.createdBy==='string'? t.createdBy.slice(0,8): '—')
                return (
                <tr key={t._id} className="border-t-2 border-on-surface/20">
                  <td className="px-sm py-xs whitespace-nowrap">{new Date(t.occurredAt).toLocaleString('en-IN')}</td>
                  <td className="px-sm py-xs font-bold">₹{(t.amountPaise/100).toLocaleString('en-IN')}</td>
                  <td className="px-sm py-xs">
                    {catEditId===t._id ? (
                      <span className="flex flex-col gap-xs">
                        <select value={catVal} onChange={e=> setCatVal(e.target.value)} className="brutal-thin px-xs py-0.5 text-xs bg-white"><option value="">—</option>{ALL_CATS.map(c=> <option key={c} value={c}>{c}</option>)}</select>
                        <input value={subVal} onChange={e=> setSubVal(e.target.value)} placeholder="subcategory" className="brutal-thin px-xs py-0.5 text-xs bg-white" />
                        <input value={prodVal} onChange={e=> setProdVal(e.target.value)} placeholder="product e.g. paneer" className="brutal-thin px-xs py-0.5 text-xs bg-white" />
                        <span className="flex gap-xs">
                          <button onClick={()=> saveCat(t._id)} className="brutal bg-brand-yellow px-xs py-0.5 text-xs font-bold">Save</button>
                          <button onClick={()=> setCatEditId(null)} className="brutal bg-white px-xs py-0.5 text-xs font-bold">Cancel</button>
                        </span>
                      </span>
                    ) : <button onClick={()=> { setCatEditId(t._id); setCatVal(t.category||'Other'); setSubVal(t.subcategory||''); setProdVal(t.productName||'')}} className="brutal-thin px-xs py-0.5 text-xs bg-white">{t.category||'Other'}{t.subcategory? `/${t.subcategory}`:''}</button>}
                  </td>
                  <td className="px-sm py-xs text-xs">{t.productName || t.lineItems?.[0]?.productName || '—'}</td>
                  <td className="px-sm py-xs text-xs">{madeBy}</td>
                  <td className="px-sm py-xs text-xs">{t.mode}</td>
                  <td className="px-sm py-xs text-xs">{t.status}</td>
                  <td className="px-sm py-xs text-xs">{t.recipient?.name||'—'}</td>
                </tr>
              )})}
            </tbody>
          </table>
          <div className="flex justify-between p-sm border-t-2 border-on-surface/20">
            <button disabled={page===0} onClick={()=> setPage(p=> Math.max(0,p-1))} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase disabled:opacity-50">Prev</button>
            <button disabled={txs.length<limit} onClick={()=> setPage(p=> p+1)} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
