// The mock backend: answers every /api/dash/* path from the fixtures, and replays a live call
// through a FakeEventSource. Loaded only when a mock scenario is on (see ./mode.ts), as its own
// chunk, so the production bundle carries no fixtures unless ?mock is used.
//
// Stateful replay (scenario "fixtures" and "slow"): from the first stream connection, one event
// every 2 s from stream-sample.txt (call CA294650154870), a 6 s pause, then the events of
// call-CA860072416005.json in the same stream format (it has a `booking`), then silence.
// A replayed call happens "now" on the mock clock: from its call.started it starts at the mock
// time of that event (not its fixture time), every replayed event carries the mock time it was
// emitted as its ts, and its row sorts to the top of /calls. While it is between call.started
// and call.ended:
//   /status -> line "on-call", live_calls 1, last_call_at = its start
//   /calls  -> that row has status "live", disposition "live", ended_at null, duration_s null,
//              bookings / notes = the booking / note events emitted so far
//   /calls/:id -> the events emitted so far, call.status "live"
// After its call.ended the row keeps the replay's times (ended_at, duration_s) and counts, with
// the fixture's disposition and status, so it does not jump back to its fixture time.
//
// Reveal: fixtures are masked "(656) ***-0150". With reveal=1 the mock answers the
// deterministic "(656) 555-0150": "***" becomes "555", which with these 01xx endings lands in
// the reserved fictional 555-0100..0199 range. Nothing else is invented.
//
// Leads: the lead record lives in ./leadStore (in memory, for the tab), seeded from
// fixtures/leads.json, which the real backend wrote (scripts/leads-fixtures.py). It answers the
// two GETs and the one POST (a coordinator's tap) like the box does, reveal included: the box
// sends the raw ten digits for a revealed lead phone, and so does the store.
//
// Scenario "demo" (mock=demo) answers from ./demo/backend instead: the made-up practice day on
// the real date, no timeline on connect; its sample call is started from ../demoControl and goes
// out through the same FakeEventSource fan-out (./hub).

import type {
  CallEvent,
  DashEvent,
  LeadRow,
  StatsResponse,
  StatusResponse,
  WireCallDetailResponse,
  WireCallRow,
} from '../api/types'
import { nowSec, setClockTo } from '../lib/clock'
import { zonedMidnight } from '../lib/time'
import { getMockScenario, type MockScenario } from './mode'
import { addStreamListener, broadcast } from './hub'
import { createLeadStore, leadsRoute, patchLead, type LeadSeed, type LeadStore } from './leadStore'
import statusFx from './fixtures/status.json'
import statsFx from './fixtures/stats.json'
import stats7Fx from './fixtures/stats-7d.json'
import callsFx from './fixtures/calls.json'
import bookingsFx from './fixtures/bookings.json'
import notesFx from './fixtures/notes.json'
import smsFx from './fixtures/sms.json'
import leadsRaw from './fixtures/leads.json?raw'
import streamRaw from './fixtures/stream-sample.txt?raw'

const detailModules = import.meta.glob<WireCallDetailResponse>('./fixtures/call-*.json', {
  eager: true,
  import: 'default',
})
const DETAILS = new Map<string, WireCallDetailResponse>()
for (const mod of Object.values(detailModules)) DETAILS.set(mod.call.call_id, mod)

const STATUS = statusFx as unknown as StatusResponse
const STATS1 = statsFx as unknown as StatsResponse
const STATS7 = stats7Fx as unknown as StatsResponse
const CALLS = (callsFx as unknown as { calls: WireCallRow[] }).calls

const EVENT_GAP_MS = 2000
const BETWEEN_CALLS_MS = 6000
const SLOW_MS = 1500
const SECOND_CALL = 'CA860072416005'

function scenario(): MockScenario {
  return getMockScenario() ?? 'fixtures'
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

const MASKED = /^(\(\d{3}\) )\*\*\*(-\d{4})$/
function unmask<T>(v: T): T {
  if (typeof v === 'string') return (MASKED.test(v) ? v.replace(MASKED, '$1555$2') : v) as T
  if (Array.isArray(v)) return v.map(unmask) as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[k] = unmask(val)
    return out as T
  }
  return v
}

// ------------------------------------------------------------------ the replay timeline

