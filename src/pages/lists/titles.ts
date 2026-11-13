// P5: the list cards' count sentences, 14/500 in the card header ("36 calls today · 27 booked").
// The top bar keeps the page title. Zero is a count too ("0 waiting"): the empty state below the
// header says what is missing, so the header does not repeat it. Pure module (relative .ts
// imports) so node can check it.

import type { CallsRange } from '../../api/queries.ts'
import type { Booking, Note, Sms } from '../../api/types.ts'
import type { OutcomeFilter } from '../../lib/chips.ts'
import { isActionNote, isNewPatientBooking } from '../../lib/reason.ts'

const RANGE_WORDS: Record<CallsRange, string> = {
  today: 'today',
  '7d': 'in the last 7 days',
  '30d': 'in the last 30 days',
}

function n(k: number, one: string, many: string): string {
  return `${k} ${k === 1 ? one : many}`
}

/**
 * Calls: "36 calls today · 27 booked"; with an outcome filter "27 of 36 calls today".
 * Empty string while the totals are unknown.
 */
export function callsTitle(
  range: CallsRange,
  outcome: OutcomeFilter,
  totals: { calls: number; booked: number } | null,
  filteredCount: number,
): string {
  if (!totals) return ''
  const r = RANGE_WORDS[range]
  const calls = Math.max(totals.calls, outcome === 'all' ? filteredCount : 0)
  if (outcome !== 'all') return `${filteredCount} of ${n(calls, 'call', 'calls')} ${r}`
  if (calls === 0) return `0 calls ${r}`
  return `${n(calls, 'call', 'calls')} ${r} · ${totals.booked} booked`
}

/** Bookings: "28 bookings today · 11 new patients". stats(1).bookings wins for the total. */
export function bookingsTitle(rows: readonly Booking[] | undefined, from: number | undefined, statsBookings?: number): string {
  if (!rows || from === undefined) return ''
  const today = rows.filter((b) => b.ts >= from)
  const k = Math.max(statsBookings ?? 0, today.length)
  if (k === 0) return '0 bookings today'
  const np = today.filter(isNewPatientBooking).length
  const head = n(k, 'booking today', 'bookings today')
  return np > 0 ? `${head} · ${np} new ${np === 1 ? 'patient' : 'patients'}` : head
}

/** Today's notes the desk must act on (not FYI, not "note is informational"), any order. */
export function actionNotesToday(notes: readonly Note[], from: number): Note[] {
  return notes.filter((x) => x.ts >= from && isActionNote(x))
}

/** Callbacks: "11 waiting · 2 urgent" (today's action notes). */
export function callbacksTitle(notes: readonly Note[] | undefined, from: number | undefined): string {
  if (!notes || from === undefined) return ''
  const waiting = actionNotesToday(notes, from)
  if (waiting.length === 0) return '0 waiting'
  const urgent = waiting.filter((x) => x.urgent).length
  return urgent > 0 ? `${waiting.length} waiting · ${urgent} urgent` : `${waiting.length} waiting`
}

/** Texts: "21 texts sent today · 20 replies". stats(1) wins for both counts. */
export function textsTitle(
  sms: readonly Sms[] | undefined,
  from: number | undefined,
  counts?: { sms_out: number; sms_in: number },
): string {
  if (!sms || from === undefined) return ''
  const today = sms.filter((x) => x.ts >= from)
  const out = Math.max(counts?.sms_out ?? 0, today.filter((x) => x.direction === 'out').length)
  const inn = Math.max(counts?.sms_in ?? 0, today.filter((x) => x.direction === 'in').length)
  if (out === 0 && inn === 0) return '0 texts sent today'
  const head = n(out, 'text sent today', 'texts sent today')
  return inn > 0 ? `${head} · ${n(inn, 'reply', 'replies')}` : `${head} · no replies yet`
}
