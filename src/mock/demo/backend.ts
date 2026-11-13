// The demo backend (mock=demo): every /api/dash/* path over the materialized demo day, and the
// sample call (s36, the showpiece) replayed through the same FakeEventSource path as mock=1.
// Loaded on demand by ../server (installMock) and ../demoControl; one instance per tab.
//
// The day is complete at NOW (21:10): 35 calls, line idle. playSample() replays live-s36.txt at
// the call's real pacing (or 2x): every event goes out with the mock time it was emitted as its
// ts, the backend state changes BEFORE the event is broadcast (so the refetch it triggers sees
// it), and while the call runs the existing live rules apply (/status on-call, a live row on
// /calls, the transcript so far on /calls/:id, booking and text rows as their events go out).
// After call.ended the row keeps the replay's times and every list and stat includes it.
//
// Leads: the same story the fixtures hold (written by the real backend, see
// scripts/leads-fixtures.py), as of 21:10 on today's weekday, moved by whole weeks so every
// weekday, exam time and "3 days ago" stays true on the demo's date. Taps change the tab's copy;
// Reset day starts it over.

import type {
  Booking,
  DashEvent,
  LeadRow,
  Note,
  Sms,
  StatsResponse,
  StatusResponse,
  WireCallDetailResponse,
  WireCallRow,
} from '../../api/types'
import { nowSec, setClockTo } from '../../lib/clock'
import { broadcast } from '../hub'
import { emitDemo, getSampleState } from './events'
import { createLeadStore, leadsRoute, patchLead, seedForDate, type LeadStore, type LeadWeek } from '../leadStore'
import {
  computeStats,
  materializeDemo,
  type DemoDay,
  type RawHistory,
  type RawManifest,
  type RawScenes,
} from './materialize'
import scenesRaw from './scenes.json?raw'
import historyRaw from './history.json?raw'
import manifestRaw from './manifest.json?raw'
import liveRaw from './live-s36.txt?raw'
import leadsWeekRaw from '../fixtures/leads-week.json?raw'

const SCENES = JSON.parse(scenesRaw) as RawScenes
const HISTORY = JSON.parse(historyRaw) as RawHistory
const MANIFEST = JSON.parse(manifestRaw) as RawManifest

function build(): DemoDay {
  return materializeDemo(SCENES, HISTORY, MANIFEST, liveRaw, Date.now())
}

let day: DemoDay = build()

const LEADS_WEEK = JSON.parse(leadsWeekRaw) as LeadWeek
let leadStore: LeadStore | null = null
/** The demo's lead record: built on first use for the day's date, dropped by Reset day. */
function leads(): LeadStore {
  leadStore ??= createLeadStore(seedForDate(LEADS_WEEK, day.nowSec))
  return leadStore
}

/** Mock only (window.__katieMock.patchLead): sets fields on one demo lead. */
export function patchDemoLead(id: string, fields: Partial<LeadRow>): boolean {
  return patchLead(leads(), id, fields)
}

/** Pins the mock clock to NOW (day 0, 21:10 practice time) and lets it run. */
export function pinClock(): void {
  setClockTo(day.nowSec)
}

// ------------------------------------------------------------------ the sample call

interface Emitted {
  id: number
  ts: number
}

interface LiveState {
  startedAt: number
  endedAt: number | null
  emitted: Emitted[]
  timers: number[]
  done: Promise<void>
  finish: () => void
}

let live: LiveState | null = null
const counters = { plays: 0, events: 0 }

function cancelReplay(): void {
  if (!live) return
  for (const t of live.timers) window.clearTimeout(t)
  live.finish()
  live = null
}

/** Re-materializes the day on today's date, drops the sample call and re-pins the clock. */
export function resetDemoDay(): void {
  cancelReplay()
  day = build()
  leadStore = null
  pinClock()
}

/**
 * Replays the showpiece. Resolves after its call.ended. While it plays, a second call returns
 * the same promise; after it ended, it starts over (the previous replay is dropped first).
 */
