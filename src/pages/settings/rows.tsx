// The Settings rows (DESIGN 6.11): label and helper on the left, the control on the right; a
// stacked row puts a wide control under the label. Shared by the toggles card and the glass card.
import { useId, type ReactNode } from 'react'
import { Toggle } from '@vibe/core'
import styles from '../lists/Settings.module.css'

export function Row({
  label,
  helper,
  helperId,
  htmlFor,
  labelId,
  stacked = false,
  children,
}: {
  label: string
  helper?: string
  /** The helper's id, for the control's aria-describedby. */
  helperId?: string
  htmlFor?: string
  labelId?: string
  /** The control goes under the label, full width (segmented groups with long options). */
  stacked?: boolean
  children: ReactNode
}) {
  return (
    <div className={[styles.row, stacked ? styles.stacked : ''].filter(Boolean).join(' ')}>
      <div className={styles.text}>
        {htmlFor ? (
          <label htmlFor={htmlFor} id={labelId} className={styles.label}>
            {label}
          </label>
        ) : (
          <span id={labelId} className={styles.label}>
            {label}
          </span>
        )}
        {helper && (
          <span id={helperId} className={styles.helper}>
            {helper}
          </span>
        )}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  )
}

export function ToggleRow({
  label,
  helper,
  value,
  disabled = false,
  onChange,
}: {
  label: string
  helper?: string
  value: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}) {
  const id = useId()
  const helperId = useId()
  return (
    <Row label={label} helper={helper} helperId={helperId} htmlFor={id}>
      <Toggle
        id={id}
        size="small"
        areLabelsHidden
        aria-label={label}
        aria-describedby={helper ? helperId : undefined}
        isSelected={value}
        disabled={disabled}
        onChange={(v: boolean) => onChange(v)}
      />
    </Row>
  )
}
