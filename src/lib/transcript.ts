// Call drawer transcript model (DESIGN.md 6.8, conflicts 13, 16, 17, 22, 31).
// Turns a call's events into ordered items: caller lines, grouped Katie replies, and quiet
// one-line system notes. Pure module: node runs it in scripts/check-lib.mjs.

import type { CallEvent } from '../api/types.ts'
import { callChip } from './chips.ts'
import { formatClock, formatDuration, getPracticeTz } from './time.ts'
import { cleanReason, displayName, joinBotTexts } from './text.ts'

export type TranscriptItem =
  | { type: 'caller'; key: string; text: string; turn: number }
  | { type: 'katie'; key: string; text: string; turn: number }
  | { type: 'note'; key: string; text: string; turn: number }

/** The row fields the "Call ended" note needs (row duration wins over the event, conflict 13). */
export interface TranscriptRow {
  duration_s: number | null
  disposition: string
  status?: string
}

/** One system note's copy, or null when the event is hidden. */
export function systemNoteText(e: CallEvent, row?: TranscriptRow, tz: string = getPracticeTz()): string | null {
  switch (e.kind) {
    case 'call.started':
      return `Call started ${formatClock(e.ts, tz)}`
    case 'greeting':
      return e.data.name ? `Greeted as ${e.data.name}` : null
    case 'tool': {
      const d = e.data
      if (!d.ok) {
        switch (d.name) {
          case 'lookup':
            return "Chart lookup didn't go through"
          case 'context':
            return "Schedule check didn't go through"
          case 'book':
            return d.slot ? `Booking didn't go through — ${d.slot}` : "Booking didn't go through"
          case 'cancel':
            return d.slot ? `Cancellation didn't go through — ${d.slot}` : "Cancellation didn't go through"
          case 'message':
            return "Desk note didn't go through"
          default:
            return null
        }
      }
      switch (d.name) {
        case 'lookup':
          return d.verified ? 'Looked up the chart — verified' : 'Looked up the chart — no match'
        case 'context':
          return 'Checked the schedule'
        case 'book':
          return d.already_booked ? `Already booked ${d.slot ?? ''}`.trim() : null
        default:
          return null
      }
    }
    case 'booking': {
      const name = displayName(e.data.name)
      return name ? `Booked ${name} for ${e.data.slot}` : `Booked ${e.data.slot}`
    }
    case 'note': {
      const reason = cleanReason(e.data.reason)
      const head = e.data.fyi && !e.data.urgent ? 'FYI note filed' : e.data.urgent ? 'Desk note filed — urgent' : 'Desk note filed'
      return reason ? `${head} · ${reason}` : head
    }
    case 'cancel': {
      const name = displayName(e.data.name)
      return name ? `Cancelled ${e.data.slot} for ${name}` : `Cancelled ${e.data.slot}`
    }
    case 'sms.out':
      return e.data.kind === 'confirmation' ? 'Confirmation text sent' : `Text sent (${e.data.kind})`
    case 'sms.in':
      return e.data.kind === 'yes' ? 'Caller replied yes by text' : `Text reply received (${e.data.kind})`
    case 'call.ended': {
      const dur = formatDuration(row ? row.duration_s : null)
      const label = callChip(row ?? { disposition: e.data.disposition }).label
      return ['Call ended', dur, label].filter(Boolean).join(' · ')
    }
    default:
      return null
  }
}

/**
 * Builds the transcript. All `turn.bot` events of one turn become one Katie block placed at
 * the first of them; a system note of that turn that falls between them renders after the block.
 */
export function buildTranscript(
  events: readonly CallEvent[],
  row?: TranscriptRow,
  tz: string = getPracticeTz(),
): TranscriptItem[] {
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

  const out: TranscriptItem[] = []
  const openTurns = new Set<number>()
  const deferred = new Map<number, TranscriptItem[]>()

  events.forEach((e, i) => {
    const key = `${e.kind}-${'id' in e ? e.id : i}-${i}`
    if (e.kind === 'turn.bot') {
      if (!openTurns.has(e.turn) && !out.some((it) => it.type === 'katie' && it.turn === e.turn)) {
        out.push({ type: 'katie', key, text: joinBotTexts(botTexts.get(e.turn) ?? []), turn: e.turn })
        openTurns.add(e.turn)
      }
      if (lastBotIndex.get(e.turn) === i) {
        openTurns.delete(e.turn)
        out.push(...(deferred.get(e.turn) ?? []))
        deferred.delete(e.turn)
      }
      return
    }
    if (e.kind === 'turn.caller') {
      const text = e.data.text.trim()
      if (text) out.push({ type: 'caller', key, text, turn: e.turn })
      return
    }
    const text = systemNoteText(e, row, tz)
    if (!text) return
    const item: TranscriptItem = { type: 'note', key, text, turn: e.turn }
    if (openTurns.has(e.turn)) {
      const list = deferred.get(e.turn) ?? []
      list.push(item)
      deferred.set(e.turn, list)
    } else {
      out.push(item)
    }
  })
  // A live call can stop mid-turn: flush anything still deferred.
  for (const list of deferred.values()) out.push(...list)
  return out
}

/** True when the events hold no conversation at all (drawer empty state). */
export function hasConversation(events: readonly CallEvent[]): boolean {
  return events.some((e) => e.kind === 'turn.caller' || e.kind === 'turn.bot')
}
