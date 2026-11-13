// The demo day (mock=demo), materialized: the dataset in this folder (scenes.json, history.json,
// manifest.json, live-s36.txt; contract in README.md) turned into wire-shaped rows on the REAL
// calendar. Pure: no Vite APIs, no window, no clock reads (the caller passes the real time), so
// node can run it (node --experimental-strip-types) and the backend can re-run it on Reset.
//
// - Day 0 is today's date in the practice tz (America/New_York) at the moment of materializing;
//   every LocalStamp "<day> HH:MM:SS.mmm" becomes UNIX seconds by calendar arithmetic from
//   day 0 plus the wall clock in that tz (DST-safe). NOW is pinned to day 0 21:10.
// - Weekdays (decided 2026-10-21, the uniform shift). The dataset was written for a TUESDAY day 0.
//   Every weekday-relative token in every call moves by ONE business-day offset, the distance from
//   Tuesday to the real day 0: Tue 0, Wed +1, Thu +2, Fri +3, Mon -1 (the business day before);
//   a Saturday or Sunday day 0 uses Friday's (+3). A token past Friday wraps into the next week
//   (Fri +1 -> Mon) and a slot keeps its "Mon 8:20 AM" form. Because every token moves together,
//   the dataset keeps its own structure: no two bookings share a slot that did not share one as
//   written, "today" stays the call's day and "tomorrow" the next business day. What moves: slot
//   strings, the book / cancel tool data, booking and cancel events, booking and note reasons,
//   the confirmation bodies (built from the moved slots), and the transcripts: spoken dates
//   ("Thursday the twenty-third", "jueves veintitrés", from manifest.date_phrases) get the moved
//   weekday and the real day-of-month, and every bare weekday word moves ("Thursday at ten",
//   "Fridays are easiest", "el jueves").
// - What never moves: office hours ("open Monday through Thursday", "Fridays from seven thirty
//   until one", "hours on Fridays") and weekend days ("Saturdays"). The practice is open Mon-Fri 7:30-5.
//   "today" / "tomorrow" / "hoy" / "mañana" stay words, except a "tomorrow" whose moved day is not
//   the next calendar day (a Friday or Saturday day 0): it becomes the weekday's name,
//   "tomorrow, <date>," loses "tomorrow, " and "See you tomorrow" becomes "See you then". A call
//   whose days were all this week as written and all land in a later week says "next week" for
//   "this week" (and the reverse), so "What do you have this week?" still fits a Monday booking.
// - Dates: written day d (a business day) lands on the real business day with the same count of
//   business days from day 0 (from the Friday before, on a weekend day 0). Known limit: on a
//   weekend day 0 the same-day visits ("today at two") land on that Friday.
// - Bookings carry new_patient (the chart lookup before the booking found no record; for history
//   rows without a transcript, the call's archetype). Texts carry a demo body (Sms.text).

import type {
  Booking,
  CallEvent,
  DashEvent,
  Note,
  Sms,
  StatsResponse,
  StatusResponse,
  WireCallDetailResponse,
  WireCallRow,
} from '../../api/types'

export const DEMO_TZ = 'America/New_York'
export const DEMO_PRACTICE_SHORT = 'Harborline Orthodontics'

// ------------------------------------------------------------------ raw dataset shapes

/** A LocalStamp ("0 21:10:00.000") or, after materializing, UNIX seconds. */
type Raw = Record<string, unknown>

export interface RawDetail {
  call: Raw
  events: Raw[]
}

export interface RawScenes {
  contract: string
  now: string
  live: {
    call_id: string
    starts_at: string
    caller_full: string
    row: Raw
    detail: RawDetail
    bookings: Raw[]
    notes: Raw[]
    sms: Raw[]
  }
  caller_full: Record<string, string>
  calls: Raw[]
  bookings: Raw[]
  notes: Raw[]
  sms: Raw[]
  details: Record<string, RawDetail>
}

export interface RawHistory {
  contract: string
  detail_call_ids: string[]
  caller_full: Record<string, string>
  calls: Raw[]
  bookings: Raw[]
  notes: Raw[]
  sms: Raw[]
  details: Record<string, RawDetail>
}

