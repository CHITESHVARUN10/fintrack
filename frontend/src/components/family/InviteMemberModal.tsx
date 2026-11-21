import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Field, Input } from '../ui/Field'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { inviteMember } from '../../services/apiClient'

export function InviteMemberModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = () => {
    setEmail('')
    setName('')
    setError(null)
    setInviteLink(null)
    setCopied(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await inviteMember({ email, name: name || undefined })
      const token = res.data?.inviteToken as string | undefined
      setEmail('')
      setName('')
      setInviteLink(token ? `${window.location.origin}/accept-invite/${token}` : null)
      if (!token) {
        setError('The invite was created but no activation link came back. Check the server response.')
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
      const details = data?.details?.length ? `: ${data.details.join(', ')}` : ''
      const msg = data?.error ? `${data.error}${details}` : 'Failed to send invite.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const copyLink = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy the link — select it and copy manually.')
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Invite Member">
      {inviteLink ? (
        <div className="flex flex-col gap-md">
          <div className="flex items-center gap-2 border-[3px] border-on-surface bg-brand-yellow px-sm py-2 font-bold">
            <Icon name="check_circle" className="text-lg" filled />
            Invite sent — share this activation link
          </div>

          <code className="block break-all border-[3px] border-on-surface bg-white p-sm text-sm">
            {inviteLink}
          </code>

          <p className="text-sm font-medium text-on-surface-variant">
            The member sets their own name and password through this link to activate the account.
            It expires 48 hours after it was issued.
          </p>

          {error && (
            <div className="border-[3px] border-on-surface bg-red-100 px-sm py-2 font-bold text-sm" role="alert">
              {error}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="white" onClick={copyLink}>
              <Icon name={copied ? 'check' : 'content_copy'} className="text-base" />
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button variant="yellow" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form className="flex flex-col gap-md" onSubmit={onSubmit}>
          {error && (
            <div className="border-[3px] border-on-surface bg-red-100 px-sm py-2 font-bold text-sm" role="alert">
              {error}
            </div>
          )}
          <Field label="Email Address">
            <Input
              type="email"
              placeholder="member@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Name (optional)" hint="Used for the account label until they set their own.">
            <Input
              type="text"
              placeholder="e.g. Aarav Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <p className="text-xs font-medium text-on-surface-variant">
            The invite creates an inactive account and emails an activation link. You will see the
            link here too, so you can pass it on directly.
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-sm">
            <Button variant="white" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="yellow" type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send Invite'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
