import { useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { cn } from '../lib/cn'
import { Icon } from '../components/ui/Icon'
import { PasswordInput } from '../components/ui/PasswordInput'
import { AuthBackground } from '../components/layout/AuthBackground'
import { acceptInvite } from '../services/apiClient'
import './entry-overview.css'

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [flash, setFlash] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setError(null)
    setLoading(true)
    try {
      await acceptInvite(token, { password, name: name || undefined })
      setDone(true)
      setFlash(true)
      window.setTimeout(() => setFlash(false), 220)
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
      const details = data?.details?.length ? `: ${data.details.join(', ')}` : ''
      const msg = data?.error ? `${data.error}${details}` : 'Could not activate this account.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fse-auth">
      <AuthBackground />
      <div
        className="fse-auth-card"
        style={flash ? ({ ['--nb-flash-from' as string]: '#ffffff' } as CSSProperties) : undefined}
      >
        <div>
          <Link to="/" className="fse-brand" aria-label="FinStack home">
            <img className="fse-brand-sq" src="/finstack-logo.png" alt="" />
            <span className="fse-brand-word">FinStack</span>
          </Link>
          <h1 className="fse-auth-h1">Accept Invite</h1>
          <p className="fse-auth-sub">Set your details to activate your account.</p>
        </div>

        {done ? (
          <>
            <div className="fse-activated" role="status">
              <Icon name="check_circle" className="text-base" filled />
              Account activated — you can log in now.
            </div>
            <button type="button" className="fin-button fse-btn is-block" onClick={() => navigate('/login')}>
              Go to Login
              <Icon name="login" className="text-base" />
            </button>
          </>
        ) : !token ? (
          <div className="fse-error" role="alert">
            This invite link is missing its token. Ask whoever invited you to resend it.
          </div>
        ) : (
          <form className="fse-form-stack" onSubmit={onSubmit}>
            {error && (
              <div className="fse-error" role="alert">
                {error}
              </div>
            )}

            <div className="fse-field">
              <label className="fse-label" htmlFor="invite-name">Name (optional)</label>
              <input
                id="invite-name"
                className="fin-input fse-input"
                type="text"
                autoComplete="name"
                placeholder="e.g. Rohan Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="fse-field">
              <label className="fse-label" htmlFor="invite-password">Password</label>
              <PasswordInput
                id="invite-password"
                className="fin-input fse-input"
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className={cn('fin-button fse-btn is-block', flash && 'nb-yellow-flash')}
              disabled={loading}
              style={flash ? ({ ['--nb-flash-from' as string]: '#ffe500' } as CSSProperties) : undefined}
            >
              {loading ? 'Activating…' : 'Activate Account'}
            </button>

            <div className="fse-auth-foot">
              <span>
                Already set up?{' '}
                <Link to="/login" className="fse-link">Log in</Link>
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
