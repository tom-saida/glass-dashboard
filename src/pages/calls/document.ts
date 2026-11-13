// P11: the call drawer as a document. A call's events become (1) an Outcome block, one line per
// action in the order it happened, each pointing at its row, and (2) transcript rows: who spoke,
// m:ss from the call's start, and what was said, with event rows in between. One block per Katie
// turn (her sentences of one turn joined, spacing fixed). Pure module (relative .ts imports) so
// node can check it on the demo data.

import type { Booking, CallEvent, Note, Sms } from '../../api/types.ts'
import { callChip } from '../../lib/chips.ts'
import { bookingLabel, cleanNoteText, isActionNote, isNewPatientBooking } from '../../lib/reason.ts'
import { cleanReason, displayName, insuranceLabel, joinBotTexts, truncateAtWord } from '../../lib/text.ts'
import { formatClock, formatDuration, getPracticeTz } from '../../lib/time.ts'

export type DocIcon = 'call' | 'person' | 'calendar' | 'booked' | 'cancel' | 'note' | 'text' | 'reply' | 'warning'

export type DocRow =
  | { type: 'caller' | 'katie'; key: string; at: number; text: string; turn: number }
  | { type: 'event'; key: string; at: number; text: string; turn: number; icon: DocIcon }

export interface OutcomeLine {
  key: string
  text: string
  icon: DocIcon
  /** The transcript row this line scrolls to; undefined when there is no transcript. */
  target?: string
}

export interface CallDocument {
  outcome: OutcomeLine[]
  rows: DocRow[]
}

/** The row fields the "Call ended" row needs (the row's duration wins over the event's, conflict 13). */
export interface DocCall {
  started_at: number
  duration_s: number | null
  disposition: string
  status?: string
}

