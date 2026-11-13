import { Link } from 'react-router'
import { useBookings, useCalls, useNotes, useStats, type CallRow, type Note } from '../../api'
import { Card, EmptyState, ErrorLine, NoteChip, SkeletonBar, useCallRowProps } from '../../components'
import { bookedOnThisCall, formatClock, isUnknownName, sortNotes } from '../../lib'
import { cleanNoteText, displayName, isActionNote } from '../../lib/reason'
import { namesByCall } from '../lists/people'
import { sayCallbacksWaiting } from './say'
import styles from './overview.module.css'

const SHOW = 5

interface CallerGroup {
  key: string
  /** Urgent first, then newest (lib/chips sortNotes). */
  notes: Note[]
  urgent: boolean
  /** Newest note's time. */
  ts: number
  name?: string
  caller: string
}

/**
 * P18: today's action notes (lib/reason isActionNote), one group per caller so a caller with two
 * notes is one row with both reasons. Urgent groups first, then the newest. A note written before
 * the name was given ("unknown (booking to follow on this call)") takes the name from `names`
 * (call_id -> name, lists/people namesByCall), as the Callbacks page does.
 */
export function groupByCaller(notes: Note[], from: number, names?: ReadonlyMap<string, string>): CallerGroup[] {
  const groups = new Map<string, Note[]>()
  for (const n of notes) {
    if (n.ts < from || !isActionNote(n)) continue
    const list = groups.get(n.caller)
    if (list) list.push(n)
    else groups.set(n.caller, [n])
  }
  const out: CallerGroup[] = []
  for (const [caller, list] of groups) {
    const sorted = sortNotes(list)
    const named = sorted.find((n) => !isUnknownName(n.name))
    out.push({
      key: `${caller}:${sorted[0]?.id ?? ''}`,
      notes: sorted,
      urgent: sorted.some((n) => n.urgent),
      ts: Math.max(...sorted.map((n) => n.ts)),
      name: named?.name ?? sorted.map((n) => names?.get(n.call_id)).find(Boolean),
      caller,
    })
  }
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.ts - a.ts)
}

function anyBooked(g: CallerGroup, calls: CallRow[] | undefined): boolean {
  return g.notes.some((n) => bookedOnThisCall(n, calls))
}

/** 6.5 Callbacks waiting: callers the desk has to call back today, urgent first, reasons readable. */
export function CallbacksWaiting() {
  const notes = useNotes()
  const bookings = useBookings()
  const stats = useStats(1)
  const today = useCalls('today')
  const callRow = useCallRowProps()

  const from = stats.data?.range.from
  // F3: today's calls decide "Booked on this call", which adds a line to a row at 1280. Wait for
  // them (or their error) so the rows appear once, at their final height.
  const todaySettled = today.data !== undefined || today.isError
  const groups =
    notes.rows && from != null && todaySettled
      ? groupByCaller(notes.rows, from, namesByCall(bookings.rows, notes.rows))
      : undefined
  const waitingCount = groups?.reduce((n, g) => n + g.notes.length, 0) ?? 0
  const urgent = groups?.reduce((n, g) => n + g.notes.filter((x) => x.urgent).length, 0) ?? 0
  // Katie names the caller the row names (a note's "unknown (...)" takes the group's name).
  const sentence = groups
    ? sayCallbacksWaiting(groups.flatMap((g) => g.notes.map((n) => (isUnknownName(n.name) && g.name ? { ...n, name: g.name } : n))))
    : ''

  let body
  if (!groups && (notes.query.isError || stats.isError)) {
    body = (
      <ErrorLine
        onRetry={() => {
          if (notes.query.isError) void notes.query.refetch()
          if (stats.isError) void stats.refetch()
        }}
      />
    )
  } else if (!groups) {
    // Before the notes arrive, stats is the best guess at the rows to come: its callbacks less its
    // urgent ones (an urgent note is nearly always "booking on this call; note is informational").
    // Before stats, a full card: five rows and the footer. Rows are a fixed 89 (two reason lines).
    const expected = stats.data ? Math.max(0, stats.data.callbacks - stats.data.urgent) : undefined
    const skeletonRows = expected == null ? SHOW : Math.min(SHOW, expected)
    const footer = expected == null || expected > SHOW
    body = (
      <div role="group" aria-busy="true" aria-label="Loading">
        {skeletonRows === 0 && <div className={styles.cbSkelEmpty} />}
        {Array.from({ length: skeletonRows }, (_, i) => (
          <div key={i} className={styles.cbRow}>
            <div className={styles.cbLine1}>
              <SkeletonBar width={140} height={14} />
              <SkeletonBar width={56} height={20} />
            </div>
            <div className={styles.cbSkelReason}>
              <div className={styles.cbSkelLine}>
                <SkeletonBar width="100%" height={14} />
              </div>
              <div className={styles.cbSkelLine}>
                <SkeletonBar width="70%" height={14} />
              </div>
            </div>
          </div>
        ))}
        {footer && <div className={styles.cbFooter} />}
      </div>
    )
  } else if (groups.length === 0) {
    body = (
      <div className={styles.cbEmpty}>
        <EmptyState title="No callbacks waiting." hint="New callbacks show here the moment a call ends." rows={3} />
      </div>
    )
  } else {
    body = (
      <>
        <ul className={styles.cbList}>
          {groups.slice(0, SHOW).map((g) => {
            const top = g.notes[0] as Note
            const who = displayName({ name: g.name, caller: g.caller })
            const booked = anyBooked(g, today.data)
            const reasons = g.notes.slice(0, 2).map((n) => cleanNoteText(n.reason))
            return (
              // a11y-03: the <li> stays a list item; the link-like row is the div inside it.
              <li key={g.key} className={styles.cbItem}>
                <div {...callRow(top.call_id, styles.cbRow)}>
                  <div className={styles.cbLine1}>
                    <span className={styles.cbIdentity}>
                      <span className={`${styles.cbName} ${who.secondary ? '' : 'tabular'}`}>{who.primary}</span>
                      {who.secondary && <span className={`${styles.cbNumber} tabular`}>{who.secondary}</span>}
                    </span>
                    {/* Every row here is a callback: only Urgent earns a chip. */}
                    {g.urgent && <NoteChip note={top} className={styles.cbChip} />}
                    {booked && <span className={styles.cbBooked}>Booked on this call</span>}
                    <span className={`${styles.cbTime} tabular`}>{formatClock(g.ts)}</span>
                  </div>
                  {reasons.length === 1 ? (
                    <p className={styles.cbReason} title={reasons[0]}>
                      {reasons[0]}
                    </p>
                  ) : (
                    <div className={styles.cbReasons} title={reasons.join(' ')}>
                      {reasons.map((r, i) => (
                        <p key={i} className={styles.cbReasonLine}>
                          {r}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {groups.length > SHOW && (
          <div className={styles.cbFooter}>
            {/* DATA-7: the list stops at 50 rows. */}
            <Link to="/callbacks">See all {waitingCount} callbacks</Link>
          </div>
        )}
      </>
    )
  }

  return (
    <Card
      title="Callbacks waiting"
      headerRight={urgent > 0 ? <span className="tabular">{urgent} urgent</span> : undefined}
      katie={sentence}
      katieMoment="urgent"
      className={styles.cbCard}
    >
      {body}
    </Card>
  )
}