export interface RawManifest {
  contract: string
  tz: string
  now: string
  status: Raw
  stats_at_now: Record<string, Raw>
  stats_after_live: Record<string, Raw>
  date_phrases: { call_id: string; event_id: number; phrase: string; days_from_day0: number }[]
}

// ------------------------------------------------------------------ time

export interface YMD {
  y: number
  m: number
  d: number
}

const partsFmt = new Map<string, Intl.DateTimeFormat>()
function fmtFor(tz: string): Intl.DateTimeFormat {
  let f = partsFmt.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFmt.set(tz, f)
  }
  return f
}

function zoned(epochMs: number, tz: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const p = fmtFor(tz).formatToParts(new Date(epochMs))
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0)
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour') % 24, mi: g('minute'), s: g('second') }
}

function tzOffsetMs(epochMs: number, tz: string): number {
  const z = zoned(epochMs, tz)
  return Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi, z.s) - Math.floor(epochMs / 1000) * 1000
}

/** Today's calendar date in `tz` at real time `epochMs`. */
export function todayIn(epochMs: number, tz = DEMO_TZ): YMD {
  const z = zoned(epochMs, tz)
  return { y: z.y, m: z.m, d: z.d }
}

const STAMP = /^(-?\d+) (\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/

/** README reference implementation: LocalStamp -> UNIX seconds (DST-safe). */
export function stampToEpoch(s: string, day0: YMD, tz = DEMO_TZ): number {
  const m = STAMP.exec(s)
  if (!m) throw new Error(`bad LocalStamp ${s}`)
  const date = new Date(Date.UTC(day0.y, day0.m - 1, day0.d + Number(m[1])))
  const wall = date.getTime() + (Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4])) * 1000
  const off = tzOffsetMs(wall, tz)
  let t = wall - off
  const off2 = tzOffsetMs(t, tz)
  if (off2 !== off) t = wall - off2
  return t / 1000
}

function stampDay(s: unknown): number {
  const m = typeof s === 'string' ? STAMP.exec(s) : null
  return m ? Number(m[1]) : 0
}

/** The calendar date `days` after day0, with its weekday (0 = Sunday). */
function addDays(day0: YMD, days: number): { y: number; m: number; d: number; dow: number } {
  const dt = new Date(Date.UTC(day0.y, day0.m - 1, day0.d + days))
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() }
}

const TIME_KEYS = new Set(['started_at', 'ended_at', 'ts', 'from', 'to', 'now', 'boot_at', 'last_call_at'])

/** Deep copy with every LocalStamp under a time key turned into UNIX seconds. */
function materializeTimes<T>(v: T, day0: YMD, tz: string): T {
  if (Array.isArray(v)) return v.map((x) => materializeTimes(x, day0, tz)) as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = TIME_KEYS.has(k) && typeof val === 'string' ? stampToEpoch(val, day0, tz) : materializeTimes(val, day0, tz)
    }
    return out as T
  }
  return v
}

// ------------------------------------------------------------------ spoken dates

const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ES_DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const EN_ORD = [
  '',
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth',
  'nineteenth', 'twentieth', 'twenty-first', 'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth',
  'twenty-sixth', 'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth', 'thirty-first',
]
const ES_NUM = [
  '',
  'primero', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete',
  'veintiocho', 'veintinueve', 'treinta', 'treinta y uno',
]

interface PhraseFix {
  from: string
  to: string
  /** The new date is not the day after the call: drop a "tomorrow, " in front. */
  dropTomorrow: boolean
}

const EN_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const EN_DAY_ALT = 'Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday'
const SHORT_ALT = 'Sun|Mon|Tue|Wed|Thu|Fri|Sat'
const ES_DAY_ALT = 'domingo|lunes|martes|miércoles|jueves|viernes|sábado'
/**
 * Every weekday token the data uses: full English (plural "Fridays" too), the slot form ("Thu")
 * and Spanish ("los viernes" is the same word). Full names first so "Monday" never matches as "Mon".
 */
