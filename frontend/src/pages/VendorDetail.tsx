import type { ApiMember, LedgerTransaction, LineItem, Vendor, VendorSummary } from '../types/api'
import { toApiError } from '../lib/apiError'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiClient } from '../services/apiClient'
import { familyService } from '../services/api'
import { compactINR } from '../components/charts/chartTheme'
import { LedgerEmpty, LedgerLoading, LedgerNotice, LedgerPage } from '../components/ledger/LedgerShell'

type Tx = { _id:string; amountPaise:number; category?:string; subcategory?:string; productName?:string; lineItems?: LineItem[]; occurredAt:string; type:string; mode:string; recipient?:{name?:string}; status:string; createdBy?: LedgerTransaction['createdBy'] }

const ALL_CATS = ['Groceries','Food','Electricity','Rent','Transportation','Shopping','Medical','Education','Entertainment','Bills','Household','Other']
const PRODUCT_COLORS = ['var(--nb-cyan)', 'var(--accent)', 'var(--nb-violet)', 'var(--nb-teal)', 'var(--nb-orange)', 'var(--nb-pink)']
const CATEGORY_COLORS = ['var(--nb-yellow)', 'var(--nb-cyan)', 'var(--nb-pink)', 'var(--nb-violet)', 'var(--nb-teal)', 'var(--nb-orange)', 'var(--chart-7)', 'var(--chart-8)']

function money(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}

function formatMonth(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1)
  return date.toLocaleString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase()
}

