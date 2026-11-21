import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/cn'
import { Icon } from '../components/ui/Icon'
import { AuthBackground } from '../components/layout/AuthBackground'
import { PasswordInput } from '../components/ui/PasswordInput'
import './entry-overview.css'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [shake, setShake] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      setFlash(true)
      window.setTimeout(() => navigate('/dashboard'), 220)
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
      const details = data?.details?.length ? `: ${data.details.join(', ')}` : ''
      const msg = data?.error ? `${data.error}${details}` : 'Login failed. Please try again.'
      setError(msg)
      setShake(true)
      window.setTimeout(() => setShake(false), 420)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fse-auth">
      <AuthBackground />
      <form
        className={cn('fse-auth-card', shake && 'nb-shake')}
        onSubmit={onSubmit}
        style={flash ? ({ ['--nb-flash-from' as string]: '#ffffff' } as CSSProperties) : undefined}
        noValidate={false}
      >
        <div>
          <Link to="/" className="fse-brand" aria-label="FinStack home">
            <img className="fse-brand-sq" src="/finstack-logo.png" alt="" />
            <span className="fse-brand-word">FinStack</span>
          </Link>
          <h1 className="fse-auth-h1">Login</h1>
          <p className="fse-auth-sub">Enter your credentials to continue.</p>
        </div>

        {error && (
          <div className="fse-error" role="alert">
            {error}
          </div>
        )}

        <div className="fse-field">
          <label className="fse-label" htmlFor="login-email">Email Address</label>
          <input
            id="login-email"
            className="fin-input fse-input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="fse-field">
          <label className="fse-label" htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            className="fin-input fse-input"
            autoComplete="current-password"
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
          {loading ? 'Logging in…' : 'Login'}
          {!loading && <Icon name="arrow_forward" className="text-base" />}
        </button>

        <div className="fse-auth-divider" />

        <div className="fse-auth-foot">
          <span>
            New here?{' '}
            <Link to="/register" className="fse-link">Create account</Link>
          </span>
          <span>
            Have an invite? Open the activation link from your email.
          </span>
        </div>
      </form>
    </div>
  )
}
