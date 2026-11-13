// The lead record for mock mode: an in-memory copy of what voice-agent/leads.py keeps, answering
// the three lead routes the way voice-agent/dash_api.py does. Seeded from fixtures the real
// backend generated (scripts/leads-fixtures.py); the coordinator's taps are mirrored here rule
// for rule, including the sentences a refused move answers with, so the page meets the same
// answers in mock as on the box. scripts/check-lib.mjs replays the fixtures' own history through
// this module and fails when it and the backend disagree.
//
// Pure module (no Vite or browser APIs, explicit .ts imports): the mock server, the demo backend,
// scripts/fake-api.mjs and scripts/check-lib.mjs all load it.

import type {
  LeadActionBody,
  LeadEvent,
  LeadRow,
  LeadStage,
  LeadsSummary,
} from '../api/types.ts'

export const LEAD_STAGE_ORDER: readonly LeadStage[] = [
  'quoted',
  'consult_booked',
  'consult_missed',
  'consult_happened',
  'started',
  'lost',
  'paused',
]
const OPEN_STAGES: readonly LeadStage[] = ['quoted', 'consult_booked', 'consult_missed', 'consult_happened']
const MOVABLE: readonly LeadStage[] = ['quoted', 'consult_booked', 'consult_missed']
const ACTIONS = ['happened', 'started', 'lost', 'paused', 'reopen', 'booked', 'missed', 'note'] as const
/** LEADS_NEVER_BOOKED_DAYS, the backend's default. */
const NEVER_BOOKED_SECS = 7 * 86_400
const DEFAULT_TZ = 'America/New_York'

/** What a fixture file holds: the list route's rows (masked) and each lead's history. */
export interface LeadSeed {
  now: number
  tz: string
  leads: LeadRow[]
  events: Record<string, LeadEvent[]>
}

/** leads-week.json: the same story as of 21:10 on Monday..Sunday of one reference week. */
export interface LeadWeek {
  tz: string
  days: LeadSeed[]
}

/** A stored row: the database columns, without the fields the routes derive. */
type Stored = Omit<LeadRow, 'open' | 'pool' | 'texts_stopped'>

export interface LeadStore {
  tz: string
  rows: Stored[]
  events: Map<string, LeadEvent[]>
  nextEventId: number
}

export interface LeadResponse {
  status: number
  body: unknown
}

// ------------------------------------------------------------------ wall clock in the practice tz

const fmtCache = new Map<string, Intl.DateTimeFormat>()

interface Wall {
  y: number
  m: number
  d: number
  h: number
  mi: number
  s: number
}

function wallOf(tsSec: number, tz: string): Wall {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    fmtCache.set(tz, f)
  }
  const out: Record<string, number> = {}
  for (const p of f.formatToParts(new Date(Math.floor(tsSec) * 1000))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return {
    y: out.year ?? 1970,
    m: out.month ?? 1,
    d: out.day ?? 1,
    h: (out.hour ?? 0) % 24,
    mi: out.minute ?? 0,
    s: out.second ?? 0,
  }
}

function offsetSec(tsSec: number, tz: string): number {
  const w = wallOf(tsSec, tz)
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) / 1000 - Math.floor(tsSec)
}

/** UNIX seconds of a wall-clock time in `tz` (day overflow allowed: d = 35 rolls the month). */
function wallToEpoch(w: Wall, tz: string): number {
  const wall = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) / 1000
  const o1 = offsetSec(wall, tz)
  const t1 = wall - o1
  const o2 = offsetSec(t1, tz)
  if (o2 === o1) return t1
  const t2 = wall - o2
  if (offsetSec(t2, tz) === o2) return t2
  // A skipped time (the spring-forward gap): the offset in force before the change, as Python's
  // zoneinfo reads it (fold=0), so 2:30 AM lands at 3:30 AM.
  return wall - offsetSec(Math.min(t1, t2), tz)
}

/** Monday = 0 .. Sunday = 6 (Python's weekday()). */
function weekdayOf(tsSec: number, tz: string): number {
  const w = wallOf(tsSec, tz)
  return (new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay() + 6) % 7
}

