// DESIGN 6.10, P15: texts as conversations. One row per text Katie sent, with the patient's reply
// folded into it (matched by call_id); a reply with nothing sent before it stands alone.
// Newest first. The whole row opens the call (P8).
import { useMemo } from 'react'
import { useBookings, useNotes, useSms, useStats, useStatus, usePracticeTz } from '../api'
import { Card } from '../components'
import { formatClock, formatWhen, humanizeCode, practiceName } from '../lib'
import { displayName } from '../lib/reason'
import { Col, PageGrid } from '../shell'
import {
  CHEVRON_COLUMN,
  ChevronCell,
  ColGroup,
  CountTitle,
  HeadRow,
  Identity,
  ListBelow,
  SkeletonBody,
  listStyles as s,
  useRowOpen,
  type ListColumn,
} from './lists/parts'
import { foldTexts, namesByCall, type Conversation } from './lists/people'
import { textsSentence } from './lists/sentences'
import { textsTitle } from './lists/titles'
import { useTodayFrom } from './lists/useTodayFrom'

const COLUMNS: readonly ListColumn[] = [
  // 168 holds "Yesterday 12:35 PM" (128 px) plus the 20 + 16 padding.
  { key: 'time', label: 'Time', width: 168 },
  // DATA-2: 200 holds a long name, and a revealed "(656) 555-0150" at 12px under it.
  { key: 'who', label: 'Patient', width: 200 },
  { key: 'message', label: 'Message', width: 'flex' },
  // "Replied Yes 12:35 PM" (about 140 px) plus padding.
  { key: 'status', label: 'Status', width: 184 },
  CHEVRON_COLUMN,
]

const SKELETON_BARS = ['56%', '72%', '80%', '64%', 0]

/**
 * Message cell: the body when the API sends it (demo only), else what kind of text it was. The
 * practice's own name in front of every body ("Harborline Orthodontics: …") is dropped, so the
 * cell starts with what the text says.
 */
function messageOf(c: Conversation, practice: string): string {
  const t = c.out ?? c.reply
  if (!t) return ''
  const body = t.text?.trim()
  if (body) {
    const prefix = practice ? `${practice}:` : ''
    return prefix && body.startsWith(prefix) ? body.slice(prefix.length).trim() : body
  }
  if (t.direction === 'out') return t.kind === 'confirmation' ? 'Confirmation text' : `${humanizeCode(t.kind)} text`
  return t.kind === 'yes' ? 'Reply: Yes' : `Reply: ${humanizeCode(t.kind)}`
}

/** Status cell: "Replied Yes 9:16 AM", "Sent" (no delivery receipt exists, so never "Delivered"). */
function statusOf(c: Conversation, tz: string): string {
  if (c.reply) {
    const what = c.reply.kind === 'yes' ? 'Yes' : c.reply.text?.trim() || humanizeCode(c.reply.kind)
    return c.out ? `Replied ${what} ${formatClock(c.reply.ts, tz)}` : 'Received'
  }
  return 'Sent'
}

export default function Texts() {
  const list = useSms()
  const bookings = useBookings()
  const notes = useNotes()
  const stats = useStats(1)
  const tz = usePracticeTz()
  const from = useTodayFrom()
  const rowOpen = useRowOpen()
  const practice = practiceName(useStatus().data?.practice).name

  const rows = useMemo(
    () => (list.rows ? [...list.rows].sort((a, b) => b.ts - a.ts || b.id - a.id) : undefined),
    [list.rows],
  )
  const convs = useMemo(() => (rows ? foldTexts(rows) : undefined), [rows])
  const names = useMemo(() => namesByCall(bookings.rows, notes.rows), [bookings.rows, notes.rows])
  const sentence = textsSentence(rows, from, stats.data)
  const title = textsTitle(rows, from, stats.data)

  return (
    <PageGrid>
      <Col span={12}>
        <Card title={<CountTitle>{title || ' '}</CountTitle>} katie={sentence} katieMoment="summary">
          <table className={s.table}>
            <caption className="visually-hidden">Texts with their replies, newest first</caption>
            <ColGroup columns={COLUMNS} />
            <HeadRow columns={COLUMNS} />
            {!convs && list.query.isPending && <SkeletonBody columns={COLUMNS} rows={10} bars={SKELETON_BARS} />}
            {convs && convs.length > 0 && (
              <tbody>
                {convs.map((c) => {
                  const when = formatWhen(c.ts, tz)
                  const who = displayName({ name: names.get(c.call_id), caller: c.phone })
                  const message = messageOf(c, practice)
                  const status = statusOf(c, tz)
                  const open = rowOpen(c.call_id, `Text to ${who.primary} at ${when}`)
                  return (
                    <tr key={c.key} {...open.row}>
                      <td className={s.tabular}>
                        <span {...open.link}>{when}</span>
                      </td>
                      <td>
                        <Identity primary={who.primary} secondary={who.secondary} tabularPrimary={!who.secondary} />
                      </td>
                      <td title={message}>{message}</td>
                      <td className={`${s.tabular} ${c.reply ? '' : s.secondary}`}>{status}</td>
                      <ChevronCell />
                    </tr>
                  )
                })}
              </tbody>
            )}
          </table>
          <ListBelow
            list={list}
            isEmpty={!!convs && convs.length === 0}
            emptyTitle="No texts yet."
            emptyHint="Confirmation texts show here after Katie books a visit."
          />
        </Card>
      </Col>
    </PageGrid>
  )
}