/** "0:00", "1:05", "12:40": seconds from the call's start. */
export function formatOffset(sec: number): string {
  const t = Math.max(0, Math.floor(sec))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

const NOTE_OUTCOME_MAX = 88

function noteHead(d: { urgent: boolean; fyi: boolean }): string {
  if (d.urgent) return 'Desk note filed · urgent'
  if (d.fyi) return 'FYI note filed'
  return 'Desk note filed'
}

/** "Desk note filed · urgent: Bracket came off…" (the reason cut for the outcome block). */
function noteLine(d: { reason: string; urgent: boolean; fyi: boolean }, max?: number): string {
  // Katie writes " - " between clauses; a comma reads better in a sentence.
  const r = cleanNoteText(cleanReason(d.reason)).replace(/\s+-\s+/g, ', ')
  if (!r) return noteHead(d)
  const text = max ? truncateAtWord(r, max) : r
  return `${noteHead(d)}: ${text}`
}

function lookupText(verified: boolean | undefined, newPatient: boolean): string {
  if (verified) return 'Checked the chart: existing patient'
  return newPatient ? 'Checked the chart: new patient' : 'Checked the chart: not on file'
}

type BookingData = { name: string; slot: string; reason: string; insurance: string; new_patient?: boolean }

/** The booking as the outcome reads it: "Booked new-patient consult · Thu 9:40 AM · Delta Dental". */
function bookingOutcome(d: BookingData, withName: boolean): string {
  const ins = insuranceLabel(d.insurance)
  const name = withName ? displayName(d.name) : null
  const parts: string[] = []
  if (isNewPatientBooking(d)) {
    parts.push(name ? `Booked ${name}` : 'Booked new-patient consult', d.slot)
    if (name) parts.push('New-patient consult')
  } else {
    parts.push(name ? `Booked ${name}` : `Booked ${d.slot}`)
    if (name) parts.push(d.slot)
    parts.push(bookingLabel(d))
  }
  if (ins) parts.push(ins)
  return parts.join(' · ')
}

/**
 * Builds the document from the call's events. `bookings` (the list rows of this call, when
 * known) supply the new_patient flag the booking events do not carry.
 */
export function buildDocument(
  events: readonly CallEvent[],
  call: DocCall,
  bookings: readonly Pick<Booking, 'slot' | 'new_patient'>[] = [],
  tz: string = getPracticeTz(),
): CallDocument {
  const start = call.started_at
  const at = (ts: number) => ts - start
  const flag = (slot: string): boolean | undefined => bookings.find((b) => b.slot === slot)?.new_patient
  const bookingEvents = events.filter((e): e is Extract<CallEvent, { kind: 'booking' }> => e.kind === 'booking')
  const anyNewPatient = bookingEvents.some((e) => isNewPatientBooking({ ...e.data, new_patient: flag(e.data.slot) }))
  const multi = bookingEvents.length > 1

  // Katie's sentences of one turn become one block, placed at the first of them; an event of
  // that turn that falls between them is shown after the block.
  const botTexts = new Map<number, string[]>()
  const lastBotIndex = new Map<number, number>()
  events.forEach((e, i) => {
    if (e.kind === 'turn.bot') {
      const list = botTexts.get(e.turn) ?? []
      list.push(e.data.text)
      botTexts.set(e.turn, list)
      lastBotIndex.set(e.turn, i)
    }
  })

  const rows: DocRow[] = []
  const outcome: OutcomeLine[] = []
  const openTurns = new Set<number>()
  const doneTurns = new Set<number>()
  const deferred = new Map<number, DocRow[]>()
  let lookupDone = false
  let lastText: OutcomeLine | null = null

  const pushEvent = (row: DocRow) => {
    if (openTurns.has(row.turn)) {
      const list = deferred.get(row.turn) ?? []
      list.push(row)
      deferred.set(row.turn, list)
    } else {
      rows.push(row)
    }
  }

  events.forEach((e, i) => {
    const key = `${e.kind}-${'id' in e ? e.id : i}-${i}`
    const t = at(e.ts)
    const ev = (text: string, icon: DocIcon) => pushEvent({ type: 'event', key, at: t, text, turn: e.turn, icon })

    switch (e.kind) {
      case 'turn.bot': {
        if (!openTurns.has(e.turn) && !doneTurns.has(e.turn)) {
          const text = joinBotTexts(botTexts.get(e.turn) ?? [])
          if (text) rows.push({ type: 'katie', key, at: t, text, turn: e.turn })
          openTurns.add(e.turn)
          doneTurns.add(e.turn)
        }
        if (lastBotIndex.get(e.turn) === i) {
          openTurns.delete(e.turn)
          rows.push(...(deferred.get(e.turn) ?? []))
          deferred.delete(e.turn)
        }
        return
      }
      case 'turn.caller': {
        const text = e.data.text.trim()
        if (text) rows.push({ type: 'caller', key, at: t, text, turn: e.turn })
        return
      }
      case 'call.started':
        ev(`Call started ${formatClock(e.ts, tz)}`, 'call')
        return
      case 'greeting':
        if (e.data.name) ev(`Greeted as ${e.data.name}`, 'person')
        return
      case 'tool': {
        const d = e.data
        if (!d.ok) {
          const failed: Record<string, string> = {
            lookup: "Chart lookup didn't go through",
            context: "Schedule check didn't go through",
            book: d.slot ? `Booking didn't go through · ${d.slot}` : "Booking didn't go through",
            cancel: d.slot ? `Cancellation didn't go through · ${d.slot}` : "Cancellation didn't go through",
            message: "Desk note didn't go through",
          }
          const text = failed[d.name]
          if (text) {
            ev(text, 'warning')
            if (d.name !== 'lookup' && d.name !== 'context') outcome.push({ key, text, icon: 'warning', target: key })
          }
          return
        }
        if (d.name === 'lookup') {
          const text = lookupText(d.verified, anyNewPatient)
          ev(text, 'person')
          if (!lookupDone) {
            lookupDone = true
            outcome.push({ key, text, icon: 'person', target: key })
          }
        } else if (d.name === 'context') {
          ev('Checked the schedule', 'calendar')
        } else if (d.name === 'book' && d.already_booked) {
          ev(`Already booked ${d.slot ?? ''}`.trim(), 'calendar')
        }
        return
      }
      case 'booking': {
        const d = { ...e.data, new_patient: flag(e.data.slot) }
        const name = displayName(d.name)
        const ins = insuranceLabel(d.insurance)
        const what = isNewPatientBooking(d) ? 'New-patient consult' : bookingLabel(d)
        ev([name ? `Booked ${name}` : 'Booked', d.slot, what, ins].filter(Boolean).join(' · '), 'booked')
        outcome.push({ key, text: bookingOutcome(d, multi), icon: 'booked', target: key })
        return
      }
      case 'cancel': {
        const name = displayName(e.data.name)
        ev(name ? `Cancelled ${e.data.slot} for ${name}` : `Cancelled ${e.data.slot}`, 'cancel')
        outcome.push({ key, text: `Cancelled ${e.data.slot}`, icon: 'cancel', target: key })
        return
      }
      case 'note': {
        ev(noteLine(e.data), 'note')
        outcome.push({ key, text: noteLine(e.data, NOTE_OUTCOME_MAX), icon: 'note', target: key })
        return
      }
      case 'sms.out': {
        const text = e.data.kind === 'confirmation' ? 'Confirmation text sent' : 'Text sent'
        ev(text, 'text')
        lastText = { key, text, icon: 'text', target: key }
        outcome.push(lastText)
        return
      }
      case 'sms.in': {
        const yes = e.data.kind === 'yes'
        ev(yes ? 'Replied Yes by text' : 'Text reply received', 'reply')
        const reply = `${yes ? 'replied Yes' : 'reply received'} ${formatClock(e.ts, tz)}`
        if (lastText && !lastText.text.includes(' · ')) lastText.text = `${lastText.text} · ${reply}`
        else outcome.push({ key, text: yes ? `Replied Yes by text ${formatClock(e.ts, tz)}` : `Text reply received ${formatClock(e.ts, tz)}`, icon: 'reply', target: key })
        return
      }
      case 'call.ended': {
        const dur = formatDuration(call.duration_s)
        const label = callChip(call.status === 'live' ? { disposition: e.data.disposition } : call).label
        ev(['Call ended', dur, label].filter(Boolean).join(' · '), 'call')
        return
      }
      default:
        return
    }
  })
  // A live call can stop mid-turn: flush anything still waiting for its Katie block.
  for (const list of deferred.values()) rows.push(...list)
  return { outcome, rows }
}

/**
 * The Outcome block for a call with no transcript (older history calls): built from the list rows
 * that carry this call_id. Lines have no target.
 */
export function outcomeFromLists(
  callId: string,
  bookings: readonly Booking[] = [],
  notes: readonly Note[] = [],
  sms: readonly Sms[] = [],
  tz: string = getPracticeTz(),
): OutcomeLine[] {
  type Item = { ts: number; id: number; line: OutcomeLine }
  const items: Item[] = []
  const mine = <T extends { call_id: string }>(rows: readonly T[]) => rows.filter((r) => r.call_id === callId)
  const bs = mine(bookings)
  for (const b of bs) items.push({ ts: b.ts, id: b.id, line: { key: `b${b.id}`, text: bookingOutcome(b, bs.length > 1), icon: 'booked' } })
  for (const n of mine(notes)) items.push({ ts: n.ts, id: n.id, line: { key: `n${n.id}`, text: noteLine(n, NOTE_OUTCOME_MAX), icon: 'note' } })
  const texts = [...mine(sms)].sort((a, b) => a.ts - b.ts || a.id - b.id)
  let last: Item | null = null
  for (const s of texts) {
    if (s.direction === 'out') {
      last = { ts: s.ts, id: s.id, line: { key: `s${s.id}`, text: s.kind === 'confirmation' ? 'Confirmation text sent' : 'Text sent', icon: 'text' } }
      items.push(last)
    } else if (last && !last.line.text.includes(' · ')) {
      last.line.text += ` · ${s.kind === 'yes' ? 'replied Yes' : 'reply received'} ${formatClock(s.ts, tz)}`
    }
  }
  return items.sort((a, b) => a.ts - b.ts || a.id - b.id).map((x) => x.line)
}

/** The name the drawer leads with: a booking's, then an action note's, any note's, the greeting's. */
export function nameFromEvents(events: readonly CallEvent[]): string | undefined {
  for (const e of events) if (e.kind === 'booking' && displayName(e.data.name)) return displayName(e.data.name) as string
  const notes = events.filter((e): e is Extract<CallEvent, { kind: 'note' }> => e.kind === 'note')
  const n =
    notes.find((x) => isActionNote(x.data) && displayName(x.data.name)) ?? notes.find((x) => displayName(x.data.name))
  if (n) return displayName(n.data.name) as string
  for (const e of events) if (e.kind === 'greeting' && e.data.name) return e.data.name
  return undefined
}
