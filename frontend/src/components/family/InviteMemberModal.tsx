import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Field, Input } from '../ui/Field'
import { Button } from '../ui/Button'
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

  const reset = () => {
    setEmail('')
    setName('')
    setError(null)
    setInviteLink(null)
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
      setInviteLink(
        token ? `${window.location.origin}/accept-invite/${token}` : null,
      )
      reset()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Failed to send invite.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Invite Member">
      {inviteLink ? (
        <div className="flex flex-col gap-md">
          <div className="border-[3px] border-on-surface bg-brand-yellow px-sm py-2 font-bold">
            Invite sent! Share this activation link:
          </div>
          <code className="block break-all border-[3px] border-on-surface bg-white p-sm text-sm">
            {inviteLink}
          </code>
          <p className="text-sm font-medium text-on-surface-variant">
            The member sets their name &amp; password via this link to activate
            the account.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="yellow" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form className="flex flex-col gap-md" onSubmit={onSubmit}>
          {error && (
            <div className="border-[3px] border-on-surface bg-red-100 px-sm py-2 font-bold text-sm">
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
          <Field label="Name (optional)">
            <Input
              type="text"
              placeholder="e.g. Rohan Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-sm">
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