export function playSample(speed: 1 | 2 = 1): Promise<void> {
  if (live && live.endedAt === null) return live.done
  cancelReplay()
  let finish: () => void = () => undefined
  const done = new Promise<void>((resolve) => {
    finish = resolve
  })
  const state: LiveState = { startedAt: nowSec(), endedAt: null, emitted: [], timers: [], done, finish }
  live = state
  counters.plays += 1
  emitDemo({ type: 'sample-start' })

  const steps = day.live.steps
  const emitStep = (i: number) => {
    if (live !== state) return
    const step = steps[i]
    if (!step) return
    const ts = nowSec()
    if (step.event.kind === 'call.started') state.startedAt = ts
    state.emitted.push({ id: step.id, ts })
    if (step.event.kind === 'call.ended') state.endedAt = ts
    counters.events += 1
    broadcast({ ...step.event, ts } as DashEvent)
    if (step.event.kind === 'call.ended') {
      state.finish()
      emitDemo({ type: 'sample-end' })
      return
    }
    const next = steps[i + 1]
    if (!next) return
    const gapMs = Math.max(0, (next.offset - step.offset) * 1000) / speed
    state.timers.push(window.setTimeout(() => emitStep(i + 1), gapMs))
  }
  // A beat before the line rings, so a click on "Play" reads as cause and effect.
  state.timers.push(window.setTimeout(() => emitStep(0), 300))
  return done
}

export function sampleState(): 'idle' | 'playing' | 'done' {
  return getSampleState()
}

// ------------------------------------------------------------------ views over the day

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function emittedTs(id: number): number | undefined {
  return live?.emitted.find((e) => e.id === id)?.ts
}

/** The showpiece's row as the replay has it, or null before it starts. */
function liveRow(): WireCallRow | null {
  if (!live || live.emitted.length === 0) return null
  const ids = new Set(live.emitted.map((e) => e.id))
  const events = day.live.detail.events.filter((e) => ids.has(e.id))
  const bookings = events.filter((e) => e.kind === 'booking').length
  const notes = events.filter((e) => e.kind === 'note').length
  const row = clone(day.live.row)
  const firstCaller = events.find((e) => e.kind === 'turn.caller')
  const turns = events.reduce((m, e) => Math.max(m, e.turn), 0)
  if (live.endedAt === null) {
    return {
      ...row,
      started_at: live.startedAt,
      ended_at: null,
      duration_s: null,
      status: 'live',
      disposition: 'live',
      bookings,
      notes,
      turns,
      first_line: firstCaller && firstCaller.kind === 'turn.caller' ? firstCaller.data.text : '',
    }
  }
  // The call's own length from its call.ended (130 s), not the time the replay took: at 2x the
  // replay runs 65 s but the call it shows still lasted 2:10.
  const ended = day.live.steps.find((s) => s.event.kind === 'call.ended')?.event
  const duration = ended && ended.kind === 'call.ended' ? ended.data.duration_s : row.duration_s
  return {
    ...row,
    started_at: live.startedAt,
    ended_at: live.endedAt,
    duration_s: duration,
    bookings,
    notes,
  }
}

function allCalls(): WireCallRow[] {
  const r = liveRow()
  return r ? [r, ...day.calls] : day.calls
}

function liveRows<T extends { id: number; ts: number }>(m: Map<number, T>): T[] {
  if (!live) return []
  const out: T[] = []
  for (const [id, row] of m) {
    const ts = emittedTs(id)
    if (ts !== undefined) out.push({ ...row, ts })
  }
  return out
}

const desc = <T extends { ts: number; id: number }>(a: T, b: T) => b.ts - a.ts || b.id - a.id

function allBookings(): Booking[] {
  return [...liveRows(day.live.bookings), ...day.bookings].sort(desc)
}
function allNotes(): Note[] {
  return [...liveRows(day.live.notes), ...day.notes].sort(desc)
}
function allSms(): Sms[] {
  return [...liveRows(day.live.sms), ...day.sms].sort(desc)
}

function statusBody(): StatusResponse {
  const base = clone(day.status)
  base.now = nowSec()
  if (live && live.emitted.length > 0 && (base.last_call_at === null || live.startedAt > base.last_call_at)) {
    base.last_call_at = live.startedAt
  }
  if (live && live.emitted.length > 0 && live.endedAt === null) return { ...base, line: 'on-call', live_calls: 1 }
  return { ...base, line: 'idle', live_calls: 0 }
}

