import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { Button } from '../ui/Button'
import { Select } from '../ui/Field'
import type { Form16 } from '../../types'

interface NewForm16ModalProps {
  open: boolean
  onClose: () => void
  records: Form16[]
  onUpload: () => void
  onManual: () => void
  onDuplicate: (recordId: string) => void
}

export function NewForm16Modal({
  open,
  onClose,
  records,
  onUpload,
  onManual,
  onDuplicate,
}: NewForm16ModalProps) {
  const [selected, setSelected] = useState('')

  return (
    <Modal open={open} onClose={onClose} title="New Form 16" width="max-w-2xl">
      <div className="flex flex-col gap-lg">
        {/* Option 1: Upload PDF */}
        <div className="bg-white brutal p-md flex flex-col md:flex-row gap-md items-start md:items-center">
          <div className="w-16 h-16 brutal-thin bg-brand-yellow flex items-center justify-center shrink-0">
            <Icon name="upload_file" className="text-[32px]" />
          </div>
          <div className="flex-1 flex flex-col gap-xs">
            <h3 className="font-bold text-lg uppercase">Upload New PDF</h3>
            <p className="font-medium text-on-surface-variant">
              Automatically parse and extract data from a standard Form 16 PDF document.
            </p>
          </div>
          <Button variant="yellow" onClick={onUpload} className="shrink-0">
            Upload PDF
          </Button>
        </div>

        {/* Option 2: Duplicate Existing */}
        <div className="bg-white brutal p-md flex flex-col gap-md">
          <div className="flex flex-col md:flex-row gap-md items-start md:items-center">
            <div className="w-16 h-16 brutal-thin bg-surface-container-high flex items-center justify-center shrink-0">
              <Icon name="content_copy" className="text-[32px]" />
            </div>
            <div className="flex-1 flex flex-col gap-xs">
              <h3 className="font-bold text-lg uppercase">Duplicate Existing Form 16</h3>
              <p className="font-medium text-on-surface-variant">
                Use a previous year's structure as a baseline. Ideal for similar employment terms.
              </p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-md">
            <Select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="flex-1"
            >
              <option value="" disabled>
                Select previous record
              </option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.financialYear} — {r.employerName || 'Form 16'} ({r.id})
                </option>
              ))}
            </Select>
            <Button
              variant="white"
              disabled={!selected}
              onClick={() => selected && onDuplicate(selected)}
              className="shrink-0"
            >
              Duplicate and Edit
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-center mt-lg pt-md border-t-2 border-on-surface">
        <button
          onClick={onManual}
          className="font-bold uppercase text-on-surface underline hover:bg-brand-yellow px-1"
        >
          Fill Manually from Scratch
        </button>
      </div>
    </Modal>
  )
}
