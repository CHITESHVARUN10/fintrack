import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Field, Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { AuthBackground } from '../components/layout/AuthBackground'
import { PasswordInput } from '../components/ui/PasswordInput'

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
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Registration failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans overflow-x-hidden relative">
      <AuthBackground />
      <div className="flex min-h-screen">
        {/* Left brand panel */}
        <div className="hidden md:flex w-1/2 border-r-4 border-on-surface flex-col justify-center p-xl bg-surface-container-low">
          <div className="inline-block border-[3px] border-on-surface bg-brand-yellow px-sm py-xs w-max font-bold uppercase tracking-widest mb-md">
            FinStack Setup
          </div>
          <h1 className="text-5xl font-bold uppercase tracking-tighter leading-none mb-md">
            Track every rupee.
            <br />
            Own your money.
          </h1>
          <ul className="flex flex-col gap-md mt-sm border-t-4 border-on-surface pt-lg">
            <li className="flex items-center gap-sm">
              <div className="w-12 h-12 border-[3px] border-on-surface bg-brand-yellow flex items-center justify-center shadow-brutal">
                <Icon name="bolt" className="text-2xl" filled />
              </div>
              <span className="text-lg font-bold uppercase tracking-tight">
                Real-time expense tracking
              </span>
            </li>
            <li className="flex items-center gap-sm">
              <div className="w-12 h-12 border-[3px] border-on-surface bg-white flex items-center justify-center shadow-brutal">
                <Icon name="family_home" className="text-2xl" filled />
              </div>
              <span className="text-lg font-bold uppercase tracking-tight">
                Family account sharing
              </span>
            </li>
          </ul>
        </div>

        {/* Right form panel */}
        <div className="w-full md:w-1/2 flex items-center justify-center p-md">
          <div className="w-full max-w-md border-[3px] border-on-surface bg-white p-lg shadow-brutal flex flex-col gap-md relative z-10">
            <h2 className="text-2xl font-bold uppercase tracking-tighter border-b-[3px] border-on-surface pb-xs">
              Register
            </h2>
            {error && (
              <div className="border-[3px] border-on-surface bg-red-100 px-sm py-2 font-bold text-sm">
                {error}
              </div>
            )}
            <form className="flex flex-col gap-md" onSubmit={onSubmit}>
              <Field label="Full Name">
                <Input
                  placeholder="e.g. Rahul Sharma"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Email Address">
                <Input
                  placeholder="rahul@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label="Password">
                <PasswordInput
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>

              <div className="bg-brand-yellow border-[3px] border-on-surface p-sm shadow-brutal-sm flex items-start gap-sm">
                <Icon name="mail" className="text-xl mt-0.5" filled />
                <p className="font-bold uppercase tracking-tight leading-tight">
                  You've been invited to join
                  <br />
                  <span className="bg-on-surface text-white px-1">Sharma Family</span> account.
                </p>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                block
                disabled={loading}
                className={flash ? 'nb-yellow-flash' : undefined}
                style={flash ? ({ ['--nb-flash-from' as string]: '#1e1c10' } as CSSProperties) : undefined}
              >
                {loading ? 'Creating…' : 'Create Account'}
                {!loading && <Icon name="person_add" className="text-xl" />}
              </Button>
            </form>
            <p className="text-center font-medium">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-bold underline decoration-4 underline-offset-4 hover:bg-brand-yellow px-1"
              >
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
