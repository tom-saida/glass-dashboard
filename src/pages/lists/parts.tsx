// Shared pieces of the list pages (Calls, Bookings, Callbacks, Texts).
import type { MouseEvent, ReactNode } from 'react'
import { NavigationChevronRight } from '@vibe/icons'
import { ErrorLine, SkeletonBar, TextButton, linkRowProps, rowLinkClass, useOpenCall } from '../../components'
import { EmptyState } from '../../components/EmptyState'
import type { LimitedList } from '../../api'
import { NOT_GIVEN } from '../../lib'
import styles from './ListTable.module.css'

export { styles as listStyles }

/** One table column: header text, width in px (padding included) or "flex", numeric alignment. */
export interface ListColumn {
  key: string
  label: string
  width: number | 'flex'
  numeric?: boolean
}

/** The last column of every clickable list: the hover chevron (P8). 16 + 20 right padding + 8. */
export const CHEVRON_COLUMN: ListColumn = { key: 'open', label: '', width: 44 }

export function ColGroup({ columns }: { columns: readonly ListColumn[] }) {
  return (
    <colgroup>
      {columns.map((c) => (
        <col key={c.key} style={c.width === 'flex' ? undefined : { width: c.width }} />
      ))}
    </colgroup>
  )
}

export function HeadRow({ columns }: { columns: readonly ListColumn[] }) {
  return (
    <thead>
      <tr>
        {columns.map((c) => (
          <th key={c.key} scope="col" className={c.numeric ? styles.num : undefined}>
            {c.label ? c.label : <span className="visually-hidden">Open</span>}
          </th>
        ))}
      </tr>
    </thead>
  )
}

/** Skeleton rows inside the real table, so every bar sits in the column it replaces. */
export function SkeletonBody({
  columns,
  rows,
  bars,
  barHeight = 12,
}: {
  columns: readonly ListColumn[]
  rows: number
  /** Bar width per column ("60%" or px); 0 = no bar (the chevron column). */
  bars: readonly (number | string)[]
  barHeight?: number
}) {
  return (
    <tbody aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {columns.map((c, i) => {
            const w = bars[i] ?? '60%'
            return (
              <td key={c.key}>
                {w !== 0 && (
                  <span className={[styles.skeletonCell, c.numeric ? styles.skeletonRight : ''].join(' ')}>
                    <SkeletonBar width={w} height={barHeight} />
                  </span>
                )}
              </td>
            )
          })}
        </tr>
      ))}
    </tbody>
  )
}

/**
 * P8: a whole-row link that opens the call drawer. The <tr> keeps its row semantics (cells keep
 * their headers, a11y-05); the keyboard link is a span in the first cell (`link`), and a click
 * anywhere on the row opens too. Enter on the span opens; focus returns to it on close.
 */
export function useRowOpen(): (
  callId: string,
  label: string,
) => {
  row: { className: string; onClick: (e: MouseEvent<HTMLTableRowElement>) => void }
  link: ReturnType<typeof linkRowProps> & { 'data-call-row': string; 'aria-label': string }
} {
  const openCall = useOpenCall()
  return (callId, label) => ({
    row: {
      className: `${rowLinkClass} ${styles.openRow}`,
      onClick: (e) => {
        if ((e.target as HTMLElement).closest('a,button,[role="link"]')) return
        openCall(callId, e.currentTarget.querySelector<HTMLElement>('[data-call-row]'))
      },
    },
    link: {
      ...linkRowProps((el) => openCall(callId, el)),
      // Not linkRowProps' rowLink class: the hover tone belongs to the whole row, not the span.
      className: styles.rowCellLink ?? '',
      'data-call-row': callId,
      'aria-label': label,
    },
  })
}

/** The chevron cell: 16px, --icon-color, visible on row hover and focus only. */
export function ChevronCell() {
  return (
    <td className={styles.chevCell} aria-hidden="true">
      <NavigationChevronRight className={styles.chev} size={16} />
    </td>
  )
}

/**
 * P10: the name first (14/20 500), the masked number under it (12/16 secondary). With no real
 * name the number is the primary line. Numbers never clip: the cell wraps nothing and the
 * column is sized for a revealed "(813) 555-0103".
 */
export function Identity({ primary, secondary, tabularPrimary }: { primary: string; secondary?: string; tabularPrimary?: boolean }) {
  return (
    <span className={styles.identity}>
      <span className={[styles.idPrimary, tabularPrimary ? styles.tabular : ''].join(' ')} title={primary}>
        {primary}
      </span>
      {secondary && <span className={`${styles.idSecondary} ${styles.tabular}`}>{secondary}</span>}
    </span>
  )
}

/** P5: the card header's count sentence, 14/20 500 (the top bar keeps the page title). */
export function CountTitle({ children }: { children: ReactNode }) {
  return <span className={`${styles.countTitle} tabular`}>{children}</span>
}

/**
 * Below the table: the designed empty state (P20), the error line, or the "Show more" footer
 * (conflict 12). The column header row always stays above.
 */
export function ListBelow<T>({
  list,
  isEmpty,
  emptyTitle,
  emptyHint,
}: {
  list: LimitedList<T>
  isEmpty: boolean
  emptyTitle: string
  emptyHint: string
}) {
  const { query, rows } = list
  if (!rows && query.isError) {
    return <ErrorLine className={styles.ruled} onRetry={() => void query.refetch()} />
  }
  if (rows && isEmpty) {
    return (
      <div className={styles.emptyWrap}>
        <EmptyState title={emptyTitle} hint={emptyHint} rows={3} />
      </div>
    )
  }
  if (rows && list.canShowMore) {
    const loadingMore = query.isFetching && query.isPlaceholderData
    return (
      <div className={styles.footer}>
        <TextButton onClick={list.showMore} disabled={loadingMore}>
          Show more
        </TextButton>
      </div>
    )
  }
  return null
}

/** "Not given" in secondary text. */
export function NotGiven() {
  return <span className={styles.secondary}>{NOT_GIVEN}</span>
}