export function parseStreamText(raw: string): DashEvent[] {
  const out: DashEvent[] = []
  for (const block of raw.split(/\r?\n\r?\n/)) {
    let kind = ''
    let data = ''
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) kind = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (kind && data) {
      const parsed = JSON.parse(data) as DashEvent
      out.push({ ...parsed, kind: kind as DashEvent['kind'] } as DashEvent)
    }
  }
  return out
}

function detailAsStream(callId: string): DashEvent[] {
  const d = DETAILS.get(callId)
  if (!d) return []
  return d.events.map(
    (e: CallEvent) => ({ ts: e.ts, call_id: callId, kind: e.kind, turn: e.turn, data: e.data }) as DashEvent,
  )
}

interface Step {
  delay: number
  event: DashEvent
}

function buildSchedule(): Step[] {
  const steps: Step[] = []
  parseStreamText(streamRaw).forEach((event) => steps.push({ delay: EVENT_GAP_MS, event }))
  detailAsStream(SECOND_CALL).forEach((event, i) =>
    steps.push({ delay: i === 0 ? BETWEEN_CALLS_MS : EVENT_GAP_MS, event }),
  )
  return steps
}

type Listener = (e: DashEvent) => void
let timelineStarted = false
let liveCallId: string | null = null

/** One replayed call, on the mock clock. */
interface Replayed {
  startedAt: number
  endedAt: number | null
  /** The mock time each emitted event went out, in order (the detail's event ts). */
  ts: number[]
  bookings: number
  notes: number
}
const replayed = new Map<string, Replayed>()

function emit(raw: DashEvent): void {
  debug.events += 1
  const now = nowSec()
  const e = { ...raw, ts: now } as DashEvent
  if (e.kind === 'call.started') {
    liveCallId = e.call_id
    // A call's detail list restarts when its replay starts.
    replayed.set(e.call_id, { startedAt: now, endedAt: null, ts: [], bookings: 0, notes: 0 })
  }
  const r = replayed.get(e.call_id)
  if (r) {
    r.ts.push(now)
    if (e.kind === 'booking') r.bookings += 1
    if (e.kind === 'note') r.notes += 1
    if (e.kind === 'call.ended') r.endedAt = now
  }
  if (e.kind === 'call.ended' && liveCallId === e.call_id) liveCallId = null
  broadcast(e)
}

function startTimeline(): void {
  if (timelineStarted) return
  timelineStarted = true
  const s = scenario()
  // The demo has no timeline: its sample call starts from the demo menu (demoControl).
  if (s === 'empty' || s === 'error' || s === 'demo') return
  const steps = buildSchedule()
  let i = 0
  const next = () => {
    const step = steps[i]
    if (!step) return
    window.setTimeout(() => {
      emit(step.event)
      i += 1
      next()
    }, step.delay)
  }
  next()
}

// ------------------------------------------------------------------ FakeEventSource

/** Counters for the Playwright checks (window.__katieMock). */
const debug = { streams: 0, events: 0, requests: {} as Record<string, number> }

type MsgHandler = (ev: MessageEvent) => void

/** Just enough of EventSource for src/live/stream.ts. */
export class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  readonly url: string
  readyState = 0
  onopen: ((ev: Event) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: MsgHandler | null = null
  private handlers = new Map<string, Set<MsgHandler>>()
  private listener: Listener | null = null
  private unlisten: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    debug.streams += 1
    window.setTimeout(() => this.connect(), 50)
  }

  private connect(): void {
    if (this.readyState === 2) return
    if (scenario() === 'error') {
      this.readyState = 2
      this.onerror?.(new Event('error'))
      return
    }
    this.readyState = 1
    this.onopen?.(new Event('open'))
    this.listener = (e) => {
      const ev = new MessageEvent(e.kind, { data: JSON.stringify(e) })
      this.handlers.get(e.kind)?.forEach((h) => h(ev))
    }
    this.unlisten = addStreamListener(this.listener)
    startTimeline()
  }

  addEventListener(type: string, handler: MsgHandler): void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler)
  }

  removeEventListener(type: string, handler: MsgHandler): void {
    this.handlers.get(type)?.delete(handler)
  }

  close(): void {
    this.readyState = 2
    this.unlisten?.()
    this.unlisten = null
    this.listener = null
  }
}

