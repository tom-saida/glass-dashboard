// Same-origin fetch of /api/dash/*. The browser carries the basic-auth session; the front end
// has no credentials. Revealed numbers: requests carry reveal=1 only when Show numbers is on,
// use cache "no-store" so nothing lands in the HTTP cache, and nothing here logs a URL or a body.

import type {
  BookingsResponse,
  CallDetail,
  CallRow,
  LeadActionBody,
  LeadActionResponse,
  LeadDetail,
  LeadsFilter,
  LeadsResponse,
  NotesResponse,
  SmsResponse,
  StatsResponse,
  StatusResponse,
  WireCallDetailResponse,
  WireCallRow,
  WireCallsResponse,
} from './types'
import { getMockScenario } from '../mock/mode'
import { DEFAULT_API_BASE, getSettings } from '../settings/store'
import {
  authHeaders,
  authMode,
  isMockAuth,
  notifyUnauthorized,
  parseUnauthorized,
} from '../auth/bridge'

// Real mode is the default: with no mock flag every request is a relative, same-origin
// /api/dash/... call. In production the base is the constant "/api/dash" (import.meta.env.DEV is
// false at build time, so the dev-only setting is compiled out).

export type ApiErrorKind = 'http' | 'network' | 'parse' | 'aborted'

/** Every failed request throws this. `status` is 0 for network/parse/aborted. */
export class ApiError extends Error {
  readonly status: number
  readonly kind: ApiErrorKind
  /** The server's own plain words ({"error": "..."}), when it sent some. */
  readonly detail?: string
  constructor(kind: ApiErrorKind, status: number, message: string, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.detail = detail
  }
  get isNotFound(): boolean {
    return this.kind === 'http' && this.status === 404
  }
  /** 401: the basic-auth session is gone (or the dev proxy's pair is wrong). Never retried. */
  get isUnauthorized(): boolean {
    return this.kind === 'http' && this.status === 401
  }
  /** 403: signed in, but this person may not see it. Never retried. */
  get isForbidden(): boolean {
    return this.kind === 'http' && this.status === 403
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

type Params = Record<string, string | number | undefined | null>

interface GetOptions {
  reveal?: boolean
  signal?: AbortSignal
}

/** "/api/dash" in production; the (same-origin, sanitized) Settings value in development. */
export function apiBase(): string {
  if (import.meta.env.DEV) return getSettings().apiBase || DEFAULT_API_BASE
  return DEFAULT_API_BASE
}

// ------------------------------------------------------------------ sign-in state

/**
 * 'ok' until a request answers 401, then 'signed-out' until any request succeeds again. The
 * shell shows one line for it, polling and the stream's reconnects pause, and nothing retries,
 * so the browser is not asked to show its sign-in prompt over and over.
 */
export type AuthState = 'ok' | 'signed-out' | 'not-allowed'
let authState: AuthState = 'ok'
const authListeners = new Set<() => void>()

function setAuthState(next: AuthState): void {
  if (next === authState) return
  authState = next
  for (const l of [...authListeners]) l()
}

/** A new sign-in succeeded: requests are expected to work again. */
export function markAuthOk(): void {
  setAuthState('ok')
}

export function getAuthState(): AuthState {
  return authState
}

export function subscribeAuthState(listener: () => void): () => void {
  authListeners.add(listener)
  return () => {
    authListeners.delete(listener)
  }
}

type DebugLog = { requests: { method: string; url: string; authorization: string | null }[] }

/** The URL of a request: path and plain parameters only. Never a token, password or code. */
export function buildUrl(path: string, qs: URLSearchParams): string {
  const query = qs.toString()
  return `${apiBase()}${path}${query ? `?${query}` : ''}`
}

/** Mock + ?auth=1: what each request would have carried, for the verifier (fake tokens only). */
async function recordMock(method: string, url: string): Promise<void> {
  const w = window as unknown as { __katieAuthDebug?: DebugLog }
  const log = (w.__katieAuthDebug ??= { requests: [] })
  const h = await authHeaders()
  log.requests.push({ method, url, authorization: h.Authorization ?? null })
  if (log.requests.length > 500) log.requests.shift()
}

async function mockRequest<T>(method: 'GET' | 'POST', path: string, qs: URLSearchParams, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: { status: number; body: unknown }
  // The one POST the practice data has: a coordinator's tap on a lead. The mock server keeps the
  // lead record (in memory, for the tab) and answers it like the box does.
  const isLeadTap = method === 'POST' && /^\/leads\/[^/]+\/action\/?$/.test(path)
  const data = async () => {
    const server = await import('../mock/server')
    return method === 'POST' ? server.mockPost(path, qs, body, signal) : server.mockFetch(path, qs, signal)
  }
  try {
    if (isMockAuth()) {
      await recordMock(method, buildUrl(path, qs))
      const back = await import('../auth/mockBackend')
      const isAuthPath = /^\/(me|people|activity|support|session)(\/|$)/.test(path)
      const gate = back.mockAuthGate()
      if (gate) res = gate
      else if (isAuthPath || (method === 'POST' && !isLeadTap)) res = back.mockAuthRoute(method, path, body, qs)
      else res = await data()
    } else if (method === 'POST' && !isLeadTap) {
      res = { status: 404, body: { error: 'not available here' } }
    } else {
      res = await data()
    }
  } catch (e) {
    throw new ApiError('aborted', 0, e instanceof Error ? e.message : 'Aborted')
  }
  return finish<T>(res.status, res.body)
}

function detailOf(body: unknown): string | undefined {
  const e = body && typeof body === 'object' ? (body as { error?: unknown }).error : null
  return typeof e === 'string' && e ? e : undefined
}

/** Shared tail of mock and real answers: status mapping, sign-in state, errors. */
function finish<T>(status: number, body: unknown): T {
  if (status === 401) {
    if (authMode() === 'cognito') notifyUnauthorized(parseUnauthorized(body))
    setAuthState('signed-out')
    throw new ApiError('http', 401, 'HTTP 401', detailOf(body))
  }
  if (status === 403) {
    setAuthState('not-allowed')
    throw new ApiError('http', 403, 'HTTP 403', detailOf(body) ?? 'not allowed')
  }
  if (status < 200 || status >= 300) throw new ApiError('http', status, `HTTP ${status}`, detailOf(body))
  setAuthState('ok')
  return body as T
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  params: Params,
  body: unknown,
  opts: GetOptions,
): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  if (opts.reveal) qs.set('reveal', '1')

  if (getMockScenario()) return mockRequest<T>(method, path, qs, body, opts.signal)

  const url = buildUrl(path, qs)
  const send = async (refresh: boolean): Promise<Response> =>
    fetch(url, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(await authHeaders({ forceRefresh: refresh })),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    })
  let res: Response
  try {
    res = await send(false)
    // An expired token: Amplify refreshes it once, then the request is tried again.
    if (res.status === 401 && authMode() === 'cognito') {
      const first = parseUnauthorized(await res.clone().json().catch(() => null))
      if (first === 'expired') res = await send(true)
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError('aborted', 0, 'Aborted')
    throw new ApiError('network', 0, 'Network error')
  }
  let parsed: unknown = null
  try {
    // A misrouted request (an HTML page with 200) is a parse error, not data.
    parsed = await res.json()
  } catch {
    if (res.ok) throw new ApiError('parse', res.status, 'Bad JSON')
  }
  return finish<T>(res.status, parsed)
}

/** GET `${base}${path}` with params; reveal=1 appended when asked. Throws ApiError. */
export function apiGet<T>(path: string, params: Params = {}, opts: GetOptions = {}): Promise<T> {
  return request<T>('GET', path, params, undefined, opts)
}

/** POST a JSON body (the sign-in layer's session events, the People actions). Throws ApiError. */
export function apiPost<T>(path: string, body: unknown = {}, opts: GetOptions = {}): Promise<T> {
  return request<T>('POST', path, {}, body, opts)
}

/** Conflict 15: `summary` never leaves the API layer. */
function toRow<T extends { summary?: string }>(row: T): Omit<T, 'summary'> {
  const { summary: _drop, ...rest } = row
  void _drop
  return rest
}

export const api = {
  status: (signal?: AbortSignal) => apiGet<StatusResponse>('/status', {}, { signal }),

  stats: (days: number, signal?: AbortSignal) => apiGet<StatsResponse>('/stats', { days }, { signal }),

  calls: async (q: { limit?: number; before?: number }, reveal: boolean, signal?: AbortSignal): Promise<CallRow[]> => {
    const r = await apiGet<WireCallsResponse>('/calls', { limit: q.limit ?? 50, before: q.before }, { reveal, signal })
    return r.calls.map((c: WireCallRow) => toRow(c))
  },

  call: async (id: string, reveal: boolean, signal?: AbortSignal): Promise<CallDetail> => {
    const r = await apiGet<WireCallDetailResponse>(`/calls/${encodeURIComponent(id)}`, {}, { reveal, signal })
    return { call: toRow(r.call), events: r.events }
  },

  bookings: async (limit: number, reveal: boolean, signal?: AbortSignal) =>
    (await apiGet<BookingsResponse>('/bookings', { limit }, { reveal, signal })).bookings,

  notes: async (limit: number, reveal: boolean, signal?: AbortSignal) =>
    (await apiGet<NotesResponse>('/notes', { limit }, { reveal, signal })).notes,

  sms: async (limit: number, reveal: boolean, signal?: AbortSignal) =>
    (await apiGet<SmsResponse>('/sms', { limit }, { reveal, signal })).sms,

  /** Leads, newest stage change first, with the counts over every lead. "all" sends no stage. */
  leads: (filter: LeadsFilter, limit: number, reveal: boolean, signal?: AbortSignal) =>
    apiGet<LeadsResponse>('/leads', { stage: filter === 'all' ? undefined : filter, limit }, { reveal, signal }),

  /** One lead and its history, oldest event first. 404 -> ApiError.isNotFound. */
  lead: (id: string, reveal: boolean, signal?: AbortSignal) =>
    apiGet<LeadDetail>(`/leads/${encodeURIComponent(id)}`, {}, { reveal, signal }),

  /**
   * A coordinator's tap. A move the stage refuses is a 409 whose `detail` is the server's own
   * sentence, written for the desk. The answer's lead has a masked phone and no derived fields:
   * merge it with api/leads mergeLeadAfterAction.
   */
  leadAction: (id: string, body: LeadActionBody) =>
    apiPost<LeadActionResponse>(`/leads/${encodeURIComponent(id)}/action`, body),
}