const DAY_TOKEN = new RegExp(
  `\\b(${EN_DAY_ALT})(s?)\\b|\\b(${SHORT_ALT})\\b|(?<![\\p{L}])(${ES_DAY_ALT})(s?)(?![\\p{L}])`,
  'gu',
)
/** A slot: "Wed 8:20 AM". */
const SLOT = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (\d{1,2}):(\d{2}) ?([AP]M)$/
const EN_RANGE_TAIL = `(?: ?(?:-|–|through|thru|to) ?(?:${EN_DAY_ALT})s?)?`
/**
 * Office hours never move: a range ("Monday through Thursday", "lunes a jueves"), "open / closed /
 * hours (on) Fridays", "Fridays from seven thirty until one", "Fridays we close at one".
 */
const HOURS = new RegExp(
  [
    `\\b(?:${EN_DAY_ALT}|${SHORT_ALT}) ?(?:-|–|through|thru) ?(?:${EN_DAY_ALT}|${SHORT_ALT})\\b`,
    `\\b(?:open|closed?|hours)(?: on| from)? (?:${EN_DAY_ALT})s?\\b${EN_RANGE_TAIL}`,
    `\\b(?:${EN_DAY_ALT})s? (?:from [^.,;?!—]*? (?:until|till|to)\\b|we(?:'re| are)? (?:open|close|closed)\\b)`,
    `(?<![\\p{L}])(?:${ES_DAY_ALT}) a (?:${ES_DAY_ALT})(?![\\p{L}])`,
    `(?<![\\p{L}])(?:abrimos|abiert[oa]s?|cerramos|cerrad[oa]s?|horario)(?: los| el)? (?:${ES_DAY_ALT})s?(?![\\p{L}])`,
  ].join('|'),
  'gu',
)

/** 0 = Sunday, for any token form; -1 when it is not a weekday. */
function dowOf(token: string): number {
  for (const list of [EN_DAYS, EN_SHORT, ES_DAYS]) {
    const i = list.indexOf(token)
    if (i >= 0) return i
  }
  return -1
}

/** The same weekday `dow` in the form `token` was written in (full, short or Spanish). */
function tokenFor(token: string, dow: number): string {
  if (EN_DAYS.includes(token)) return EN_DAYS[dow] ?? token
  if (EN_SHORT.includes(token)) return EN_SHORT[dow] ?? token
  return ES_DAYS[dow] ?? token
}

const SPANISH_PHRASE = /^(domingo|lunes|martes|miércoles|jueves|viernes|sábado) [\p{L} ]+$/u
const ENGLISH_PHRASE = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) the [a-z-]+$/

/** "Thursday the twenty-third" / "jueves veintitrés" for the real date `days` after day 0. */
function phraseFor(spanish: boolean, day0: YMD, days: number): string {
  const t = addDays(day0, days)
  return spanish ? `${ES_DAYS[t.dow]} ${ES_NUM[t.d]}` : `${EN_DAYS[t.dow]} the ${EN_ORD[t.d]}`
}

const isWeekend = (dow: number) => dow === 0 || dow === 6

/**
 * Business days every written weekday moves for a real day 0 on weekday `dow0` (0 = Sunday):
 * Tue 0, Wed +1, Thu +2, Fri +3, Mon -1; Saturday and Sunday use Friday's.
 */
export function weekdayOffset(dow0: number): number {
  return [3, -1, 0, 1, 2, 3, 3][dow0] ?? 0
}

/** Weekday `dow` (0 = Sunday) moved `k` business days, wrapping (Fri +1 -> Mon). Weekends stay. */
export function shiftWeekday(dow: number, k: number): number {
  return isWeekend(dow) ? dow : ((((dow - 1 + k) % 5) + 5) % 5) + 1
}

/** How one call's words land on the real calendar. Day numbers are offsets from day 0. */
interface CallPlan {
  callDay: number
  /** The call's "tomorrow" lands on a day that is not the next calendar day: its weekday's name. */
  tomorrowWord?: string
  /** Every day the call names was this week as written and lands in a later week. */
  weekSwap: boolean
}

