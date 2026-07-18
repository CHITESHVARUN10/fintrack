import { useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { PasswordInput } from '../components/ui/PasswordInput'
import { acceptInvite } from '../services/apiClient'

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
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Could not activate this account.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-md bg-white relative">
      <div
        className="w-full max-w-md bg-white border-[3px] border-on-surface shadow-brutal p-lg relative z-10"
        style={flash ? ({ ['--nb-flash-from' as string]: '#ffffff' } as CSSProperties) : undefined}
      >
        <div className="mb-lg">
          <h1 className="text-4xl font-bold uppercase tracking-tighter text-on-surface">
            FinStack
          </h1>
          <h2 className="text-2xl font-bold uppercase text-on-surface mt-2">
            Accept Invite
          </h2>
          <p className="font-medium text-on-surface-variant">
            Set your details to activate your account.
          </p>
        </div>

        {done ? (
          <div className="flex flex-col gap-md">
            <div className="border-[3px] border-on-surface bg-brand-yellow px-sm py-3 font-bold">
              Account activated! You can now log in.
            </div>
            <Button variant="yellow" size="lg" block onClick={() => navigate('/login')}>
              Go to Login
              <Icon name="login" className="text-xl" />
            </Button>
          </div>
        ) : !token ? (
          <div className="border-[3px] border-on-surface bg-red-100 px-sm py-3 font-bold">
            This invite link is missing its token.
          </div>
        ) : (
          <form className="flex flex-col gap-sm" onSubmit={onSubmit}>
            {error && (
              <div className="border-[3px] border-on-surface bg-red-100 px-sm py-2 font-bold text-sm">
                {error}
              </div>
            )}
            <Field label="Name (optional)">
              <Input
                id="name"
                type="text"
                placeholder="e.g. Rohan Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <PasswordInput
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
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
                {loading ? 'Activating…' : 'Activate Account'}
              </Button>
            </div>
            <p className="text-center font-medium mt-2">
              Already set up?{' '}
              <Link
                to="/login"
                className="font-bold hover:bg-brand-yellow px-1 transition-colors"
              >
                Log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
