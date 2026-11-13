// What the Leads page says (voice-agent/handoff/LEADS-PAGE-SPEC-2026-11-04.md): the filter, the
// chip per stage, the quote in one line, the exam line, the last touch, a lead's history in plain
// sentences, the taps a stage offers and Katie's sentence. Also the one place that reads the
// fields RESERVED for the next backend pieces (nextStep, below).
// Pure module (explicit .ts imports, no React): node runs it in scripts/check-lib.mjs.

import type {
  LeadAction,
  LeadEvent,
  LeadQuote,
  LeadQuoteOption,
  LeadRow,
  LeadStage,
  LeadsFilter,
  LeadsSummary,
} from '../../api/types.ts'
import { count } from '../../lib/katie.ts'
import { capitalizeFirst } from '../../lib/text.ts'
import { formatClock, formatWhen, getPracticeTz, localDayNumber, zonedWallToEpoch } from '../../lib/time.ts'
import { nowSec } from '../../lib/clock.ts'

export const DASH = '—'

// ------------------------------------------------------------------ filter

export interface LeadFilterOption {
  value: LeadsFilter
  label: string
}

/** The select's choices, in order. "open" is the page's default and stays out of the URL. */
export const LEAD_FILTERS: readonly LeadFilterOption[] = [
  { value: 'open', label: 'Open leads' },
  { value: 'missed_consult', label: 'Missed consult' },
  { value: 'never_booked', label: 'Never booked' },
  { value: 'consult_booked', label: 'Consult booked' },
  { value: 'consult_happened', label: 'Came in, not started' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'started', label: 'Started' },
  { value: 'paused', label: 'Paused' },
  { value: 'lost', label: 'Lost' },
  { value: 'all', label: 'All leads' },
]

export const DEFAULT_LEADS_FILTER: LeadsFilter = 'open'

/** ?show=<filter>. Anything unknown is the default; the stage "consult_missed" is the pool. */
export function parseLeadsFilter(search: string): LeadsFilter {
  const v = new URLSearchParams(search).get('show')
  if (v === 'consult_missed') return 'missed_consult'
  return LEAD_FILTERS.some((o) => o.value === v) ? (v as LeadsFilter) : DEFAULT_LEADS_FILTER
}

/** The page's search string with the filter set ("" for the default). */
export function leadsFilterSearch(search: string, next: LeadsFilter): string {
  const params = new URLSearchParams(search)
  if (next === DEFAULT_LEADS_FILTER) params.delete('show')
  else params.set('show', next)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function leadFilterLabel(filter: LeadsFilter): string {
  return LEAD_FILTERS.find((o) => o.value === filter)?.label ?? 'Leads'
}

// ------------------------------------------------------------------ the four counts

export interface LeadCount {
  key: 'missed_consult' | 'never_booked' | 'consult_booked' | 'consult_happened'
  /** The filter a tap selects. */
  filter: LeadsFilter
  label: string
  /** One line under the number saying what the count means. */
  hint: string
  /** undefined while the summary is not in (or the lead record is off). */
  value: number | undefined
  /** Pool A: the count the desk works first. */
  accent: boolean
}

/** The header strip, in the spec's order. A summary of {} (lead record off) gives no numbers. */
export function leadCounts(summary: LeadsSummary | undefined): LeadCount[] {
  const stage = (s: LeadStage) => (summary?.by_stage ? (summary.by_stage[s] ?? 0) : undefined)
  return [
    {
      key: 'missed_consult',
      filter: 'missed_consult',
      label: 'Missed consult',
      hint: 'No-show or cancelled',
      value: summary?.missed_consult,
      accent: true,
    },
    {
      key: 'never_booked',
      filter: 'never_booked',
      label: 'Never booked',
      hint: 'Quoted a week ago or more',
      value: summary?.never_booked,
      accent: false,
    },
    { key: 'consult_booked', filter: 'consult_booked', label: 'Booked', hint: 'Exam on the schedule', value: stage('consult_booked'), accent: false },
    {
      key: 'consult_happened',
      filter: 'consult_happened',
      label: 'Came in, not started',
      hint: 'Had the exam',
      value: stage('consult_happened'),
      accent: false,
    },
  ]
}

// ------------------------------------------------------------------ stage

export type LeadChipTone = 'neutral' | 'callback' | 'missed' | 'live' | 'booked'

export interface LeadChip {
  label: string
  tone: LeadChipTone
}

const STAGE_CHIPS: Record<LeadStage, LeadChip> = {
  quoted: { label: 'Quoted', tone: 'neutral' },
  consult_booked: { label: 'Consult booked', tone: 'callback' },
  consult_missed: { label: 'Missed consult', tone: 'missed' },
  consult_happened: { label: 'Came in', tone: 'live' },
  started: { label: 'Started', tone: 'booked' },
  lost: { label: 'Lost', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'neutral' },
}

/** An unknown stage (a newer backend) shows its code in plain words on the neutral chip. */
export function leadStageChip(stage: string): LeadChip {
  return STAGE_CHIPS[stage as LeadStage] ?? { label: capitalizeFirst(String(stage).replace(/_/g, ' ')), tone: 'neutral' }
}

// ------------------------------------------------------------------ small formatters

/** Dollars: 4900 -> "$4,900", 4900.5 -> "$4,900.50", null -> "—". */
export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH
  const whole = Math.abs(n - Math.round(n)) < 0.005
  const body = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
  return `${n < 0 ? '-' : ''}$${body}`
}

