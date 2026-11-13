// Calls page (DESIGN.md 6.6): one card, the outcome filter in its header, the range in the top
// bar, a ruled table of calls. Rows open the call drawer over this page.

import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { RANGE_DAYS, useBookings, useCalls, useNotes, useStats, usePracticeTz, type CallsRange } from '../api'
import { Card, CallChip, EmptyState, ErrorLine, SkeletonRows, type SkeletonColumn } from '../components'
import { formatDuration, formatElapsed, formatWhen, languageName, matchesOutcome, useNow, type OutcomeFilter } from '../lib'
import { callName, deriveReason, displayName } from '../lib/reason'
import { Col, PageGrid, useCallsRange, useDrawerOpenId } from '../shell'
import { callsSentence } from './calls/sentence'
import { ChevronCell, CountTitle, Identity, useRowOpen } from './lists/parts'
import { byCall } from './lists/people'
import { callsTitle } from './lists/titles'
import styles from './calls/Calls.module.css'

interface OutcomeOption {
  value: OutcomeFilter
  label: string
}

const OUTCOME_OPTIONS: OutcomeOption[] = [
  { value: 'all', label: 'All outcomes' },
  { value: 'booked', label: 'Booked' },
  { value: 'no-booking', label: 'No booking' },
  { value: 'live', label: 'Live' },
  { value: 'dropped', label: 'Dropped' },
]

function parseOutcome(search: string): OutcomeFilter {
  const v = new URLSearchParams(search).get('outcome')
  return OUTCOME_OPTIONS.some((o) => o.value === v) ? (v as OutcomeFilter) : 'all'
}

/**
 * Column widths include the cell padding (16, and 20 at the table edges). Time is 120 for Today
 * and 168 for the longer ranges, where "Yesterday 12:35 PM" (128 px) appears. Caller holds a long
 * name over a revealed "(656) 555-0150" at 12px. Reason flexes (P7). Language shows only a
 * language other than English (P19). The Bookings and Notes counts left the table for the
 * drawer's outcome block (M8). The last column is the hover chevron (P8).
 */
interface Column {
  key: string
  title: string
  width?: number
  numeric?: boolean
  bar: number | string
}

function columnsFor(range: CallsRange): Column[] {
  return [
    { key: 'time', title: 'Time', width: range === 'today' ? 120 : 168, bar: range === 'today' ? 56 : 96 },
    { key: 'caller', title: 'Caller', width: 200, bar: 120 },
    { key: 'reason', title: 'Reason', bar: '72%' },
    { key: 'language', title: 'Language', width: 104, bar: 0 },
    { key: 'outcome', title: 'Outcome', width: 120, bar: 64 },
    { key: 'duration', title: 'Duration', width: 96, numeric: true, bar: 32 },
    { key: 'open', title: '', width: 44, bar: 0 },
  ]
}

function skeletonFor(columns: Column[]): SkeletonColumn[] {
  return columns.map((c) => ({ width: c.width ?? '1fr', bar: c.bar, align: c.numeric ? 'right' : 'left' }))
}

/** Skeleton rows: a viewport of rows at most (DESIGN 6.6 had 12 before the count was known). */
const SKELETON_MAX = 20

/**
 * F3: useCalls waits for stats(range) (it needs range.from), so the count is known before the
 * rows: size the skeleton to it. Outcomes stats cannot count fall back to 12.
 */
function skeletonRowCount(
  stats: { calls: number; booked_calls: number } | undefined,
  outcome: OutcomeFilter,
): number {
  const n = !stats ? undefined : outcome === 'all' ? stats.calls : outcome === 'booked' ? stats.booked_calls : undefined
  return n == null ? 12 : Math.min(SKELETON_MAX, n)
}

const EMPTY_TITLE = {
  today: 'No calls yet today.',
  '7d': 'No calls in the last 7 days.',
  '30d': 'No calls in the last 30 days.',
} as const
const EMPTY_HINT = 'Calls show here the moment Katie answers.'

