import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { familyService } from '../services/api'
import { Icon } from '../components/ui/Icon'

export function FamilyCreateJoin() {
  const nav = useNavigate()
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    setErr(null)
    if (!name.trim()) { setErr('Enter a family name'); return }
    setLoading(true)
    try {
      const res = await familyService.create({ name: name.trim() })
      nav('/family', { state: { created: res.family } })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create family'
      const data = (e as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
      const details = data?.details?.length ? `: ${data.details.join(', ')}` : ''
      setErr(data?.error ? `${data.error}${details}` : msg)
    } finally { setLoading(false) }
  }

  async function handleJoin() {
    setErr(null)
    if (!code.trim()) { setErr('Enter an invite code'); return }
    setLoading(true)
    try {
      await familyService.join(code.trim().toUpperCase())
      nav('/family', { state: { joined: true } })
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
      const details = data?.details?.length ? `: ${data.details.join(', ')}` : ''
      setErr(data?.error ? `${data.error}${details}` : 'Invalid invite code')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-md">
      <div className="w-full max-w-lg brutal bg-white p-xl flex flex-col gap-md">
        <h1 className="text-2xl font-bold uppercase tracking-tight">Family</h1>
        <p className="text-sm text-on-surface-variant">Create a new family or join one with an invite code.</p>

        {err && <div className="brutal-thin bg-error-container text-on-error-container px-sm py-xs text-sm">{err}</div>}

        {mode === 'choose' && (
          <div className="flex flex-col gap-sm">
            <button onClick={() => setMode('create')} className="brutal bg-brand-yellow px-md py-sm font-bold uppercase flex items-center gap-sm"><Icon name="group_add" /> Create Family</button>
            <button onClick={() => setMode('join')} className="brutal bg-white px-md py-sm font-bold uppercase flex items-center gap-sm"><Icon name="login" /> Join Family</button>
          </div>
        )}

        {mode === 'create' && (
          <div className="flex flex-col gap-sm">
            <label className="text-xs font-bold uppercase tracking-wider">Family Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Varun Family" className="brutal-thin px-sm py-xs" />
            <div className="flex gap-sm">
              <button onClick={handleCreate} disabled={loading} className="brutal bg-brand-yellow px-md py-xs font-bold uppercase disabled:opacity-50">{loading ? 'Creating…' : 'Create'}</button>
              <button onClick={() => setMode('choose')} className="brutal bg-white px-md py-xs font-bold uppercase">Back</button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="flex flex-col gap-sm">
            <label className="text-xs font-bold uppercase tracking-wider">Invite Code (e.g. VF7K92)</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VF7K92" className="brutal-thin px-sm py-xs uppercase tracking-widest" maxLength={6} />
            <div className="flex gap-sm">
              <button onClick={handleJoin} disabled={loading} className="brutal bg-brand-yellow px-md py-xs font-bold uppercase disabled:opacity-50">{loading ? 'Joining…' : 'Join'}</button>
              <button onClick={() => setMode('choose')} className="brutal bg-white px-md py-xs font-bold uppercase">Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
