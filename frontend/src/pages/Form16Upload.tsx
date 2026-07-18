import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { form16Service } from '../services/api'
import { Icon } from '../components/ui/Icon'
import { Button } from '../components/ui/Button'

export function Form16Upload() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = (f?: File) => {
    if (f) {
      setFile(f)
      setFileName(f.name)
    }
  }

  const startUpload = () => {
    if (!file) return
    setBusy(true)
    navigate('/form16/processing', { state: { file } })
  }

  const startManual = async () => {
    setBusy(true)
    const rec = await form16Service.createManual()
    navigate(`/form16/review/${rec.id}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-md">
      <button
        onClick={() => navigate('/form16')}
        className="absolute top-md left-md flex items-center gap-1 font-bold uppercase text-on-surface-variant hover:text-on-surface"
      >
        <Icon name="arrow_back" className="text-sm" />
        Back
      </button>

      <main className="w-full max-w-2xl bg-white brutal p-xl flex flex-col gap-lg relative overflow-hidden">
        <header className="flex items-center gap-sm pb-md border-b-[3px] border-on-surface">
          <Icon name="upload_file" className="text-3xl" />
          <h1 className="font-bold text-2xl uppercase tracking-tight">Upload Form 16 PDF</h1>
        </header>

        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            handleFile(e.dataTransfer.files?.[0])
          }}
          className="border-[3px] border-dashed border-on-surface p-xl flex flex-col items-center justify-center gap-md min-h-[250px] cursor-pointer hover:border-on-surface hover:bg-surface-container-low transition-colors"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Icon name="description" className="text-[64px] text-on-surface-variant" />
          <p className="font-bold uppercase tracking-widest text-center text-on-surface-variant">
            Drag and drop your Form 16 PDF here
          </p>
          <Button
            type="button"
            variant="yellow"
            onClick={(e) => {
              e.preventDefault()
              inputRef.current?.click()
            }}
          >
            Browse File
          </Button>
        </label>

        {fileName && (
          <div className="bg-surface-container-high brutal-thin p-sm flex items-center justify-between">
            <div className="flex items-center gap-sm overflow-hidden">
              <Icon name="description" className="bg-brand-yellow p-1 border-r-[3px] border-on-surface" />
              <div className="flex flex-col overflow-hidden">
                <span className="font-bold truncate">{fileName}</span>
                <span className="font-mono-data text-xs text-on-surface-variant">PDF selected</span>
              </div>
            </div>
            <button
              onClick={() => setFileName(null)}
              className="bg-error-container text-on-error-container brutal-thin p-2 hover:bg-error hover:text-on-error transition-colors"
              title="Remove file"
            >
              <Icon name="delete" />
            </button>
          </div>
        )}

        <div className="flex flex-col gap-xs md:flex-row md:justify-between font-mono-data text-sm uppercase text-on-surface-variant">
          <div className="flex items-center gap-2">
            <Icon name="picture_as_pdf" className="text-[20px]" />
            <span>Supported format: PDF only</span>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="lock" className="text-[20px]" />
            <span>Securely processed</span>
          </div>
        </div>

        <Button variant="yellow" block size="lg" disabled={!fileName || busy} onClick={startUpload}>
          <Icon name="cloud_upload" className="text-xl" />
          Extract with Gemini AI
        </Button>

        <div className="relative flex py-md items-center">
          <div className="flex-grow border-t-[3px] border-on-surface" />
          <span className="flex-shrink-0 mx-4 font-bold uppercase bg-on-surface text-white px-4 py-1 border-[3px] border-on-surface">
            OR
          </span>
          <div className="flex-grow border-t-[3px] border-on-surface" />
        </div>

        <Button
          variant="white"
          block
          size="lg"
          disabled={busy}
          onClick={startManual}
        >
          <Icon name="edit_document" className="text-xl" />
          Fill Form 16 Manually Instead
        </Button>
      </main>
    </div>
  )
}
