import { forwardRef, useId, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { katieLine } from '../lib/katie'
import styles from './Card.module.css'

export interface SectionHeaderProps {
  title: ReactNode
  /** Right side: meta text, legend, links, filters. */
  children?: ReactNode
  /** id for the title (Card wires it to aria-labelledby). */
  titleId?: string
  className?: string
}

/** The 56px card header row: title left (16/24 600), meta and links right (12/16 secondary). */
export function SectionHeader({ title, children, titleId, className }: SectionHeaderProps) {
  return (
    <div className={[styles.header, className].filter(Boolean).join(' ')}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {children != null && <div className={styles.meta}>{children}</div>}
    </div>
  )
}

/** The occasions a widget is Katie's target for (docs/research/MONDAY-LLAMA-2026-10-13.md 3.10). */
export type KatieMoment = 'urgent' | 'first-open' | 'booking' | 'summary'

/** data-katie-moment for a target that is not a Card (KPI cells). */
export function katieMomentAttr(m: KatieMoment | readonly KatieMoment[] | undefined): { 'data-katie-moment'?: string } {
  if (!m) return {}
  const v = typeof m === 'string' ? m : m.join(' ')
  return v ? { 'data-katie-moment': v } : {}
}

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Renders a SectionHeader with this title. */
  title?: ReactNode
  /** Right side of the header (needs `title`). */
  headerRight?: ReactNode
  /**
   * Katie target. A string (her sentence) or null (she stands silently) makes this card a target:
   * it gets data-katie (the sentence or ""). undefined (default): not a target, no attribute.
   * Being a target no longer makes the card focusable (hover and focus do not summon her).
   */
  katie?: string | null
  /**
   * The moments this card is Katie's widget for (data-katie-moment, space separated): `urgent`
   * (callbacks waiting), `first-open`, `booking`, `summary` (what the top bar's Katie button
   * points at when nothing more pressing is on the page).
   */
  katieMoment?: KatieMoment | readonly KatieMoment[]
  /** A tab stop for the card itself (off by default; cards with links inside need none). */
  focusable?: boolean
  /** Pads the body 20px (default false: tables run edge to edge). */
  padded?: boolean
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

/** White card. Never put a Card inside a Card. */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { title, headerRight, katie, katieMoment, focusable = false, padded = false, children, className, ...rest },
  ref,
) {
  const titleId = useId()
  const isTarget = katie !== undefined
  const targetProps = isTarget ? { 'data-katie': katieLine(katie), ...katieMomentAttr(katieMoment) } : {}
  return (
    <section
      ref={ref}
      className={['card-glass', styles.card, padded ? styles.padded : '', className].filter(Boolean).join(' ')}
      aria-labelledby={title != null ? titleId : undefined}
      tabIndex={focusable ? 0 : undefined}
      {...targetProps}
      {...rest}
    >
      {title != null && (
        <SectionHeader title={title} titleId={titleId}>
          {headerRight}
        </SectionHeader>
      )}
      {children}
    </section>
  )
})
