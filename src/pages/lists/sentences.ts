// Katie's sentences for the list pages (DESIGN 7.6: Bookings, Callbacks, Texts). Pure functions
// of the query data; every result goes through katieLine (<= 160 chars, no "!", capitalised).
// Kept here until src/katie/say.ts exists; the templates match DESIGN 7.6 word for word.

import type { Booking, Note, Sms } from '../../api/types'
import { waitingNotes } from '../../lib/chips'
import { countWord, katieLine } from '../../lib/katie'
import { isActionNote } from '../../lib/reason'
import { displayIdentity } from '../../lib/text'
import { expandSlot, formatClock } from '../../lib/time'

function newestFirst<T extends { ts: number; id: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.ts - a.ts || b.id - a.id)
}

/**
 * Bookings page. `fromTs` = local midnight today (stats.range.from).
 *   >= 1 today: "{K} appointments were booked today. The latest is {name} for {Day at time}, and the
 *               confirmation text went out." (the clause only when an sms.out confirmation shares the call)
 *   0 today:    "Nothing booked yet today. The last booking was {name} for {Day at time}."
 * K comes from `counts` (stats(1).bookings, the same count as the KPI) when given; the list (at
 * most 50 rows, DATA-7) only names the latest booking.
 */
export function bookingsSentence(
  bookings: readonly Booking[] | undefined,
  sms: readonly Sms[] | undefined,
  fromTs: number | undefined,
  counts?: { bookings: number },
): string {
  if (!bookings || bookings.length === 0 || fromTs === undefined) return ''
  const all = newestFirst(bookings)
  const today = all.filter((b) => b.ts >= fromTs)
  const k = Math.max(counts?.bookings ?? 0, today.length)
  const head = k === 1 ? 'One appointment was booked today.' : `${countWord(k)} appointments were booked today.`
  if (today.length === 0) {
    // Stats already counts a booking the list has not caught up with: say the count only.
    if (k > 0) return katieLine(head)
    const last = all[0] as Booking
    return katieLine(
      `Nothing booked yet today. The last booking was ${displayIdentity(last.name, last.caller)} for ${expandSlot(last.slot)}.`,
    )
  }
  const latest = today[0] as Booking
  const confirmed = !!sms?.some(
    (s) => s.direction === 'out' && s.kind === 'confirmation' && s.call_id === latest.call_id,
  )
  const tail = confirmed ? ', and the confirmation text went out.' : '.'
  return katieLine(
    `${head} The latest is ${displayIdentity(latest.name, latest.caller)} for ${expandSlot(latest.slot)}${tail}`,
  )
}

/**
 * Callbacks page. Waiting = today's notes the desk must act on (conflict 26 plus the 2026-10-21
 * decision: not FYI and not annotated "note is informational"), urgent first.
 *   > 0: "{C} callbacks are waiting, {U} of them urgent. Start with {identity} from {time}."
 *   1:   "One callback is waiting, from {identity} at {time}." ("One urgent callback …" when urgent)
 *   0:   "No one is waiting on a callback."
 * C and U come from the list: stats(1).callbacks also counts the informational notes, so it
 * cannot give this count (`counts` is accepted for the old call sites and ignored).
 */
export function callbacksSentence(
  notes: readonly Note[] | undefined,
  fromTs: number | undefined,
  _counts?: { callbacks: number; urgent: number },
): string {
  if (!notes || fromTs === undefined) return ''
  const waiting = waitingNotes(notes.filter(isActionNote), fromTs)
  const c = waiting.length
  if (c === 0) return katieLine('No one is waiting on a callback.')
  const first = waiting[0] as Note
  const who = displayIdentity(first.name, first.caller)
  const time = formatClock(first.ts)
  if (c === 1) {
    return katieLine(`One ${first.urgent ? 'urgent ' : ''}callback is waiting, from ${who} at ${time}.`)
  }
  const u = waiting.filter((n) => n.urgent).length
  const urgent = u === 0 ? 'none of them urgent' : `${countWord(u)} of them urgent`
  return katieLine(`${countWord(c)} callbacks are waiting, ${urgent}. Start with ${who} from ${time}.`)
}

/**
 * Texts page: the Texts sent sentence (counts from stats when given, else today's rows), plus
 * " The latest went to {phone}." when the newest text today went out.
 */
export function textsSentence(
  sms: readonly Sms[] | undefined,
  fromTs: number | undefined,
  counts: { sms_out: number; sms_in: number } | undefined,
): string {
  if (!sms || fromTs === undefined) return ''
  const today = newestFirst(sms.filter((s) => s.ts >= fromTs))
  const out = today.filter((s) => s.direction === 'out')
  const inn = today.filter((s) => s.direction === 'in')
  const o = counts?.sms_out ?? out.length
  const i = counts?.sms_in ?? inn.length
  if (o === 0) return ''
  const allConfirm = out.every((s) => s.kind === 'confirmation') && inn.every((s) => s.kind === 'yes')
  const what = allConfirm
    ? o === 1
      ? 'confirmation text'
      : 'confirmation texts'
    : o === 1
      ? 'text'
      : 'texts'
  let s: string
  if (i === 0) s = `${countWord(o)} ${what} went out today. No replies yet.`
  else if (allConfirm) s = `${countWord(o)} ${what} went out today, and ${countWord(i)} ${i === 1 ? 'person' : 'people'} replied yes.`
  else s = `${countWord(o)} ${what} went out today, and ${countWord(i)} ${i === 1 ? 'reply' : 'replies'} came in.`
  const latest = today[0]
  if (latest && latest.direction === 'out') s += ` The latest went to ${latest.phone}.`
  return katieLine(s)
}