/** The written calendar (day 0 a Tuesday) against the real one, and the one uniform shift. */
function makeCalendar(day0: YMD) {
  const writtenDow = (d: number) => (((2 + d) % 7) + 7) % 7
  const realDow = (d: number) => addDays(day0, d).dow
  const dow0 = realDow(0)
  const offset = weekdayOffset(dow0)
  /** The business day the written Tuesday lands on: day 0, or the Friday before a weekend day 0. */
  const anchor = dow0 === 6 ? -1 : dow0 === 0 ? -2 : 0
  /** Business days from written day 0 to written day `d` (negative before it). */
  const writtenBiz = (d: number) => {
    let n = 0
    for (let x = 1; x <= d; x++) if (!isWeekend(writtenDow(x))) n++
    for (let x = d; x < 0; x++) if (!isWeekend(writtenDow(x))) n--
    return n
  }
  /** The real day `b` business days from the anchor. */
  const realOfBiz = (b: number) => {
    let d = anchor
    for (let n = b; n > 0; ) if (!isWeekend(realDow(++d))) n--
    for (let n = b; n < 0; ) if (!isWeekend(realDow(--d))) n++
    return d
  }
  /** The real day a written business day lands on: the same count of business days from day 0. */
  const land = (d: number) => (isWeekend(writtenDow(d)) ? d : realOfBiz(writtenBiz(d)))
  /** Days after the call a written slot on weekday `dow` meant (0 = same day, when it is later). */
  const daysAhead = (callDay: number, dow: number, startMin: number, slotMin: number) => {
    const delta = (dow - writtenDow(callDay) + 7) % 7
    if (delta !== 0) return delta
    return slotMin > startMin ? 0 : 7
  }
  /** Monday-based week numbers, written and real, relative to day 0's week. */
  const writtenWeek = (d: number) => Math.floor((d + 1) / 7)
  const realWeek = (d: number) => Math.floor((d + ((dow0 + 6) % 7)) / 7)
  return { writtenDow, realDow, offset, land, daysAhead, writtenWeek, realWeek }
}

function slotMinutes(h: string, m: string, ap: string): number {
  return ((Number(h) % 12) + (ap === 'PM' ? 12 : 0)) * 60 + Number(m)
}

function stampMinutes(s: unknown): number {
  const m = typeof s === 'string' ? STAMP.exec(s) : null
  return m ? Number(m[2]) * 60 + Number(m[3]) : 0
}

const WEEK_EN = /\b([Tt]his|[Nn]ext) week\b/g
const WEEK_ES = /(?<![\p{L}])(esta semana|la próxima semana)(?![\p{L}])/gu

/**
 * Rewrites one string of a call: office hours are held as written, spoken dates (`fixes`) get
 * their real date, every other weekday token moves `offset` business days, then the call's
 * "tomorrow" and "this week" follow (see the header).
 */
function rewriteText(text: string, plan: CallPlan | undefined, fixes: readonly PhraseFix[], offset: number): string {
  const held: string[] = []
  const hold = (v: string) => {
    held.push(v)
    return `\u0000${held.length - 1}\u0000`
  }
  let t = text.replace(HOURS, (m) => hold(m))
  for (const fix of fixes) {
    if (!t.includes(fix.from)) continue
    if (fix.dropTomorrow) {
      // "tomorrow, Wednesday the twenty-second, at ten" -> "Monday the second at ten"
      t = t.split(`tomorrow, ${fix.from},`).join(hold(fix.to))
      t = t.split(`tomorrow, ${fix.from}`).join(hold(fix.to))
    }
    t = t.split(fix.from).join(hold(fix.to))
  }
  if (offset !== 0) {
    t = t.replace(DAY_TOKEN, (m, en?: string, enS?: string, short?: string, es?: string, esS?: string) => {
      const base = en ?? short ?? es ?? ''
      const dow = dowOf(base)
      if (dow < 0 || isWeekend(dow)) return m
      return hold(tokenFor(base, shiftWeekday(dow, offset)) + (enS ?? esS ?? ''))
    })
  }
  if (plan?.tomorrowWord) {
    t = t.replace(/\bSee you tomorrow\b/g, 'See you then')
    t = t.replace(/\btomorrow\b/g, plan.tomorrowWord).replace(/\bTomorrow\b/g, plan.tomorrowWord)
  }
  if (plan?.weekSwap) {
    const swap: Record<string, string> = { this: 'next', next: 'this', This: 'Next', Next: 'This' }
    t = t.replace(WEEK_EN, (_, w: string) => `${swap[w] ?? w} week`)
    t = t.replace(WEEK_ES, (m) => (m === 'esta semana' ? 'la próxima semana' : 'esta semana'))
  }
  return t.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)] ?? '')
}