// ------------------------------------------------------------------ HTTP handlers

export interface MockResponse {
  status: number
  body: unknown
}

/** A row as the replay has it: live (no end yet) or ended at the replay's times. */
function replayRow<T extends Omit<WireCallRow, 'first_line'>>(row: T): T {
  const r = replayed.get(row.call_id)
  if (!r) return row
  const counts = { started_at: r.startedAt, bookings: r.bookings, notes: r.notes }
  if (row.call_id === liveCallId || r.endedAt === null) {
    return { ...row, ...counts, status: 'live', disposition: 'live', ended_at: null, duration_s: null }
  }
  return { ...row, ...counts, ended_at: r.endedAt, duration_s: r.endedAt - r.startedAt }
}

function lastReplayStart(): number | null {
  let last: number | null = null
  for (const r of replayed.values()) if (last === null || r.startedAt > last) last = r.startedAt
  return last
}

function statusBody(): StatusResponse {
  const base = clone(STATUS)
  base.now = nowSec()
  if (scenario() === 'empty') {
    return { ...base, line: 'idle', live_calls: 0, last_call_at: null }
  }
  const replayStart = lastReplayStart()
  if (replayStart !== null && (base.last_call_at === null || replayStart > base.last_call_at)) {
    base.last_call_at = replayStart
  }
  if (liveCallId) return { ...base, line: 'on-call', live_calls: 1 }
  return { ...base, line: 'idle', live_calls: 0 }
}

function statsBody(daysParam: string | null): StatsResponse {
  const days = Math.min(90, Math.max(1, Math.floor(Number(daysParam) || 1)))
  const src = days === 1 ? STATS1 : STATS7
  const out = clone(src)
  out.range = {
    ...out.range,
    days,
    from: days === 1 ? STATS1.range.from : zonedMidnight(STATS1.range.from, STATS1.range.tz, days - 1),
    to: nowSec(),
  }
  if (scenario() === 'empty') {
    return {
      ...out,
      calls: 0,
      booked_calls: 0,
      bookings: 0,
      callbacks: 0,
      urgent: 0,
      sms_out: 0,
      sms_in: 0,
      avg_duration_s: 0,
      by_hour: out.by_hour.map((b) => ({ ...b, calls: 0, booked: 0 })),
      dispositions: {},
      languages: {},
    }
  }
  return out
}

function callsBody(limitParam: string | null, beforeParam: string | null): { calls: WireCallRow[] } {
  if (scenario() === 'empty') return { calls: [] }
  const limit = Math.max(1, Math.floor(Number(limitParam) || 50))
  const before = beforeParam ? Number(beforeParam) : Infinity
  const rows = clone(CALLS)
    .map(replayRow)
    .sort((a, b) => b.started_at - a.started_at)
    .filter((c) => c.started_at < before)
    .slice(0, limit)
  return { calls: rows }
}

function detailBody(id: string): MockResponse {
  const d = scenario() === 'empty' ? undefined : DETAILS.get(id)
  if (!d) return { status: 404, body: { detail: 'call not found' } }
  const out = clone(d)
  const r = replayed.get(id)
  if (r) {
    out.call = replayRow(out.call)
    out.events = out.events.slice(0, r.ts.length).map((e, i) => ({ ...e, ts: r.ts[i] ?? e.ts }))
  }
  return { status: 200, body: out }
}

function listBody<K extends string>(key: K, rows: unknown[], limitParam: string | null): Record<K, unknown[]> {
  const limit = Math.max(1, Math.floor(Number(limitParam) || 50))
  return { [key]: scenario() === 'empty' ? [] : clone(rows).slice(0, limit) } as Record<K, unknown[]>
}

function route(path: string, params: URLSearchParams): MockResponse {
  const p = path.replace(/\/+$/, '')
  if (p === '/status') return { status: 200, body: statusBody() }
  if (p === '/stats') return { status: 200, body: statsBody(params.get('days')) }
  if (p === '/calls') return { status: 200, body: callsBody(params.get('limit'), params.get('before')) }
  const m = /^\/calls\/([^/]+)$/.exec(p)
  if (m && m[1]) return detailBody(decodeURIComponent(m[1]))
  if (p === '/bookings') return { status: 200, body: listBody('bookings', bookingsFx.bookings, params.get('limit')) }
  if (p === '/notes') return { status: 200, body: listBody('notes', notesFx.notes, params.get('limit')) }
  if (p === '/sms') return { status: 200, body: listBody('sms', smsFx.sms, params.get('limit')) }
  return { status: 404, body: { detail: 'not found' } }
}

