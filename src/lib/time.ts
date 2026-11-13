// Time formatting in the practice timezone (DESIGN.md 6 "Formats used everywhere",
// conflicts 14, 21, 32). Every function takes UNIX seconds and an IANA timezone; the
// timezone defaults to the practice tz (stats.range.tz, America/New_York until known).
// Pure module: node runs it in scripts/check-lib.mjs.

import { nowSec } from './clock.ts'

export const DEFAULT_TZ = 'America/New_York'

let practiceTz = DEFAULT_TZ

/** The practice timezone as last reported by `stats.range.tz`. */
export function getPracticeTz(): string {
  return practiceTz
}

/** Called by the stats query when it loads. Ignores empty or invalid zones. */
export function setPracticeTz(tz: string | null | undefined): void {
  if (!tz || tz === practiceTz) return
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    practiceTz = tz
  } catch {
    /* keep the previous zone */
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string, key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = tz + '|' + key
  let f = fmtCache.get(k)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz })
    fmtCache.set(k, f)
  }
  return f
}

/** ICU writes U+202F (narrow no-break space) before AM/PM; the UI uses a plain space. */
function clean(s: string): string {
  return s.replace(/[  ]/g, ' ')
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function zonedParts(tsSec: number, tz: string): ZonedParts {
  const f = fmt(tz, 'parts', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  })
  const out: Record<string, number> = {}
  for (const p of f.formatToParts(new Date(tsSec * 1000))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return {
    year: out.year ?? 1970,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  }
}

/** Local calendar day as a day count since 1970-01-01 (for day differences). */
export function localDayNumber(tsSec: number, tz: string = practiceTz): number {
  const p = zonedParts(tsSec, tz)
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000)
}

/** Stable key for grouping by local day, e.g. "2026-10-12". */
export function localDayKey(tsSec: number, tz: string = practiceTz): string {
  const p = zonedParts(tsSec, tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Local hour (0-23) and minute of a timestamp. */
export function localHourMinute(tsSec: number, tz: string = practiceTz): { hour: number; minute: number } {
  const p = zonedParts(tsSec, tz)
  return { hour: p.hour, minute: p.minute }
}

function tzOffsetSec(tsSec: number, tz: string): number {
  const p = zonedParts(tsSec, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000
  return asUtc - Math.floor(tsSec)
}

/**
 * UNIX seconds of a wall-clock time (month 1-12) in `tz`. DST-safe: the offset is resolved at
 * the resulting instant. A time the clocks skipped (2:30 AM on the spring-forward morning) takes
 * the offset in force before the change, so it lands after the gap (3:30 AM), as the record's
 * own reading does; a time that happens twice (1:30 AM on the fall-back morning) is its first.
 */
export function zonedWallToEpoch(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  tz: string = practiceTz,
): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second) / 1000
  const o1 = tzOffsetSec(wall, tz)
  const t1 = wall - o1
  const o2 = tzOffsetSec(t1, tz)
  if (o2 === o1) return t1
  const t2 = wall - o2
  if (tzOffsetSec(t2, tz) === o2) return t2
  return wall - tzOffsetSec(Math.min(t1, t2), tz)
}

/**
 * UNIX seconds of local midnight of the day containing `tsSec`, `daysBack` days earlier.
 * DST-safe: the offset is resolved at the resulting instant.
 */
export function zonedMidnight(tsSec: number, tz: string = practiceTz, daysBack = 0): number {
  const p = zonedParts(tsSec, tz)
  return zonedWallToEpoch(p.year, p.month, p.day - daysBack, 0, 0, 0, tz)
}

/** "5:35 PM" */
export function formatClock(tsSec: number, tz: string = practiceTz): string {
  return clean(fmt(tz, 'clock', { hour: 'numeric', minute: '2-digit' }).format(new Date(tsSec * 1000)))
}

/**
 * Relative time used in every list: today "5:35 PM", yesterday "Yesterday 5:35 PM",
 * within 6 days "Sat 5:35 PM", older "Oct 1, 5:35 PM".
 */
export function formatWhen(tsSec: number, tz: string = practiceTz, now: number = nowSec()): string {
  const diff = localDayNumber(now, tz) - localDayNumber(tsSec, tz)
  const clock = formatClock(tsSec, tz)
  if (diff === 0) return clock
  if (diff === 1) return `Yesterday ${clock}`
  if (diff > 1 && diff <= 6) return `${fmt(tz, 'wd', { weekday: 'short' }).format(new Date(tsSec * 1000))} ${clock}`
  return `${clean(fmt(tz, 'md', { month: 'short', day: 'numeric' }).format(new Date(tsSec * 1000)))}, ${clock}`
}

/** Group header for a local day: "Today" / "Yesterday" / "Sat, Oct 10". */
export function formatDayHeader(tsSec: number, tz: string = practiceTz, now: number = nowSec()): string {
  const diff = localDayNumber(now, tz) - localDayNumber(tsSec, tz)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return formatDateShort(tsSec, tz)
}

/** "Mon, Oct 12" (drawer header line 2). */
export function formatDateShort(tsSec: number, tz: string = practiceTz): string {
  return clean(
    fmt(tz, 'wmd', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(tsSec * 1000)),
  )
}

/** Overview top bar: "Today, Monday, October 12". */
export function formatTodayLong(now: number = nowSec(), tz: string = practiceTz): string {
  return `Today, ${clean(
    fmt(tz, 'long', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(now * 1000)),
  )}`
}

/**
 * Overview top bar below 1440 wide: "Monday, October 12". About 50 px shorter than the long
 * form, so at 1280 the date ends before Katie's Line-tile spot (RV-2).
 */
export function formatTodayShort(now: number = nowSec(), tz: string = practiceTz): string {
  return clean(fmt(tz, 'long', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(now * 1000)))
}

/** Chart and Katie hour labels: 0 -> "12 AM", 15 -> "3 PM". */
export function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * Duration per conflict 14: Math.round, then m:ss, or h:mm:ss from one hour.
 * 54.5 -> "0:55", 123 -> "2:03". null/NaN -> "".
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return ''
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Elapsed time of a live call, for the 1 s tickers. */
export function formatElapsed(startedAtSec: number, now: number = nowSec()): string {
  return formatDuration(Math.max(0, Math.floor(now - startedAtSec)))
}

const langCache = new Map<string, string>()
/** ISO code to English language name (conflict 32): "en" -> "English". "" -> "". */
export function languageName(code: string | null | undefined): string {
  if (!code) return ''
  const hit = langCache.get(code)
  if (hit) return hit
  let name = code
  try {
    name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    /* unknown code: show it as given */
  }
  langCache.set(code, name)
  return name
}

const DAY_NAMES: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
}

/** Katie's slot form: "Mon 3:20 PM" -> "Monday at 3:20 PM"; anything else as given. */
export function expandSlot(slot: string): string {
  const m = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (.+)$/.exec(slot.trim())
  if (!m || !m[1] || !m[2]) return slot
  return `${DAY_NAMES[m[1]]} at ${m[2]}`
}
