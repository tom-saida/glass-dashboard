import type { FC, SVGAttributes } from 'react'
import { Calendar, Mobile, Person, Reply } from '@vibe/icons'
import { useBookings, useCalls, useNotes, useSms, useStats, type StatsResponse } from '../../api'
import { Card, ErrorLine, SkeletonBar, katieMomentAttr, useRouteRowProps, type KatieMoment } from '../../components'
import { katieTargetProps } from '../../lib'
import { Col } from '../../shell/Grid'
import { isActionNote, isNewPatientBooking } from '../../lib/reason'
import { isAfterHours } from './hours'
import { sayBookedCell, sayCallbacksCell, sayCallsCell, sayNewPatientCell } from './say'
import styles from './overview.module.css'

interface Cell {
  key: string
  label: string
  /** undefined while the list it counts is still loading (the number shows a skeleton bar). */
  value: number | undefined
  /** The list it counts failed: show a dash instead of a skeleton that never ends. */
  failed?: boolean
  /** A real fact about today, or "" (P3: never "Yesterday 0", never a fake delta). */
  sub: string
  /** Yesterday's count when it is known and non-zero, else null: the comparison line is drawn
   *  from it and today's value, or not at all. */
  yesterday: number | null
  to: string
  sentence: string
  /** Katie's moments for this cell (data-katie-moment) */
  moment?: KatieMoment | readonly KatieMoment[]
}

/**
 * Conflict 8: yesterday = stats(days=2) - stats(days=1), only when days=2 really covers the day
 * before (its from is 23-25 h before days=1's from) and the difference is not negative.
 */
function yesterdayDiff(d1: StatsResponse | undefined, d2: StatsResponse | undefined, pick: (s: StatsResponse) => number) {
  if (!d1 || !d2 || d2.range.days !== 2) return null
  const gap = d1.range.from - d2.range.from
  if (gap < 82_800 || gap > 90_000) return null
  const v = pick(d2) - pick(d1)
  return v >= 0 ? v : null
}

const LABELS = ['Calls answered', 'Appointments booked', 'New-patient consults', 'Callbacks waiting'] as const

type IconType = FC<SVGAttributes<SVGElement> & { size?: string | number }>

/** DESIGN-GLASS 4: one pastel icon tile per card (Vibe has no handset icon; Mobile stands in). */
const TILES: { Icon: IconType; tone: 'blue' | 'purple' | 'green' | 'orange' }[] = [
  { Icon: Mobile, tone: 'blue' },
  { Icon: Calendar, tone: 'purple' },
  { Icon: Person, tone: 'green' },
  { Icon: Reply, tone: 'orange' },
]

/** Yesterday's count, kept only when it is known and above zero (P3: never "Yesterday 0"). */
const known = (n: number | null) => (n != null && n > 0 ? n : null)

/**
 * The comparison line (DESIGN-GLASS 4): "↑ +5 vs yesterday" when today is ahead, "↓ −3 vs
 * yesterday" when behind, nothing when they are equal or yesterday is not known. Real numbers
 * only: today's count against yesterday's, both from the API.
 */