// ------------------------------------------------------------------ helpers

const NEW_PATIENT_ARCHETYPES = new Set(['new_consult', 'insurance_then_book', 'sibling'])

function scenarioOf(row: Raw): string {
  const s = typeof row.summary === 'string' ? row.summary : ''
  return /scenario=(\S+)/.exec(s)?.[1] ?? ''
}

const ES_SHORT: Record<string, string> = {
  Mon: 'lunes', Tue: 'martes', Wed: 'miércoles', Thu: 'jueves', Fri: 'viernes', Sat: 'sábado', Sun: 'domingo',
}

function slotEs(slot: string): string {
  const m = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (.+)$/.exec(slot)
  return m && m[1] && m[2] ? `el ${ES_SHORT[m[1]]} ${m[2]}` : slot
}

/** The confirmation body for a call's bookings. Demo only. */
export function confirmationText(bookings: Pick<Booking, 'name' | 'slot'>[], spanish: boolean): string {
  const [a, b] = bookings
  if (!a) return spanish ? `${DEMO_PRACTICE_SHORT}: su cita está reservada. Responda SÍ para confirmar.` : `${DEMO_PRACTICE_SHORT}: your visit is booked. Reply YES to confirm.`
  if (spanish) {
    const who = b ? `${a.name} tiene cita ${slotEs(a.slot)} y ${b.name} ${slotEs(b.slot)}` : `${a.name} tiene cita ${slotEs(a.slot)}`
    return `${DEMO_PRACTICE_SHORT}: ${who}. Responda SÍ para confirmar.`
  }
  const who = b ? `${a.name} is booked ${a.slot} and ${b.name} ${b.slot}` : `${a.name} is booked ${a.slot}`
  return `${DEMO_PRACTICE_SHORT}: ${who}. Reply YES to confirm.`
}

function replyText(chars: number, spanish: boolean): string {
  return spanish && chars === 2 ? 'Sí' : 'Yes'
}

const byTsDesc = <T extends { ts: number; id: number }>(a: T, b: T) => b.ts - a.ts || b.id - a.id

// ------------------------------------------------------------------ the materialized day

export interface LiveStep {
  /** Seconds after the call started (live-s36.txt `ts`). */
  offset: number
  /** The detail event id this step is (index-aligned with live.detail.events). */
  id: number
  event: DashEvent
}

export interface DemoLive {
  callId: string
  callerFull: string
  /** The finished row (times are replaced by the replay's). */
  row: WireCallRow
  /** The full detail (event ts replaced by the replay's). */
  detail: WireCallDetailResponse
  /** By event id: the row each booking / note / sms event adds. */
  bookings: Map<number, Booking>
  notes: Map<number, Note>
  sms: Map<number, Sms>
  steps: LiveStep[]
}

export interface DemoDay {
  day0: YMD
  tz: string
  /** NOW: day 0 21:10 in the practice tz. */
  nowSec: number
  status: StatusResponse
  /** Day 0 + history, newest first. */
  calls: WireCallRow[]
  bookings: Booking[]
  notes: Note[]
  sms: Sms[]
  details: Map<string, WireCallDetailResponse>
  callerFull: Map<string, string>
  live: DemoLive
  /** UNIX seconds of local midnight `n` days before day 0 (n = 0: day 0's midnight). */
  midnight: (daysBack: number) => number
}

/** live-s36.txt -> [{ ts, kind, data, ... }] in file order. */
export function parseSse(raw: string): Raw[] {
  const out: Raw[] = []
  for (const block of raw.split(/\r?\n\r?\n/)) {
    let kind = ''
    let data = ''
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) kind = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (kind && data) out.push({ ...(JSON.parse(data) as Raw), kind })
  }
  return out
}

/**
 * Builds the demo day on the real calendar. `realNowMs` is the real time (Date.now()), used
 * only to pick day 0's date.
 */
