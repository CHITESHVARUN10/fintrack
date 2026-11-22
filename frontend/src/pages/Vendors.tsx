import { useConfirmation } from '../hooks/useConfirmation'
import { toApiError } from '../lib/apiError'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiClient } from '../services/apiClient'
import { LedgerEmpty, LedgerLoading, LedgerNotice, LedgerOverlay, LedgerPage } from '../components/ledger/LedgerShell'

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

const FALLBACK_CATEGORIES = ['Groceries','Food','Electricity','Rent','Transportation','Shopping','Medical','Education','Entertainment','Bills','Household','Proxy','Family','Internal Transfer','Other']
const MODES = ['UPI','BANK','CASH','CARD','OTHER'] as const

function productLine(v: Vendor) {
  if (!(v.products || []).length) return 'No products mapped yet'
  return (v.products || [])
    .map((p) => `${p.name}${p.typicalAmountPaise ? ` ₹${(p.typicalAmountPaise / 100).toFixed(0)}` : ''} ×${p.hits}`)
    .join(' · ')
}

export function Vendors(){
  const confirmAction = useConfirmation()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState<Vendor[]>([])
  const [q, setQ] = useState(() => searchParams.get('q') || '')
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

  const load = useCallback((search = q, category = catFilter) => Promise.resolve().then(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (search.trim()) params.q = search.trim()
      if (category) params.category = category
      const response = await apiClient.get<{ items: Vendor[] }>('/recipients', { params })
      setItems(response.data.items || [])
    } catch (error: unknown) {
      setNotice(toApiError(error).response?.data?.error || 'Could not load vendors')
    } finally { setLoading(false) }
  }), [q, catFilter])
  async function backfill(){
    setBackfilling(true)
    try{
      const r = await apiClient.post('/recipients/backfill')
      setNotice(`Backfilled ${r.data.touched} vendors from ${r.data.scanned} transactions`)
      load('','')
    } finally { setBackfilling(false) }
  }
  const urlQuery = searchParams.get('q') || ''
  const [previousUrlQuery, setPreviousUrlQuery] = useState(urlQuery)
  if (previousUrlQuery !== urlQuery) { setPreviousUrlQuery(urlQuery); setQ(urlQuery) }
  useEffect(() => { load(q, catFilter) }, [load, q, catFilter])
  useEffect(()=>{
    apiClient.get('/recipients/categories').then((r)=>{
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
    } catch (caught: unknown) { const e = toApiError(caught);
      setNotice(e?.response?.data?.error||'Save failed')
      setTimeout(()=> setNotice(null),2500)
    } finally { setBusy(false) }
  }

  async function archive(id:string){
    if (!(await confirmAction('Archive this vendor?', 'The vendor will be hidden. Its transactions will stay in your ledger.', 'Archive'))) return
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
    } catch (caught: unknown) { const e = toApiError(caught);
      setNotice(e?.response?.data?.error||'Create failed')
      setTimeout(()=> setNotice(null),2500)
    } finally { setBusy(false) }
  }

  async function apply(id:string){
    setBusy(true)
    try{
      const r = await apiClient.post(`/recipients/${id}/apply`, { overwrite: false })
      setNotice(r.data.updated ? `Updated ${r.data.updated} ${r.data.updated === 1 ? 'transaction' : 'transactions'}.` : 'No transactions matched.')
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
    } catch (caught: unknown) { const e = toApiError(caught);
      setNotice(e?.response?.data?.error||'Merge failed')
      setTimeout(()=> setNotice(null),2500)
    } finally { setBusy(false) }
  }

  return (
    <LedgerPage
      title="Vendors"
      subtitle="Teach FinStack what each vendor offers — dairy guy, Amazon Pay, fruit stall. Future payments inherit the default category. Add standalone vendors with UPI/mode."
    >
      {notice && (
        <LedgerNotice tone="yellow">
          <span className="led-notice-mark">✓</span>
          <span>{notice}</span>
        </LedgerNotice>
      )}

      <div className="led-filter-row">
        <input
          value={q}
          onChange={e=> setQ(e.target.value)}
          onKeyDown={e=> e.key==='Enter' && load()}
          placeholder="Search vendors, UPI, alias…"
          className="led-input led-grow"
          aria-label="Search vendors"
        />
        <select
          value={catFilter}
          onChange={e=>{ setCatFilter(e.target.value); load(q, e.target.value)}}
          className="led-select led-w-185"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {cats.map(c=> <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={()=> load()} className="led-btn led-btn-sm">Search</button>
        <button onClick={backfill} disabled={backfilling} className="led-btn led-btn-white led-btn-sm">
          {backfilling? 'Backfilling…':'Backfill'}
        </button>
        <button onClick={()=> setShowCreate(true)} className="led-btn led-btn-dark led-btn-sm">+ New Vendor</button>
      </div>

      {mergeSource && (
        <div className="led-merge-bar">
          <span className="led-label">Merge {items.find(x=> x._id===mergeSource)?.label} into:</span>
          <div className="led-filter-row">
            <select
              value={mergeTarget}
              onChange={e=> setMergeTarget(e.target.value)}
              className="led-select led-grow"
              aria-label="Merge target vendor"
            >
              <option value="">Select target vendor</option>
              {items.filter(x=> x._id!==mergeSource).map(v=> <option key={v._id} value={v._id}>{v.label} ({v.vendorKey})</option>)}
            </select>
            <button onClick={doMerge} disabled={busy || !mergeTarget} className="led-btn led-btn-sm">Merge</button>
            <button onClick={()=> { setMergeSource(null); setMergeTarget('')}} className="led-btn led-btn-white led-btn-sm">Cancel</button>
          </div>
          <span className="led-tiny">All products, offerings, and transactions will move to target. Source will be deleted.</span>
        </div>
      )}

      {loading ? <LedgerLoading rows={4} /> : items.length===0 ? (
        <LedgerEmpty title="No vendors yet">
          Create one via + New Vendor or save from a transaction’s detail drawer.
        </LedgerEmpty>
      ) : (
        <div className="led-stack">
          {items.map(v=> {
            const isEditing = editId===v._id
            const offers = (v.offerings && v.offerings.length)
              ? v.offerings
              : (v.primaryCategory ? [{ category: v.primaryCategory, hits: v.hits }] : [])
            return (
              <article
                key={v._id}
                onClick={()=> !isEditing && nav(`/vendors/${v._id}`)}
                className={`led-vendor-card${isEditing ? ' led-vendor-editing' : ''}`}
              >
                <div className="led-vendor-top">
                  <div className="led-vendor-meta">
                    <span className="led-vendor-name">{v.label}</span>
                    <span className="led-tag led-tag-warm">{v.vendorKey}</span>
                    {v.contact?.preferredMode && <span className="led-tag">{v.contact.preferredMode}</span>}
                    {v.upiId && <span className="led-tag led-tag-cased">{v.upiId}</span>}
                    <span className="led-hits">hits {v.hits}</span>
                    {v.lastSeen && <span className="led-hits">{new Date(v.lastSeen).toLocaleDateString('en-IN')}</span>}
                    {v.status==='ARCHIVED' && <span className="led-tag led-tag-inverse">Archived</span>}
                  </div>
                  {!isEditing && (
                    <div className="led-vendor-right">
                      <span className="led-tag led-tag-yellow">{(v.primaryCategory || v.category || 'Other')}</span>
                      {offers.length>0 && (
                        <span className="led-hits">{offers.map(o=> `${o.category}×${o.hits}`).join(' · ')}</span>
                      )}
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <>
                    <div className="led-vendor-sells">Sells: <strong>{productLine(v)}</strong></div>
                    {v.description && <div className="led-tiny">{v.description}</div>}
                    {v.aliases && v.aliases.length>0 && <div className="led-tiny">aka: {v.aliases.join(', ')}</div>}
                    {(v.contact?.phone || v.contact?.address) && (
                      <div className="led-tiny">
                        ☎ {v.contact?.phone || '—'}{v.contact?.address ? ` · ${v.contact.address}` : ''}
                      </div>
                    )}
                  </>
                )}

                {!isEditing ? (
                  <div className="led-vendor-actions" onClick={e=> e.stopPropagation()}>
                    <div className="led-vendor-actions-left">
                      <button onClick={(e)=>{ e.stopPropagation(); startEdit(v)}} className="led-btn led-btn-white led-btn-sm">Edit</button>
                      <button onClick={(e)=>{ e.stopPropagation(); apply(v._id)}} disabled={busy} className="led-btn led-btn-white led-btn-sm">Apply to Other</button>
                      <button onClick={(e)=>{ e.stopPropagation(); setMergeSource(v._id)}} className="led-btn led-btn-white led-btn-sm">Merge</button>
                      <button onClick={(e)=>{ e.stopPropagation(); archive(v._id)}} disabled={busy} className="led-btn led-btn-white led-btn-sm">Archive</button>
                    </div>
                    <button onClick={(e)=>{ e.stopPropagation(); nav(`/vendors/${v._id}`)}} className="led-btn led-btn-sm led-ml-auto">
                      View →
                    </button>
                  </div>
                ) : (
                  <div className="led-edit-panel" onClick={e=> e.stopPropagation()}>
                    <div className="led-grid-2" style={{ gap: 12 }}>
                      <label className="led-field">Label
                        <input value={editLabel} onChange={e=> setEditLabel(e.target.value)} className="led-input" />
                      </label>
                      <label className="led-field">UPI ID
                        <input value={editUpi} onChange={e=> setEditUpi(e.target.value)} className="led-input" />
                      </label>
                      <label className="led-field">Phone
                        <input value={editPhone} onChange={e=> setEditPhone(e.target.value)} className="led-input" />
                      </label>
                      <label className="led-field">Preferred mode
                        <select value={editMode} onChange={e=> setEditMode(e.target.value)} className="led-select">
                          <option value="">—</option>
                          {MODES.map(m=> <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="led-field">Description
                      <input value={editDesc} onChange={e=> setEditDesc(e.target.value)} placeholder="e.g. Dairy guy near society" className="led-input" />
                    </label>
                    <label className="led-field">Notes
                      <input value={editNotes} onChange={e=> setEditNotes(e.target.value)} placeholder="Private notes" className="led-input" />
                    </label>
                    <div className="led-field">
                      <span className="led-label">What does {editLabel||v.label} offer? (check all that apply)</span>
                      <div className="led-chips">
                        {cats.filter(c=> c!=='Other').map(c=> (
                          <button
                            type="button"
                            key={c}
                            onClick={()=> toggle(c)}
                            className={`led-chip${editCats.includes(c)? ' is-on':''}`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="led-filter-row">
                      <input
                        value={customCat}
                        onChange={e=> setCustomCat(e.target.value)}
                        onKeyDown={e=> e.key==='Enter' && addCustom()}
                        placeholder="Custom (e.g. Stationery)"
                        className="led-input led-grow"
                      />
                      <button type="button" onClick={addCustom} className="led-btn led-btn-white led-btn-sm">+ Add</button>
                    </div>
                    <div className="led-row">
                      <button onClick={save} disabled={busy} className="led-btn led-btn-sm">{busy?'Saving…':'Save'}</button>
                      <button onClick={()=> setEditId(null)} className="led-btn led-btn-white led-btn-sm">Cancel</button>
                    </div>
                    <span className="led-tiny">Products are edited on the Vendor Detail page for richer control.</span>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {showCreate && (
        <LedgerOverlay onClose={()=> setShowCreate(false)} label="New vendor">
          <div className="led-modal">
            <div className="led-modal-head">
              <h2 className="led-modal-title">New Vendor</h2>
              <button type="button" onClick={()=> setShowCreate(false)} className="led-close-btn" aria-label="Close">×</button>
            </div>
            <div className="led-modal-body">
              <label className="led-field">Label*
                <input value={cLabel} onChange={e=> setCLabel(e.target.value)} placeholder="e.g. Dairy Guy" className="led-input" />
              </label>
              <label className="led-field">UPI ID (or leave blank if using mode)
                <input value={cUpi} onChange={e=> setCUpi(e.target.value)} placeholder="dairyguy@upi" className="led-input led-mono" />
              </label>
              <label className="led-field">Preferred mode*
                <select value={cMode} onChange={e=> setCMode(e.target.value)} className="led-select led-mono">
                  <option value="">Select</option>
                  {MODES.map(m=> <option key={m} value={m}>{m}</option>)}
                </select>
              </label>

              <div className="led-field">
                <span className="led-label">Categories* (check all that apply)</span>
                <div className="led-chips">
                  {cats.filter(c=> c!=='Other').map(c=> (
                    <button
                      type="button"
                      key={c}
                      onClick={()=> toggleCreate(c)}
                      className={`led-chip${cCats.includes(c)? ' is-on':''}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="led-filter-row" style={{ marginTop: 6 }}>
                  <input
                    value={cCustom}
                    onChange={e=> setCCustom(e.target.value)}
                    onKeyDown={e=> e.key==='Enter' && addCreateCustom()}
                    placeholder="Custom (e.g. Stationery)"
                    className="led-input led-grow"
                  />
                  <button type="button" onClick={addCreateCustom} className="led-btn led-btn-white led-btn-sm">+ Add</button>
                </div>
              </div>

              <div className="led-card-warm">
                <span className="led-label">What does this vendor sell? (products — free form, optional)</span>
                <div className="led-filter-row" style={{ marginTop: 10 }}>
                  <input
                    value={cProdName}
                    onChange={e=> setCProdName(e.target.value)}
                    placeholder="e.g. paneer"
                    className="led-input led-grow"
                  />
                  <input
                    value={cProdAmt}
                    onChange={e=> setCProdAmt(e.target.value)}
                    placeholder="₹ typical"
                    type="number"
                    className="led-input led-mono led-w-120"
                  />
                  <button
                    type="button"
                    onClick={()=>{
                      if(!cProdName.trim()) return
                      const amt = cProdAmt ? Math.round(Number(cProdAmt)*100) : undefined
                      setCProducts(p=> [...p, { name: cProdName.trim(), category: cCats[0]||'Other', typicalAmountPaise: amt }])
                      setCProdName(''); setCProdAmt('')
                    }}
                    className="led-btn led-btn-sm"
                  >
                    + Product
                  </button>
                </div>
                {cProducts.length>0 && (
                  <div className="led-chips" style={{ marginTop: 10 }}>
                    {cProducts.map((pr,i)=> (
                      <span key={i} className="led-pill">
                        <span>{pr.name}</span>
                        {pr.typicalAmountPaise ? <span className="led-tag led-tag-yellow">₹{(pr.typicalAmountPaise/100).toFixed(0)}</span> : null}
                        <button type="button" onClick={()=> setCProducts(p=> p.filter((_,idx)=> idx!==i))} aria-label={`Remove ${pr.name}`}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="led-tiny" style={{ marginTop: 10 }}>
                  e.g. 40 → paneer helps future suggestion when amount matches. Leave empty if not needed.
                </p>
              </div>
            </div>
            <div className="led-modal-foot">
              <button type="button" onClick={()=> setShowCreate(false)} className="led-btn led-btn-white">Cancel</button>
              <button type="button" onClick={createVendor} disabled={busy} className="led-btn">{busy?'Saving…':'Create'}</button>
            </div>
          </div>
        </LedgerOverlay>
      )}
    </LedgerPage>
  )
}
