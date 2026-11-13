import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './people.module.css'

/**
 * A small modal over the page: a dim layer, a white card, Escape and a click outside close it,
 * Tab stays inside, focus goes to the first field (or the cancel button) and back afterwards.
 * Sits above the call drawer (z 100) and Katie (50).
 */
export function Dialog({
  title,
  children,
  onClose,
  dialogId,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  dialogId: string
}) {
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const el = box.current
    const first = el?.querySelector<HTMLElement>('[data-autofocus], input, select, button')
    first?.focus()
    return () => before?.focus?.()
  }, [])

  // Escape works wherever focus is (a disabled button drops it while a request runs).
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const items = [...(box.current?.querySelectorAll<HTMLElement>('input, select, button:not(:disabled), a[href]') ?? [])]
    if (items.length === 0) return
    const first = items[0] as HTMLElement
    const last = items[items.length - 1] as HTMLElement
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className={styles.dim}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={box}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-dialog={dialogId}
        onKeyDown={onKey}
      >
        <h3 id={titleId} className={styles.dialogTitle}>
          {title}
        </h3>
        {children}
      </div>
    </div>,
    document.body,
  )
}