/**
 * A lead's phone as the page shows it. The box sends "(813) ***-0141" masked and the ten digits
 * "8135550141" revealed; both read "(813) …-0141" here. Anything else is shown as given.
 */
export function leadPhone(phone: string | null | undefined): string {
  const p = (phone ?? '').trim()
  const digits = p.replace(/\D/g, '')
  if (/^\+?[\d\s().-]+$/.test(p)) {
    const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
    if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
  }
  return p
}

/** "Owen", or "No name" (the quote form's first name can be blank). */
export function leadName(lead: Pick<LeadRow, 'first_name'>): string {
  return (lead.first_name ?? '').trim() || 'No name'
}

const CONSENT: Record<string, string> = {
  verbal_yes_on_call: 'said yes on the call',
  verified_patient_on_file: 'patient on file',
  form_consent: 'form',
}

/** The consent basis in the desk's words, or "" (the raw value is never shown). */
export function consentLabel(basis: string | null | undefined): string {
  return CONSENT[(basis ?? '').trim()] ?? ''
}

// ------------------------------------------------------------------ the quote

/** "Phase1" -> "Phase 1", "ComplexComprehensive" -> "Complex comprehensive". */
export function categoryName(quote: Pick<LeadQuote, 'category' | 'category_label'> | null | undefined): string {
  const raw = (quote?.category ?? '').trim()
  if (raw) {
    const words = raw
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    return capitalizeFirst(words)
  }
  // No category code: the label's own name, up to its colon.
  const label = (quote?.category_label ?? '').trim()
  const head = label.split(':')[0]?.trim() ?? ''
  return head.length <= 40 ? head : ''
}

const APPLIANCE_SHORT: Record<string, string> = {
  metal: 'metal',
  ceramic: 'ceramic',
  self_ligating: 'self-ligating',
  lingual: 'lingual',
  aligner_lite: 'aligners lite',
  aligner_comprehensive: 'aligners',
}

/** The appliance in a word or two for the one-line quote. */
export function applianceShort(option: Pick<LeadQuoteOption, 'appliance' | 'label'>): string {
  const code = (option.appliance ?? '').trim().toLowerCase()
  return APPLIANCE_SHORT[code] ?? ((option.label ?? '').trim().toLowerCase() || code.replace(/_/g, ' ') || 'option')
}

/** The appliance as the practice names it: "Metal braces". */
export function applianceName(option: Pick<LeadQuoteOption, 'appliance' | 'label'>): string {
  return (option.label ?? '').trim().replace(/\s+—\s+/g, ', ') || capitalizeFirst(applianceShort(option))
}

/**
 * The insurance figure of an option. The box sends 0 (not null) when nothing was submitted and
 * while benefits are still being checked, so the status decides what the desk reads.
 */
