// The practice day the Overview draws against (P3, P4). The API has no office hours yet, so this
// is one constant: open 7 AM, close 5 PM, Monday to Friday. The chart labels them as landmarks and
// the Calls answered sub-line counts calls outside them ("N after hours") only when no Spanish
// count takes that place. Pure module.

import { getPracticeTz } from '../../lib'

export const OPEN_HOUR = 7
export const CLOSE_HOUR = 17

const WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])

function weekdayIn(tsSec: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(tsSec * 1000))
}

function hourIn(tsSec: number, tz: string): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit' }).format(
    new Date(tsSec * 1000),
  )
  return Number(h) % 24
}

/** True when the call started outside OPEN_HOUR..CLOSE_HOUR on a weekday, or on a weekend. */
export function isAfterHours(startedAt: number, tz: string = getPracticeTz()): boolean {
  if (!WEEKDAYS.has(weekdayIn(startedAt, tz))) return true
  const h = hourIn(startedAt, tz)
  return h < OPEN_HOUR || h >= CLOSE_HOUR
}
