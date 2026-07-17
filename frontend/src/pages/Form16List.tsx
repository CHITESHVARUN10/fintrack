import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { form16Service } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { NewForm16Modal } from '../components/form16/NewForm16Modal'
import { DuplicateModal } from '../components/form16/DuplicateModal'
import { formatCurrency } from '../lib/format'
import type { Form16 } from '../types'

export function Form16List() {
  const navigate = useNavigate()
  const { data, loading } = useAsync(() => form16Service.list(), [])
  const [newOpen, setNewOpen] = useState(false)
  const [dupSource, setDupSource] = useState<Form16 | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading || !data) return <LoadingBlock label="Loading Form 16 records…" />

  const openRecommendation = (id: string) =>
    navigate(`/form16/recommendation/loading?form=${id}`)

  const handleManual = async () => {
    setNewOpen(false)
    setBusy(true)
    const rec = await form16Service.createManual()
    setBusy(false)
    navigate(`/form16/review/${rec.id}`)
  }

  const handleUpload = () => {
    setNewOpen(false)
    navigate('/form16/upload')
  }

  const handleDuplicateFromModal = (recordId: string) => {
    setNewOpen(false)
    const src = data.find((r) => r.id === recordId)
    if (src) setDupSource(src)
  }

  const confirmDuplicate = async (newName: string) => {
    if (!dupSource) return
    setBusy(true)
    const copy = await form16Service.duplicate(dupSource.id, newName)
    setBusy(false)
    setDupSource(null)
    navigate(`/form16/review/${copy.id}`)
  }

  return (
    <div>
      <PageHeader
        title="Form 16 Records"
        subtitle="Manage and analyze your tax documents."
        action={
          <Button variant="yellow" onClick={() => setNewOpen(true)}>
            <Icon name="add" className="text-xl" />
            New Form 16
          </Button>
        }
      />

      {data.length === 0 ? (
        <div className="bg-white brutal p-xl text-center flex flex-col items-center gap-md">
          <Icon name="description" className="text-5xl text-on-surface-variant" />
          <p className="font-bold text-lg uppercase">No Form 16 records yet</p>
          <Button variant="yellow" onClick={() => setNewOpen(true)}>
            <Icon name="add" className="text-xl" />
            Add your first Form 16
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-lg">
          {data.map((rec) => (
            <div key={rec.id} className="bg-white brutal flex flex-col">
              {/* Card header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-md border-b-[3px] border-on-surface gap-3 bg-surface-container-low">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge color="yellow">{rec.financialYear}</Badge>
                  <Badge color="surface">{rec.status}</Badge>
                  <Badge color={rec.taxRegimeUsed === 'New' ? 'cyan' : 'white'}>
                    {rec.taxRegimeUsed} Regime
                  </Badge>
                </div>
                <div className="font-mono-data text-sm text-on-surface-variant bg-white brutal-thin px-2 py-1">
                  ID: {rec.id}
                </div>
              </div>

              {/* Card body */}
              <div className="p-lg flex flex-col md:flex-row gap-md md:gap-xl">
                <div className="flex-1 flex flex-col gap-3">
                  <div>
                    <p className="font-bold text-xs uppercase text-on-surface-variant">Employer</p>
                    <p className="font-bold text-lg uppercase">{rec.employerName}</p>
                  </div>
                  <div>
                    <p className="font-bold text-xs uppercase text-on-surface-variant">Employee</p>
                    <p className="font-bold uppercase">{rec.employeeName}</p>
                  </div>
                </div>
                <div className="flex-1 flex flex-col md:flex-row gap-md md:gap-xl md:pl-xl md:border-l-[3px] md:border-on-surface">
                  <div>
                    <p className="font-bold text-xs uppercase text-on-surface-variant">Gross Salary</p>
                    <p className="font-bold text-2xl">{formatCurrency(rec.grossSalary)}</p>
                  </div>
                  <div>
                    <p className="font-bold text-xs uppercase text-on-surface-variant">TDS Deducted</p>
                    <p className="font-bold text-2xl bg-brand-yellow border-b-[3px] border-on-surface inline-block px-1">
                      {formatCurrency(rec.tdsDeducted)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card actions */}
              <div className="p-md border-t-[3px] border-on-surface bg-white flex flex-wrap gap-sm md:justify-end">
                <Button
                  variant="white"
                  size="sm"
                  icon={<Icon name="visibility" className="text-sm" />}
                  onClick={() => navigate(`/form16/review/${rec.id}`)}
                >
                  View &amp; Edit
                </Button>
                <Button
                  variant="white"
                  size="sm"
                  icon={<Icon name="content_copy" className="text-sm" />}
                  onClick={() => setDupSource(rec)}
                >
                  Duplicate
                </Button>
                <Button
                  variant="yellow"
                  size="sm"
                  icon={<Icon name="lightbulb" className="text-sm" />}
                  onClick={() => openRecommendation(rec.id)}
                >
                  Tax Recommendation
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewForm16Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        records={data}
        onUpload={handleUpload}
        onManual={handleManual}
        onDuplicate={handleDuplicateFromModal}
      />

      <DuplicateModal
        open={!!dupSource}
        source={dupSource}
        onClose={() => setDupSource(null)}
        onConfirm={confirmDuplicate}
      />

      {busy && <LoadingBlock label="Working…" />}
    </div>
  )
}