export function insuranceText(option: Pick<LeadQuoteOption, 'insurance' | 'insurance_status'>): string {
  switch (option.insurance_status) {
    case 'pending':
      return 'pending'
    case 'none':
      return 'none'
    case 'zero':
      return '$0'
    default:
      return money(option.insurance)
  }
}

/** "ins. $2,000" / "ins. pending" / "no insurance" for the one-line quote. */
function insurancePiece(option: LeadQuoteOption): string {
  const t = insuranceText(option)
  return t === 'none' ? 'no insurance' : `ins. ${t}`
}

export interface QuoteLine {
  /** The whole line. */
  text: string
  /** The same line as the row sets it: the plan above ("Comprehensive · ceramic")... */
  plan: string
  /** ...and the dollars under it: ["$5,900", "ins. $2,000", "patient pays $3,900"]. */
  figures: string[]
  /** How many more options the quote has. */
  more: number
}

/**
 * The quote in one line: "Comprehensive · ceramic $5,900 · ins. $2,000 · patient pays $3,900".
 * The first option as quoted; `more` counts the others. Staff read this, so it says "patient
 * pays" where the patient's own text says "you pay".
 */
export function quoteLine(quote: LeadQuote | null | undefined): QuoteLine {
  const first = quote?.options?.[0]
  if (!quote || !first) {
    const plan = quote ? categoryName(quote) : ''
    return { text: plan, plan, figures: [], more: 0 }
  }
  const category = categoryName(quote)
  const appliance = applianceShort(first)
  const rest = [insurancePiece(first), `patient pays ${money(first.patient)}`]
  return {
    text: [category, `${appliance} ${money(first.total)}`, ...rest].filter(Boolean).join(' · '),
    plan: [category, appliance].filter(Boolean).join(' · '),
    figures: [money(first.total), ...rest],
    more: Math.max(0, quote.options.length - 1),
  }
}

// ------------------------------------------------------------------ days and times

function monthDay(ts: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(new Date(ts * 1000))
}

function weekday(ts: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(ts * 1000))
}

/**
 * A day near today in a word: "Today", "Tomorrow", "Yesterday", a weekday for the next six
 * days, else the date. Past days beyond yesterday always get the date, so "Fri" is never read as
 * the coming Friday.
 */
export function dayWord(ts: number, now: number = nowSec(), tz: string = getPracticeTz()): string {
  const diff = localDayNumber(ts, tz) - localDayNumber(now, tz)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff <= 6) return weekday(ts, tz)
  return monthDay(ts, tz)
}

/** An exam's time: "Tomorrow 3:20 PM", "Wed 8:00 AM", "Oct 5, 1:00 PM". */
export function examWhen(ts: number, now: number = nowSec(), tz: string = getPracticeTz()): string {
  const day = dayWord(ts, now, tz)
  const clock = formatClock(ts, tz)
  return /\d$/.test(day) ? `${day}, ${clock}` : `${day} ${clock}`
}

/**
 * How long ago, for the Last touch column: "Just now", "12 min ago", "3 hr ago" (same day),
 * "Yesterday", "3 days ago", "2 weeks ago", then the date.
 */
export function agoLabel(ts: number, now: number = nowSec(), tz: string = getPracticeTz()): string {
  const secs = now - ts
  const days = localDayNumber(now, tz) - localDayNumber(ts, tz)
  if (days <= 0) {
    if (secs < 60) return 'Just now'
    if (secs < 3600) return `${Math.floor(secs / 60)} min ago`
    return `${Math.floor(secs / 3600)} hr ago`
  }
  if (days === 1) return 'Yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 56) return `${Math.floor(days / 7)} weeks ago`
  return monthDay(ts, tz)
}

// ------------------------------------------------------------------ the exam line

export interface ExamLine {
  text: string
  /** The exam did not happen (no check-in, cancelled) or a week passed with none. */
  warn: boolean
}

type ExamLead = Pick<
  LeadRow,
  'stage' | 'consult_at' | 'appointment_label' | 'missed_reason' | 'quoted_at' | 'created_at' | 'pool'
>

