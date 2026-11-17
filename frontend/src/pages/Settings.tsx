import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { familyService } from '../services/api'
import { PageHeader } from '../components/ui/PageHeader'
import { Field, Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { PasswordInput } from '../components/ui/PasswordInput'
import { initials } from '../lib/format'

function FamilySection() {
  const { user, refreshSession } = useAuth()
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle')
  const [familyName, setFamilyName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inFamily = Boolean(user?.familyAccountId)

  async function createFamily() {
    setError(null)
    if (!familyName.trim()) { setError('Enter a family name'); return }
    setBusy(true)
    try {
      await familyService.create({ name: familyName.trim() })
      await refreshSession()
      setMode('idle')
      setFamilyName('')
      setMessage('Family created — you are the admin.')
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
      setError(data?.error || 'Could not create the family.')
    } finally { setBusy(false) }
  }

  async function joinFamily() {
    setError(null)
    if (!code.trim()) { setError('Enter an invite code'); return }
    setBusy(true)
    try {
      await familyService.join(code.trim().toUpperCase())
      setMode('idle')
      setCode('')
      setMessage('Request sent — an admin has to approve it before the family unlocks.')
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
      setError(data?.error || 'Invalid invite code.')
    } finally { setBusy(false) }
  }

  return (
    <section id="family" className="border-b-[3px] border-on-surface pb-lg scroll-mt-md">
      <h2 className="text-2xl font-bold uppercase mb-lg flex items-center gap-2"><Icon name="group" /> Family</h2>
      <div className="p-4 bg-white border-[3px] border-on-surface shadow-brutal min-w-0 flex flex-col gap-sm">
        {inFamily ? (
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <div className="min-w-0">
              <p className="font-bold">Family account active</p>
              <p className="font-medium text-on-surface-variant text-sm mt-1">
                Invite members, approve join requests and manage the household from Members.
              </p>
            </div>
            <Link to="/family" className="brutal bg-brand-yellow px-md py-xs font-bold uppercase text-sm shrink-0">
              Manage members
            </Link>
          </div>
        ) : (
          <>
            <p className="font-bold">Set up your family</p>
            <p className="font-medium text-on-surface-variant text-sm">
              Create a household as admin, or join one with an invite code. A family is required for Import, Transactions, Budgets and the family dashboard.
            </p>

            {mode === 'idle' && (
              <div className="flex flex-col sm:flex-row gap-sm pt-xs">
                <button onClick={() => { setMode('create'); setError(null); setMessage(null) }} className="brutal bg-brand-yellow px-md py-sm font-bold uppercase flex items-center gap-sm">
                  <Icon name="group_add" /> Create Family
                </button>
                <button onClick={() => { setMode('join'); setError(null); setMessage(null) }} className="brutal bg-white px-md py-sm font-bold uppercase flex items-center gap-sm">
                  <Icon name="login" /> Join Family
                </button>
              </div>
            )}

            {mode === 'create' && (
              <div className="flex flex-col gap-sm pt-xs">
                <Field label="Family Name">
                  <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="Sharma Family" />
                </Field>
                <div className="flex flex-col sm:flex-row gap-sm">
                  <Button onClick={createFamily} disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button>
                  <Button variant="white" onClick={() => setMode('idle')}>Back</Button>
                </div>
              </div>
            )}

            {mode === 'join' && (
              <div className="flex flex-col gap-sm pt-xs">
                <Field label="Invite Code" hint="Six characters, e.g. VF7K92">
                  <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VF7K92" maxLength={6} className="uppercase tracking-widest" />
                </Field>
                <div className="flex flex-col sm:flex-row gap-sm">
                  <Button onClick={joinFamily} disabled={busy}>{busy ? 'Joining…' : 'Join'}</Button>
                  <Button variant="white" onClick={() => setMode('idle')}>Back</Button>
                </div>
              </div>
            )}
          </>
        )}

        {error && <div className="brutal-thin bg-error-container text-on-error-container px-sm py-xs text-sm font-bold">{error}</div>}
        {message && <div className="brutal-thin bg-brand-yellow text-on-surface px-sm py-xs text-sm font-bold">{message}</div>}
      </div>
    </section>
  )
}


function Toggle({ label, desc, defaultOn = false }: { label: string; desc: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border-[3px] border-on-surface shadow-brutal min-w-0">
      <div>
        <p className="font-bold">{label}</p>
        <p className="font-medium text-on-surface-variant text-sm mt-1">{desc}</p>
      </div>
      <button
        onClick={() => setOn((v) => !v)}
        className={`relative w-14 h-8 border-[3px] border-on-surface transition-colors ${
          on ? 'bg-brand-yellow' : 'bg-white'
        }`}
        aria-pressed={on}
        aria-label={label}
      >
        <span
          className={`absolute top-[-3px] w-6 h-6 border-[3px] border-on-surface bg-white transition-transform ${
            on ? 'translate-x-[26px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export function Settings() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwFlash, setPwFlash] = useState(false)
  // Deep links from the family banner and Import land on /settings#family;
  // bring the section into view once the page has mounted.
  useEffect(() => {
    if (window.location.hash !== '#family') return
    const timer = window.setTimeout(() => document.getElementById('family')?.scrollIntoView({ block: 'start' }), 0)
    return () => window.clearTimeout(timer)
  }, [])
  if (!user) return null

  const savePassword = () => {
    setPwFlash(true)
    window.setTimeout(() => setPwFlash(false), 220)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-xl min-w-0 w-full">
      <PageHeader title="Settings" />

      {/* Account */}
      <section className="border-b-[3px] border-on-surface pb-lg">
        <h2 className="text-2xl font-bold uppercase mb-lg">Account</h2>
        <div className="flex flex-col sm:flex-row gap-lg items-start min-w-0">
          <div className="w-32 h-32 max-w-full border-[3px] border-on-surface flex items-center justify-center text-4xl font-bold bg-brand-yellow shadow-brutal shrink-0">
            {initials(user.name)}
          </div>
          <div className="flex-grow w-full min-w-0 space-y-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm min-w-0">
              <Field label="First Name">
                <Input defaultValue={user.name.split(' ')[0]} />
              </Field>
              <Field label="Last Name">
                <Input defaultValue={user.name.split(' ').slice(1).join(' ')} />
              </Field>
            </div>
            <Field label="Email Address">
              <Input type="email" defaultValue={user.email} />
            </Field>
            <div className="pt-sm">
              <Button variant="white">Save Changes</Button>
            </div>
          </div>
        </div>
      </section>

      {/* Family */}
      <FamilySection />

      {/* Appearance */}
      <section className="border-b-[3px] border-on-surface pb-lg">
        <h2 className="text-2xl font-bold uppercase mb-lg">Appearance</h2>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row flex-wrap sm:items-center justify-between gap-3 p-4 bg-white border-[3px] border-on-surface shadow-brutal min-w-0">
            <div>
              <p className="font-bold">Dark Mode</p>
              <p className="font-medium text-on-surface-variant text-sm mt-1">Toggle between light and dark theme. Saved for next visit.</p>
            </div>
            <div className="flex flex-wrap items-center gap-sm sm:ml-md shrink-0 min-w-0">
              <button
                onClick={() => setTheme('light')}
                className={`brutal-thin px-sm py-xs text-xs font-bold uppercase ${theme === 'light' ? 'bg-brand-yellow' : 'bg-white'}`}
                aria-pressed={theme === 'light'}
              >
                <Icon name="light_mode" className="text-base mr-1" />Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`brutal-thin px-sm py-xs text-xs font-bold uppercase ${theme === 'dark' ? 'bg-brand-yellow text-on-surface' : 'bg-white'}`}
                aria-pressed={theme === 'dark'}
              >
                <Icon name="dark_mode" className="text-base mr-1" />Dark
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="border-b-[3px] border-on-surface pb-lg">
        <h2 className="text-2xl font-bold uppercase mb-lg">Notifications</h2>
        <div className="space-y-4">
          <Toggle
            label="Push Notifications"
            desc="Receive alerts on your device"
            defaultOn
          />
          <Toggle
            label="Email Summaries"
            desc="Weekly reports of your portfolio"
            defaultOn
          />
          <Toggle
            label="Payment Reminders"
            desc="Alerts 3 days before a due date"
            defaultOn
          />
        </div>
      </section>

      {/* Security */}
      <section className="border-b-[3px] border-on-surface pb-lg">
        <h2 className="text-2xl font-bold uppercase mb-lg">Security</h2>
        <div className="space-y-sm max-w-2xl">
          <Field label="New Password">
            <PasswordInput
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm New Password">
            <PasswordInput
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <div className="pt-sm">
            <Button
              variant="primary"
              className={pwFlash ? 'nb-yellow-flash' : undefined}
              style={pwFlash ? ({ ['--nb-flash-from' as string]: '#1e1c10' } as CSSProperties) : undefined}
              onClick={savePassword}
            >
              Change Password
            </Button>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="text-2xl font-bold uppercase text-on-error-container mb-lg">Danger Zone</h2>
        <div className="border-[3px] border-on-surface p-lg bg-error-container min-w-0 max-w-full">
          <h3 className="text-lg font-bold text-on-error-container mb-2">
            Delete Account
          </h3>
          <p className="font-medium text-on-error-container mb-6 max-w-2xl">
            Once you delete your account, there is no going back. Please be certain.
            All your financial data, expenses, and investment history will be
            permanently erased.
          </p>
          <Button variant="error">
            <Icon name="delete_forever" className="text-xl" />
            Delete My Account
          </Button>
        </div>
      </section>
    </div>
  )
}
