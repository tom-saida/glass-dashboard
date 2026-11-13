import { useSyncExternalStore, type ReactNode } from 'react'
import { getAuthState, subscribeAuthState } from '../api/client'
import styles from './Lines.module.css'

/** Designed empty state: one quiet 14/20 secondary line in a 56px row. */
export function EmptyLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={[styles.line, className].filter(Boolean).join(' ')}>
      <p className={styles.text}>{children}</p>
    </div>
  )
}

export const ERROR_COPY = "Couldn't load this. Trying again."
/** Signed out (401): nothing retries until a reload, so the line does not promise it. */
export const ERROR_COPY_SIGNED_OUT = "Couldn't load this."

/**
 * Widget error state (DESIGN 6): one line plus a "Retry" text button. The default copy says
 * "Trying again." only while requests are retried; after a 401 (never retried; the top bar's
 * SessionLine says why) it reads "Couldn't load this." alone.
 */
export function ErrorLine({
  onRetry,
  children,
  className,
}: {
  onRetry?: () => void
  children?: ReactNode
  className?: string
}) {
  const auth = useSyncExternalStore(subscribeAuthState, getAuthState, getAuthState)
  const text = children ?? (auth === 'not-allowed' ? 'Not allowed.' : auth === 'signed-out' ? ERROR_COPY_SIGNED_OUT : ERROR_COPY)
  return (
    <div className={[styles.line, className].filter(Boolean).join(' ')} role="status">
      <p className={styles.text}>{text}</p>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

/** A text button styled as a link (Show more, Retry). */
export function TextButton({
  onClick,
  children,
  className,
  disabled,
}: {
  onClick: () => void
  children: ReactNode
  className?: string
  disabled?: boolean
}) {
  return (
    <button type="button" className={[styles.retry, className].filter(Boolean).join(' ')} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