// The lead record of this tab: taps change it, a reload starts it over. Empty in "empty".
let leadStore: LeadStore | null = null
function leads(): LeadStore {
  leadStore ??= createLeadStore(scenario() === 'empty' ? null : (JSON.parse(leadsRaw) as LeadSeed))
  return leadStore
}

type DemoBackend = typeof import('./demo/backend')
let demo: DemoBackend | null = null
let demoLoading: Promise<DemoBackend> | null = null

/** The demo backend, loaded once (its own chunk: the dataset is only fetched for mock=demo). */
export function loadDemoBackend(): Promise<DemoBackend> {
  demoLoading ??= import('./demo/backend').then((m) => {
    demo = m
    return m
  })
  return demoLoading
}

async function answer(
  method: 'GET' | 'POST',
  path: string,
  params: URLSearchParams,
  body: unknown,
  signal?: AbortSignal,
): Promise<MockResponse> {
  const counted = method === 'GET' ? path : `${method} ${path}`
  debug.requests[counted] = (debug.requests[counted] ?? 0) + 1
  const s = scenario()
  const latency = s === 'slow' ? SLOW_MS : 30
  await new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(resolve, latency)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
  if (s === 'error') return { status: 500, body: { detail: 'mock error scenario' } }
  // The demo backend applies reveal itself (from caller_full).
  if (s === 'demo') return (demo ?? (await loadDemoBackend())).demoRoute(path, params, method, body)
  // The lead routes apply reveal themselves, the way the box does.
  const lead = leadsRoute(leads(), method, path, params, body, nowSec())
  if (lead) return lead
  if (method !== 'GET') return { status: 404, body: { error: 'not found' } }
  const res = route(path, params)
  if (res.status === 200 && params.get('reveal') === '1') res.body = unmask(res.body)
  return res
}

/** Answers one GET. `path` is relative to /api/dash, e.g. "/calls/CA1". */
export function mockFetch(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<MockResponse> {
  return answer('GET', path, params, undefined, signal)
}

/** Answers one POST: a coordinator's tap on a lead ("/leads/:id/action"); anything else is 404. */
export function mockPost(path: string, params: URLSearchParams, body: unknown, signal?: AbortSignal): Promise<MockResponse> {
  return answer('POST', path, params, body, signal)
}

/**
 * Called once from main.tsx before the first render: pins the clock to the fixtures' "now", or
 * for mock=demo loads the demo day and pins the clock to its NOW (day 0, 21:10).
 */
export async function installMock(): Promise<void> {
  // Mock mode only: a handle for Playwright checks (the data is fictional; never set in real mode).
  const w = window as unknown as { __katieMock?: unknown; __katieDemo?: unknown }
  w.__katieMock = {
    get: (path: string, query = '') => mockFetch(path, new URLSearchParams(query)),
    post: (path: string, body: unknown = {}) => mockPost(path, new URLSearchParams(), body),
    /**
     * Sets fields on one mock lead, e.g. the reserved next_text_at / call_now the next backend
     * pieces will send, so the page's reserved slots can be looked at before they exist.
     */
    patchLead: async (id: string, fields: Partial<LeadRow>): Promise<boolean> =>
      scenario() === 'demo' ? (demo ?? (await loadDemoBackend())).patchDemoLead(id, fields) : patchLead(leads(), id, fields),
    debug,
  }
  if (scenario() === 'demo') {
    const b = await loadDemoBackend()
    b.pinClock()
    // Console and Playwright: drive the demo without the menu. Functions and counters only.
    const control = await import('./demoControl')
    w.__katieDemo = {
      playSampleCall: control.playSampleCall,
      resetDay: control.resetDay,
      sampleCallState: control.sampleCallState,
      debug: b.demoDebug,
    }
    return
  }
  setClockTo(STATUS.now)
}
