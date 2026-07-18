import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/cn'
import { Field, Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { AuthBackground } from '../components/layout/AuthBackground'
import { PasswordInput } from '../components/ui/PasswordInput'

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
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Login failed. Please try again.'
      setError(msg)
      setShake(true)
      window.setTimeout(() => setShake(false), 420)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-md bg-white relative">
      <AuthBackground />
      <div
        className={cn(
          'w-full max-w-md bg-white border-[3px] border-on-surface shadow-brutal p-lg relative z-10',
          shake && 'nb-shake',
        )}
        style={flash ? ({ ['--nb-flash-from' as string]: '#ffffff' } as CSSProperties) : undefined}
      >
        <div className="mb-lg">
          <h1 className="text-4xl font-bold uppercase tracking-tighter text-on-surface">
            FinStack
          </h1>
          <h2 className="text-2xl font-bold uppercase text-on-surface mt-2">Login</h2>
          <p className="font-medium text-on-surface-variant">
            Enter your credentials to continue.
          </p>
        </div>

        {error && (
          <div className="mb-md border-[3px] border-on-surface bg-red-100 px-sm py-2 font-bold text-sm">
            {error}
          </div>
        )}

        <form className="flex flex-col gap-sm" onSubmit={onSubmit}>
          <Field label="Email Address">
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>

          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-sm uppercase tracking-wide text-on-surface">
                Password
              </span>
              <a
                className="font-bold text-sm text-on-surface hover:underline underline-offset-4"
                href="#"
              >
                Forgot password?
              </a>
            </div>
            <PasswordInput
              id="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="pt-sm">
            <Button
              type="submit"
              variant="yellow"
              size="lg"
              block
              disabled={loading}
              className={flash ? 'nb-yellow-flash' : undefined}
              style={flash ? ({ ['--nb-flash-from' as string]: '#ffe500' } as CSSProperties) : undefined}
            >
              {loading ? 'Logging in…' : 'Login'}
              {!loading && <Icon name="login" className="text-xl" />}
            </Button>
          </div>
        </form>

        <div className="mt-lg pt-sm border-t-4 border-on-surface text-center">
          <p className="font-medium text-on-surface">
            New here?{' '}
            <Link
              to="/register"
              className="font-bold hover:bg-brand-yellow px-1 transition-colors"
            >
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
