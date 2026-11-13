// The live stream: one EventSource('/api/dash/stream') per tab (FakeEventSource in mock mode),
// reconnect backoff 1, 2, 4, 8, 16, 30 s, TanStack Query invalidation per DESIGN.md 5, and a tiny
// typed event bus for Katie. No state library.

//
// Real mode (the default): a real EventSource on the same origin. The browser carries the
// basic-auth session; ": ping" comments every 15 s are swallowed by EventSource itself. Events
// often arrive in bursts with one timestamp (a reply's sentences, sms.out + call.ended at hang-up),
// so invalidations are coalesced: one refetch per query per burst, and every event's `refreshed`
// resolves after that refetch.

import type { QueryClient } from '@tanstack/react-query'
import { EVENT_KINDS, type DashEvent, type EventKind } from '../api/types'
import { qk } from '../api/queries'
import { apiBase, getAuthState, subscribeAuthState } from '../api/client'
import { authHeaders, authMode, notifyUnauthorized, parseUnauthorized } from '../auth/bridge'
import { getMockScenario } from '../mock/mode'
import { FetchEventSource } from './sse'

// ------------------------------------------------------------------ event bus

export interface DashEventMeta {
  /** Resolves when the queries this event invalidated have refetched (or failed). */
  refreshed: Promise<void>
}

type Handler<K extends EventKind> = (event: DashEvent<K>, meta: DashEventMeta) => void
type AnyHandler = (event: DashEvent, meta: DashEventMeta) => void

const handlers = new Map<EventKind | '*', Set<AnyHandler>>()

/**
 * Subscribe to stream events of one kind, or '*' for all. Returns unsubscribe.
 *   const off = onDashEvent('booking', (e) => celebrate(e.data.name))
 */
export function onDashEvent<K extends EventKind>(kind: K, handler: Handler<K>): () => void
export function onDashEvent(kind: '*', handler: AnyHandler): () => void
export function onDashEvent(kind: EventKind | '*', handler: AnyHandler): () => void {
  let set = handlers.get(kind)
  if (!set) {
    set = new Set()
    handlers.set(kind, set)
  }
  set.add(handler)
  return () => {
    set.delete(handler)
  }
}

function dispatch(event: DashEvent, meta: DashEventMeta): void {
  for (const key of [event.kind, '*'] as const) {
    const set = handlers.get(key)
    if (!set) continue
    for (const h of [...set]) {
      try {
        h(event, meta)
      } catch (err) {
        // A broken subscriber must not stop the stream. Log the kind only, never the payload.
        void err
        console.warn(`dash event handler failed for ${event.kind}`)
      }
    }
  }
}

// ------------------------------------------------------------------ connection state

export type StreamState = 'connecting' | 'open' | 'waiting' | 'stopped'
let state: StreamState = 'stopped'
const stateListeners = new Set<() => void>()

function setState(s: StreamState): void {
  if (s === state) return
  state = s
  for (const l of stateListeners) l()
}

export function getStreamState(): StreamState {
  return state
}

export function subscribeStreamState(listener: () => void): () => void {
  stateListeners.add(listener)
  return () => {
    stateListeners.delete(listener)
  }
}

// ------------------------------------------------------------------ invalidation

function invalidate(qc: QueryClient, e: DashEvent): Promise<void> {
  const keys: (readonly unknown[])[] = []
  switch (e.kind) {
    case 'call.started':
      keys.push(qk.status(), qk.callsAll())
      break
    case 'booking':
      keys.push(qk.bookings(), ['dash', 'stats'], qk.callsAll())
      break
    case 'note':
      keys.push(qk.notes(), ['dash', 'stats'])
      break
    case 'sms.out':
    case 'sms.in':
      keys.push(qk.sms(), ['dash', 'stats'])
      break
    case 'call.ended':
      keys.push(qk.status(), qk.callsAll(), ['dash', 'stats'])
      break
    case 'cancel':
      keys.push(qk.bookings(), ['dash', 'stats'])
      break
    default:
      break
  }
  // Every event belongs to a call: an open drawer for it appends the event (only active
  // queries refetch, so this is free when no drawer shows that call).
  if (e.call_id) keys.push(qk.callAll(e.call_id))
  return queueInvalidation(qc, keys)
}

// A burst of events (same tick, or within BATCH_MS) invalidates each key once.
const BATCH_MS = 40
let pendingKeys = new Map<string, readonly unknown[]>()
let pendingWaiters: (() => void)[] = []
let batchTimer: number | undefined

function queueInvalidation(qc: QueryClient, keys: (readonly unknown[])[]): Promise<void> {
  for (const k of keys) pendingKeys.set(JSON.stringify(k), k)
  const done = new Promise<void>((resolve) => pendingWaiters.push(resolve))
  if (batchTimer === undefined) {
    batchTimer = window.setTimeout(() => {
      batchTimer = undefined
      const batch = [...pendingKeys.values()]
      const waiters = pendingWaiters
      pendingKeys = new Map()
      pendingWaiters = []
      void Promise.all(batch.map((queryKey) => qc.invalidateQueries({ queryKey }).catch(() => undefined))).then(
        () => waiters.forEach((w) => w()),
      )
    }, BATCH_MS)
  }
  return done
}