/**
 * The line under the stage chip: when the exam is or was, "no check-in" / "cancelled" for a
 * missed one, and for a quoted lead how long it has gone without one.
 */
export function examLine(lead: ExamLead, now: number = nowSec(), tz: string = getPracticeTz()): ExamLine {
  const when = lead.consult_at != null ? examWhen(lead.consult_at, now, tz) : (lead.appointment_label ?? '').trim()
  if (lead.stage === 'consult_missed') {
    const why = lead.missed_reason === 'cancelled' ? 'cancelled' : 'no check-in'
    return { text: when ? `${when} · ${why}` : capitalizeFirst(why), warn: true }
  }
  if (lead.stage === 'quoted') {
    const days = Math.floor((now - (lead.quoted_at ?? lead.created_at)) / 86_400)
    if (lead.pool === 'never_booked') return { text: `${days} days, no exam`, warn: true }
    return { text: 'No exam yet', warn: false }
  }
  return { text: when, warn: false }
}

/**
 * The drawer's "Exam" fact. A no-show the clock marked is said as what it is: "no check-in by
 * 10:35 AM" (the time the sweep gave up waiting), not as a fact about the patient.
 */
export function examDetail(
  lead: ExamLead & Pick<LeadRow, 'stage_source' | 'stage_at'>,
  now: number = nowSec(),
  tz: string = getPracticeTz(),
): string {
  const when = lead.consult_at != null ? examWhen(lead.consult_at, now, tz) : (lead.appointment_label ?? '').trim()
  switch (lead.stage) {
    case 'consult_booked':
      return when || 'Booked'
    case 'consult_missed': {
      const exam = when || 'Missed'
      if (lead.missed_reason === 'cancelled') return `${exam} · cancelled`
      if (lead.stage_source === 'sweep') return `${exam} · no check-in by ${formatClock(lead.stage_at, tz)}`
      return `${exam} · no check-in`
    }
    case 'consult_happened':
      return when ? `Came in ${when}` : 'Came in'
    case 'quoted': {
      const days = Math.floor((now - (lead.quoted_at ?? lead.created_at)) / 86_400)
      return lead.pool === 'never_booked' ? `None in ${days} days` : 'None yet'
    }
    default:
      return when
  }
}

// ------------------------------------------------------------------ last touch

const COORDINATOR_TOUCH: Record<string, string> = {
  happened: 'Marked came in',
  started: 'Marked started',
  lost: 'Marked lost',
  paused: 'Paused',
  reopen: 'Reopened',
  booked: 'Exam booked by the desk',
  missed: 'Marked no-show',
  note: 'Note saved',
}

const TEXT_IN: Record<string, string> = {
  yes: 'Replied yes',
  no: 'Replied no',
  stop: 'Replied STOP',
  help: 'Asked for help',
  reschedule: 'Asked to reschedule',
}

/** The backend's touch label ("text in: yes", "coordinator: lost") in the desk's words. */
export function touchLabel(touch: string | null | undefined): string {
  const t = (touch ?? '').trim()
  if (!t) return ''
  const low = t.toLowerCase()
  if (low === 'quote text sent') return 'Quote texted'
  if (low === 'quote text sent again') return 'Quote texted again'
  if (low === 'text out') return 'Text sent'
  if (low === 'exam cancelled') return 'Exam cancelled'
  if (low === 'texted stop') return 'Texted STOP'
  const textIn = /^text in:\s*(.*)$/i.exec(t)
  if (textIn) return TEXT_IN[(textIn[1] ?? '').trim().toLowerCase()] ?? 'Replied by text'
  const booked = /^exam booked\s+(.+)$/i.exec(t)
  if (booked) return `Exam booked, ${(booked[1] ?? '').trim()}`
  const desk = /^coordinator:\s*(.*)$/i.exec(t)
  if (desk) {
    const action = (desk[1] ?? '').trim().toLowerCase()
    return COORDINATOR_TOUCH[action] ?? `Desk: ${action.replace(/_/g, ' ')}`
  }
  return capitalizeFirst(t)
}

// ------------------------------------------------------------------ reserved: next text, call now

