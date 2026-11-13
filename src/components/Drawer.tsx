import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { IconButton } from '@vibe/core'
import { Close } from '@vibe/icons'
import styles from './Drawer.module.css'

const EXIT_MS = 200

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const DrawerCloseContext = createContext<() => void>(() => {})

/** Inside a Drawer: closes it with the exit slide. */
export function useDrawerClose(): () => void {
  return useContext(DrawerCloseContext)
}

export interface DrawerProps {
  /** e.g. "Call from (656) ***-0150" */
  label: string
  /** Called after the exit slide (or at once under reduced motion). Navigate away here. */
  onClose: () => void
  /** Change it to swap content in place; focus moves to the heading again. */
  contentKey?: string
  children: ReactNode
}

/**
 * The side drawer frame (not a modal): fixed right, no backdrop, role complementary, Esc and
 * the close button close it, focus goes to the [data-drawer-heading] element on open.
 * Focus return to the opening row is the route's job (shell/CallDrawerRoute).
 */
export function Drawer({ label, onClose, contentKey, children }: DrawerProps) {
  const ref = useRef<HTMLElement>(null)
  const [phase, setPhase] = useState<'enter' | 'open' | 'exit'>(() => (prefersReducedMotion() ? 'open' : 'enter'))
  const closing = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (phase !== 'enter') return
    let r2 = 0
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setPhase('open'))
    })
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
    }
  }, [phase])

  const requestClose = useCallback(() => {
    if (closing.current) return
    closing.current = true
    if (prefersReducedMotion()) {
      onCloseRef.current()
      return
    }
    setPhase('exit')
    window.setTimeout(() => onCloseRef.current(), EXIT_MS)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose])

  // Focus the heading on open and whenever the content swaps.
  useEffect(() => {
    closing.current = false
    const focusHeading = () => {
      const root = ref.current
      if (!root) return false
      const h = root.querySelector<HTMLElement>('[data-drawer-heading]')
      ;(h ?? root).focus({ preventScroll: true })
      return !!h
    }
    if (focusHeading()) return
    const r = requestAnimationFrame(() => focusHeading())
    return () => cancelAnimationFrame(r)
  }, [contentKey])

  return (
    <DrawerCloseContext.Provider value={requestClose}>
      <aside ref={ref} role="complementary" aria-label={label} tabIndex={-1} className={`${styles.drawer} ${styles[phase]}`}>
        <div className={styles.close}>
          <IconButton icon={Close} aria-label="Close" size="small" kind="tertiary" onClick={requestClose} hideTooltip />
        </div>
        {children}
      </aside>
    </DrawerCloseContext.Provider>
  )
}

/** The drawer's heading (focus target on open). Style it as you like; it is an h2. */
export function DrawerHeading({ children, className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 data-drawer-heading tabIndex={-1} className={[styles.heading, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </h2>
  )
}
