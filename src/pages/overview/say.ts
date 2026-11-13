// What Katie says on the Overview widgets (DESIGN.md 7.6). Pure functions of query data; every
// result goes through katieLine (no "!", <= 160 chars, capitalised, "" = she stands silently).
// Counts are words one to ten, digits from 11, "no" for zero (lib countWord).

import type { CallRow, HourBucket, Note, Sms, StatsResponse, StatusResponse } from '../../api'
import {
  capitalizeFirst,
  count,
  countWord,
  displayIdentity,
  formatClock,
  formatDuration,
  formatHourLabel,
  KATIE_MAX_CHARS,
  katieLine,
  truncateAtWord,
} from '../../lib'
import { cleanNoteText } from '../../lib/reason'

/** "none" for zero in "{n} of them" phrases ("no of them" is not English). */
function ofThem(n: number): string {
  return n === 0 ? 'none' : countWord(n)
}

// ------------------------------------------------------------------ Line tile (6.1)

export function sayLine(args: {
  status: StatusResponse | undefined
  statusError: boolean
  liveRow: CallRow | undefined
  todayFrom: number
  /** The caller's name once the call has given one (lib/reason callName). */
  liveName?: string
}): string {
  const { status, statusError, liveRow, todayFrom, liveName } = args
  if (statusError || !status) return ''
  if (status.line === 'on-call') {
    if (!liveRow) return katieLine("I'm on a call right now.")
    return katieLine(`I'm on a call with ${liveName ?? liveRow.caller}. It started at ${formatClock(liveRow.started_at)}.`)
  }
  if (status.last_call_at != null && status.last_call_at >= todayFrom) {
    return katieLine(`The line is quiet. The last call came in at ${formatClock(status.last_call_at)}.`)
  }
  return katieLine('The line is open. No one has called yet today.')
}

// ------------------------------------------------------------------ KPI cells (6.2)

/** Facts for the Calls answered cell's sentence: the same ones its sub-line shows. */
export interface CallsCellFacts {
  /** Today's calls in Spanish (stats.languages.es). */
  spanish?: number
  /** Today's calls outside the practice's hours (pages/overview/hours). */
  afterHours?: number
}

export function sayCallsCell(stats: StatsResponse, yesterdayCalls: number | null, facts: CallsCellFacts = {}): string {
  const n = stats.calls
  if (n <= 0) return ''
  const b = stats.booked_calls
  let s =
    n === 1
      ? `One call answered so far today, and it ${b > 0 ? 'was booked' : "wasn't booked"}.`
      : `${countWord(n)} calls answered so far today, ${ofThem(b)} of them booked.`
  if (stats.avg_duration_s > 0) {
    s += ` ${n === 1 ? 'It ran' : 'The average call ran'} ${formatDuration(stats.avg_duration_s)}.`
  }
  const es = facts.spanish ?? 0
  const ah = facts.afterHours ?? 0
  if (es > 0) s += es === 1 ? ' One was in Spanish.' : ` ${capitalizeFirst(countWord(es))} were in Spanish.`
  else if (ah > 0) s += ah === 1 ? ' One came in after hours.' : ` ${capitalizeFirst(countWord(ah))} came in after hours.`
  if (yesterdayCalls != null && yesterdayCalls > 0) {
    s += yesterdayCalls === 1 ? ' Yesterday there was one.' : ` Yesterday there were ${countWord(yesterdayCalls)}.`
  }
  return katieLine(s)
}

/** Appointments booked. `confirmed` = today's "yes" replies to a confirmation text. */
export function sayBookedCell(stats: StatsResponse, confirmed = 0): string {
  const n = stats.calls
  const b = stats.booked_calls
  const k = stats.bookings
  if (n <= 0) return ''
  if (b <= 0) return katieLine('Nothing has been booked yet today.')
  const appts = count(k, 'appointment')
  const s =
    n === 1
      ? `Today's one call ended in a booking, ${appts} in all.`
      : `${countWord(b)} of today's ${countWord(n)} calls ended in a booking, ${appts} in all.`
  if (confirmed <= 0) return katieLine(s)
  return katieLine(
    `${s} ${confirmed === 1 ? 'One patient' : `${capitalizeFirst(countWord(confirmed))} patients`} confirmed by text.`,
  )
}

