// Why someone called, in the owner's words (plan P7, P10, P18; FINDINGS 2026-10-21).
// Pure module: node runs it in scripts/check-lib.mjs. Not re-exported from lib/index.ts, because
// its displayName() takes a row and text.ts's takes a string: import from '../lib/reason'.
//
//   deriveReason(call, bookings, notes)  booking reason first ("New-patient consult · Delta Dental"),
//                                         then the cleaned note reason, then the cleaned first line;
//                                         never the raw first utterance; <= 48 characters.
//   isNewPatientBooking(b)                b.new_patient when the API sends it, else /consult/i.
//   isActionNote(n)                       a note the desk must act on: not FYI, not "informational".
//   displayName({ name, caller })         name first when it is a real name, masked number second.

import type { Booking, CallRow, Note } from '../api/types.ts'
import { capitalizeFirst, cleanReason, insuranceLabel, isUnknownName, truncateAtWord } from './text.ts'

/** Longest reason a list cell shows (the Overview Reason column at 1280). */
export const REASON_MAX = 48

/** A booking as the helpers read it (new_patient is optional on the wire). */
export type BookingLike = Pick<Booking, 'call_id' | 'reason' | 'insurance'> & {
  name?: string
  slot?: string
  new_patient?: boolean
}

type NoteLike = Pick<Note, 'call_id' | 'reason' | 'urgent' | 'fyi'> & { name?: string; ts?: number; id?: number }

/** New-patient consult: the API's flag when present, else the reason says "consult". */
export function isNewPatientBooking(b: { reason: string; new_patient?: boolean }): boolean {
  if (typeof b.new_patient === 'boolean') return b.new_patient
  return /consult/i.test(b.reason ?? '')
}

/** Katie's annotation on a note she wrote only for the record (the booking already handles it). */
const INFORMATIONAL = /note is informational/i

/** A note the desk has to act on: not FYI and not annotated "note is informational". */
export function isActionNote(n: { fyi: boolean; reason: string }): boolean {
  return !n.fyi && !INFORMATIONAL.test(n.reason ?? '')
}

/** A note Katie left for the record only (FYI, or "note is informational"). */
export function isInformationalNote(n: { fyi: boolean; reason: string }): boolean {
  return !isActionNote(n)
}

/** Name first when it is a real name, masked number second; the number alone otherwise. */
export function displayName(row: { name?: string | null; caller: string }): { primary: string; secondary?: string } {
  const name = isUnknownName(row.name) ? null : (row.name as string).trim()
  if (name) return row.caller ? { primary: name, secondary: row.caller } : { primary: name }
  if (row.caller) return { primary: row.caller }
  return { primary: 'Not given' }
}

// ------------------------------------------------------------------ cleaning

/** Drop [annotations] and (asides), cut at the first clause break, no trailing punctuation. */
function firstClause(s: string): string {
  let t = s.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '')
  t = t.replace(/\s+/g, ' ').trim()
  // " - ", " — ", "; ", ". " end a clause; keep a "?" that ends a question.
  // "Dr. Reyes" is not a clause break.
  const parts = t.split(/\s[-—–]\s|;\s|(?<!\b(?:Dr|Mr|Mrs|Ms|St))\.\s|(?<=\?)\s/)
  const tidy = (x: string) => (/\?$/.test(x.trim()) ? x.trim() : x.trim().replace(/[\s,;:.—–-]+$/, ''))
  let out = tidy(parts[0] ?? '')
  // A one-word clause ("Retainer") says too little: carry on into the next one.
  if (out.length < 12 && parts.length > 1) out = `${out}, ${tidy(parts[1] ?? '')}`
  return out
}

function fit(s: string): string {
  return truncateAtWord(capitalizeFirst(s.trim()), REASON_MAX)
}

/** "Reschedule from Mon 3:20 PM" when the reason names the old slot, else "Reschedule". */
function rescheduleLabel(reason: string): string | null {
  if (!/reschedul|moved from/i.test(reason)) return null
  const from = /from ((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]* \d{1,2}:\d{2} ?[AP]M)/i.exec(reason)
  return from ? `Reschedule from ${from[1]}` : 'Reschedule'
}

/** What one booking was for: "New-patient consult", "Reschedule from Thu 8:40 AM", "Cracked retainer". */
export function bookingLabel(b: { reason: string; new_patient?: boolean }): string {
  if (isNewPatientBooking(b)) return 'New-patient consult'
  const r = b.reason ?? ''
  const resched = rescheduleLabel(r)
  if (resched) return resched
  const c = firstClause(r)
  return c ? capitalizeFirst(c) : 'Appointment'
}

/** "New-patient consult · Delta Dental", "2 new-patient consults · Cigna", "Cracked retainer". */
function bookingsReason(list: readonly BookingLike[]): string {
  const first = list.find(isNewPatientBooking) ?? list[0]
  if (!first) return ''
  let label = bookingLabel(first)
  const same = list.filter((b) => bookingLabel(b) === label).length
  if (list.length > 1) {
    if (same === list.length && label === 'New-patient consult') label = `${list.length} new-patient consults`
    else label = `${label} +${list.length - 1}`
  }
  const ins = insuranceLabel(first.insurance)
  const withIns = ins ? `${label} · ${ins}` : label
  return withIns.length <= REASON_MAX ? withIns : fit(label)
}

/**
 * A note's text as the desk reads it: lib/text cleanReason (no [annotations], no "URGENT:") and
 * without Katie's "Existing patient X, DOB on file:" lead-in, which repeats the row's name.
 * "Existing patient Elijah Moreno, DOB on file: parent asks…" -> "Parent asks…".
 */
