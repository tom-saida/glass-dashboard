import { useRef } from 'react'
import { Link } from 'react-router'
import { useBookings, useLatestCalls, useNotes, useStats, type CallRow } from '../../api'
import { CallChip, Card, EmptyState, ErrorLine, SkeletonBar, useCallRowProps } from '../../components'
import { formatClock, formatDuration, formatElapsed, useNow } from '../../lib'
import { callName, deriveReason, displayName } from '../../lib/reason'
import { sayLatestCalls } from './say'
import styles from './overview.module.css'

// P7 + P10 columns: Time · Who · Reason · Outcome · Duration. Each width includes the cell's own
// padding (20 outer, 8 inner). Who holds a name at 14/500 over the masked number at 12 (a revealed
// "(656) 555-0150" is 96 px at 12). Reason takes the rest; its " · insurance" part drops to a
// second 12px line the same way.
const COL = { time: 88, who: 140, outcome: 96, duration: 76 }
const GRID = `${COL.time}px ${COL.who}px minmax(0, 1fr) ${COL.outcome}px ${COL.duration}px`
// Skeleton bars per column, as a share of the cell's content box (DESIGN 6.4).
const SKELETON_BARS = ['60%', '80%', '100%', '72%', '40%']
const LIMIT = 10

/** Rows the loaded list will have: min(10, today's calls) once stats knows, else 10. */
function skeletonRows(todayCalls: number | undefined): number {
  return todayCalls == null ? LIMIT : Math.min(LIMIT, todayCalls)
}

/** "New-patient consult · Delta Dental" -> ["New-patient consult", "Delta Dental"]. */
function splitReason(r: string): [string, string | undefined] {
  const i = r.indexOf(' · ')
  return i < 0 ? [r, undefined] : [r.slice(0, i), r.slice(i + 3)]
}

/**
 * Which rows just arrived and which just hung up, decided once per call id for the life of this
 * list (so a re-render never replays a row's motion). The first answer is the baseline: nothing
 * on it animates.
 */
function useRowMotion(rows: CallRow[] | undefined): { entered: Set<string>; ended: Set<string> } {
  const seen = useRef<Map<string, CallRow['status']> | null>(null)
  const entered = useRef(new Set<string>())
  const ended = useRef(new Set<string>())
  if (rows) {
    if (seen.current === null) {
      seen.current = new Map(rows.map((r) => [r.call_id, r.status]))
    } else {
      for (const r of rows) {
        const before = seen.current.get(r.call_id)
        if (before === undefined) entered.current.add(r.call_id)
        else if (before === 'live' && r.status !== 'live') ended.current.add(r.call_id)
        seen.current.set(r.call_id, r.status)
      }
    }
  }
  return { entered: entered.current, ended: ended.current }
}

/** 6.4 Latest calls: today's ten newest; a row opens the drawer over Overview. */
export function LatestCalls() {
  const q = useLatestCalls(LIMIT)
  // Today's call count, when stats is in before the list, sizes the skeleton to the rows to come.
  const todayCalls = useStats(1).data?.calls
  const bookings = useBookings()
  const notes = useNotes()
  const callRow = useCallRowProps()
  const rows = q.data
  const hasLive = !!rows?.some((r) => r.status === 'live')
  const now = useNow(1000, hasLive)
  const motion = useRowMotion(rows)
  const nameOf = (r: CallRow) => callName(r, bookings.rows, notes.rows)
  const sentence = sayLatestCalls(rows, nameOf)

  let body
  if (!rows && q.isError) {
    body = <ErrorLine onRetry={() => void q.refetch()} />
  } else if (!rows && skeletonRows(todayCalls) === 0) {
    // Stats says no calls yet: hold the empty state's height while the list confirms it.
    body = <div className={styles.lcSkelEmpty} role="group" aria-busy="true" aria-label="Loading" />
  } else if (!rows) {
    body = (
      <div role="group" aria-busy="true" aria-label="Loading">
        {Array.from({ length: skeletonRows(todayCalls) }, (_, i) => (
          <div key={i} className={styles.lcRow} style={{ gridTemplateColumns: GRID }}>
            {SKELETON_BARS.map((w, j) => (
              <span key={j} className={`${styles.lcCell} ${j === 4 ? styles.lcNum : ''}`}>
                <SkeletonBar width={w} height={12} />
              </span>
            ))}
          </div>
        ))}
      </div>
    )
  } else if (rows.length === 0) {
    body = (
      <div className={styles.lcEmpty}>
        <EmptyState title="No calls yet today." hint="Each call shows here the moment Katie picks up." rows={3} />
      </div>
    )
  } else {
    body = (
      <div>
        {rows.map((r) => {
          const live = r.status === 'live'
          const who = displayName({ name: nameOf(r), caller: r.caller })
          const [reason, reasonMore] = splitReason(deriveReason(r, bookings.rows, notes.rows))
          const rowProps = callRow(r.call_id, styles.lcRow)
          const cls = [
            rowProps.className,
            motion.entered.has(r.call_id) ? styles.lcEnter : '',
            motion.ended.has(r.call_id) ? styles.lcJustEnded : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div key={r.call_id} {...rowProps} className={cls} style={{ gridTemplateColumns: GRID }} data-live={live ? '' : undefined}>
              <span className={`${styles.lcCell} tabular`}>{live ? 'Now' : formatClock(r.started_at)}</span>
              <span className={`${styles.lcCell} ${styles.lcStack}`}>
                <span className={`${styles.lcPrimary} ${who.secondary ? '' : 'tabular'}`}>{who.primary}</span>
                {who.secondary && <span className={`${styles.lcSecondary} tabular`}>{who.secondary}</span>}
              </span>
              <span className={`${styles.lcCell} ${styles.lcStack}`} title={reasonMore ? `${reason} · ${reasonMore}` : reason}>
                <span className={styles.lcReason}>{reason}</span>
                {reasonMore && <span className={styles.lcSecondary}>{reasonMore}</span>}
              </span>
              <span className={styles.lcCell}>
                <CallChip row={r} />
              </span>
              <span className={`${styles.lcCell} ${styles.lcNum} tabular`}>
                {live ? formatElapsed(r.started_at, now) : formatDuration(r.duration_s)}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Card
      title="Latest calls"
      headerRight={<Link to="/calls">All calls</Link>}
      katie={sentence}
      className={styles.lcCard}
    >
      <div>
        <div>
          <div className={styles.lcHead} aria-hidden="true" style={{ gridTemplateColumns: GRID }}>
            <span className={styles.lcCell}>Time</span>
            <span className={styles.lcCell}>Who</span>
            <span className={styles.lcCell}>Reason</span>
            <span className={styles.lcCell}>Outcome</span>
            <span className={`${styles.lcCell} ${styles.lcNum}`}>Duration</span>
          </div>
        </div>
        {body}
      </div>
    </Card>
  )
}
