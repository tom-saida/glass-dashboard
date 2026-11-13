import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

export interface EmptyStateProps {
  /**
   * One sentence with a period, saying what is missing: "No callbacks waiting." Optional only when
   * `filtered` is a string (then it defaults to "Nothing matches <filtered>.").
   */
  title?: string
  /**
   * A sub-line under 14 words saying when data appears or what to do next: "New callbacks show
   * here the moment a call ends." Filtered lists default to "Change the filter to see more."
   */
  hint?: string
  /** The box is this many table rows tall (var(--row-height) each), so the card keeps its size. */
  rows?: number
  /**
   * The list is empty because of a filter, not because there is no data (Stripe: worded
   * differently). true uses the filtered default hint; a string names the filter ("Booked"), and
   * the default title becomes "Nothing matches Booked.".
   */
  filtered?: boolean | string
  /** Optional next step (a TextButton) after the hint. */
  action?: ReactNode
  className?: string
}

/**
 * P20 (FINDINGS M11): a designed empty list. A dashed 1px --layout-border-color box the height of
 * `rows` table rows with one sentence and a quiet sub-line. No illustration and never Katie
 * (FINDINGS 6.2 and 6.8).
 */
export function EmptyState({ title, hint, rows = 3, filtered, action, className }: EmptyStateProps) {
  const isFiltered = filtered !== undefined && filtered !== false
  const heading = title ?? (typeof filtered === 'string' && filtered ? `Nothing matches ${filtered}.` : 'Nothing here yet.')
  const sub = hint ?? (isFiltered ? 'Change the filter to see more.' : undefined)
  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')} data-empty={isFiltered ? 'filtered' : 'no-data'}>
      <div className={styles.box} style={{ minHeight: `calc(var(--row-height) * ${Math.max(1, rows)})` }}>
        <p className={styles.title}>{heading}</p>
        {sub && <p className={styles.hint}>{sub}</p>}
        {action && <div className={styles.action}>{action}</div>}
      </div>
    </div>
  )
}
