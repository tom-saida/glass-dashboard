// DESIGN 6.9: the page the front desk opens at 8 AM. Desk notes by local day (newest day first).
// Inside a day: the notes the desk must act on, grouped by caller like the Overview, urgent
// first; then "Noted on booked calls" (Katie's informational notes, the booking already handles
// them); then FYI. Reasons are cleaned; the number is masked unless Show numbers is on. The
// whole row opens the call (P8).
import { Fragment, useMemo } from 'react'
import { useBookings, useNotes, usePracticeTz, type Note } from '../api'
import { Card, NoteChip, SkeletonBar, StatusChip } from '../components'
import { formatClock, formatDayHeader, isUnknownName, localDayKey } from '../lib'
import { cleanNoteText, isActionNote } from '../lib/reason'
import { Col, PageGrid } from '../shell'
import {
  CHEVRON_COLUMN,
  ChevronCell,
  ColGroup,
  CountTitle,
  HeadRow,
  Identity,
  ListBelow,
  listStyles as s,
  useRowOpen,
  type ListColumn,
} from './lists/parts'
import { namesByCall } from './lists/people'
import { callbacksSentence } from './lists/sentences'
import { callbacksTitle } from './lists/titles'
import { useTodayFrom } from './lists/useTodayFrom'

const COLUMNS: readonly ListColumn[] = [
  { key: 'priority', label: 'Priority', width: 104 },
  // DATA-2: 200 holds a long name, and a revealed "(656) 555-0150" at 12px under it.
  { key: 'who', label: 'Caller', width: 200 },
  { key: 'reason', label: 'Reason', width: 'flex' },
  { key: 'time', label: 'Time', width: 104 },
  CHEVRON_COLUMN,
]

type Section = 'action' | 'noted' | 'fyi'

/** One row: a caller's notes of one kind on one day (P18). */
interface CallerGroup {
  key: string
  section: Section
  caller: string
  notes: Note[]
}

interface DayGroup {
  key: string
  label: string
  action: CallerGroup[]
  noted: CallerGroup[]
  fyi: CallerGroup[]
}

function sectionOf(n: Note): Section {
  if (isActionNote(n)) return 'action'
  return n.fyi && !n.urgent ? 'fyi' : 'noted'
}

function rank(n: { urgent: boolean; fyi: boolean }): number {
  return n.urgent ? 0 : n.fyi ? 2 : 1
}

/** Urgent first, then newest; inside a group the same order. */
function byPriority(a: Note, b: Note): number {
  return rank(a) - rank(b) || b.ts - a.ts || b.id - a.id
}

function groupByCaller(notes: readonly Note[], section: Section, day: string): CallerGroup[] {
  const map = new Map<string, Note[]>()
  for (const n of [...notes].sort(byPriority)) {
    const list = map.get(n.caller)
    if (list) list.push(n)
    else map.set(n.caller, [n])
  }
  return [...map.entries()]
    .map(([caller, list]) => ({ key: `${day}|${section}|${caller}`, section, caller, notes: list }))
    .sort((a, b) => byPriority(a.notes[0] as Note, b.notes[0] as Note))
}

function groupByDay(notes: readonly Note[], tz: string): DayGroup[] {
  const byKey = new Map<string, Note[]>()
  for (const n of [...notes].sort((a, b) => b.ts - a.ts || b.id - a.id)) {
    const k = localDayKey(n.ts, tz)
    const g = byKey.get(k)
    if (g) g.push(n)
    else byKey.set(k, [n])
  }
  return [...byKey.entries()].map(([key, group]) => ({
    key,
    label: formatDayHeader((group[0] as Note).ts, tz),
    action: groupByCaller(group.filter((n) => sectionOf(n) === 'action'), 'action', key),
    noted: groupByCaller(group.filter((n) => sectionOf(n) === 'noted'), 'noted', key),
    fyi: groupByCaller(group.filter((n) => sectionOf(n) === 'fyi'), 'fyi', key),
  }))
}

const SECTION_HEADS: Record<Exclude<Section, 'action'>, string> = {
  noted: 'Noted on booked calls',
  fyi: 'FYI',
}