function statsBody(daysParam: string | null): StatsResponse {
  const days = Math.min(30, Math.max(1, Math.floor(Number(daysParam) || 1)))
  return computeStats(
    { calls: allCalls(), bookings: allBookings(), notes: allNotes(), sms: allSms() },
    { from: day.midnight(days - 1), to: nowSec(), days, tz: day.tz },
  )
}

function limitOf(p: string | null): number {
  return Math.max(1, Math.floor(Number(p) || 50))
}

function detailBody(id: string): { status: number; body: unknown } {
  if (id === day.live.callId) {
    const row = liveRow()
    if (!row || !live) return { status: 404, body: { detail: 'call not found' } }
    const { first_line: _drop, ...call } = row
    void _drop
    const events = live.emitted
      .map((em) => {
        const e = day.live.detail.events.find((x) => x.id === em.id)
        return e ? { ...clone(e), ts: em.ts } : null
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
    const out: WireCallDetailResponse = { call, events }
    return { status: 200, body: out }
  }
  const d = day.details.get(id)
  if (!d) return { status: 404, body: { detail: 'call not found' } }
  return { status: 200, body: clone(d) }
}

// ------------------------------------------------------------------ reveal

const MASKED = /^(\(\d{3}\) )\*\*\*(-\d{4})$/
const FULL_IN_TEXT = /\((\d{3})\) 555-(\d{4})/g
const PHONE_KEYS = new Set(['caller', 'phone'])

/**
 * reveal=1: caller / phone fields become the full number from caller_full (by the row's
 * call_id; nested event fields by the enclosing call). Without it, numbers inside free text
 * (a note's "contact number is ...") are masked too, so nothing full leaves masked mode.
 */
function present<T>(v: T, reveal: boolean, callId: string | null = null): T {
  if (typeof v === 'string') {
    if (!reveal) return v.replace(FULL_IN_TEXT, '($1) ***-$2') as T
    return v
  }
  if (Array.isArray(v)) return v.map((x) => present(x, reveal, callId)) as T
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>
    const id = typeof obj.call_id === 'string' ? obj.call_id : callId
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(obj)) {
      if (reveal && PHONE_KEYS.has(k) && typeof val === 'string' && MASKED.test(val)) {
        out[k] = (id && day.callerFull.get(id)) || val.replace(MASKED, '$1555$2')
      } else {
        out[k] = present(val, reveal, id)
      }
    }
    return out as T
  }
  return v
}

// ------------------------------------------------------------------ routes

export function demoRoute(
  path: string,
  params: URLSearchParams,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): { status: number; body: unknown } {
  // The lead routes (two GETs and the coordinator's tap) apply reveal themselves.
  const lead = leadsRoute(leads(), method, path, params, body, nowSec())
  if (lead) return lead
  if (method !== 'GET') return { status: 404, body: { error: 'not found' } }
  const p = path.replace(/\/+$/, '')
  const reveal = params.get('reveal') === '1'
  let res: { status: number; body: unknown }
  if (p === '/status') res = { status: 200, body: statusBody() }
  else if (p === '/stats') res = { status: 200, body: statsBody(params.get('days')) }
  else if (p === '/calls') {
    const before = params.get('before') ? Number(params.get('before')) : Infinity
    const rows = allCalls()
      .filter((c) => c.started_at < before)
      .slice(0, limitOf(params.get('limit')))
    res = { status: 200, body: { calls: clone(rows) } }
  } else if (/^\/calls\/[^/]+$/.test(p)) {
    res = detailBody(decodeURIComponent(p.slice('/calls/'.length)))
  } else if (p === '/bookings') res = { status: 200, body: { bookings: clone(allBookings().slice(0, limitOf(params.get('limit')))) } }
  else if (p === '/notes') res = { status: 200, body: { notes: clone(allNotes().slice(0, limitOf(params.get('limit')))) } }
  else if (p === '/sms') res = { status: 200, body: { sms: clone(allSms().slice(0, limitOf(params.get('limit')))) } }
  else res = { status: 404, body: { detail: 'not found' } }
  if (res.status === 200) res.body = present(res.body, reveal)
  return res
}

/** Playwright / console checks: counters and the day's date only, never rows. */
export function demoDebug(): { day0: string; now: number; plays: number; events: number; sample: string } {
  const { y, m, d } = day.day0
  return {
    day0: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    now: day.nowSec,
    plays: counters.plays,
    events: counters.events,
    sample: getSampleState(),
  }
}