/** New-patient consults booked today (lib/reason isNewPatientBooking). */
export function sayNewPatientCell(consults: number, yesterday: number | null = null): string {
  let s =
    consults <= 0
      ? 'No new-patient consults booked yet today.'
      : consults === 1
        ? 'One new-patient consult booked today.'
        : `${countWord(consults)} new-patient consults booked today.`
  if (yesterday != null && yesterday > 0) {
    s += yesterday === 1 ? ' Yesterday there was one.' : ` Yesterday there were ${countWord(yesterday)}.`
  }
  return katieLine(s)
}

/**
 * Callbacks waiting: the notes the desk must act on (lib/reason isActionNote), not stats.callbacks.
 * Takes { callbacks, urgent } so a StatsResponse still fits (scripts/check-lib).
 */
export function sayCallbacksCell(waiting: { callbacks: number; urgent: number }): string {
  const c = waiting.callbacks
  const u = Math.min(waiting.urgent, c)
  if (c <= 0) return katieLine('No one is waiting on a callback.')
  if (c === 1) return katieLine(u === 1 ? 'One callback is waiting, and it is urgent.' : 'One callback is waiting.')
  return katieLine(`${countWord(c)} callbacks are waiting, ${ofThem(u)} of them urgent.`)
}

/**
 * Texts sent (no longer an Overview cell since P6: its fact is the Appointments booked sub-line).
 * Kept for scripts/check-lib until the verify stage drops it. "Confirmation" and "replied yes" are only said when today's rows prove it
 * (every outbound row is a confirmation, every inbound row a yes); otherwise the plain form.
 */
export function sayTextsCell(stats: StatsResponse, todaySms: Sms[] | undefined): string {
  const o = stats.sms_out
  const i = stats.sms_in
  if (o <= 0) return ''
  const outs = todaySms?.filter((m) => m.direction === 'out') ?? []
  const ins = todaySms?.filter((m) => m.direction === 'in') ?? []
  const allConfirmations = !!todaySms && outs.length > 0 && outs.every((m) => m.kind === 'confirmation')
  const allYes = ins.every((m) => m.kind === 'yes')
  const texts = allConfirmations ? count(o, 'confirmation text') : count(o, 'text')
  if (i <= 0) return katieLine(`${texts} went out today. No replies yet.`)
  if (allConfirmations && allYes) {
    return katieLine(`${texts} went out today, and ${count(i, 'person', 'people')} replied yes.`)
  }
  return katieLine(`${texts} went out today, and ${count(i, 'reply', 'replies')} came in.`)
}

// ------------------------------------------------------------------ Calls by hour (6.3)

export function sayCallsByHour(byHour: HourBucket[], firstCallAt: number | undefined): string {
  let best: HourBucket | undefined
  for (const b of byHour) if (b.calls > 0 && (!best || b.calls > best.calls)) best = b
  if (!best) return ''
  const first = firstCallAt != null ? formatClock(firstCallAt) : null
  if (best.calls === 1) {
    return katieLine(
      first
        ? `Calls have been spread out, one an hour at most. The first came in at ${first}.`
        : 'Calls have been spread out, one an hour at most.',
    )
  }
  const s = `The busiest hour was ${formatHourLabel(best.hour)}, with ${count(best.calls, 'call')}.`
  return katieLine(first ? `${s} The first call came in at ${first}.` : s)
}

// ------------------------------------------------------------------ Latest calls (6.4)

export function sayLatestCalls(rows: CallRow[] | undefined, nameOf?: (row: CallRow) => string | undefined): string {
  const row = rows?.[0]
  if (!row) return ''
  const time = formatClock(row.started_at)
  const who = nameOf?.(row) ?? row.caller
  if (row.status === 'live') return katieLine(`A call from ${who} is on the line now. It started at ${time}.`)
  const head = `The last call came in at ${time} from ${who}.`
  const notes = count(row.notes, 'note')
  if (row.bookings > 0) {
    const booked = `It booked ${count(row.bookings, 'appointment')}`
    return katieLine(row.notes > 0 ? `${head} ${booked} and left ${notes} for the desk.` : `${head} ${booked}.`)
  }
  return katieLine(row.notes > 0 ? `${head} Nothing was booked, and it left ${notes} for the desk.` : `${head} Nothing was booked.`)
}

// ------------------------------------------------------------------ Callbacks waiting (6.5)

export function sayCallbacksWaiting(waiting: Note[]): string {
  const top = waiting[0]
  if (!top) return ''
  const prefix = `Start with ${displayIdentity(top.name, top.caller)} from ${formatClock(top.ts)}. `
  const reason = cleanNoteText(top.reason)
  const room = KATIE_MAX_CHARS - prefix.length
  return katieLine(prefix + (reason.length > room ? truncateAtWord(reason, room) : reason))
}