export function materializeDemo(
  scenes: RawScenes,
  history: RawHistory,
  manifest: RawManifest,
  liveText: string,
  realNowMs: number,
): DemoDay {
  const tz = manifest.tz || DEMO_TZ
  const day0 = todayIn(realNowMs, tz)
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

  // Raw copies we may edit (date phrases) before the times are materialized.
  const sc = clone(scenes)
  const hi = clone(history)

  // ---- weekdays and spoken dates (see the header)
  const cal = makeCalendar(day0)
  const rowsRaw: Raw[] = [...sc.calls, ...hi.calls, sc.live.row]
  const plans = new Map<string, CallPlan>()
  const startMin = new Map<string, number>()
  for (const r of rowsRaw) {
    const callDay = stampDay(r.started_at)
    const plan: CallPlan = { callDay, weekSwap: false }
    // The call's "tomorrow" (the written next day, when that is a business day) lands where?
    if (!isWeekend(cal.writtenDow(callDay + 1))) {
      const next = cal.land(callDay + 1)
      if (next !== callDay + 1) plan.tomorrowWord = EN_DAYS[cal.realDow(next)]
    }
    plans.set(String(r.call_id), plan)
    startMin.set(String(r.call_id), stampMinutes(r.started_at))
  }
  const callsWithDetail: [string, RawDetail][] = [
    ...Object.entries(sc.details),
    ...Object.entries(hi.details),
    [sc.live.call_id, sc.live.detail],
  ]
  // Every string field that can name a day, per call.
  const TEXT_KEYS = ['text', 'reason', 'slot', 'first_line'] as const
  const owned: { callId: string; obj: Raw; eventId?: number }[] = []
  for (const r of rowsRaw) owned.push({ callId: String(r.call_id), obj: r })
  for (const list of [sc.bookings, sc.notes, sc.sms, hi.bookings, hi.notes, hi.sms, sc.live.bookings, sc.live.notes, sc.live.sms]) {
    for (const x of list) owned.push({ callId: String(x.call_id), obj: x })
  }
  for (const [callId, d] of callsWithDetail) {
    for (const e of d.events) {
      if (e.data && typeof e.data === 'object') owned.push({ callId, obj: e.data as Raw, eventId: Number(e.id) })
    }
  }

  // "this week" <-> "next week": the written days a call with a transcript names (its bookings,
  // else its spoken dates) were all in the call's own week and all land in a later one.
  const pushDay = (m: Map<string, number[]>, id: string, d: number) => m.set(id, [...(m.get(id) ?? []), d])
  const bookedDays = new Map<string, number[]>()
  for (const b of [...sc.bookings, ...hi.bookings, ...sc.live.bookings]) {
    const id = String(b.call_id)
    const plan = plans.get(id)
    const m = SLOT.exec(String(b.slot))
    if (!plan || !m) continue
    const ahead = cal.daysAhead(plan.callDay, dowOf(m[1] as string), startMin.get(id) ?? 0, slotMinutes(m[2] as string, m[3] as string, m[4] as string))
    pushDay(bookedDays, id, plan.callDay + ahead)
  }
  const spokenDays = new Map<string, number[]>()
  for (const p of manifest.date_phrases) pushDay(spokenDays, p.call_id, p.days_from_day0)
  for (const [callId] of callsWithDetail) {
    const plan = plans.get(callId)
    const days = bookedDays.get(callId) ?? spokenDays.get(callId)
    if (!plan || !days) continue
    plan.weekSwap =
      days.every((d) => cal.writtenWeek(d) === cal.writtenWeek(plan.callDay)) &&
      days.every((d) => cal.realWeek(cal.land(d)) > cal.realWeek(plan.callDay))
  }

  // Spoken dates: the event they are in -> the rewrite (moved weekday, real day-of-month).
  const fixesByEvent = new Map<number, PhraseFix[]>()
  for (const p of manifest.date_phrases) {
    const plan = plans.get(p.call_id)
    const en = ENGLISH_PHRASE.exec(p.phrase)
    const es = en ? null : SPANISH_PHRASE.exec(p.phrase)
    if (!plan || !(en || es)) continue
    const day = cal.land(p.days_from_day0)
    const fix: PhraseFix = { from: p.phrase, to: phraseFor(!!es, day0, day), dropTomorrow: day !== plan.callDay + 1 }
    const list = fixesByEvent.get(p.event_id) ?? []
    list.push(fix)
    fixesByEvent.set(p.event_id, list)
  }
  const rewriteObj = (callId: string, obj: Raw, eventId?: number) => {
    const plan = plans.get(callId)
    const fixes = eventId !== undefined ? (fixesByEvent.get(eventId) ?? []) : []
    for (const key of TEXT_KEYS) {
      const t = obj[key]
      if (typeof t === 'string') obj[key] = rewriteText(t, plan, fixes, cal.offset)
    }
  }
  for (const { callId, obj, eventId } of owned) rewriteObj(callId, obj, eventId)

  // ---- times
  const nowSec = stampToEpoch(manifest.now, day0, tz)
  const M = <T>(v: T): T => materializeTimes(v, day0, tz)

  const details = new Map<string, WireCallDetailResponse>()
  for (const [id, d] of [...Object.entries(sc.details), ...Object.entries(hi.details)]) {
    details.set(id, M(d) as unknown as WireCallDetailResponse)
  }
  const callerFull = new Map<string, string>([
    ...Object.entries(hi.caller_full),
    ...Object.entries(sc.caller_full),
    [sc.live.call_id, sc.live.caller_full],
  ])

  const rows = [...sc.calls, ...hi.calls]
  const scenarioById = new Map<string, string>()
  const languageById = new Map<string, string>()
  for (const r of [...rows, sc.live.row]) {
    scenarioById.set(String(r.call_id), scenarioOf(r))
    languageById.set(String(r.call_id), String(r.language ?? 'en'))
  }
  const calls = (M(rows) as unknown as WireCallRow[]).sort((a, b) => b.started_at - a.started_at)

  // ---- new_patient
  const lookupVerdict = (callId: string, bookingId: number, events: { id: number; kind: string; data: unknown }[]) => {
    let verdict: boolean | undefined
    for (const e of events) {
      if (e.id === bookingId) break
      const d = e.data as { name?: string; verified?: boolean }
      if (e.kind === 'tool' && d.name === 'lookup' && typeof d.verified === 'boolean') verdict = !d.verified
    }
    if (verdict !== undefined) return verdict
    return NEW_PATIENT_ARCHETYPES.has(scenarioById.get(callId) ?? '') || /new_patient/.test(scenarioById.get(callId) ?? '')
  }
  const liveDetailRaw = sc.live.detail
  const withNewPatient = (b: Booking): Booking => {
    const det = details.get(b.call_id) ?? (b.call_id === sc.live.call_id ? (liveDetailRaw as unknown as WireCallDetailResponse) : undefined)
    const np = det
      ? lookupVerdict(b.call_id, b.id, det.events as { id: number; kind: string; data: unknown }[])
      : NEW_PATIENT_ARCHETYPES.has(scenarioById.get(b.call_id) ?? '')
    return { ...b, new_patient: np }
  }

  const bookings = (M([...sc.bookings, ...hi.bookings]) as unknown as Booking[]).map(withNewPatient).sort(byTsDesc)
  const notes = (M([...sc.notes, ...hi.notes]) as unknown as Note[]).sort(byTsDesc)

  // ---- sms bodies
  const bookingsByCall = new Map<string, Booking[]>()
  for (const b of [...bookings].sort((x, y) => x.ts - y.ts)) {
    const list = bookingsByCall.get(b.call_id) ?? []
    list.push(b)
    bookingsByCall.set(b.call_id, list)
  }
  const withText = (s: Sms, callBookings: Booking[]): Sms => {
    const spanish = languageById.get(s.call_id) === 'es'
    const text =
      s.direction === 'out' && s.kind === 'confirmation'
        ? confirmationText(callBookings, spanish)
        : s.direction === 'in' && s.kind === 'yes'
          ? replyText(s.chars, spanish)
          : undefined
    return text === undefined ? s : { ...s, text, chars: text.length }
  }
  const sms = (M([...sc.sms, ...hi.sms]) as unknown as Sms[])
    .map((s) => withText(s, bookingsByCall.get(s.call_id) ?? []))
    .sort(byTsDesc)

  // ---- status
  const status = M(manifest.status) as unknown as StatusResponse

  // ---- the live showpiece
  const liveDetail = M(sc.live.detail) as unknown as WireCallDetailResponse
  const liveBookings = (M(sc.live.bookings) as unknown as Booking[]).map(withNewPatient)
  const liveNotes = M(sc.live.notes) as unknown as Note[]
  const liveSms = (M(sc.live.sms) as unknown as Sms[]).map((s) => withText(s, liveBookings))
  const parsed = parseSse(liveText)
  const steps: LiveStep[] = parsed.map((raw, i) => {
    const det = liveDetail.events[i] as CallEvent | undefined
    if (!det || det.kind !== raw.kind) throw new Error('live-s36.txt does not match live.detail')
    // The stream text gets the same rewrite as the detail.
    const data = clone(raw.data) as Raw
    rewriteObj(sc.live.call_id, data, det.id)
    const event = { ts: 0, call_id: sc.live.call_id, kind: raw.kind, turn: Number(raw.turn ?? 0), data } as unknown as DashEvent
    return { offset: Number(raw.ts), id: det.id, event }
  })
  const live: DemoLive = {
    callId: sc.live.call_id,
    callerFull: sc.live.caller_full,
    row: M(sc.live.row) as unknown as WireCallRow,
    detail: liveDetail,
    bookings: new Map(liveBookings.map((b) => [b.id, b])),
    notes: new Map(liveNotes.map((n) => [n.id, n])),
    sms: new Map(liveSms.map((s) => [s.id, s])),
    steps,
  }

  return {
    day0,
    tz,
    nowSec,
    status,
    calls,
    bookings,
    notes,
    sms,
    details,
    callerFull,
    live,
    midnight: (daysBack: number) => stampToEpoch(`${-daysBack} 00:00:00.000`, day0, tz),
  }
}

