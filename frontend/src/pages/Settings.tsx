import { useState, type CSSProperties } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Field, Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { PasswordInput } from '../components/ui/PasswordInput'
import { initials } from '../lib/format'

function Toggle({ label, desc, defaultOn = false }: { label: string; desc: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className="flex items-center justify-between p-4 bg-white border-[3px] border-on-surface shadow-brutal hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all">
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
  const { theme, toggle, setTheme } = useTheme()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwFlash, setPwFlash] = useState(false)
  if (!user) return null

  const savePassword = () => {
    setPwFlash(true)
    window.setTimeout(() => setPwFlash(false), 220)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-xl">
      <PageHeader title="Settings" />

      {/* Account */}
      <section className="border-b-[3px] border-on-surface pb-lg">
        <h2 className="text-2xl font-bold uppercase mb-lg">Account</h2>
        <div className="flex flex-col md:flex-row gap-lg items-start">
          <div className="w-32 h-32 border-[3px] border-on-surface flex items-center justify-center text-4xl font-bold bg-brand-yellow shadow-brutal shrink-0">
            {initials(user.name)}
          </div>
          <div className="flex-grow w-full space-y-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
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

      {/* Appearance */}
      <section className="border-b-[3px] border-on-surface dark:border-[#f5f0da] pb-lg">
        <h2 className="text-2xl font-bold uppercase mb-lg dark:text-[#f5f0da]">Appearance</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-white dark:bg-[#23231a] border-[3px] border-on-surface dark:border-[#f5f0da] shadow-brutal">
            <div>
              <p className="font-bold dark:text-[#f5f0da]">Dark Mode</p>
              <p className="font-medium text-on-surface-variant dark:text-[#b8b5a0] text-sm mt-1">Toggle between light and dark theme. Saved for next visit.</p>
              <p className="text-[11px] opacity-60 dark:text-[#b8b5a0] mt-1">Shortcut: theme persists + respects system preference.</p>
            </div>
            <div className="flex items-center gap-sm ml-md shrink-0">
              <button
                onClick={() => setTheme('light')}
                className={`brutal-thin px-sm py-xs text-xs font-bold uppercase ${theme === 'light' ? 'bg-brand-yellow' : 'bg-white dark:bg-[#2a2a1e] dark:text-[#f5f0da]'}`}
              >
                <Icon name="light_mode" className="text-base mr-1" />Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`brutal-thin px-sm py-xs text-xs font-bold uppercase ${theme === 'dark' ? 'bg-brand-yellow text-on-surface' : 'bg-white dark:bg-[#2a2a1e] dark:text-[#f5f0da]'}`}
              >
                <Icon name="dark_mode" className="text-base mr-1" />Dark
              </button>
              <button
                onClick={toggle}
                className="brutal bg-white dark:bg-[#2a2a1e] dark:text-[#f5f0da] border-2 border-on-surface dark:border-[#f5f0da] p-2"
                title="Toggle"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="border-b-[3px] border-on-surface dark:border-[#f5f0da] pb-lg">
        <h2 className="text-2xl font-bold uppercase mb-lg dark:text-[#f5f0da]">Notifications</h2>
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
        <h2 className="text-2xl font-bold uppercase text-error mb-lg">Danger Zone</h2>
        <div className="border-[3px] border-error p-lg bg-error-container">
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
