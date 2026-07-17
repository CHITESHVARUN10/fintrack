import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import type { Form16 } from '../../types'

interface DuplicateModalProps {
  open: boolean
  source: Form16 | null
  onClose: () => void
  onConfirm: (newName: string) => void
}

export function DuplicateModal({ open, source, onClose, onConfirm }: DuplicateModalProps) {
  const [name, setName] = useState('')

  const value = name || `FY ${source?.financialYear ?? ''} Draft`

  return (
    <Modal open={open} onClose={onClose} title="Duplicate Record" width="max-w-[540px]">
      <div className="flex flex-col gap-lg">
        <p className="font-medium">
          You are about to create an independent copy
          {source ? (
            <>
              {' '}
              of the <strong>FY {source.financialYear}</strong> Form 16 for{' '}
              <strong>{source.employerName}</strong>
            </>
          ) : (
            ''
          )}
          .
        </p>

        <Field label="New Record Name">
          <Input
            value={value}
            onChange={(e) => setName(e.target.value)}
            placeholder="FY 2025-26 Draft"
          />
        </Field>

        <div className="bg-brand-yellow brutal-thin p-md flex gap-sm items-start">
          <Icon name="info" className="mt-0.5" />
          <p className="font-bold">This copy will not affect the original record.</p>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-sm justify-end mt-lg pt-md border-t-2 border-on-surface">
        <Button variant="white" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="yellow" icon={<Icon name="content_copy" />} onClick={() => onConfirm(value)}>
          Confirm Duplicate
        </Button>
      </div>
    </Modal>
  )
}