/** What the Next text column shows for a lead. */
export type NextText =
  | { kind: 'stopped' }
  | { kind: 'due'; when: string; label: string }
  | { kind: 'none' }

export interface NextStep {
  text: NextText
  /** The "call now" prompt of a missed-consult row, or null. `reason` may be "". */
  call: { reason: string } | null
}

/**
 * RESERVED for the next backend pieces (the follow-up text ladder and the day-3 call prompt).
 * This is the only place that reads the four fields they will send; rename them here.
 *   next_text_at     unix seconds of the next follow-up text, or null
 *   next_text_label  what that text is ("Day 2 text")
 *   call_now         true when a person should call this lead now
 *   call_now_reason  why, in the desk's words
 * Until they arrive: a lead who texted STOP reads "Texts stopped", everyone else "—", no prompt.
 */
export function nextStep(lead: LeadRow, now: number = nowSec(), tz: string = getPracticeTz()): NextStep {
  const call = lead.open && lead.call_now === true ? { reason: (lead.call_now_reason ?? '').trim() } : null
  if (lead.texts_stopped) return { text: { kind: 'stopped' }, call }
  if (lead.open && typeof lead.next_text_at === 'number' && Number.isFinite(lead.next_text_at)) {
    return {
      text: { kind: 'due', when: dayWord(lead.next_text_at, now, tz), label: (lead.next_text_label ?? '').trim() || 'Follow-up text' },
      call,
    }
  }
  return { text: { kind: 'none' }, call }
}

// ------------------------------------------------------------------ the taps

export interface LeadTap {
  action: Exclude<LeadAction, 'note'>
  label: string
  /** The stage's main moves are bold in the spec; the rest are quiet. */
  primary: boolean
  /** Booked asks for the exam's day and time first; Lost asks to confirm (the only tap that does). */
  asks?: 'slot' | 'confirm'
}

const LOST: LeadTap = { action: 'lost', label: 'Lost', primary: false, asks: 'confirm' }
const PAUSE: LeadTap = { action: 'paused', label: 'Pause', primary: false }

/** The taps a stage offers, in the spec's order. Started leads have none (only the note). */
export function leadTaps(stage: string): LeadTap[] {
  switch (stage) {
    case 'consult_booked':
      return [
        { action: 'happened', label: 'Came in', primary: true },
        { action: 'missed', label: 'No-show', primary: true },
        LOST,
        PAUSE,
      ]
    case 'consult_missed':
    case 'quoted':
      return [
        { action: 'booked', label: 'Booked', primary: true, asks: 'slot' },
        { action: 'happened', label: 'Came in', primary: false },
        LOST,
        PAUSE,
      ]
    case 'consult_happened':
      return [{ action: 'started', label: 'Started', primary: true }, LOST, PAUSE]
    case 'paused':
    case 'lost':
      return [{ action: 'reopen', label: 'Reopen', primary: true }]
    default:
      return []
  }
}

const STAGE_WORDS: Record<string, string> = {
  consult_booked: 'booked',
  consult_missed: 'missed-consult',
  consult_happened: 'came-in',
}

/**
 * The server's sentence for a move it refused (409), as it reads on the page: the same words,
 * with a stage code said plainly ("a consult_booked lead" -> "a booked lead"), a capital and a
 * period. Empty when the server sent none.
 */
export function refusalSentence(detail: string | null | undefined): string {
  let s = (detail ?? '').trim()
  if (!s) return ''
  s = s.replace(/\bconsult_(?:booked|missed|happened)\b/g, (m) => STAGE_WORDS[m] ?? m)
  s = capitalizeFirst(s)
  return /[.?!]$/.test(s) ? s : `${s}.`
}

/** "2026-11-12" + "09:00" -> the slot the booked tap sends: a local time in the practice's zone. */
export function slotValue(date: string, time: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time) ? `${date}T${time}` : ''
}

