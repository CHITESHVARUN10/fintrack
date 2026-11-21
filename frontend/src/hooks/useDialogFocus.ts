import { useEffect, useEffectEvent, type RefObject } from 'react'

const dialogStack: HTMLElement[] = []
let previousOverflow = ''

const focusableSelector = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'summary',
  '[tabindex="0"]',
].join(', ')

export function useDialogFocus(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  open = true,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  const close = useEffectEvent(onClose)

  useEffect(() => {
    const panel = panelRef.current
    if (!open || !panel) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null

    if (dialogStack.length === 0) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    dialogStack.push(panel)

    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => !element.closest('[hidden], [aria-hidden="true"], [inert]') && element.tabIndex >= 0)
    const timer = window.setTimeout(() => {
      if (dialogStack.at(-1) === panel) (initialFocus?.current || focusable()[0] || panel).focus()
    }, 0)

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || dialogStack.at(-1) !== panel) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
      if (event.key !== 'Tab') return

      const items = focusable()
      const first = items[0]
      const last = items.at(-1)
      const current = document.activeElement
      if (!first || !last) {
        event.preventDefault()
        panel.focus()
      } else if (event.shiftKey && (current === first || current === panel || !panel.contains(current))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (current === last || !panel.contains(current))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      const wasTop = dialogStack.at(-1) === panel
      const index = dialogStack.indexOf(panel)
      if (index !== -1) dialogStack.splice(index, 1)
      if (dialogStack.length === 0) document.body.style.overflow = previousOverflow
      if (wasTop && trigger?.isConnected) trigger.focus()
    }
  }, [initialFocus, open, panelRef])
}