export function cleanNoteText(reason: string | null | undefined): string {
  // The lead-in ends at a colon that is not a clock's ("New patient booked Thu 11:00 AM - …" stays).
  const s = cleanReason(reason).replace(/^(?:existing|new) patient [^:]{0,60}:(?!\d)\s*/i, '')
  return capitalizeFirst(s)
}

/** "Existing patient X, DOB on file: parent asks…" -> "Parent asks…" (first clause, <= 48). */
function noteReason(n: NoteLike): string {
  let s = cleanNoteText(n.reason)
  s = s.replace(/^name correction\b.*$/i, 'Name correction on the booking')
  const c = firstClause(s)
  return c ? fit(c) : ''
}

const FILLER =
  /^(?:hi|hey|hello|yeah|yes|yep|um+|uh+|eh|oh|so|okay|ok|well|sorry|there|hola|bueno|buenas(?: tardes| noches)?|buenos días|good (?:morning|afternoon|evening)|quick question)\b[\s,.!?…—–-]*/i

/** The caller's first sentence without the "Hi, um, yeah" in front of it. */
export function cleanFirstLine(line: string | null | undefined): string {
  let s = (line ?? '').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 8; i++) {
    const next = s.replace(FILLER, '')
    if (next === s) break
    s = next
  }
  if (!s) return ''
  // First sentence only (keep its "?").
  const m = /^(.+?[.?!])(?:\s|$)/.exec(s)
  let first = (m?.[1] ?? s).trim()
  if (first.endsWith('.') || first.endsWith('!')) first = first.slice(0, -1)
  return fit(first)
}

// ------------------------------------------------------------------ the reason

/**
 * The Reason cell for a call row: its bookings' reason, else its notes' (urgent, then action,
 * then any), else the cleaned first line. A live call with none of these reads "In progress".
 */
export function deriveReason(
  call: Pick<CallRow, 'call_id' | 'first_line'> & { status?: string },
  bookings: readonly BookingLike[] | undefined,
  notes: readonly NoteLike[] | undefined,
): string {
  const mine = (bookings ?? []).filter((b) => b.call_id === call.call_id)
  if (mine.length) return bookingsReason(mine)
  const ns = (notes ?? []).filter((n) => n.call_id === call.call_id)
  const note =
    ns.find((n) => n.urgent && isActionNote(n)) ?? ns.find((n) => isActionNote(n)) ?? ns.find((n) => n.urgent) ?? ns[0]
  if (note) {
    const r = noteReason(note)
    if (r) return r
  }
  if (call.status === 'live') return 'In progress'
  return cleanFirstLine(call.first_line)
}

/** A name-correction note's corrected name: "booked as 'Renee Shimanski', now 'Renee Szymanski'". */
export function correctedName(reason: string | null | undefined): string | undefined {
  const m = /^\s*name correction\b[\s\S]*?\bnow ['‘’"“”]([^'‘’"“”]{2,60})['‘’"“”]/i.exec(reason ?? '')
  const name = m?.[1]?.trim()
  return name && !isUnknownName(name) ? name : undefined
}

/** A name-correction note's spelling as booked: "booked as 'Renee Shimanski'". */
function correctedFrom(reason: string | null | undefined): string | undefined {
  const m = /^\s*name correction\b[\s\S]*?\bbooked as ['‘’"“”]([^'‘’"“”]{2,60})['‘’"“”]/i.exec(reason ?? '')
  return m?.[1]?.trim() || undefined
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Bookings with the name corrections made on their calls applied (P10, like callName), so the
 * Bookings list spells a patient the way every other page does. A correction renames the booking
 * whose name it says was booked ("booked as 'X'"), or, when it does not say, a call's only booking.
 */
export function withCorrectedNames<T extends { call_id: string; name: string }>(
  bookings: readonly T[],
  notes: readonly NoteLike[] | undefined,
): T[] {
  const fixes = new Map<string, { from?: string; to: string }[]>()
  for (const n of notes ?? []) {
    const to = correctedName(n.reason)
    if (to) fixes.set(n.call_id, [...(fixes.get(n.call_id) ?? []), { from: correctedFrom(n.reason), to }])
  }
  if (fixes.size === 0) return [...bookings]
  const perCall = new Map<string, number>()
  for (const b of bookings) perCall.set(b.call_id, (perCall.get(b.call_id) ?? 0) + 1)
  return bookings.map((b) => {
    const fix = fixes.get(b.call_id)?.find((f) => (f.from ? sameName(f.from, b.name) : perCall.get(b.call_id) === 1))
    return fix ? { ...b, name: fix.to } : b
  })
}

/**
 * The name to show for a call: a name correction made on the call, then its booking's, then a
 * note's (real names only); else undefined. The correction wins so one patient never shows under
 * two spellings on one screen (the Callbacks rows use the note's corrected name).
 */
export function callName(
  call: Pick<CallRow, 'call_id' | 'greeted_as'>,
  bookings: readonly BookingLike[] | undefined,
  notes: readonly NoteLike[] | undefined,
): string | undefined {
  for (const n of notes ?? []) {
    if (n.call_id !== call.call_id) continue
    const fixed = correctedName(n.reason)
    if (fixed) return fixed
  }
  for (const b of bookings ?? []) if (b.call_id === call.call_id && !isUnknownName(b.name)) return (b.name as string).trim()
  const ns = (notes ?? []).filter((n) => n.call_id === call.call_id && !isUnknownName(n.name))
  const n = ns.find((x) => isActionNote(x)) ?? ns[0]
  if (n) return (n.name as string).trim()
  return isUnknownName(call.greeted_as) ? undefined : call.greeted_as.trim()
}
