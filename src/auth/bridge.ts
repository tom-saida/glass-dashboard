// The small seam between the API layer and the sign-in layer, so src/api/client.ts never imports
// the session store (the store imports the client). Three facts live here: the auth mode, where
// the access token comes from, and who hears about a 401.
import type { UnauthorizedReason } from './types.ts'

export type AuthMode = 'basic' | 'cognito'

let mode: AuthMode = 'basic'
let tokenSource: ((opts?: { forceRefresh?: boolean }) => Promise<string | null>) | null = null
let mockAuth = false
let unauthorized: ((reason: UnauthorizedReason) => void) | null = null

export function configureBridge(next: {
  mode: AuthMode
  accessToken?: (opts?: { forceRefresh?: boolean }) => Promise<string | null>
  onUnauthorized?: (reason: UnauthorizedReason) => void
}): void {
  mode = next.mode
  tokenSource = next.accessToken ?? null
  unauthorized = next.onUnauthorized ?? null
}

/** Mock scenario with ?auth=1: the auth endpoints answer from src/auth/mockBackend. */
export function setMockAuth(on: boolean): void {
  mockAuth = on
}

export function isMockAuth(): boolean {
  return mockAuth
}

export function authMode(): AuthMode {
  return mode
}

/** Authorization header for a request: a Bearer token in cognito mode, nothing in basic mode. */
export async function authHeaders(opts?: { forceRefresh?: boolean }): Promise<Record<string, string>> {
  if (mode !== 'cognito' || !tokenSource) return {}
  const t = await tokenSource(opts).catch(() => null)
  return t ? { Authorization: `Bearer ${t}` } : {}
}

const REASONS: readonly UnauthorizedReason[] = ['sign in', 'expired', 'signed out']

/** The server's {"error": "..."} body as a known reason; anything else reads as "sign in". */
export function parseUnauthorized(body: unknown): UnauthorizedReason {
  const e = body && typeof body === 'object' ? (body as { error?: unknown }).error : null
  return typeof e === 'string' && (REASONS as readonly string[]).includes(e) ? (e as UnauthorizedReason) : 'sign in'
}

export function notifyUnauthorized(reason: UnauthorizedReason): void {
  unauthorized?.(reason)
}

/** The plain words for the sign-in screen after a 401. */
export function unauthorizedMessage(reason: UnauthorizedReason): string {
  if (reason === 'expired') return 'Your session ran out. Please sign in again.'
  if (reason === 'signed out') return 'You were signed out. Please sign in again.'
  return 'Please sign in to continue.'
}
