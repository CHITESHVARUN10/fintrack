import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { apiClient } from '../services/apiClient'

type Vendor = {
  _id: string
  label: string
  vendorKey: string
  upiId?: string
  primaryCategory?: string
  category?: string
  offerings?: { category:string; hits:number; subcategories?: string[] }[]
  products?: { _id:string; name:string; category:string; subcategory?:string; typicalAmountPaise?:number; hits:number; lastSeen?:string }[]
  priceMap?: { amountPaise:number; productRef:string; hits:number }[]
  hits:number
  lastSeen?:string
  description?:string
  aliases?:string[]
  contact?:{ phone?:string; email?:string; address?:string; preferredMode?:string }
  notes?:string
  status?:string
}

const FALLBACK_CATEGORIES = ['Groceries','Food','Electricity','Rent','Transportation','Shopping','Medical','Education','Entertainment','Bills','Household','Other']
const MODES = ['UPI','BANK','CASH','CARD','OTHER'] as const

export function Vendors(){
  const nav = useNavigate()
  const [items, setItems] = useState<Vendor[]>([])
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [cats, setCats] = useState<string[]>(FALLBACK_CATEGORIES)
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string|null>(null)
  const [editCats, setEditCats] = useState<string[]>([])
  const [editLabel, setEditLabel] = useState('')
  const [editUpi, setEditUpi] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editMode, setEditMode] = useState('')
  const [customCat, setCustomCat] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string|null>(null)
  const [backfilling, setBackfilling] = useState(false)

  // create modal
  const [showCreate, setShowCreate] = useState(false)
  const [cLabel, setCLabel] = useState('')
  const [cUpi, setCUpi] = useState('')
  const [cMode, setCMode] = useState('UPI')
  const [cCats, setCCats] = useState<string[]>([])
  const [cCustom, setCCustom] = useState('')
  const [cProducts, setCProducts] = useState<{ name:string; category:string; typicalAmountPaise?: number }[]>([])
  const [cProdName, setCProdName] = useState('')
  const [cProdAmt, setCProdAmt] = useState('')

  const [mergeSource, setMergeSource] = useState<string|null>(null)
  const [mergeTarget, setMergeTarget] = useState('')

  function load(search=q, category=catFilter){
    setLoading(true)
    const params:any={}
    if(search.trim()) params.q=search.trim()
    if(category) params.category=category
    apiClient.get('/recipients', { params }).then(r=> {
      const arr = r.data.items||r.data||[]
      setItems(arr)
      if(arr.length===0 && !search.trim() && !category && !backfilling) {
        setBackfilling(true)
        apiClient.post('/recipients/backfill').then((b:any)=> {
          const d=b.data
          if(d.touched>0){ setNotice(`Backfilled ${d.touched} vendors from ${d.scanned} transactions — including past imports. Edit to teach.`); load('','') }
          else { setNotice(null) }
        }).finally(()=> setBackfilling(false))
      }
    }).finally(()=> setLoading(false))
  }
  async function backfill(){
    setBackfilling(true)
    try{
      const r:any = await apiClient.post('/recipients/backfill')
      setNotice(`Backfilled ${r.data.touched} vendors from ${r.data.scanned} transactions`)
      load('','')
    } finally { setBackfilling(false) }
  }
  useEffect(()=>{ load('','') }, [])
  useEffect(()=>{
    apiClient.get('/recipients/categories').then((r:any)=>{
      if(r.data?.categories?.length) setCats(r.data.categories)
    }).catch(()=>{})
  }, [])

  function startEdit(v: Vendor){
    setEditId(v._id)
    const cs = (v.offerings && v.offerings.length ? v.offerings.map(o=> o.category) : (v.primaryCategory? [v.primaryCategory]: []))
    setEditCats(cs)
    setEditLabel(v.label||'')
    setEditUpi(v.upiId||'')
    setEditDesc(v.description||'')
    setEditNotes(v.notes||'')
    setEditPhone(v.contact?.phone||'')
    setEditMode(v.contact?.preferredMode||'')
    setCustomCat('')
  }

  function toggle(cat:string){
    setEditCats(p=> p.includes(cat)? p.filter(c=> c!==cat): [...p, cat])
  }
  function toggleCreate(cat:string){
    setCCats(p=> p.includes(cat)? p.filter(c=> c!==cat): [...p, cat])
  }
  function addCustom(){
    const c = customCat.trim()
    if(!c) return
    const normalized = c[0].toUpperCase()+c.slice(1).toLowerCase()
    if(!editCats.includes(normalized)) setEditCats(p=> [...p, normalized])
    if(!cats.includes(normalized)) setCats(p=> [...p, normalized])
    setCustomCat('')
  }
  function addCreateCustom(){
    const c = cCustom.trim()
    if(!c) return
    const normalized = c[0].toUpperCase()+c.slice(1).toLowerCase()
    if(!cCats.includes(normalized)) setCCats(p=> [...p, normalized])
    if(!cats.includes(normalized)) setCats(p=> [...p, normalized])
    setCCustom('')
  }

  async function save(){
    if(!editId) return
    if(!editCats.length) { setNotice('Pick at least one category'); setTimeout(()=> setNotice(null),2000); return }
    setBusy(true)
    try{
      await apiClient.put(`/recipients/${editId}`, {
        label: editLabel.trim() || undefined,
        upiId: editUpi.trim() || undefined,
        categories: editCats,
        description: editDesc.trim(),
        notes: editNotes.trim(),
        contact: { phone: editPhone.trim()||undefined, preferredMode: editMode||undefined },
      })
      setEditId(null); load()
      setNotice('Vendor updated')
      setTimeout(()=> setNotice(null),2000)
    } catch(e:any){
      setNotice(e?.response?.data?.error||'Save failed')
      setTimeout(()=> setNotice(null),2500)
    } finally { setBusy(false) }
  }

  async function archive(id:string){
    if(!confirm('Archive this vendor? Transactions remain but vendor hidden from list.')) return
    setBusy(true)
    try{
      await apiClient.delete(`/recipients/${id}`)
      load()
      setNotice('Vendor archived')
      setTimeout(()=> setNotice(null),2000)
    } finally { setBusy(false) }
  }

  async function createVendor(){
    if(!cLabel.trim()){ setNotice('Label required'); setTimeout(()=>setNotice(null),2000); return }
    if(!cCats.length){ setNotice('Pick at least one category'); setTimeout(()=>setNotice(null),2000); return }
    if(!cUpi.trim() && !cMode){ setNotice('UPI ID or payment mode required'); setTimeout(()=>setNotice(null),2000); return }
    setBusy(true)
    try{
      const products = cProducts.filter(p=> p.name).map(p=> ({
        name: p.name,
        category: p.category || cCats[0],
        typicalAmountPaise: p.typicalAmountPaise,
      }))
      await apiClient.post('/recipients', {
        label: cLabel.trim(),
        upiId: cUpi.trim()||undefined,
        preferredMode: cMode,
        categories: cCats,
        products: products.length? products: undefined,
      })
      setShowCreate(false)
      setCLabel(''); setCUpi(''); setCCats([]); setCProducts([]); setCProdName(''); setCProdAmt('')
      load()
      setNotice('Vendor created')
      setTimeout(()=> setNotice(null),2000)
    } catch(e:any){
      setNotice(e?.response?.data?.error||'Create failed')
      setTimeout(()=> setNotice(null),2500)
    } finally { setBusy(false) }
  }

  async function apply(id:string){
    setBusy(true)
    try{
      const r:any = await apiClient.post(`/recipients/${id}/apply`, { overwrite: false })
      alert(`Matched ${r.data.matched}, updated ${r.data.updated} transactions (only Other)`)
    } finally { setBusy(false) }
  }

  async function doMerge(){
    if(!mergeSource || !mergeTarget) return
    if(mergeSource===mergeTarget){ setNotice('Pick different target'); setTimeout(()=>setNotice(null),2000); return }
    setBusy(true)
    try{
      await apiClient.post(`/recipients/${mergeSource}/merge`, { targetId: mergeTarget })
      setMergeSource(null); setMergeTarget('')
      load()
      setNotice('Vendors merged')
      setTimeout(()=> setNotice(null),2000)
    } catch(e:any){
      setNotice(e?.response?.data?.error||'Merge failed')
      setTimeout(()=> setNotice(null),2500)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Teach FinStack what each vendor offers — dairy guy, Amazon Pay, fruit stall. Future payments inherit the default category. Add standalone vendors with UPI/mode." />
      {notice && <div className="brutal-thin bg-brand-yellow p-sm mb-md text-sm font-bold flex items-center gap-xs"><span className="w-6 h-6 flex items-center justify-center bg-white border-2 border-on-surface text-xs">✓</span>{notice}</div>}
      <div className="flex flex-wrap gap-sm mb-md">
        <input value={q} onChange={e=> setQ(e.target.value)} onKeyDown={e=> e.key==='Enter' && load()} placeholder="Search vendors, UPI, alias…" className="brutal-thin px-sm py-xs text-sm flex-1 bg-white" />
        <select value={catFilter} onChange={e=>{ setCatFilter(e.target.value); load(q, e.target.value)}} className="brutal-thin px-sm py-xs text-sm bg-white">
          <option value="">All categories</option>
          {cats.map(c=> <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={()=> load()} className="brutal bg-brand-yellow px-md py-xs font-bold uppercase text-sm">Search</button>
        <button onClick={backfill} disabled={backfilling} className="brutal bg-white px-md py-xs font-bold uppercase text-sm disabled:opacity-50">{backfilling? 'Backfilling…':'Backfill'}</button>
        <button onClick={()=> setShowCreate(true)} className="brutal bg-on-surface text-white px-md py-xs font-bold uppercase text-sm">+ New Vendor</button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-md">
          <div className="absolute inset-0 bg-on-surface/40" onClick={()=> setShowCreate(false)} />
          <div className="relative w-full max-w-xl brutal bg-white p-md flex flex-col gap-sm max-h-[90vh] overflow-auto">
            <h3 className="font-bold uppercase">New Vendor</h3>
            <label className="flex flex-col text-xs font-bold uppercase gap-1">Label* <input value={cLabel} onChange={e=> setCLabel(e.target.value)} placeholder="e.g. Dairy Guy" className="brutal-thin px-sm py-xs bg-white text-sm" /></label>
            <label className="flex flex-col text-xs font-bold uppercase gap-1">UPI ID (or leave blank if using mode) <input value={cUpi} onChange={e=> setCUpi(e.target.value)} placeholder="dairyguy@upi" className="brutal-thin px-sm py-xs bg-white text-sm" /></label>
            <label className="flex flex-col text-xs font-bold uppercase gap-1">Preferred Mode* <select value={cMode} onChange={e=> setCMode(e.target.value)} className="brutal-thin px-sm py-xs bg-white text-sm"><option value="">Select</option>{MODES.map(m=> <option key={m} value={m}>{m}</option>)}</select></label>
            <div className="flex flex-col gap-sm">
              <span className="text-xs font-bold uppercase">Categories* (check all that apply)</span>
              <div className="flex flex-wrap gap-xs">{cats.filter(c=> c!=='Other').map(c=> <button key={c} onClick={()=> toggleCreate(c)} className={`brutal-thin px-xs py-xs text-xs font-bold uppercase ${cCats.includes(c)? 'bg-brand-yellow':'bg-white'}`}>{c}</button>)}</div>
              <div className="flex gap-xs">
                <input value={cCustom} onChange={e=> setCCustom(e.target.value)} onKeyDown={e=> e.key==='Enter' && addCreateCustom()} placeholder="Custom (e.g. Stationery)" className="brutal-thin px-sm py-xs text-xs flex-1 bg-white" />
                <button onClick={addCreateCustom} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">+ Add</button>
              </div>
            </div>
            <div className="brutal-thin bg-surface-container-low p-sm flex flex-col gap-sm">
              <span className="text-xs font-bold uppercase">What does this vendor sell? (products — free form, optional)</span>
              <div className="flex gap-xs">
                <input value={cProdName} onChange={e=> setCProdName(e.target.value)} placeholder="e.g. paneer" className="brutal-thin px-sm py-xs text-xs flex-1 bg-white" />
                <input value={cProdAmt} onChange={e=> setCProdAmt(e.target.value)} placeholder="₹ typical (e.g. 40)" className="brutal-thin px-sm py-xs text-xs w-28 bg-white" type="number" />
                <select value={cProducts.length? cProducts[cProducts.length-1]?.category||cCats[0]||'Food' : cCats[0]||'Food'} onChange={()=>{}} className="hidden" />
                <button onClick={()=>{
                  if(!cProdName.trim()) return
                  const amt = cProdAmt ? Math.round(Number(cProdAmt)*100) : undefined
                  setCProducts(p=> [...p, { name: cProdName.trim(), category: cCats[0]||'Other', typicalAmountPaise: amt }])
                  setCProdName(''); setCProdAmt('')
                }} className="brutal bg-brand-yellow px-sm py-xs text-xs font-bold uppercase">+ Product</button>
              </div>
              {cProducts.length>0 && <div className="flex flex-wrap gap-xs">{cProducts.map((pr,i)=> <span key={i} className="brutal-thin bg-white px-xs py-0.5 text-xs flex items-center gap-xs">{pr.name} {pr.typicalAmountPaise? `₹${(pr.typicalAmountPaise/100).toFixed(0)}` : ''} <button onClick={()=> setCProducts(p=> p.filter((_,idx)=> idx!==i))} className="ml-xs font-bold">×</button></span> )}</div>}
              <span className="text-[11px] opacity-60">e.g. 40 → paneer helps future suggestion when amount matches. Leave empty if not needed.</span>
            </div>
            <div className="flex gap-sm">
              <button onClick={createVendor} disabled={busy} className="brutal bg-brand-yellow px-md py-xs font-bold uppercase text-sm">{busy?'Saving…':'Create'}</button>
              <button onClick={()=> setShowCreate(false)} className="brutal bg-white px-md py-xs font-bold uppercase text-sm">Cancel</button>
            </div>
            <span className="text-[11px] opacity-60">* Required. UPI or mode identifies how you pay this vendor (CSV/UPI screenshot).</span>
          </div>
        </div>
      )}

      {mergeSource && (
        <div className="brutal bg-brand-yellow/20 p-sm mb-md flex flex-col gap-sm">
          <span className="text-xs font-bold uppercase">Merge {items.find(x=> x._id===mergeSource)?.label} into:</span>
          <div className="flex gap-sm">
            <select value={mergeTarget} onChange={e=> setMergeTarget(e.target.value)} className="brutal-thin px-sm py-xs text-sm flex-1 bg-white">
              <option value="">Select target vendor</option>
              {items.filter(x=> x._id!==mergeSource).map(v=> <option key={v._id} value={v._id}>{v.label} ({v.vendorKey})</option>)}
            </select>
            <button onClick={doMerge} disabled={busy || !mergeTarget} className="brutal bg-brand-yellow px-sm py-xs text-xs font-bold uppercase">Merge</button>
            <button onClick={()=> { setMergeSource(null); setMergeTarget('')}} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">Cancel</button>
          </div>
          <span className="text-[11px] opacity-60">All products, offerings, and transactions will move to target. Source will be deleted.</span>
        </div>
      )}

      {loading ? <div className="brutal bg-white p-md text-sm">Loading…</div> : items.length===0 ? <div className="brutal bg-white p-md text-sm">No vendors yet — create one via + New Vendor or save from a transaction's detail drawer.</div> : (
        <div className="flex flex-col gap-sm">
          {items.map(v=> {
            const isEditing = editId===v._id
            return (
              <div key={v._id} onClick={()=> !isEditing && nav(`/vendors/${v._id}`)} className="brutal bg-white p-md flex flex-col gap-sm cursor-pointer hover:bg-brand-yellow/10">
                <div className="flex flex-wrap gap-sm items-center">
                  <span className="font-bold">{v.label}</span>
                  <span className="text-xs opacity-60 brutal-thin px-xs py-0.5 bg-surface-container-low">{v.vendorKey}</span>
                  {v.upiId && <span className="text-xs brutal-thin px-xs py-0.5 bg-white">{v.upiId}</span>}
                  {v.contact?.preferredMode && <span className="text-xs brutal-thin px-xs py-0.5 bg-white">{v.contact.preferredMode}</span>}
                  <span className="text-xs opacity-60">hits {v.hits}</span>
                  {v.lastSeen && <span className="text-xs opacity-60">{new Date(v.lastSeen).toLocaleDateString('en-IN')}</span>}
                  {v.status==='ARCHIVED' && <span className="text-xs brutal-thin px-xs py-0.5 bg-on-surface text-white">ARCHIVED</span>}
                  {!isEditing && <span className="ml-auto brutal-thin px-sm py-0.5 bg-brand-yellow text-xs font-bold uppercase">{v.primaryCategory || v.category || 'Other'}</span>}
                  {(v.offerings||[]).length>0 && !isEditing && <span className="text-xs">{v.offerings!.map(o=> `${o.category}×${o.hits}${o.subcategories?.length? ` (${o.subcategories.join(',')})`:''}`).join(' · ')}</span>}
                </div>
                {v.description && !isEditing && <div className="text-xs opacity-80">{v.description}</div>}
                {(v.products||[]).length>0 && !isEditing && <div className="text-xs">Sells: {(v.products||[]).map(p=> `${p.name}${p.typicalAmountPaise? ` ₹${(p.typicalAmountPaise/100).toFixed(0)}`:''} ×${p.hits}`).join(' · ')}</div>}
                {v.aliases && v.aliases.length>0 && !isEditing && <div className="text-xs opacity-60">aka: {v.aliases.join(', ')}</div>}
                {v.contact?.phone && !isEditing && <div className="text-xs opacity-60">☎ {v.contact.phone} {v.contact.address? `· ${v.contact.address}`:''}</div>}
                {!isEditing ? (
                 <div className="flex flex-wrap gap-sm" onClick={e=> e.stopPropagation()}>
                   <button onClick={(e)=>{ e.stopPropagation(); startEdit(v)}} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">Edit</button>
                   <button onClick={(e)=>{ e.stopPropagation(); apply(v._id)}} disabled={busy} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">Apply to Other</button>
                   <button onClick={(e)=>{ e.stopPropagation(); setMergeSource(v._id)}} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">Merge</button>
                   <button onClick={(e)=>{ e.stopPropagation(); archive(v._id)}} disabled={busy} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">Archive</button>
                   <button onClick={(e)=>{ e.stopPropagation(); nav(`/vendors/${v._id}`)}} className="brutal bg-brand-yellow px-sm py-xs text-xs font-bold uppercase ml-auto">View →</button>
                 </div>
                ) : (
                  <div className="brutal-thin bg-brand-yellow/20 p-sm flex flex-col gap-sm" onClick={e=> e.stopPropagation()}>
                    <div className="grid md:grid-cols-2 gap-sm">
                      <label className="flex flex-col text-xs font-bold uppercase gap-1">Label <input value={editLabel} onChange={e=> setEditLabel(e.target.value)} className="brutal-thin px-sm py-xs bg-white text-sm" /></label>
                      <label className="flex flex-col text-xs font-bold uppercase gap-1">UPI ID <input value={editUpi} onChange={e=> setEditUpi(e.target.value)} className="brutal-thin px-sm py-xs bg-white text-sm" /></label>
                      <label className="flex flex-col text-xs font-bold uppercase gap-1">Phone <input value={editPhone} onChange={e=> setEditPhone(e.target.value)} className="brutal-thin px-sm py-xs bg-white text-sm" /></label>
                      <label className="flex flex-col text-xs font-bold uppercase gap-1">Preferred Mode <select value={editMode} onChange={e=> setEditMode(e.target.value)} className="brutal-thin px-sm py-xs bg-white text-sm"><option value="">—</option>{MODES.map(m=> <option key={m} value={m}>{m}</option>)}</select></label>
                    </div>
                    <label className="flex flex-col text-xs font-bold uppercase gap-1">Description <input value={editDesc} onChange={e=> setEditDesc(e.target.value)} placeholder="e.g. Dairy guy near society" className="brutal-thin px-sm py-xs bg-white text-sm" /></label>
                    <label className="flex flex-col text-xs font-bold uppercase gap-1">Notes <input value={editNotes} onChange={e=> setEditNotes(e.target.value)} placeholder="Private notes" className="brutal-thin px-sm py-xs bg-white text-sm" /></label>
                    <span className="text-xs font-bold uppercase">What does {editLabel||v.label} offer? (check all that apply)</span>
                    <div className="flex flex-wrap gap-xs">{cats.filter(c=> c!=='Other').map(c=> <button key={c} onClick={()=> toggle(c)} className={`brutal-thin px-xs py-xs text-xs font-bold uppercase ${editCats.includes(c)? 'bg-brand-yellow':'bg-white'}`}>{c}</button>)}</div>
                    <div className="flex gap-xs">
                      <input value={customCat} onChange={e=> setCustomCat(e.target.value)} onKeyDown={e=> e.key==='Enter' && addCustom()} placeholder="Custom (e.g. Stationery)" className="brutal-thin px-sm py-xs text-xs flex-1 bg-white" />
                      <button onClick={(e)=>{ e.stopPropagation(); addCustom()}} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">+ Add</button>
                    </div>
                    <div className="flex gap-sm">
                      <button onClick={(e)=>{ e.stopPropagation(); save()}} disabled={busy} className="brutal bg-brand-yellow px-sm py-xs text-xs font-bold uppercase">{busy?'Saving…':'Save'}</button>
                      <button onClick={(e)=>{ e.stopPropagation(); setEditId(null)}} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">Cancel</button>
                    </div>
                    <span className="text-[11px] opacity-60">Products are edited on Vendor Detail → page for richer control.</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
