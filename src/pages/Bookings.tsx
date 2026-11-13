// DESIGN 6.7: every booking Katie made, newest first. The whole row opens the call (P8); the
// patient's name leads with the number under it (P10); the header counts today (P5).
import { useMemo } from 'react'
import { useBookings, useNotes, useSms, usePracticeTz, useStats, type Booking } from '../api'
import { Card } from '../components'
import { capitalizeFirst, formatWhen, insuranceLabel } from '../lib'
import { bookingLabel, displayName, withCorrectedNames } from '../lib/reason'
import { Col, PageGrid } from '../shell'
import {
  CHEVRON_COLUMN,
  ChevronCell,
  ColGroup,
  CountTitle,
  HeadRow,
  Identity,
  ListBelow,
  NotGiven,
  SkeletonBody,
  listStyles as s,
  useRowOpen,
  type ListColumn,
} from './lists/parts'
import { bookingsSentence } from './lists/sentences'
import { bookingsTitle } from './lists/titles'
import { useTodayFrom } from './lists/useTodayFrom'

const COLUMNS: readonly ListColumn[] = [
  // 168 holds "Yesterday 12:35 PM" (128 px) plus the 20 + 16 padding.
  { key: 'when', label: 'Booked', width: 168 },
  // DATA-2: 200 holds a long name, and a revealed "(656) 555-0150" at 12px under it.
  { key: 'patient', label: 'Patient', width: 200 },
  { key: 'slot', label: 'Slot', width: 128 },
  { key: 'reason', label: 'Reason', width: 'flex' },
  { key: 'insurance', label: 'Insurance', width: 152 },
  CHEVRON_COLUMN,
]

const SKELETON_BARS = ['56%', '72%', '64%', '56%', '60%', 0]

export default function Bookings() {
  const list = useBookings()
  const sms = useSms()
  // A name corrected on the call wins here too (lib/reason withCorrectedNames), as on every page.
  const notes = useNotes()
  const tz = usePracticeTz()
  const from = useTodayFrom()
  const rowOpen = useRowOpen()

  const rows = useMemo(
    () => (list.rows ? withCorrectedNames(list.rows, notes.rows).sort((a, b) => b.ts - a.ts || b.id - a.id) : undefined),
    [list.rows, notes.rows],
  )
  // DATA-7: today's count from stats (as the KPI), the list only for the latest booking.
  const stats = useStats(1).data
  const sentence = bookingsSentence(rows, sms.rows, from, stats)
  const title = bookingsTitle(rows, from, stats?.bookings)

  return (
    <PageGrid>
      <Col span={12}>
        <Card title={<CountTitle>{title || ' '}</CountTitle>} katie={sentence} katieMoment={['booking', 'summary']}>
          <table className={s.table}>
            <caption className="visually-hidden">Bookings, newest first</caption>
            <ColGroup columns={COLUMNS} />
            <HeadRow columns={COLUMNS} />
            {!rows && list.query.isPending && <SkeletonBody columns={COLUMNS} rows={8} bars={SKELETON_BARS} />}
            {rows && rows.length > 0 && (
              <tbody>
                {rows.map((b) => {
                  const when = formatWhen(b.ts, tz)
                  const who = displayName(b)
                  const open = rowOpen(b.call_id, `Booking for ${who.primary}, booked ${when}`)
                  return <BookingRow key={b.id} booking={b} when={when} open={open} />
                })}
              </tbody>
            )}
          </table>
          <ListBelow
            list={list}
            isEmpty={!!rows && rows.length === 0}
            emptyTitle="No bookings yet."
            emptyHint="Every appointment Katie books shows here with its slot."
          />
        </Card>
      </Col>
    </PageGrid>
  )
}

function BookingRow({
  booking: b,
  when,
  open,
}: {
  booking: Booking
  when: string
  open: ReturnType<ReturnType<typeof useRowOpen>>
}) {
  const who = displayName(b)
  const insurance = insuranceLabel(b.insurance)
  const label = bookingLabel(b)
  // The full reason stays on hover when the label shortened it.
  const full = capitalizeFirst(b.reason.trim())
  return (
    <tr {...open.row}>
      <td className={s.tabular}>
        <span {...open.link}>{when}</span>
      </td>
      <td>
        <Identity primary={who.primary} secondary={who.secondary} tabularPrimary={!who.secondary} />
      </td>
      <td className={s.tabular}>{b.slot}</td>
      <td title={full || undefined}>{label}</td>
      <td title={insurance ?? undefined}>{insurance ?? <NotGiven />}</td>
      <ChevronCell />
    </tr>
  )
}
