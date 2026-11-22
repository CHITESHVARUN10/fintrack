import { lazy, Suspense, useCallback, useRef, useState, type ReactNode } from 'react'
import { ConfirmationContext, type ConfirmAction } from '../../hooks/useConfirmation'
import { Button } from './Button'
const Modal = lazy(() => import('./Modal').then(module => ({ default: module.Modal })))

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<{ title: string; message: string; action: string } | null>(null)
  const resolve = useRef<((confirmed: boolean) => void) | null>(null)
  const ask = useCallback<ConfirmAction>((title, message, action = 'Delete') => {
    if (resolve.current) return Promise.resolve(false)
    return new Promise<boolean>((done) => {
      resolve.current = done
      setPrompt({ title, message, action })
    })
  }, [])

  function close(confirmed: boolean) {
    const done = resolve.current
    resolve.current = null
    setPrompt(null)
    done?.(confirmed)
  }

  return (
    <ConfirmationContext.Provider value={ask}>
      {children}
      {prompt && (
        <Suspense>
          <Modal open zIndex={150} onClose={() => close(false)} title={prompt.title}
            footer={<>
              <Button variant="white" onClick={() => close(false)}>Cancel</Button>
              <Button variant="error" onClick={() => close(true)}>{prompt.action}</Button>
            </>}>
            <p>{prompt.message}</p>
          </Modal>
        </Suspense>
      )}
    </ConfirmationContext.Provider>
  )
}