/** Today's date in the practice's zone as "YYYY-MM-DD" (the date input's earliest day). */
export function localDateInput(now: number = nowSec(), tz: string = getPracticeTz()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(now * 1000),
  )
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** The practice's clock right now as "HH:MM" (24-hour), the time input's shape. */
export function localTimeInput(now: number = nowSec(), tz: string = getPracticeTz()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(
    new Date(now * 1000),
  )
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('hour')}:${get('minute')}`
}

/**
 * The Booked form's day and time are already behind the practice's clock: an earlier day, or
 * today at a time that has passed. Unfilled or malformed values are not "past" (the form's own
 * required / min rules say what is missing).
 */
export function slotInPast(date: string, time: string, now: number = nowSec(), tz: string = getPracticeTz()): boolean {
  if (!slotValue(date, time)) return false
  const today = localDateInput(now, tz)
  return date < today || (date === today && time < localTimeInput(now, tz))
}

// ------------------------------------------------------------------ history

export type HistoryIcon = 'quote' | 'calendar' | 'check' | 'missed' | 'text' | 'reply' | 'note' | 'person' | 'pause' | 'warning'

export interface HistoryLine {
  key: string
  ts: number
  icon: HistoryIcon
  text: string
  /** A coordinator's own words, shown in quotes under the line. */
  quote?: string
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Who did a thing, as the page says it. The record stores what the sign-in gave the box: a
 * display name, "front desk" (the shared login), a staff email (the per-person sign-in prefers
 * it) or a bare account id. An email reads as the part before the @ in words ("jane.doe@..." ->
 * "Jane Doe"); an account id, or nothing, reads as "The desk". An address is never shown.
 */
function whoName(who: unknown): string {
  const s = str(who)
  if (!s || UUID_RE.test(s)) return 'The desk'
  const at = s.indexOf('@')
  if (at >= 0) {
    const local = s.slice(0, at).replace(/[._+-]+/g, ' ').trim()
    return local ? local.split(/\s+/).map(capitalizeFirst).join(' ') : 'The desk'
  }
  return capitalizeFirst(s)
}

const ISO_START = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/

/**
 * An ISO time as "Fri, Oct 16, 10:00 AM"; anything else as given. A time with an offset is an
 * instant; one without is the practice's wall clock (the record's own reading of it), never the
 * browser's: Date.parse would read "2026-10-16T10:00:00" in the machine's zone.
 */
function startLabel(start: string, tz: string): string {
  const m = ISO_START.exec(start.trim())
  if (!m) return start
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [number, number, number, number, number]
  const sec = Number(m[6] ?? 0)
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return start
  let ts: number
  const zone = m[7]
  if (!zone) ts = zonedWallToEpoch(y, mo, d, h, mi, sec, tz)
  else {
    ts = Date.UTC(y, mo - 1, d, h, mi, sec) / 1000
    if (zone !== 'Z') {
      const digits = zone.slice(1).replace(':', '')
      ts -= (zone.startsWith('-') ? -1 : 1) * (Number(digits.slice(0, 2)) * 3600 + Number(digits.slice(2, 4)) * 60)
    }
  }
  return `${weekday(ts, tz)}, ${monthDay(ts, tz)}, ${formatClock(ts, tz)}`
}

function stageLine(e: LeadEvent, tz: string): { icon: HistoryIcon; text: string } {
  const d = e.data
  const to = str(d.to)
  const from = str(d.from)
  const source = str(d.source)
  const who = whoName(d.who)
  const label = str(d.appointment_label)
  const byDesk = source === 'coordinator'
  const reopened = byDesk && (from === 'paused' || from === 'lost')
  switch (to) {
    case 'consult_booked': {
      const slot = label ? `: ${label}` : ''
      if (reopened) return { icon: 'person', text: `${who} reopened the lead${label ? `, exam ${label}` : ''}` }
      if (byDesk) return { icon: 'calendar', text: `${who} booked the exam${slot}` }
      if (source === 'call_booking') return { icon: 'calendar', text: `Booked the exam on a call with Katie${slot}` }
      if (source === 'sms_reslot') return { icon: 'calendar', text: `Rebooked the exam by text${slot}` }
      if (source === 'quote_sent') return { icon: 'calendar', text: `Exam booked with the quote${slot}` }
      if (source === 'nexhealth') return { icon: 'calendar', text: `Exam found on the schedule${slot}` }
      return { icon: 'calendar', text: `Exam booked${slot}` }
    }
    case 'consult_missed': {
      if (reopened) return { icon: 'person', text: `${who} reopened the lead` }
      if (str(d.reason) === 'cancelled') {
        if (source === 'sms_cancel') return { icon: 'missed', text: 'Cancelled the exam by text' }
        if (source === 'call_cancel') return { icon: 'missed', text: 'Cancelled the exam on a call' }
        if (source === 'nexhealth') return { icon: 'missed', text: 'Exam cancelled on the schedule' }
        return { icon: 'missed', text: byDesk ? `${who} marked the exam cancelled` : 'Exam cancelled' }
      }
      if (source === 'sweep') return { icon: 'missed', text: `No check-in by ${formatClock(e.ts, tz)}` }
      if (source === 'nexhealth') return { icon: 'missed', text: 'Marked a no-show on the schedule' }
      return { icon: 'missed', text: byDesk ? `${who} marked a no-show` : 'No check-in for the exam' }
    }
    case 'consult_happened':
      if (reopened) return { icon: 'person', text: `${who} reopened the lead` }
      if (source === 'nexhealth') return { icon: 'check', text: 'Checked in for the exam, per the schedule' }
      return { icon: 'check', text: byDesk ? `${who} marked came in` : 'Came in for the exam' }
    case 'started':
      return { icon: 'check', text: byDesk ? `${who} marked started` : 'Started treatment' }
    case 'lost':
      return { icon: 'missed', text: byDesk ? `${who} marked lost` : 'Marked lost' }
    case 'paused':
      return { icon: 'pause', text: byDesk ? `${who} paused follow-up` : 'Follow-up paused' }
    case 'quoted':
      return { icon: 'person', text: reopened ? `${who} reopened the lead` : 'Back to quoted' }
    default:
      return { icon: 'person', text: capitalizeFirst(`${to || 'changed'}`.replace(/_/g, ' ')) }
  }
}

/**
 * A lead's history as sentences, oldest first (as served). The coordinator's tap writes two
 * events (the stage change and its own record): the second is dropped when the first says it.
 */
export function historyLines(events: readonly LeadEvent[], tz: string = getPracticeTz()): HistoryLine[] {
  const deskMoves = new Set(
    events.filter((e) => e.kind === 'stage' && str(e.data.source) === 'coordinator').map((e) => Math.round(e.ts * 1000)),
  )
  // A STOP arrives as a text (a touch) and as the stop itself; one line says it.
  const stopSaid = events.some((e) => e.kind === 'sms_stop')
  const out: HistoryLine[] = []
  for (const e of events) {
    const d = e.data ?? {}
    const key = `e${e.id}`
    switch (e.kind) {
      case 'quoted': {
        const cat = categoryName({ category: str(d.category), category_label: '' })
        if (d.again) out.push({ key, ts: e.ts, icon: 'quote', text: `Quote texted again${cat ? `: ${cat}` : ''}` })
        else {
          const n = typeof d.options === 'number' ? d.options : 0
          const tail = [cat, n > 0 ? count(n, 'option') : ''].filter(Boolean).join(', ')
          out.push({ key, ts: e.ts, icon: 'quote', text: `Quote sent${tail ? `: ${tail}` : ''}` })
        }
        break
      }
      case 'stage': {
        const line = stageLine(e, tz)
        out.push({ key, ts: e.ts, ...line, quote: str(d.note) || undefined })
        break
      }
      case 'coordinator': {
        if (deskMoves.has(Math.round(e.ts * 1000))) break
        const action = str(d.action).toLowerCase()
        out.push({
          key,
          ts: e.ts,
          icon: 'person',
          text: `${whoName(d.who)}: ${(COORDINATOR_TOUCH[action] ?? action.replace(/_/g, ' ')).toLowerCase()}`,
          quote: str(d.note) || undefined,
        })
        break
      }
      case 'touch': {
        const what = str(d.what)
        const text = touchLabel(what) || 'Contact'
        if (text === 'Replied STOP' && stopSaid) break
        out.push({ key, ts: e.ts, icon: str(d.direction) === 'in' ? 'reply' : 'text', text })
        break
      }
      case 'sms_stop':
        out.push({ key, ts: e.ts, icon: 'warning', text: 'Texted STOP: no more texts go to this number' })
        break
      case 'note': {
        const note = str(d.note)
        out.push({
          key,
          ts: e.ts,
          icon: 'note',
          text: note ? `${whoName(d.who)} wrote a note` : `${whoName(d.who)} cleared the note`,
          quote: note || undefined,
        })
        break
      }
      case 'unmatched': {
        const what = str(d.what) || 'change'
        const label = str(d.label)
        const n = typeof d.candidates === 'number' ? d.candidates : 0
        const shared = n > 1 ? `: ${count(n, 'lead')} share this number` : ''
        out.push({
          key,
          ts: e.ts,
          icon: 'warning',
          text: `A ${what}${label ? ` for ${label}` : ''} could not be matched to one lead${shared}`,
        })
        break
      }
      case 'moved': {
        const start = str(d.start)
        out.push({ key, ts: e.ts, icon: 'calendar', text: `Exam moved on the schedule${start ? ` to ${startLabel(start, tz)}` : ''}` })
        break
      }
      default:
        out.push({ key, ts: e.ts, icon: 'person', text: capitalizeFirst(String(e.kind).replace(/[._]/g, ' ')) })
    }
  }
  return out
}

/** A history line's time: "Fri 10:35 AM" style, as every list writes it. */
export function historyWhen(ts: number, now: number = nowSec(), tz: string = getPracticeTz()): string {
  return formatWhen(ts, tz, now)
}

// ------------------------------------------------------------------ card title and Katie's sentence

/**
 * The card header's count sentence for the list on screen. "" while loading. `shown` is the
 * rows on screen; `total` the summary's count for this filter when it has one.
 */
export function leadsTitle(filter: LeadsFilter, shown: number | undefined, summary: LeadsSummary | undefined): string {
  if (shown == null) return ''
  const fromSummary: number | undefined =
    filter === 'open'
      ? summary?.open
      : filter === 'missed_consult'
        ? summary?.missed_consult
        : filter === 'never_booked'
          ? summary?.never_booked
          : filter === 'all'
            ? summary?.total
            : summary?.by_stage?.[filter as LeadStage]
  const n = Math.max(shown, fromSummary ?? 0)
  switch (filter) {
    case 'open':
      return `${n} open ${n === 1 ? 'lead' : 'leads'}`
    case 'missed_consult':
      return `${n} missed ${n === 1 ? 'consult' : 'consults'}`
    case 'never_booked':
      return `${n} never booked`
    case 'consult_booked':
      return `${n} with a consult booked`
    case 'consult_happened':
      return `${n} came in, not started`
    case 'quoted':
      return `${n} quoted`
    case 'started':
      return `${n} started`
    case 'paused':
      return `${n} paused`
    case 'lost':
      return `${n} lost`
    default:
      return `${n} ${n === 1 ? 'lead' : 'leads'}`
  }
}

/**
 * Katie's sentence for the Leads card: the open leads, and where to start. Counts only (never a
 * name or a number). "" when there are no leads at all or the summary is not in.
 */
export function leadsSentence(summary: LeadsSummary | undefined): string {
  if (!summary || summary.total == null) return ''
  const open = summary.open ?? 0
  const missed = summary.missed_consult ?? 0
  const never = summary.never_booked ?? 0
  const happened = summary.by_stage?.consult_happened ?? 0
  if (summary.total === 0) return ''
  if (open === 0) return 'No open leads right now. Everyone quoted has started, paused or closed.'
  const head = `${capitalizeFirst(count(open, 'open lead'))}.`
  if (missed > 0) return `${head} ${capitalizeFirst(count(missed, 'missed consult'))}: start with ${missed === 1 ? 'that one' : 'those'}.`
  if (never > 0) return `${head} ${capitalizeFirst(count(never, 'has', 'have'))} gone a week without booking an exam.`
  if (happened > 0) return `${head} ${capitalizeFirst(count(happened, 'has', 'have'))} had the exam and not started yet.`
  return `${head} Every one has an exam on the schedule or a fresh quote.`
}