function Comparison({ today, yesterday }: { today: number | undefined; yesterday: number | null }) {
  if (today == null || yesterday == null || today === yesterday) return <p className={styles.kpiDelta}>{' '}</p>
  const up = today > yesterday
  const diff = Math.abs(today - yesterday)
  return (
    <p className={`${styles.kpiDelta} ${up ? styles.kpiUp : ''} tabular`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span> {up ? '+' : '−'}
      {diff} vs yesterday
    </p>
  )
}

function Tile({ i }: { i: number }) {
  const t = TILES[i]!
  return (
    <span className={`${styles.kpiTile} ${styles[`tile_${t.tone}`]}`} aria-hidden="true">
      <t.Icon size={20} />
    </span>
  )
}

/** The four KPI cards' columns (cols 5-6, 7-8, 9-10, 11-12). */
const START = [5, 7, 9, 11] as const

/** True when a newest-first list reaches back past `from`, so counting rows after `from` is complete. */
function covers<T extends { ts: number }>(rows: T[], limit: number, from: number): boolean {
  if (rows.length < limit) return true
  const oldest = rows[rows.length - 1]
  return !!oldest && oldest.ts < from
}

/**
 * 6.2 Today numbers (P3, P6, DESIGN-GLASS 4): Calls answered, Appointments booked, New-patient
 * consults, Callbacks waiting. Four cards (rendered straight into the page grid, cols 5-12), each
 * its own Katie target and link. Every sub-line is a fact about today; the comparison line shows
 * only where yesterday's count is known and non-zero, and today differs from it.
 */
export function TodayNumbers() {
  const stats = useStats(1)
  const stats2 = useStats(2)
  const calls = useCalls('today')
  const bookings = useBookings()
  const notes = useNotes()
  const sms = useSms()
  const routeRow = useRouteRowProps()

  const s = stats.data
  if (!s && stats.isError) {
    // One card across the four columns: the same sentence four times over would be noise.
    return (
      <Col span={8} start={5} stretch>
        <Card className={styles.kpiCard}>
          <ErrorLine className={styles.kpiError} onRetry={() => void stats.refetch()} />
        </Card>
      </Col>
    )
  }

  if (!s) {
    return (
      <>
        {LABELS.map((label, i) => (
          <Col key={label} span={2} start={START[i]} stretch>
            <Card className={styles.kpiCard} aria-busy="true">
              <div className={styles.kpiCell}>
                {/* The labels are fixed text: shown at once, so the skeleton has the loaded card's height. */}
                <div className={styles.kpiHead}>
                  <Tile i={i} />
                  <p className={styles.kpiLabel}>{label}</p>
                </div>
                <div className={styles.kpiNumber}>
                  <SkeletonBar width={56} height={28} />
                </div>
                <div className={styles.kpiSub}>
                  <SkeletonBar width={72} height={12} />
                </div>
                <p className={styles.kpiDelta}>{' '}</p>
              </div>
            </Card>
          </Col>
        ))}
      </>
    )
  }

  const from = s.range.from
  const d2 = stats2.data

  // Calls answered: "N in Spanish", else "N after hours", else nothing.
  const spanish = s.languages?.es ?? 0
  const afterHours = calls.data ? calls.data.filter((r) => isAfterHours(r.started_at)).length : 0
  const callsSub = spanish > 0 ? `${spanish} in Spanish` : afterHours > 0 ? `${afterHours} after hours` : ''
  const yCalls = yesterdayDiff(s, d2, (x) => x.calls)

  // Appointments booked: "N confirmed by text" = today's "yes" replies.
  const confirmed = sms.rows?.filter((m) => m.ts >= from && m.direction === 'in' && m.kind === 'yes').length ?? 0
  const yBooked = yesterdayDiff(s, d2, (x) => x.bookings)

  // New-patient consults: today's bookings that are new patients. Yesterday's count only when the
  // list reaches back past yesterday's midnight (otherwise it would undercount).
  const bRows = bookings.rows
  const consults = bRows?.filter((b) => b.ts >= from && isNewPatientBooking(b)).length
  const yFrom = d2 && yesterdayDiff(s, d2, () => 0) != null ? d2.range.from : null
  const yConsults =
    bRows && yFrom != null && covers(bRows, bookings.limit, yFrom)
      ? bRows.filter((b) => b.ts >= yFrom && b.ts < from && isNewPatientBooking(b)).length
      : null

  // Callbacks waiting: today's notes the desk must act on (not FYI, not "informational").
  const action = notes.rows?.filter((n) => n.ts >= from && isActionNote(n))
  const urgent = action?.filter((n) => n.urgent).length ?? 0

  const cells: Cell[] = [
    {
      key: 'calls',
      label: LABELS[0],
      value: s.calls,
      sub: callsSub,
      yesterday: known(yCalls),
      to: '/calls',
      sentence: sayCallsCell(s, yCalls, { spanish, afterHours }),
      moment: ['first-open', 'summary'],
    },
    {
      key: 'booked',
      label: LABELS[1],
      value: s.bookings,
      sub: confirmed > 0 ? `${confirmed} confirmed by text` : '',
      yesterday: known(yBooked),
      to: '/bookings',
      sentence: sayBookedCell(s, confirmed),
      moment: 'booking',
    },
    {
      key: 'consults',
      label: LABELS[2],
      value: consults,
      failed: !bRows && bookings.query.isError,
      sub: '',
      yesterday: known(yConsults),
      to: '/bookings',
      sentence: consults == null || s.calls <= 0 ? '' : sayNewPatientCell(consults, yConsults),
    },
    {
      key: 'callbacks',
      label: LABELS[3],
      value: action?.length,
      failed: !action && notes.query.isError,
      sub: urgent > 0 ? `${urgent} urgent` : '',
      yesterday: null,
      to: '/callbacks',
      sentence: action ? sayCallbacksCell({ callbacks: action.length, urgent }) : '',
    },
  ]

  // DESIGN-GLASS 4: four separate cards. Each card's content is its link and its own Katie
  // target (the director stands her on the card's top edge, as it did on the one KPI card).
  return (
    <>
      {cells.map((c, i) => {
        const link = routeRow(c.to, styles.kpiCell)
        return (
          <Col key={c.key} span={2} start={START[i]} stretch>
            <Card className={styles.kpiCard}>
              <div
                {...link}
                {...katieTargetProps(c.sentence)}
                {...katieMomentAttr(c.moment)}
                /* a11y-09: no aria-label; the link is named by what it shows ("Calls answered 35 4 in Spanish"). */
                data-kpi={c.key}
              >
                <div className={styles.kpiHead}>
                  <Tile i={i} />
                  <p className={styles.kpiLabel}>{c.label}</p>
                </div>
                <p className={`${styles.kpiNumber} tabular`}>
                  {c.value != null ? c.value : c.failed ? '–' : <SkeletonBar width={56} height={28} />}
                </p>
                <p className={`${styles.kpiSub} tabular`}>{c.sub || ' '}</p>
                <Comparison today={c.value} yesterday={c.yesterday} />
              </div>
            </Card>
          </Col>
        )
      })}
    </>
  )
}