function dayNumber(tsSec: number, tz: string): number {
  const w = wallOf(tsSec, tz)
  return Math.round(Date.UTC(w.y, w.m - 1, w.d) / 86_400_000)
}

const SLOT_LABEL = /^\s*(\w{3})\w*\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i
const DAY_INDEX: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/

/** An ISO time ("2026-11-12T09:00", with or without an offset) as UNIX seconds, else null. */
function isoToEpoch(s: string, tz: string): number | null {
  const m = ISO.exec(s.trim())
  if (!m) return null
  const w: Wall = {
    y: Number(m[1]),
    m: Number(m[2]),
    d: Number(m[3]),
    h: Number(m[4] ?? 0),
    mi: Number(m[5] ?? 0),
    s: Number(m[6] ?? 0),
  }
  if (w.m < 1 || w.m > 12 || w.d < 1 || w.d > 31 || w.h > 23 || w.mi > 59 || w.s > 59) return null
  const zone = m[7]
  if (!zone) return wallToEpoch(w, tz)
  const utc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) / 1000
  if (zone === 'Z') return utc
  const sign = zone.startsWith('-') ? -1 : 1
  const digits = zone.slice(1).replace(':', '')
  return utc - sign * (Number(digits.slice(0, 2)) * 3600 + Number(digits.slice(2, 4)) * 60)
}

/**
 * leads.resolve_consult_at: the exam's UNIX time from an ISO time or a slot label. A label is
 * read from the moment it was booked: the next such weekday, a week on when that time has already
 * passed on the booking day. Unreadable -> null (the clock then never calls it a no-show).
 */
export function resolveConsultAt(start: string, bookedTs: number, tz: string = DEFAULT_TZ): number | null {
  const s = String(start ?? '').trim()
  if (!s) return null
  const iso = isoToEpoch(s, tz)
  if (iso !== null) return iso
  const m = SLOT_LABEL.exec(s)
  if (!m) return null
  const wd = DAY_INDEX[(m[1] as string).toLowerCase().slice(0, 3)]
  if (wd === undefined) return null
  const hour = (Number(m[2]) % 12) + ((m[4] as string).toUpperCase() === 'PM' ? 12 : 0)
  const minute = Number(m[3])
  const booked = wallOf(bookedTs, tz)
  let ahead = (wd - weekdayOf(bookedTs, tz) + 7) % 7
  if (ahead === 0 && hour * 60 + minute <= booked.h * 60 + booked.mi) ahead = 7
  return wallToEpoch({ y: booked.y, m: booked.m, d: booked.d + ahead, h: hour, mi: minute, s: 0 }, tz)
}

/** leads._label_of: "Thu 9:00 AM" for an ISO start, or the label itself. */
export function labelOf(start: string, tz: string = DEFAULT_TZ): string {
  const s = String(start ?? '').trim()
  if (SLOT_LABEL.test(s)) return s
  const at = isoToEpoch(s, tz)
  if (at === null) return s.slice(0, 40)
  const w = wallOf(at, tz)
  return `${DAY_SHORT[weekdayOf(at, tz)]} ${w.h % 12 || 12}:${String(w.mi).padStart(2, '0')} ${w.h < 12 ? 'AM' : 'PM'}`
}

// ------------------------------------------------------------------ seeds

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function toStored(row: LeadRow): Stored {
  const { open: _o, pool: _p, texts_stopped: _t, ...rest } = clone(row)
  void _o
  void _p
  void _t
  return rest
}

export function createLeadStore(seed: LeadSeed | null): LeadStore {
  const events = new Map<string, LeadEvent[]>()
  let maxId = 0
  for (const [id, list] of Object.entries(seed?.events ?? {})) {
    events.set(id, clone(list))
    for (const e of list) maxId = Math.max(maxId, e.id)
  }
  return {
    tz: seed?.tz || DEFAULT_TZ,
    rows: (seed?.leads ?? []).map(toStored),
    events,
    nextEventId: maxId + 1,
  }
}

const TIME_FIELDS = [
  'stage_at',
  'created_at',
  'updated_at',
  'quoted_at',
  'consult_at',
  'sms_stopped_at',
  'last_touch_at',
] as const