export default function Calls() {
  const range = useCallsRange()
  // Inside <Routes location={…}> this is the page's own location, also while a drawer is open.
  const location = useLocation()
  const navigate = useNavigate()
  const drawerId = useDrawerOpenId('call')
  const outcome = parseOutcome(location.search)

  const setOutcome = useCallback(
    (next: OutcomeFilter) => {
      const params = new URLSearchParams(location.search)
      if (next === 'all') params.delete('outcome')
      else params.set('outcome', next)
      const qs = params.toString()
      const search = qs ? `?${qs}` : ''
      if (drawerId) {
        // Keep the open drawer; only the page underneath changes.
        navigate(`/calls/${encodeURIComponent(drawerId)}`, {
          replace: true,
          state: { background: { ...location, pathname: '/calls', search } },
        })
      } else {
        navigate({ pathname: '/calls', search }, { replace: true })
      }
    },
    [drawerId, location, navigate],
  )

  const columns = useMemo(() => columnsFor(range), [range])
  const tz = usePracticeTz()
  const stats = useStats(RANGE_DAYS[range])
  const calls = useCalls(range)
  const rows = calls.data
  const filtered = useMemo(() => (rows ?? []).filter((r) => matchesOutcome(r, outcome)), [rows, outcome])
  const anyLive = filtered.some((r) => r.status === 'live')
  const now = useNow(1000, anyLive)
  const rowOpen = useRowOpen()
  // P7/P10: names and reasons live on the bookings and notes; join them by call_id.
  const bookings = useBookings()
  const notes = useNotes()
  const bookingsByCall = useMemo(() => byCall(bookings.rows), [bookings.rows])
  const notesByCall = useMemo(() => byCall(notes.rows), [notes.rows])

  const totals = stats.data
    ? { calls: stats.data.calls, booked: stats.data.booked_calls, languages: stats.data.languages }
    : rows
      ? {
          calls: rows.length,
          booked: rows.filter((r) => r.bookings > 0).length,
          languages: rows.reduce<Record<string, number>>((acc, r) => {
            acc[r.language] = (acc[r.language] ?? 0) + 1
            return acc
          }, {}),
        }
      : null
  const sentence = rows ? callsSentence({ range, outcome, totals, filteredCount: filtered.length }) : ''
  const title = rows ? callsTitle(range, outcome, totals, filtered.length) : ''
  const outcomeLabel = OUTCOME_OPTIONS.find((o) => o.value === outcome)?.label ?? ''

  // a11y-04: a native select (Vibe's Dropdown put aria-selected on a plain div), sized like the
  // top bar's range control: 32 high, 14/20 type.
  const filter = (
    <span className={styles.filter}>
      <select
        className={styles.select}
        aria-label="Outcome"
        value={outcome}
        onChange={(e) => setOutcome(e.target.value as OutcomeFilter)}
      >
        {OUTCOME_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  )

  const loading = !rows && !calls.isError
  const hasRows = filtered.length > 0

  let body
  if (calls.isError && !rows) {
    body = <ErrorLine className={styles.stateRow} onRetry={() => void calls.refetch()} />
  } else if (loading) {
    const n = skeletonRowCount(stats.data, outcome)
    body =
      n === 0 ? (
        <div className={styles.skelEmpty} role="group" aria-busy="true" aria-label="Loading" />
      ) : (
        <SkeletonRows rows={n} columns={skeletonFor(columns)} />
      )
  } else if (!hasRows) {
    body = (
      <div className={styles.emptyWrap}>
        {rows && rows.length > 0 ? (
          <EmptyState
            filtered={outcomeLabel}
            title={`No calls match ${outcomeLabel}.`}
            hint="Choose All outcomes to see every call."
            rows={3}
          />
        ) : (
          <EmptyState title={EMPTY_TITLE[range]} hint={EMPTY_HINT} rows={3} />
        )}
      </div>
    )
  } else {
    body = null
  }

  return (
    <PageGrid>
      <Col span={12}>
        <Card
          title={<CountTitle>{title || '\u00a0'}</CountTitle>}
          headerRight={filter}
          katie={sentence}
          katieMoment={['first-open', 'summary']}
        >
          <table className={styles.table} aria-label="Calls" aria-busy={loading || undefined}>
            <colgroup>
              {columns.map((c) => (
                <col key={c.key} style={c.width ? { width: c.width } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr className={styles.headRow}>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={c.numeric ? styles.num : undefined}>
                    {c.title || <span className="visually-hidden">Open</span>}
                  </th>
                ))}
              </tr>
            </thead>
            {hasRows && (
              <tbody>
                {filtered.map((row) => {
                  const live = row.status === 'live'
                  const when = formatWhen(row.started_at, tz)
                  const bs = bookingsByCall.get(row.call_id)
                  const ns = notesByCall.get(row.call_id)
                  const who = displayName({ name: callName(row, bs, ns), caller: row.caller })
                  const reason = deriveReason(row, bs, ns)
                  const lang = /^en\b/i.test(row.language) ? '' : languageName(row.language)
                  // a11y-05: the <tr> keeps its row semantics (cells keep their column headers).
                  // The keyboard link is the time cell's span; a click anywhere on the row opens too.
                  const open = rowOpen(row.call_id, `Call from ${who.primary} at ${when}`)
                  return (
                    <tr key={row.call_id} {...open.row} className={`${styles.row} ${open.row.className}`}>
                      <td className="tabular">
                        <span {...open.link}>{when}</span>
                      </td>
                      <td>
                        <Identity primary={who.primary} secondary={who.secondary} tabularPrimary={!who.secondary} />
                      </td>
                      <td className={styles.reason} title={reason || undefined}>
                        {reason}
                      </td>
                      <td>{lang}</td>
                      <td>
                        <CallChip row={row} />
                      </td>
                      <td className={`${styles.num} tabular`}>
                        {live ? formatElapsed(row.started_at, now) : formatDuration(row.duration_s)}
                      </td>
                      <ChevronCell />
                    </tr>
                  )
                })}
              </tbody>
            )}
          </table>
          {body}
        </Card>
      </Col>
    </PageGrid>
  )
}