// ------------------------------------------------------------------ stats from rows

const hourFmt = new Map<string, Intl.DateTimeFormat>()
function hourIn(tsSec: number, tz: string): number {
  let f = hourFmt.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit' })
    hourFmt.set(tz, f)
  }
  return Number(f.format(new Date(tsSec * 1000))) % 24
}

/**
 * /stats over [from, to]: calls by start time, bookings / notes / texts by their ts. `callbacks`
 * = notes that are not fyi (urgent included), `booked_calls` = calls with disposition
 * phone-booked, `avg_duration_s` over calls that have a duration, 1 decimal.
 */
export function computeStats(
  input: { calls: WireCallRow[]; bookings: Booking[]; notes: Note[]; sms: Sms[] },
  range: { from: number; to: number; days: number; tz: string },
): StatsResponse {
  const inRange = (t: number) => t >= range.from && t <= range.to
  const calls = input.calls.filter((c) => inRange(c.started_at))
  const notes = input.notes.filter((n) => inRange(n.ts))
  const sms = input.sms.filter((s) => inRange(s.ts))
  const by_hour = Array.from({ length: 24 }, (_, hour) => ({ hour, calls: 0, booked: 0 }))
  const dispositions: Record<string, number> = {}
  const languages: Record<string, number> = {}
  let durSum = 0
  let durN = 0
  for (const c of calls) {
    const b = by_hour[hourIn(c.started_at, range.tz)]
    if (b) {
      b.calls += 1
      if (c.disposition === 'phone-booked') b.booked += 1
    }
    dispositions[c.disposition] = (dispositions[c.disposition] ?? 0) + 1
    languages[c.language] = (languages[c.language] ?? 0) + 1
    if (typeof c.duration_s === 'number') {
      durSum += c.duration_s
      durN += 1
    }
  }
  return {
    range: { ...range },
    calls: calls.length,
    booked_calls: calls.filter((c) => c.disposition === 'phone-booked').length,
    bookings: input.bookings.filter((b) => inRange(b.ts)).length,
    callbacks: notes.filter((n) => !n.fyi).length,
    urgent: notes.filter((n) => n.urgent).length,
    sms_out: sms.filter((s) => s.direction === 'out').length,
    sms_in: sms.filter((s) => s.direction === 'in').length,
    avg_duration_s: durN ? Math.round((durSum / durN) * 10) / 10 : 0,
    by_hour,
    dispositions,
    languages,
  }
}
