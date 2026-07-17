import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Field, Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await login(email, password)
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-md bg-white">
      <div className="w-full max-w-md bg-white border-[3px] border-on-surface shadow-brutal p-lg">
        <div className="mb-lg">
          <h1 className="text-4xl font-bold uppercase tracking-tighter text-on-surface">
            FinStack
          </h1>
          <h2 className="text-2xl font-bold uppercase text-on-surface mt-2">Login</h2>
          <p className="font-medium text-on-surface-variant">
            Enter your credentials to continue.
          </p>
        </div>

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
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="pt-sm">
            <Button type="submit" variant="yellow" size="lg" block disabled={loading}>
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
