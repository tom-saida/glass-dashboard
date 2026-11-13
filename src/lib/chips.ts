// Outcome and priority chips (DESIGN.md 2.2) and the note ordering rules (6.5, 6.9, conflict 26).
// Pure module: node runs it in scripts/check-lib.mjs.

import { humanizeCode } from './text.ts'

export type ChipTone = 'booked' | 'neutral' | 'live' | 'dropped' | 'callback' | 'urgent' | 'fyi' | 'missed'

export interface Chip {
  label: string
  tone: ChipTone
}

/** Disposition -> chip. Unknown values: strip "phone-", humanize, neutral tone. */
export function dispositionChip(disposition: string | null | undefined): Chip {
  switch (disposition) {
    case 'phone-booked':
      return { label: 'Booked', tone: 'booked' }
    case 'phone-no-booking':
      return { label: 'No booking', tone: 'neutral' }
    case 'live':
      return { label: 'Live', tone: 'live' }
    case 'unknown-crash':
      return { label: 'Dropped', tone: 'dropped' }
    default:
      return { label: disposition ? humanizeCode(disposition) : 'No booking', tone: 'neutral' }
  }
}

/** A call row's chip: status "live" wins over the disposition. */
export function callChip(row: { status?: string; disposition: string }): Chip {
  return row.status === 'live' ? { label: 'Live', tone: 'live' } : dispositionChip(row.disposition)
}

/** Desk note -> Urgent / FYI / Callback (urgent wins). */
export function noteChip(note: { urgent: boolean; fyi: boolean }): Chip {
  if (note.urgent) return { label: 'Urgent', tone: 'urgent' }
  if (note.fyi) return { label: 'FYI', tone: 'fyi' }
  return { label: 'Callback', tone: 'callback' }
}

/** Outcome filter values on the Calls page, matched against callChip(row).tone. */
export type OutcomeFilter = 'all' | 'booked' | 'no-booking' | 'live' | 'dropped'

export function matchesOutcome(row: { status?: string; disposition: string }, f: OutcomeFilter): boolean {
  if (f === 'all') return true
  const tone = callChip(row).tone
  if (f === 'no-booking') return tone === 'neutral'
  return tone === f
}

function priority(n: { urgent: boolean; fyi: boolean }): number {
  return n.urgent ? 0 : n.fyi ? 2 : 1
}

/** Urgent, then callbacks, then FYI; each newest first (ts desc, then id desc). */
export function sortNotes<T extends { urgent: boolean; fyi: boolean; ts: number; id: number }>(
  notes: readonly T[],
): T[] {
  return [...notes].sort((a, b) => priority(a) - priority(b) || b.ts - a.ts || b.id - a.id)
}

/** Conflict 26: "waiting" = today's notes (ts >= range.from) that are not FYI, sorted. */
export function waitingNotes<T extends { urgent: boolean; fyi: boolean; ts: number; id: number }>(
  notes: readonly T[],
  fromTs: number,
): T[] {
  return sortNotes(notes.filter((n) => n.ts >= fromTs && !n.fyi))
}

/** Conflict 19: an urgent note whose call also booked shows "Booked on this call". */
export function bookedOnThisCall(
  note: { call_id: string; urgent: boolean },
  calls: readonly { call_id: string; bookings: number }[] | undefined,
): boolean {
  if (!note.urgent || !calls) return false
  const row = calls.find((c) => c.call_id === note.call_id)
  return !!row && row.bookings > 0
}