function SpendTrend({ data }: { data: { month: string; spend: number }[] }) {
  const [readout, setReadout] = useState<string | null>(null)
  const series = data.slice(-12)
  if (!series.length) return <div className="led-chart-empty">No expense trend for these filters yet.</div>

  const width = 320
  const height = 185
  const left = 46
  const right = 18
  const top = 22
  const base = 146
  const max = Math.max(...series.map((d) => d.spend), 1)
  const points = series.map((d, i) => ({
    ...d,
    x: series.length === 1 ? (left + width - right) / 2 : left + (i / (series.length - 1)) * (width - left - right),
    y: base - (d.spend / max) * (base - top),
  }))
  const last = points[points.length - 1]
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))
  const grid = [
    { y: top, value: max },
    { y: top + (base - top) / 3, value: max * (2 / 3) },
    { y: top + (2 * (base - top)) / 3, value: max / 3 },
    { y: base, value: 0 },
  ]

  return (
    <>
      <div className="led-chart-head">
        <span className="led-chart-title">Spend trend (monthly)</span>
        <span className="led-readout">{readout ?? `${formatMonth(last.month)}: ${compactINR(last.spend)}`}</span>
      </div>
      <div className="led-chart-body">
        <svg
          className="led-chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Monthly spend trend"
        >
          {grid.map((g) => (
            <g key={g.y}>
              {g.y !== base && (
                <line x1={left} y1={g.y} x2={width - right} y2={g.y} stroke="var(--text-primary)" strokeOpacity="0.14" strokeDasharray="3 3" />
              )}
              <text x={left - 6} y={g.y + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize="9.5" fontWeight="700" fill="var(--text-secondary)">
                {compactINR(g.value)}
              </text>
            </g>
          ))}
          <line x1={left} y1={base} x2={width - right} y2={base} stroke="var(--text-primary)" strokeWidth="2" />
          <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinejoin="round" />
          <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--text-primary)" strokeWidth="2.2" strokeLinejoin="round" />
          {points.map((p, i) => (
            <g
              key={p.month}
              tabIndex={0}
              role="img"
              aria-label={`${formatMonth(p.month)} spend ${money(p.spend * 100)}`}
              onMouseEnter={() => setReadout(`${formatMonth(p.month)}: ${compactINR(p.spend)}`)}
              onFocus={() => setReadout(`${formatMonth(p.month)}: ${compactINR(p.spend)}`)}
              style={{ cursor: 'pointer' }}
            >
              <line x1={p.x} y1={p.y} x2={p.x} y2={base} stroke="var(--text-primary)" strokeOpacity="0.22" strokeDasharray="3 3" />
              <rect x={p.x - 6} y={p.y - 6} width="12" height="12" fill="var(--accent)" stroke="var(--text-primary)" strokeWidth="2" />
              {(i % labelEvery === 0 || i === points.length - 1) && (
                <text x={p.x} y="166" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fontWeight="800" fill="var(--text-primary)">
                  {p.month}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </>
  )
}

function CategoryDonut({ entries, totalPaise }: { entries: { name: string; value: number }[]; totalPaise: number }) {
  if (!entries.length || totalPaise <= 0) return <div className="led-chart-empty">No categorized expense yet.</div>

  const total = entries.reduce((sum, entry) => sum + entry.value, 0)
  const shares = entries.map((entry) => entry.value / total)
  const starts = shares.map((_, index) => shares.slice(0, index).reduce((sum, share) => sum + share, 0))
  const segments = entries.map((entry, index) => ({
    ...entry,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    from: starts[index],
    to: starts[index] + shares[index],
  }))
  const top = segments[0]
  const topPct = (top.value / total) * 100
  const ticks = 60
  const cx = 88
  const cy = 88
  const rIn = 54
  const rOut = 78

  return (
    <>
      <div className="led-chart-head">
        <span className="led-chart-title">By category</span>
        <span className="led-readout">{topPct.toFixed(1)}%</span>
      </div>
      <div className="led-donut-stage">
        <svg width="176" height="176" viewBox="0 0 176 176" role="img" aria-label="Category share">
          {Array.from({ length: ticks }).map((_, index) => {
            const fraction = (index + 0.5) / ticks
            const segment = segments.find((s) => fraction >= s.from && fraction < s.to) || segments[segments.length - 1]
            const angle = (index / ticks) * Math.PI * 2 - Math.PI / 2
            const x1 = cx + Math.cos(angle) * rIn
            const y1 = cy + Math.sin(angle) * rIn
            const x2 = cx + Math.cos(angle) * rOut
            const y2 = cy + Math.sin(angle) * rOut
            return (
              <line
                key={index}
                x1={x1.toFixed(1)}
                y1={y1.toFixed(1)}
                x2={x2.toFixed(1)}
                y2={y2.toFixed(1)}
                stroke={segment.color}
                strokeWidth="4.5"
              />
            )
          })}
        </svg>
        <div className="led-donut-center">
          <div className="led-donut-val">{compactINR(totalPaise / 100)}</div>
          <div className="led-donut-sub">{topPct.toFixed(1)}% {top.name}</div>
        </div>
      </div>
      <div className="led-legend">
        {segments.slice(0, 4).map((segment) => (
          <span className="led-legend-item" key={segment.name}>
            <span className="led-swatch" style={{ background: segment.color }} />
            <span>{segment.name} {((segment.value / total) * 100).toFixed(1)}%</span>
          </span>
        ))}
        {segments.length > 4 && <span className="led-legend-item led-muted">+{segments.length - 4} more</span>}
      </div>
    </>
  )
}

function ProductBars({ entries }: { entries: { name: string; value: number }[] }) {
  if (!entries.length) return <div className="led-chart-empty">No product spend yet — transactions have no product name.</div>
  const top = entries.slice(0, 6)
  const max = Math.max(...top.map((entry) => entry.value), 1)
  return (
    <>
      <div className="led-chart-head">
        <span className="led-chart-title">By product</span>
        <span className="led-readout">{entries.length} {entries.length === 1 ? 'item' : 'items'}</span>
      </div>
      <div className="led-bars">
        {top.map((entry, index) => (
          <div key={entry.name}>
            <div className="led-bar-head">
              <span>{entry.name}</span>
              <span>{money(entry.value)}</span>
            </div>
            <div className="led-bar-track">
              <div
                className="led-bar-fill"
                style={{
                  width: `${Math.max(4, (entry.value / max) * 100)}%`,
                  background: PRODUCT_COLORS[index % PRODUCT_COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export function VendorDetail(){
  const { id } = useParams()
  const nav = useNavigate()
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [txs, setTxs] = useState<Tx[]>([])
  const [summary, setSummary] = useState<VendorSummary | null>(null)
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
  const [members, setMembers] = useState<ApiMember[]>([])
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
    apiClient.get('/families/me').then(r=> r.data?.family?._id ? familyService.members(r.data.family._id).then((d)=> setMembers(d.members||[])) : null).catch(()=>{})
  }
  useEffect(()=> { fetchMembers() }, [])

  const load = useCallback(async () => {
    try{
      const params: Record<string, string | number> = { limit, skip: page*limit }
      if(from) params.from=from
      if(to) params.to=to
      if(memberId) params.memberId=memberId
      if(filterCat) params.category=filterCat
      const r = await apiClient.get<VendorSummary & { vendor: Vendor; transactions: Tx[] }>(`/vendors/${id}/transactions`, { params })
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
        setECats(r.data.vendor.offerings?.map((o)=> o.category) || (r.data.vendor.primaryCategory?[r.data.vendor.primaryCategory]:[]))
        setNewProdCat(r.data.vendor.primaryCategory||'Food')
      }
    } finally { setLoading(false) }
  }, [id, page, from, to, memberId, filterCat, editMode])
  useEffect(()=>{ load() }, [load])

  async function saveCat(txId:string){
    try{
      await apiClient.patch(`/transactions/${txId}`, { category: catVal, subcategory: subVal||undefined, productName: prodVal||undefined })
      setCatEditId(null); load()
      setNotice('Transaction updated — vendor will learn')
      setTimeout(()=> setNotice(null),2000)
    } catch (caught: unknown) { const e = toApiError(caught); setNotice(e?.response?.data?.error||'Save failed'); setTimeout(()=> setNotice(null),2000) }
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
    } catch (caught: unknown) { const e = toApiError(caught); setNotice(e?.response?.data?.error||'Save failed'); setTimeout(()=> setNotice(null),2500) }
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
    } catch (caught: unknown) { const e = toApiError(caught); setNotice(e?.response?.data?.error||'Add failed'); setTimeout(()=> setNotice(null),2500) }
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

  const byCategoryData = summary?.byCategory
    ? Object.entries(summary.byCategory)
        .map(([name, value]) => ({ name, value: value as number }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value)
    : []
  const byProductData = summary?.byProduct
    ? Object.entries(summary.byProduct)
        .map(([name, value]) => ({ name, value: value as number }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value)
    : []
  const monthlyData = summary?.monthlyBuckets || []
  const totalPages = Math.max(1, Math.ceil((summary?.count || 0) / limit))
  const offersText = (vendor?.offerings || []).map((o)=> `${o.category}×${o.hits}${o.subcategories?.length? ` (${o.subcategories.join(', ')})`:''}`).join(' · ') || vendor?.primaryCategory || '—'
  const sellsText = (vendor?.products || []).length
    ? (vendor?.products || []).map((p)=> `${p.name}${p.typicalAmountPaise ? ` ${money(p.typicalAmountPaise)}` : ''} · ${p.category}${p.subcategory ? `/${p.subcategory}` : ''} ×${p.hits}`).join(' | ')
    : 'No products configured yet'
  const creatorRaw = vendor?.createdBy as unknown
  const creatorLabel = typeof creatorRaw === 'string'
    ? creatorRaw.slice(0, 12)
    : creatorRaw && typeof creatorRaw === 'object'
      ? ((creatorRaw as { name?: string }).name || '')
      : ''

  return (
    <LedgerPage
      title={vendor?.label || 'Vendor'}
      subtitle={vendor ? (
        <span className="led-mono">
          {vendor.vendorKey} · {vendor.upiId || 'no UPI'} · default {vendor.primaryCategory || vendor.category || 'Other'} · {vendor.contact?.preferredMode || 'no mode'}
        </span>
      ) : 'Loading vendor…'}
      top={<button onClick={()=> nav('/vendors')} className="led-btn led-btn-white led-btn-sm">← Back to Vendors</button>}
    >
      {notice && (
        <LedgerNotice tone="yellow">
          <span className="led-notice-mark">✓</span>
          <span>{notice}</span>
        </LedgerNotice>
      )}

      {vendor && (
        <section className="led-card led-stack">
          {!editMode ? (
            <>
              <div className="led-vendor-top">
                <div className="led-vendor-meta">
                  <strong className="led-vendor-name">{vendor.label}</strong>
                  <span className="led-tag led-tag-warm">{vendor.vendorKey}</span>
                  {vendor.upiId && <span className="led-tag led-tag-cased">{vendor.upiId}</span>}
                  {vendor.contact?.preferredMode && <span className="led-tag">{vendor.contact.preferredMode}</span>}
                </div>
                <span className="led-tag led-tag-yellow">{vendor.primaryCategory || vendor.category || 'Other'}</span>
              </div>
              <div className="led-vendor-sells">Offers: <strong>{offersText}</strong></div>
              <div className="led-vendor-sells">Sells: <strong>{sellsText}</strong></div>
              {vendor.description && <div className="led-tiny">{vendor.description}</div>}
              {(vendor.aliases || []).length > 0 && <div className="led-tiny">Aliases: {vendor.aliases?.join(', ')}</div>}
              {(vendor.contact?.phone || vendor.contact?.address) && (
                <div className="led-tiny">
                  Contact: {vendor.contact.phone || '—'}{vendor.contact.address ? ` · ${vendor.contact.address}` : ''}
                </div>
              )}
              {vendor.notes && <div className="led-tiny">Notes: {vendor.notes}</div>}
              <div className="led-hits">
                Hits {vendor.hits} · Last seen {vendor.lastSeen ? new Date(vendor.lastSeen).toLocaleString('en-IN') : '—'}
                {creatorLabel ? ` · by ${creatorLabel}` : ''}
              </div>
              <div className="led-row">
                <button onClick={()=> setEditMode(true)} className="led-btn led-btn-sm">Edit Vendor</button>
              </div>
            </>
          ) : (
            <>
              <h2 className="led-h2">Edit Vendor</h2>
              <div className="led-grid-2" style={{ gap: 12 }}>
                <label className="led-field">Label
                  <input value={eLabel} onChange={e=> setELabel(e.target.value)} className="led-input" />
                </label>
                <label className="led-field">UPI ID
                  <input value={eUpi} onChange={e=> setEUpi(e.target.value)} className="led-input led-mono" />
                </label>
                <label className="led-field">Phone
                  <input value={ePhone} onChange={e=> setEPhone(e.target.value)} className="led-input" />
                </label>
                <label className="led-field">Mode
                  <select value={eContactMode} onChange={e=> setEContactMode(e.target.value)} className="led-select">
                    <option value="">—</option>
                    {['UPI','BANK','CASH','CARD','OTHER'].map(m=> <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>
              <label className="led-field">Description
                <input value={eDesc} onChange={e=> setEDesc(e.target.value)} className="led-input" />
              </label>
              <label className="led-field">Aliases (comma separated)
                <input value={eAliases} onChange={e=> setEAliases(e.target.value)} placeholder="dairy guy, milk guy" className="led-input" />
              </label>
              <label className="led-field">Notes
                <input value={eNotes} onChange={e=> setENotes(e.target.value)} className="led-input" />
              </label>
              <div className="led-field">
                <span className="led-label">Categories (what this vendor offers)</span>
                <div className="led-chips">
                  {ALL_CATS.filter(c=> c!=='Other').map(c=> (
                    <button
                      type="button"
                      key={c}
                      onClick={()=> setECats(p=> p.includes(c)? p.filter(x=> x!==c): [...p,c])}
                      className={`led-chip${eCats.includes(c)? ' is-on':''}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="led-filter-row" style={{ marginTop: 6 }}>
                  <input
                    value={eCustomCat}
                    onChange={e=> setECustomCat(e.target.value)}
                    onKeyDown={e=> { if (e.key !== 'Enter') return; const c=eCustomCat.trim(); if(!c) return; const n=c[0].toUpperCase()+c.slice(1).toLowerCase(); if(!eCats.includes(n)) setECats(p=> [...p,n]); setECustomCat('') }}
                    placeholder="Custom category"
                    className="led-input led-grow"
                  />
                  <button
                    type="button"
                    onClick={()=>{ const c=eCustomCat.trim(); if(!c) return; const n=c[0].toUpperCase()+c.slice(1).toLowerCase(); if(!eCats.includes(n)) setECats(p=> [...p,n]); setECustomCat('')}}
                    className="led-btn led-btn-white led-btn-sm"
                  >
                    + Add
                  </button>
                </div>
              </div>
              <div className="led-row">
                <button onClick={saveVendor} disabled={saving} className="led-btn led-btn-sm">{saving?'Saving…':'Save'}</button>
                <button onClick={()=> setEditMode(false)} className="led-btn led-btn-white led-btn-sm">Cancel</button>
              </div>
            </>
          )}
        </section>
      )}

      {/* Products */}
      {vendor && (
        <section className="led-card led-stack">
          <div>
            <h2 className="led-h2">What this vendor sells — products (free form)</h2>
            <p className="led-page-sub" style={{ marginTop: 3 }}>
              Add products with typical amount to enable amount → product suggestions, e.g. 40 → paneer. Keep category as transaction category.
            </p>
          </div>
          <div className="led-chips">
            {(vendor.products || []).length === 0 ? (
              <span className="led-tiny">No products yet — add the first one below.</span>
            ) : (vendor.products || []).map((p)=> (
              <span key={p._id} className="led-pill">
                <span>{p.name}</span>
                <span className="led-muted">{p.category}{p.subcategory ? `/${p.subcategory}` : ''}</span>
                {p.typicalAmountPaise ? <span className="led-tag led-tag-yellow">₹{(p.typicalAmountPaise/100).toFixed(0)}</span> : null}
                <span className="led-tiny">×{p.hits}</span>
                <button type="button" onClick={()=> delProduct(p._id)} disabled={prodBusy} aria-label={`Remove ${p.name}`}>×</button>
              </span>
            ))}
          </div>
          <div className="led-product-form">
            <label className="led-field">Name
              <input value={newProdName} onChange={e=> setNewProdName(e.target.value)} placeholder="paneer" className="led-input" />
            </label>
            <label className="led-field">Category
              <select value={newProdCat} onChange={e=> setNewProdCat(e.target.value)} className="led-select">
                {ALL_CATS.map(c=> <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="led-field">Subcategory
              <input value={newProdSub} onChange={e=> setNewProdSub(e.target.value)} placeholder="Protein" className="led-input" />
            </label>
            <label className="led-field">Typical ₹
              <input type="number" value={newProdAmt} onChange={e=> setNewProdAmt(e.target.value)} placeholder="40" className="led-input led-mono" />
            </label>
            <button onClick={addProduct} disabled={prodBusy} className="led-btn led-btn-sm">{prodBusy?'Saving…':'+ Add Product'}</button>
          </div>
        </section>
      )}

      {summary && (
        <div className="led-grid-4">
          <div className="led-card-yellow led-kpi">
            <span className="led-label">Transactions</span>
            <div>
              <div className="led-kpi-val">{summary.count}</div>
              <div className="led-kpi-sub">{txs.length} on page</div>
            </div>
          </div>
          <div className="led-card-sm led-kpi">
            <span className="led-label" style={{ color: 'var(--text-secondary)' }}>Total spend</span>
            <div>
              <div className="led-kpi-val">{money(summary.totalPaise)}</div>
              <div className="led-kpi-sub">EXPENSE only</div>
            </div>
          </div>
          <div className="led-card-sm led-kpi">
            <span className="led-label" style={{ color: 'var(--text-secondary)' }}>Avg per txn</span>
            <div className="led-kpi-val">{money(summary.count ? Math.round(summary.totalPaise / summary.count) : 0)}</div>
          </div>
          <div className="led-card-sm led-kpi">
            <span className="led-label" style={{ color: 'var(--text-secondary)' }}>By member</span>
            <div className="led-mono" style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.55 }}>
              {summary.byMember?.length
                ? summary.byMember.map((m)=>(<div key={m.name}>{m.name} {money(Math.round(m.spend * 100))} ×{m.count}</div>))
                : '—'}
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div className="led-grid-3">
          <div className="led-card led-chart-panel">
            <SpendTrend data={monthlyData} />
          </div>
          <div className="led-card led-chart-panel">
            <CategoryDonut entries={byCategoryData} totalPaise={summary.totalPaise} />
          </div>
          <div className="led-card led-chart-panel">
            <ProductBars entries={byProductData} />
          </div>
        </div>
      )}

      <div className="led-card-sm led-row-between">
        <div className="led-filter-row">
          <label className="led-field led-w-150">From
            <input type="date" value={from} onChange={e=> {setFrom(e.target.value); setPage(0)}} className="led-input led-mono" />
          </label>
          <label className="led-field led-w-150">To
            <input type="date" value={to} onChange={e=> {setTo(e.target.value); setPage(0)}} className="led-input led-mono" />
          </label>
          <label className="led-field led-w-155">Member
            <select value={memberId} onChange={e=> {setMemberId(e.target.value); setPage(0)}} className="led-select">
              <option value="">All members</option>
              {members.map((m)=> <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="led-field led-w-145">Category
            <select value={filterCat} onChange={e=> {setFilterCat(e.target.value); setPage(0)}} className="led-select">
              <option value="">All</option>
              {ALL_CATS.map(c=> <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button
            onClick={()=> {setFrom(''); setTo(''); setMemberId(''); setFilterCat(''); setPage(0)}}
            className="led-btn led-btn-white led-btn-sm"
          >
            Clear
          </button>
        </div>
        <span className="led-filter-meta">{summary?.count || 0} total · page {page + 1}</span>
      </div>

      {loading ? <LedgerLoading rows={4} /> : txs.length === 0 ? (
        <LedgerEmpty title="No transactions for this vendor">
          It fills once payments with a matching name, UPI handle, or alias arrive from CSV or screenshots.
        </LedgerEmpty>
      ) : (
        <div className="led-table-card">
          <div className="led-table-scroll">
            <table className="led-table compact">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th>Product</th>
                  <th>By</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Recipient</th>
                </tr>
              </thead>
              <tbody>
                {txs.map(t=> {
                  const madeBy = (typeof t.createdBy === 'object' ? t.createdBy?.name : '') || (typeof t.createdBy==='string'? t.createdBy.slice(0,8): '—')
                  const statusClass = t.status === 'PENDING_REVIEW'
                    ? 'led-tag led-tag-yellow'
                    : t.status === 'RECONCILED'
                      ? 'led-tag led-tag-green'
                      : t.status === 'VOIDED'
                        ? 'led-tag led-tag-muted'
                        : 'led-tag'
                  return (
                    <tr key={t._id} className="led-row-clickable" onClick={()=> nav(`/transactions?highlight=${t._id}`)}>
                      <td className="led-mono led-nowrap" style={{ fontSize: 11.5 }}>{new Date(t.occurredAt).toLocaleString('en-IN')}</td>
                      <td className="led-num">{money(t.amountPaise)}</td>
                      <td onClick={(e)=> e.stopPropagation()}>
                        {catEditId===t._id ? (
                          <span className="led-row" style={{ alignItems: 'flex-start' }}>
                            <span className="led-stack" style={{ gap: 4 }}>
                              <select value={catVal} onChange={e=> setCatVal(e.target.value)} className="led-input-xs">
                                <option value="">—</option>
                                {ALL_CATS.map(c=> <option key={c} value={c}>{c}</option>)}
                              </select>
                              <input value={subVal} onChange={e=> setSubVal(e.target.value)} placeholder="subcategory" className="led-input-xs" />
                              <input value={prodVal} onChange={e=> setProdVal(e.target.value)} placeholder="product e.g. paneer" className="led-input-xs" />
                              <span className="led-row" style={{ gap: 4 }}>
                                <button onClick={()=> saveCat(t._id)} className="led-btn led-btn-xs">Save</button>
                                <button onClick={()=> setCatEditId(null)} className="led-btn led-btn-white led-btn-xs">Cancel</button>
                              </span>
                            </span>
                          </span>
                        ) : (
                          <button
                            onClick={()=> { setCatEditId(t._id); setCatVal(t.category||'Other'); setSubVal(t.subcategory||''); setProdVal(t.productName||'')}}
                            className="led-tag led-tag-cased"
                            title="Edit category, subcategory and product"
                          >
                            {t.category||'Other'}{t.subcategory? `/${t.subcategory}`:''}
                          </button>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>{t.productName || t.lineItems?.[0]?.productName || '—'}</td>
                      <td className="led-nowrap" style={{ fontSize: 12 }}>{madeBy}</td>
                      <td className="led-mono led-nowrap">{t.mode}</td>
                      <td><span className={statusClass}>{t.status.replace('_', ' ')}</span></td>
                      <td style={{ fontSize: 12 }}>{t.recipient?.name || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="led-table-foot">
            <button disabled={page===0} onClick={()=> setPage(p=> Math.max(0,p-1))} className="led-btn led-btn-white led-btn-sm">Prev</button>
            <span className="led-filter-meta">Page {page + 1} of {totalPages}</span>
            <button disabled={page + 1 >= totalPages} onClick={()=> setPage(p=> p+1)} className="led-btn led-btn-white led-btn-sm">Next</button>
          </div>
        </div>
      )}
    </LedgerPage>
  )
}
