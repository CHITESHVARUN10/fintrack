import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/cn'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { AuthBackground } from '../components/layout/AuthBackground'
import { PasswordInput } from '../components/ui/PasswordInput'
import { Badge } from '../components/ui/Badge'
import './entry-overview.css'

export function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await register(name, email, password)
      setFlash(true)
      window.setTimeout(() => navigate('/dashboard'), 220)
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
      const details = data?.details?.length ? `: ${data.details.join(', ')}` : ''
      const msg = data?.error ? `${data.error}${details}` : 'Registration failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fse-split">
      <div className="fse-split-left fse-grid">
        <div>
          <Badge color="yellow">FinStack Setup</Badge>
        </div>
        <h1 className="fse-split-h1">
          Track every rupee.
          <br />
          Own your money.
        </h1>
        <div className="fse-auth-divider" style={{ maxWidth: 440 }} />
        <div className="fse-perks">
          <div className="fse-perk">
            <span className="fse-perk-icon is-accent">
              <Icon name="bolt" className="text-[18px]" filled />
            </span>
            <span>Real-time expense tracking</span>
          </div>
          <div className="fse-perk">
            <span className="fse-perk-icon">
              <Icon name="family_home" className="text-[18px]" />
            </span>
            <span>Family account sharing</span>
          </div>
        </div>
      </div>

      <div className="fse-split-right">
        <AuthBackground />
        <form
          className="fse-auth-card"
          onSubmit={onSubmit}
          style={flash ? ({ ['--nb-flash-from' as string]: '#ffffff' } as CSSProperties) : undefined}
        >
          <h2 className="fse-split-h2">Register</h2>

          {error && (
            <div className="fse-error" role="alert">
              {error}
            </div>
          )}

          <div className="fse-form-stack">
            <div className="fse-field">
              <label className="fse-label" htmlFor="register-name">Full Name</label>
              <input
                id="register-name"
                className="fin-input fse-input"
                type="text"
                autoComplete="name"
                placeholder="e.g. Rahul Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="fse-field">
              <label className="fse-label" htmlFor="register-email">Email Address</label>
              <input
                id="register-email"
                className="fin-input fse-input"
                type="email"
                autoComplete="email"
                placeholder="rahul@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="fse-field">
              <label className="fse-label" htmlFor="register-password">Password</label>
              <PasswordInput
                id="register-password"
                className="fin-input fse-input"
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              disabled={loading}
              className={cn('uppercase', flash && 'nb-yellow-flash')}
              style={flash ? ({ ['--nb-flash-from' as string]: '#1e1c10' } as CSSProperties) : undefined}
            >
              {loading ? 'Creating…' : 'Create Account'}
              {!loading && <Icon name="arrow_forward" className="text-base" />}
            </Button>
          </div>

          <div className="fse-auth-foot">
            <span>
              Already have an account?{' '}
              <Link to="/login" className="fse-link">Log in</Link>
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}