/**
 * Refetch every dash query now (the demo's Reset). Resolves when the active ones have refetched;
 * a no-op before the shell starts the stream.
 */
export function invalidateAllDashQueries(): Promise<void> {
  if (!client) return Promise.resolve()
  return client.invalidateQueries({ queryKey: qk.all }).catch(() => undefined)
}

// ------------------------------------------------------------------ connection

interface EventSourceLike {
  readonly readyState: number
  onopen: ((ev: Event) => void) | null
  onerror: ((ev: Event) => void) | null
  addEventListener(type: string, handler: (ev: MessageEvent) => void): void
  close(): void
}

const BACKOFF_S = [1, 2, 4, 8, 16, 30]
/** A connection that stayed open this long counts as healthy: the next error starts at 1 s. */
const HEALTHY_MS = 30_000

let client: QueryClient | null = null
let source: EventSourceLike | null = null
let refs = 0
let attempt = 0
let retryTimer: number | undefined
let generation = 0
/** True after the first successful open: a later open may have missed events. */
let everOpened = false
let authOff: (() => void) | null = null

function streamUrl(): string {
  return `${apiBase()}/stream`
}

function handleMessage(gen: number, kind: string, raw: unknown): void {
  if (gen !== generation || !client) return
  let event: DashEvent
  try {
    const parsed = JSON.parse(String(raw)) as DashEvent
    if (!parsed || typeof parsed !== 'object') return
    const k = (EVENT_KINDS as readonly string[]).includes(kind) ? kind : parsed.kind
    // Unknown kinds (a newer backend) are ignored, never guessed at.
    if (!(EVENT_KINDS as readonly string[]).includes(k)) return
    event = { ...parsed, kind: k } as DashEvent
  } catch {
    return
  }
  const refreshed = invalidate(client, event)
  dispatch(event, { refreshed })
}

async function open(): Promise<void> {
  const gen = ++generation
  setState('connecting')
  let es: EventSourceLike
  if (getMockScenario()) {
    const { FakeEventSource } = await import('../mock/server')
    if (gen !== generation) return
    es = new FakeEventSource(streamUrl())
  } else if (authMode() === 'cognito') {
    // EventSource cannot send a header and a token never goes in a URL: read the stream with
    // fetch (Authorization: Bearer ...) and parse it here (src/live/sse.ts).
    es = new FetchEventSource(streamUrl(), {
      headers: () => authHeaders(),
      onStatus: (status, body) => {
        if (status === 401) notifyUnauthorized(parseUnauthorized(body))
      },
    })
  } else {
    // Same origin: the browser sends the basic-auth session with the request.
    es = new EventSource(streamUrl())
  }
  source = es
  let openedAt = 0

  es.onopen = () => {
    if (gen !== generation) return
    // After a reconnect we may have missed events: refresh everything once.
    if (everOpened && client) void client.invalidateQueries({ queryKey: qk.all })
    everOpened = true
    openedAt = Date.now()
    setState('open')
  }

  es.onerror = () => {
    if (gen !== generation) return
    // Take over from the browser's own retry so the backoff is ours. A 401 / 5xx on connect and
    // a dropped connection both land here (EventSource does not expose the status).
    es.close()
    source = null
    if (openedAt && Date.now() - openedAt >= HEALTHY_MS) attempt = 0
    scheduleReconnect()
  }

  for (const kind of EVENT_KINDS) {
    es.addEventListener(kind, (msg: MessageEvent) => handleMessage(gen, kind, msg.data))
  }
  // An event sent without an "event:" line arrives as "message"; its JSON carries the kind.
  es.addEventListener('message', (msg: MessageEvent) => handleMessage(gen, 'message', msg.data))
}

function scheduleReconnect(): void {
  if (refs <= 0) return
  window.clearTimeout(retryTimer)
  setState('waiting')
  // Signed out: wait until a request succeeds again (the shell asks the person to reload).
  if (getAuthState() === 'signed-out') {
    if (!authOff) {
      authOff = subscribeAuthState(() => {
        if (getAuthState() !== 'ok') return
        authOff?.()
        authOff = null
        if (refs > 0 && !source) void open()
      })
    }
    return
  }
  const delay = BACKOFF_S[Math.min(attempt, BACKOFF_S.length - 1)] as number
  attempt += 1
  retryTimer = window.setTimeout(() => {
    if (refs > 0) void open()
  }, delay * 1000)
}

/**
 * Start the tab's stream (idempotent; the shell calls it once). Returns stop. Reference
 * counted so React StrictMode's mount/unmount/mount keeps a single connection.
 */
export function startDashStream(qc: QueryClient): () => void {
  client = qc
  refs += 1
  if (refs === 1 && !source && state !== 'connecting' && state !== 'waiting') void open()
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    refs -= 1
    // Defer so an immediate re-mount (StrictMode) reuses the connection.
    window.setTimeout(() => {
      if (refs > 0) return
      generation += 1
      window.clearTimeout(retryTimer)
      authOff?.()
      authOff = null
      source?.close()
      source = null
      attempt = 0
      setState('stopped')
    }, 0)
  }
}
