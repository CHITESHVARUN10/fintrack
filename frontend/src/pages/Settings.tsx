import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { familyService } from '../services/api'
import { PageHeader } from '../components/ui/PageHeader'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { initials } from '../lib/format'
import './family-workspace.css'

const PRIVACY_EMAIL = 'privacy@fintrack.app'
const PREFS_KEY = 'fintrack-notification-prefs'

type PrefKey = 'push' | 'email' | 'reminders'

const NOTIFICATION_PREFS: { key: PrefKey; label: string; desc: string }[] = [
  { key: 'push', label: 'Push Notifications', desc: 'Alerts about upcoming bills in the app' },
  { key: 'email', label: 'Email Summaries', desc: 'Weekly summaries of your household spend' },
  { key: 'reminders', label: 'Payment Reminders', desc: 'Reminders before a payment is due' },
]

function readPrefs(): Record<PrefKey, boolean> {
  const fallback: Record<PrefKey, boolean> = { push: true, email: true, reminders: true }
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Record<PrefKey, boolean>>
    return { ...fallback, ...parsed }
  } catch {
    return fallback
  }
}

function FamilySection() {
  const { user, refreshSession } = useAuth()
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle')
  const [familyName, setFamilyName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inFamily = Boolean(user?.familyAccountId)

  function apiError(e: unknown, fallback: string) {
    const data = (e as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
    const details = data?.details?.length ? `: ${data.details.join(', ')}` : ''
    return data?.error ? `${data.error}${details}` : fallback
  }

  async function createFamily() {
    setError(null)
    setMessage(null)
    if (!familyName.trim()) {
      setError('Enter a family name')
      return
    }
    setBusy(true)
    try {
      await familyService.create({ name: familyName.trim() })
      await refreshSession()
      setMode('idle')
      setFamilyName('')
      setMessage('Family created — you are the admin.')
    } catch (e: unknown) {
      setError(apiError(e, 'Could not create the family.'))
    } finally {
      setBusy(false)
    }
  }

  async function joinFamily() {
    setError(null)
    setMessage(null)
    if (!code.trim()) {
      setError('Enter an invite code')
      return
    }
    setBusy(true)
    try {
      await familyService.join(code.trim().toUpperCase())
      setMode('idle')
      setCode('')
      setMessage('Request sent — an admin has to approve it before the family unlocks.')
    } catch (e: unknown) {
      setError(apiError(e, 'Invalid invite code.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="family" className="fw-section" style={{ scrollMarginTop: 16 }}>
      <h2 className="fw-h2">Family</h2>

      <div className="fw-card fw-stack">
        {inFamily ? (
          <div className="fw-split">
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Family account active</p>
              <p className="fw-muted" style={{ fontSize: 13, marginTop: 3 }}>
                Invite members, approve join requests and manage the household from Members.
              </p>
            </div>
            <Link to="/family" className="fw-btn">
              MANAGE MEMBERS
            </Link>
          </div>
        ) : (
          <>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Set up your family</p>
              <p className="fw-muted" style={{ fontSize: 13, marginTop: 3 }}>
                Create a household as admin, or join one with an invite code. A family is required
                for Import, Transactions, Budgets and the family dashboard.
              </p>
            </div>

            {mode === 'idle' && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="fw-btn"
                  onClick={() => {
                    setMode('create')
                    setError(null)
                    setMessage(null)
                  }}
                >
                  <Icon name="group_add" className="text-base" />
                  CREATE FAMILY
                </button>
                <button
                  type="button"
                  className="fw-btn fw-btn--white"
                  onClick={() => {
                    setMode('join')
                    setError(null)
                    setMessage(null)
                  }}
                >
                  <Icon name="login" className="text-base" />
                  JOIN FAMILY
                </button>
              </div>
            )}

            {mode === 'create' && (
              <div className="fw-stack">
                <label className="fw-field">
                  <span className="fw-label">Family name</span>
                  <input
                    className="fw-input"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    placeholder="Sharma Family"
                  />
                </label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button type="button" className="fw-btn" onClick={createFamily} disabled={busy}>
                    {busy ? 'CREATING…' : 'CREATE'}
                  </button>
                  <button
                    type="button"
                    className="fw-btn fw-btn--white"
                    onClick={() => setMode('idle')}
                    disabled={busy}
                  >
                    BACK
                  </button>
                </div>
              </div>
            )}

            {mode === 'join' && (
              <div className="fw-stack">
                <label className="fw-field">
                  <span className="fw-label">Invite code</span>
                  <input
                    className="fw-input fw-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="VF7K92"
                    maxLength={6}
                    style={{ letterSpacing: '0.2em', textTransform: 'uppercase' }}
                  />
                  <span className="fw-muted" style={{ fontSize: 12 }}>
                    Six characters, e.g. VF7K92
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button type="button" className="fw-btn" onClick={joinFamily} disabled={busy}>
                    {busy ? 'JOINING…' : 'JOIN'}
                  </button>
                  <button
                    type="button"
                    className="fw-btn fw-btn--white"
                    onClick={() => setMode('idle')}
                    disabled={busy}
                  >
                    BACK
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="fw-status fw-status--error" role="alert">
            {error}
          </div>
        )}
        {message && <div className="fw-status">{message}</div>}
      </div>
    </section>
  )
}

export function Settings() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(readPrefs)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Deep links from the family banner and Import land on /settings#family;
  // bring the section into view once the page has mounted.
  useEffect(() => {
    if (window.location.hash !== '#family') return
    const timer = window.setTimeout(
      () => document.getElementById('family')?.scrollIntoView({ block: 'start' }),
      0,
    )
    return () => window.clearTimeout(timer)
  }, [])

  // Alert preferences are a per-device UI preference; the server owns actual
  // delivery through the scheduled notification jobs.
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      // Storage can be unavailable in private browsing — the toggles still work
      // for this session.
    }
  }, [prefs])

  if (!user) return null

  const [firstName, ...rest] = user.name.split(' ')
  const lastName = rest.join(' ')

  const deletionEmail = `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(
    'Account deletion request',
  )}&body=${encodeURIComponent(
    `Please delete the FinStack account and all associated financial data for ${user.email}.`,
  )}`

  return (
    <div className="fw-page">
      <PageHeader title="Settings" />

      <div className="fw-settings">
        {/* Account */}
        <section className="fw-section">
          <h2 className="fw-h2">Account</h2>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="fw-avatar-xl">{initials(user.name)}</div>
            <div style={{ flex: 1, minWidth: 260, maxWidth: 640 }} className="fw-stack">
              <div className="fw-grid-2" style={{ gap: 14 }}>
                <label className="fw-field">
                  <span className="fw-label">First name</span>
                  <input className="fw-input" value={firstName || ''} readOnly aria-readonly="true" />
                </label>
                <label className="fw-field">
                  <span className="fw-label">Last name</span>
                  <input className="fw-input" value={lastName} readOnly aria-readonly="true" />
                </label>
              </div>
              <label className="fw-field">
                <span className="fw-label">Email address</span>
                <input className="fw-input" type="email" value={user.email} readOnly aria-readonly="true" />
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="fw-tag fw-tag--dark">{user.role.toUpperCase()}</span>
                <span className={`fw-tag${user.isActive ? ' fw-tag--warm' : ' fw-tag--accent'}`}>
                  {user.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <p className="fw-muted" style={{ fontSize: 12 }}>
                Name, email and role are owned by the household account and can only be changed by
                the family admin through the server. There is no profile-edit endpoint in this
                build, so these fields are read-only rather than a button that silently does nothing.
              </p>
            </div>
          </div>
        </section>

        <FamilySection />

        {/* Appearance */}
        <section className="fw-section">
          <h2 className="fw-h2">Appearance</h2>
          <div className="fw-card fw-split">
            <div style={{ minWidth: 0 }}>
              <p className="fw-toggle-label">Dark Mode</p>
              <p className="fw-muted" style={{ fontSize: 13, marginTop: 3 }}>
                Toggle between light and dark theme. Saved for next visit.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`fw-btn fw-btn--sm${theme === 'light' ? '' : ' fw-btn--white'}`}
                aria-pressed={theme === 'light'}
                onClick={() => setTheme('light')}
              >
                <Icon name="light_mode" className="text-base" />
                LIGHT
              </button>
              <button
                type="button"
                className={`fw-btn fw-btn--sm${theme === 'dark' ? '' : ' fw-btn--white'}`}
                aria-pressed={theme === 'dark'}
                onClick={() => setTheme('dark')}
              >
                <Icon name="dark_mode" className="text-base" />
                DARK
              </button>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="fw-section">
          <h2 className="fw-h2">Notifications</h2>
          <div className="fw-stack">
            {NOTIFICATION_PREFS.map((pref) => {
              const on = prefs[pref.key]
              return (
                <div key={pref.key} className="fw-card fw-split">
                  <div style={{ minWidth: 0 }}>
                    <p className="fw-toggle-label">{pref.label}</p>
                    <p className="fw-muted" style={{ fontSize: 13, marginTop: 2 }}>
                      {pref.desc}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`fw-toggle${on ? ' is-on' : ''}`}
                    role="switch"
                    aria-checked={on}
                    aria-label={pref.label}
                    onClick={() => setPrefs((prev) => ({ ...prev, [pref.key]: !prev[pref.key] }))}
                  >
                    <span className="fw-toggle__knob" />
                  </button>
                </div>
              )
            })}
            <p className="fw-muted" style={{ fontSize: 12 }}>
              These switches are stored on this device. Delivery itself is handled by the server's
              notification jobs, which decide what is actually sent.
            </p>
          </div>
        </section>

        {/* Security */}
        <section className="fw-section">
          <h2 className="fw-h2">Security</h2>
          <div className="fw-card fw-stack">
            <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              This build has no password-change endpoint — the session is managed by the server and
              passwords are only set when an account is created or an invite is accepted.
            </p>
            <p className="fw-muted" style={{ fontSize: 12 }}>
              If you need a new password, ask your family admin to re-issue an invite, or contact{' '}
              <a href={`mailto:${PRIVACY_EMAIL}`} style={{ textDecoration: 'underline', fontWeight: 700 }}>
                {PRIVACY_EMAIL}
              </a>
              . We do not show a form that cannot actually save.
            </p>
          </div>
        </section>

        {/* Danger zone */}
        <section className="fw-section">
          <h2 className="fw-h2" style={{ color: 'var(--fw-danger-ink)' }}>
            Danger Zone
          </h2>
          <div className="fw-danger">
            <span className="fw-danger__title">Delete Account</span>
            <p style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 680 }}>
              Once your account is deleted there is no going back. All financial data, transactions
              and investment history are permanently erased.
            </p>
            <div>
              <button type="button" className="fw-btn fw-btn--danger" onClick={() => setDeleteOpen(true)}>
                <Icon name="delete_forever" className="text-base" />
                DELETE MY ACCOUNT
              </button>
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Confirm account deletion"
        footer={
          <>
            <Button variant="white" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="error"
              onClick={() => {
                window.location.href = deletionEmail
                setDeleteOpen(false)
              }}
            >
              Email deletion request
            </Button>
          </>
        }
      >
        <div className="fw-stack">
          <p style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5 }}>
            This permanently erases your FinStack profile, transactions, budgets and tax records
            for <strong>{user.email}</strong>. This action cannot be undone.
          </p>
          <div className="fw-status">
            Hard deletion is handled by the operator, not by an in-app endpoint. Continuing opens a
            pre-filled request to {PRIVACY_EMAIL}, in line with the privacy policy.
          </div>
        </div>
      </Modal>
    </div>
  )
}