/**
 * The week file's story as of `asOfSec`: the variant written for that weekday, moved by whole
 * weeks so every weekday, clock time and "Thu 9:00 AM" label stays true (wall-clock shift, so a
 * 9:00 exam stays at 9:00 across a daylight-saving change).
 */
export function seedForDate(week: LeadWeek, asOfSec: number): LeadSeed {
  const tz = week.tz || DEFAULT_TZ
  const src = week.days[weekdayOf(asOfSec, tz)] ?? week.days[0]
  if (!src) return { now: asOfSec, tz, leads: [], events: {} }
  const days = dayNumber(asOfSec, tz) - dayNumber(src.now, tz)
  const shift = (ts: number): number => {
    const w = wallOf(ts, tz)
    return wallToEpoch({ ...w, d: w.d + days }, tz) + (ts - Math.floor(ts))
  }
  const shiftIso = (s: string): string => {
    const at = isoToEpoch(s, tz)
    if (at === null || SLOT_LABEL.test(s)) return s
    const w = wallOf(shift(at), tz)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${w.y}-${p(w.m)}-${p(w.d)}T${p(w.h)}:${p(w.mi)}:${p(w.s)}`
  }
  const out = clone(src)
  out.now = shift(src.now)
  for (const l of out.leads) {
    for (const k of TIME_FIELDS) {
      const v = l[k]
      if (typeof v === 'number') l[k] = shift(v)
    }
    l.appointment_start = shiftIso(l.appointment_start)
  }
  for (const list of Object.values(out.events)) {
    for (const e of list) {
      e.ts = shift(e.ts)
      for (const [k, v] of Object.entries(e.data)) {
        if (k === 'consult_at' && typeof v === 'number') e.data[k] = shift(v)
        else if ((k === 'appointment_start' || k === 'start') && typeof v === 'string') e.data[k] = shiftIso(v)
      }
    }
  }
  return out
}

// ------------------------------------------------------------------ reads

const MASKED = /^\((\d{3})\) \*\*\*-(\d{4})$/

/** reveal=1 sends the ten digits. The fixtures hold "(813) ***-0141"; "***" becomes "555". */
function revealPhone(masked: string): string {
  const m = MASKED.exec(masked)
  return m ? `${m[1]}555${m[2]}` : masked
}

function poolOf(l: Stored, now: number): LeadRow['pool'] {
  if (l.stage === 'consult_missed') return 'missed_consult'
  if (l.stage === 'quoted' && now - (l.quoted_at || l.created_at) >= NEVER_BOOKED_SECS) return 'never_booked'
  return ''
}

function isOpen(stage: LeadStage): boolean {
  return OPEN_STAGES.includes(stage)
}

/** leads._public: the row as the list and detail routes send it. */
function publicRow(l: Stored, reveal: boolean, now: number): LeadRow {
  return {
    ...clone(l),
    phone: reveal ? revealPhone(l.phone) : l.phone,
    open: isOpen(l.stage),
    pool: poolOf(l, now),
    texts_stopped: !!l.sms_stopped_at,
  }
}

export function listLeads(
  store: LeadStore,
  q: { stage?: string | null; limit?: number; reveal?: boolean },
  now: number,
): LeadRow[] {
  const s = String(q.stage ?? '')
    .trim()
    .toLowerCase()
  let rows = store.rows
  if (s === 'open') rows = rows.filter((l) => isOpen(l.stage))
  else if (s === 'missed_consult') rows = rows.filter((l) => l.stage === 'consult_missed')
  else if (s === 'never_booked') {
    rows = rows.filter((l) => l.stage === 'quoted' && (l.quoted_at ?? l.created_at) <= now - NEVER_BOOKED_SECS)
  } else if ((LEAD_STAGE_ORDER as readonly string[]).includes(s)) rows = rows.filter((l) => l.stage === s)
  const limit = Math.max(1, Math.min(Math.floor(Number(q.limit) || 200), 2000))
  return [...rows]
    .sort((a, b) => b.stage_at - a.stage_at)
    .slice(0, limit)
    .map((l) => publicRow(l, !!q.reveal, now))
}

export function leadsSummary(store: LeadStore, now: number): Required<LeadsSummary> {
  const by_stage = Object.fromEntries(LEAD_STAGE_ORDER.map((s) => [s, 0])) as Record<LeadStage, number>
  const out = { by_stage, open: 0, missed_consult: 0, never_booked: 0, texts_stopped: 0, total: 0 }
  for (const l of store.rows) {
    out.total += 1
    by_stage[l.stage] = (by_stage[l.stage] ?? 0) + 1
    if (isOpen(l.stage)) out.open += 1
    const pool = poolOf(l, now)
    if (pool) out[pool] += 1
    if (l.sms_stopped_at) out.texts_stopped += 1
  }
  return out
}

function find(store: LeadStore, id: string): Stored | undefined {
  return store.rows.find((l) => l.lead_id === id)
}

function eventsOf(store: LeadStore, id: string): LeadEvent[] {
  let list = store.events.get(id)
  if (!list) {
    list = []
    store.events.set(id, list)
  }
  return list
}

// ------------------------------------------------------------------ the coordinator's taps

class Refused extends Error {}

function addEvent(store: LeadStore, id: string, kind: string, data: Record<string, unknown>, ts: number): void {
  eventsOf(store, id).push({ id: store.nextEventId++, ts, kind, data })
}

/** leads._move: the one place a stage changes; the row and its history move together. */
function move(
  store: LeadStore,
  lead: Stored,
  to: LeadStage,
  o: { now: number; reason?: string; who: string; note: string; extra?: Partial<Stored> },
): void {
  const from = lead.stage
  const reason = o.reason ?? ''
  lead.stage = to
  lead.stage_at = o.now
  lead.stage_source = 'coordinator'
  if (to === 'consult_missed') lead.missed_reason = reason === 'no_show' || reason === 'cancelled' ? reason : 'no_show'
  else if (to === 'consult_booked' || to === 'consult_happened' || to === 'started') lead.missed_reason = ''
  if (o.note) lead.note = o.note.slice(0, 500)
  Object.assign(lead, o.extra ?? {})
  lead.updated_at = o.now
  addEvent(
    store,
    lead.lead_id,
    'stage',
    { from, to, source: 'coordinator', reason, who: o.who, note: o.note.slice(0, 500), ...(o.extra ?? {}) },
    o.now,
  )
}

/**
 * POST /leads/:id/action, as dash_api.lead_action + leads.coordinator answer it:
 * 422 for an unknown action, 404 for an unknown lead, 409 with the stage's sentence for a move
 * the stage refuses, else {ok, lead}: the stored row (no open / pool / texts_stopped, exactly
 * like the box) with the phone masked whatever the request's reveal says.
 */
export function leadAction(store: LeadStore, id: string, body: unknown, who: string, now: number): LeadResponse {
  const b = (body && typeof body === 'object' ? body : {}) as Partial<LeadActionBody>
  const action = String(b.action ?? '')
    .trim()
    .toLowerCase() as (typeof ACTIONS)[number]
  if (!ACTIONS.includes(action)) {
    return { status: 422, body: { error: `action must be one of ${ACTIONS.join(', ')}` } }
  }
  const lead = find(store, id)
  if (!lead) return { status: 404, body: { error: 'no such lead' } }
  const st = lead.stage
  const note = String(b.note ?? '').trim()
  const done = (): LeadResponse => ({ status: 200, body: { ok: true, lead: clone(lead) } })
  try {
    if (action === 'note') {
      lead.note = note.slice(0, 500)
      lead.updated_at = now
      addEvent(store, id, 'note', { who, note: note.slice(0, 500) }, now)
      return done()
    }
    if (action === 'happened') {
      if (!MOVABLE.includes(st)) throw new Refused(`a ${st} lead cannot be marked as having had the consult`)
      move(store, lead, 'consult_happened', { now, who, note })
    } else if (action === 'started') {
      if (st === 'started') return done()
      if (st === 'lost') throw new Refused('a lost lead is reopened first')
      move(store, lead, 'started', { now, who, note })
    } else if (action === 'lost') {
      if (st === 'started' || st === 'lost') throw new Refused(`a ${st} lead cannot be marked lost`)
      move(store, lead, 'lost', { now, who, note })
    } else if (action === 'paused') {
      if (!isOpen(st)) throw new Refused(`a ${st} lead cannot be paused`)
      move(store, lead, 'paused', { now, who, note })
    } else if (action === 'reopen') {
      if (st !== 'paused' && st !== 'lost') throw new Refused(`a ${st} lead is not paused or lost`)
      let back: LeadStage = 'quoted'
      const history = eventsOf(store, id)
      for (let i = history.length - 1; i >= 0; i--) {
        const e = history[i] as LeadEvent
        if (e.kind !== 'stage') continue
        if (e.data.to === st && isOpen(e.data.from as LeadStage)) {
          back = e.data.from as LeadStage
          break
        }
      }
      move(store, lead, back, { now, who, note, reason: back === 'consult_missed' ? lead.missed_reason : '' })
    } else if (action === 'booked') {
      if (!MOVABLE.includes(st)) throw new Refused(`a ${st} lead cannot take a booking`)
      const label = String(b.slot_label ?? '').trim()
      if (!label) throw new Refused("a booking needs the slot (for example 'Thu 9:00 AM')")
      move(store, lead, 'consult_booked', {
        now,
        who,
        note,
        extra: {
          appointment_start: label.slice(0, 64),
          appointment_label: labelOf(label, store.tz).slice(0, 40),
          consult_at: resolveConsultAt(label, now, store.tz),
        },
      })
    } else if (action === 'missed') {
      if (st !== 'consult_booked') throw new Refused(`a ${st} lead has no exam to miss`)
      move(store, lead, 'consult_missed', { now, who, note, reason: 'no_show' })
    }
  } catch (e) {
    if (e instanceof Refused) return { status: 409, body: { error: e.message } }
    throw e
  }
  lead.last_touch_at = now
  lead.last_touch = `coordinator: ${action}`
  lead.updated_at = now
  addEvent(store, id, 'coordinator', { action, who, note: note.slice(0, 500) }, now)
  return done()
}

// ------------------------------------------------------------------ the three routes

/**
 * Answers a lead route, or null when `path` (relative to /api/dash) is not one.
 *   GET  /leads?stage=&limit=[&reveal=1]   {leads, summary}
 *   GET  /leads/:id[?reveal=1]             {lead, events}   404 {error: "no such lead"}
 *   POST /leads/:id/action                 {ok, lead}       422 / 409 / 404 {error}
 */
export function leadsRoute(
  store: LeadStore,
  method: string,
  path: string,
  params: URLSearchParams,
  body: unknown,
  now: number,
  who = 'front desk',
): LeadResponse | null {
  const p = path.replace(/\/+$/, '')
  const reveal = params.get('reveal') === '1'
  if (p === '/leads') {
    if (method !== 'GET') return { status: 405, body: { detail: 'Method Not Allowed' } }
    return {
      status: 200,
      body: {
        leads: listLeads(store, { stage: params.get('stage'), limit: Number(params.get('limit')) || 200, reveal }, now),
        summary: leadsSummary(store, now),
      },
    }
  }
  const act = /^\/leads\/([^/]+)\/action$/.exec(p)
  if (act && act[1]) {
    if (method !== 'POST') return { status: 405, body: { detail: 'Method Not Allowed' } }
    return leadAction(store, decodeURIComponent(act[1]), body, who, now)
  }
  const one = /^\/leads\/([^/]+)$/.exec(p)
  if (one && one[1]) {
    if (method !== 'GET') return { status: 405, body: { detail: 'Method Not Allowed' } }
    const lead = find(store, decodeURIComponent(one[1]))
    if (!lead) return { status: 404, body: { error: 'no such lead' } }
    return { status: 200, body: { lead: publicRow(lead, reveal, now), events: clone(eventsOf(store, lead.lead_id)) } }
  }
  return null
}

/**
 * Mock only, for the verifier: sets fields on a stored lead, e.g. the reserved next_text_at /
 * call_now the next backend pieces will send. Returns false for an unknown lead.
 */
export function patchLead(store: LeadStore, id: string, fields: Partial<LeadRow>): boolean {
  const lead = find(store, id)
  if (!lead) return false
  Object.assign(lead, clone(fields))
  return true
}