export default function Callbacks() {
  const list = useNotes()
  // Conflict 19: an urgent note whose call also booked says so; bookings also name the patient
  // when Katie filed the note before she had the name.
  const bookings = useBookings()
  const tz = usePracticeTz()
  const from = useTodayFrom()
  const rowOpen = useRowOpen()

  const groups = useMemo(() => (list.rows ? groupByDay(list.rows, tz) : undefined), [list.rows, tz])
  const names = useMemo(() => namesByCall(bookings.rows, list.rows), [bookings.rows, list.rows])
  const bookedCalls = useMemo(() => new Set((bookings.rows ?? []).map((b) => b.call_id)), [bookings.rows])
  const sentence = callbacksSentence(list.rows, from)
  const title = callbacksTitle(list.rows, from)

  const renderGroup = (g: CallerGroup) => {
    const newest = [...g.notes].sort((a, b) => b.ts - a.ts || b.id - a.id)[0] as Note
    const realName = g.notes.find((n) => !isUnknownName(n.name))?.name.trim() ?? names.get(newest.call_id)
    const label = `${g.section === 'action' ? 'Callback' : 'Note'} from ${realName ?? g.caller} at ${formatClock(newest.ts, tz)}`
    const open = rowOpen(newest.call_id, label)
    const top = g.notes[0] as Note
    return (
      <tr key={g.key} {...open.row} className={`${open.row.className} ${g.section !== 'action' ? s.notedRow : ''}`}>
        <td>
          <span {...open.link} className={`${open.link.className} ${s.chipCell}`}>
            {g.section === 'action' ? (
              <NoteChip note={top} />
            ) : (
              // Handled on the call (P2: only what needs action gets the loud chip): the same
              // words, in the quiet neutral tone.
              <StatusChip tone="neutral">{top.urgent ? 'Urgent' : 'FYI'}</StatusChip>
            )}
          </span>
        </td>
        <td>
          <Identity
            primary={realName ?? g.caller}
            secondary={realName ? g.caller : undefined}
            tabularPrimary={!realName}
          />
        </td>
        <td className={s.reasonCell}>
          {g.notes.map((n) => (
            <Fragment key={n.id}>
              <p className={s.reason}>{cleanNoteText(n.reason).replace(/\s+-\s+/g, ', ')}</p>
              {g.section === 'action' && n.urgent && bookedCalls.has(n.call_id) && (
                <p className={s.booked}>Booked on this call</p>
              )}
            </Fragment>
          ))}
        </td>
        <td className={s.tabular}>{formatClock(newest.ts, tz)}</td>
        <ChevronCell />
      </tr>
    )
  }

  return (
    <PageGrid>
      <Col span={12}>
        <Card title={<CountTitle>{title || ' '}</CountTitle>} katie={sentence} katieMoment={['urgent', 'summary']}>
          <table className={[s.table, s.wrapTable].join(' ')}>
            <caption className="visually-hidden">Callbacks by day: waiting first, urgent on top, then notes on booked calls</caption>
            <ColGroup columns={COLUMNS} />
            <HeadRow columns={COLUMNS} />
            {!groups && list.query.isPending && <CallbacksSkeleton />}
            {groups && groups.length > 0 && (
              <tbody>
                {groups.map((d) => (
                  <Fragment key={d.key}>
                    <tr>
                      <th scope="colgroup" colSpan={COLUMNS.length} className={s.group}>
                        {d.label}
                      </th>
                    </tr>
                    {d.action.map(renderGroup)}
                    {(['noted', 'fyi'] as const).map((sec) =>
                      d[sec].length > 0 ? (
                        <Fragment key={sec}>
                          <tr>
                            <th scope="colgroup" colSpan={COLUMNS.length} className={s.subGroup}>
                              {SECTION_HEADS[sec]}
                            </th>
                          </tr>
                          {d[sec].map(renderGroup)}
                        </Fragment>
                      ) : null,
                    )}
                  </Fragment>
                ))}
              </tbody>
            )}
          </table>
          <ListBelow
            list={list}
            isEmpty={!!groups && groups.length === 0}
            emptyTitle="No callbacks waiting."
            emptyHint="New callbacks show here the moment a call ends."
          />
        </Card>
      </Col>
    </PageGrid>
  )
}

/**
 * One day header and six rows at the loaded row's usual size (F3): two lines of identity in a
 * 12 + 36 + 12 row. Each bar sits centred in the line box of the text it stands for.
 */
function CallbacksSkeleton() {
  return (
    <tbody aria-busy="true">
      <tr aria-hidden="true">
        <th scope="colgroup" colSpan={COLUMNS.length} className={s.group}>
          <SkeletonBar width={48} height={12} />
        </th>
      </tr>
      {Array.from({ length: 6 }, (_, r) => (
        <tr key={r} aria-hidden="true">
          <td>
            <SkeletonBar width={72} height={20} />
          </td>
          <td>
            <span className={s.skLine}>
              <SkeletonBar width="64%" height={14} />
            </span>
            <span className={s.skLineSmall}>
              <SkeletonBar width="56%" height={10} />
            </span>
          </td>
          <td>
            <span className={s.skLine}>
              <SkeletonBar width="90%" height={14} />
            </span>
          </td>
          <td>
            <span className={s.skLine}>
              <SkeletonBar width="64%" height={14} />
            </span>
          </td>
          <td />
        </tr>
      ))}
    </tbody>
  )
}
