// The sign-in session store: one module-level state (like src/settings and the API's auth state),
// read in React with useSyncExternalStore. It owns the provider, runs the sign-in steps, keeps the
// remembered-computer date, locks after idle and signs out. The access token never lands here: it
// stays inside the provider (Amplify keeps it in memory).
import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { authApi } from '../api/authApi'
import { markAuthOk } from '../api/client'
import { getMockScenario } from '../mock/mode'
import { nowMs } from '../lib/clock'
import { configureBridge, setMockAuth, unauthorizedMessage } from './bridge'
import { fetchConfig, MOCK_CONFIG } from './config'
import { isRemembered, parseRememberedAt, rememberExpired } from './helpers'
import {
  AuthStepError,
  type AuthConfig,
  type AuthProvider,
  type MfaKind,
  type Me,
  type SignInResult,
  type TotpSetup,
  type UnauthorizedReason,
} from './types'

export type Phase = 'basic' | 'signed-out' | 'challenge' | 'signed-in' | 'locked'
export type Step = 'new-password' | 'choose-code' | 'setup-app' | 'code'

export interface AuthState {
  phase: Phase
  step: Step | null
  /** The email typed at the password step (kept for the lock screen and the code screens). */
  email: string
  choices: MfaKind[]
  /** choose-code is picking what to set up (true) or what to use now (false). */
  setup: boolean
  codeKind: MfaKind | null
  canSwitch: boolean
  totp: TotpSetup | null
  error: string | null
  notice: string | null
  busy: boolean
  me: Me | null
}

export const REMEMBER_KEY = 'katie.auth.rememberedAt'
const MOCK_AUTH_KEY = 'katie.mockauth'

const INITIAL: AuthState = {
  phase: 'basic', step: null, email: '', choices: [], setup: false, codeKind: null, canSwitch: false,
  totp: null, error: null, notice: null, busy: false, me: null,
}

let state: AuthState = INITIAL
let config: AuthConfig | null = null
let provider: AuthProvider | null = null
let qc: QueryClient | null = null
/** True while the sign-in screens are for unlocking (a lock, not a first sign-in). */
let unlocking = false
let tickets = 0

const listeners = new Set<() => void>()
function set(patch: Partial<AuthState>): void {
  state = { ...state, ...patch }
  for (const l of [...listeners]) l()
}
export function getAuthSession(): AuthState {
  return state
}
export function subscribeAuthSession(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function useAuthSession(): AuthState {
  return useSyncExternalStore(subscribeAuthSession, getAuthSession, getAuthSession)
}
export function getAuthConfig(): AuthConfig | null {
  return config
}
/** Cognito mode (real or mock): the screens, the top bar line and the People cards apply. */
export function isCognitoMode(): boolean {
  return config?.auth === 'cognito'
}

export function bindAuthQueryClient(client: QueryClient): void {
  qc = client
}

// ------------------------------------------------------------------ remembered computer

function readRemembered(): number | null {
  try {
    return parseRememberedAt(window.localStorage.getItem(REMEMBER_KEY))
  } catch {
    return null
  }
}
function writeRemembered(ms: number | null): void {
  try {
    if (ms === null) window.localStorage.removeItem(REMEMBER_KEY)
    else window.localStorage.setItem(REMEMBER_KEY, new Date(ms).toISOString())
  } catch {
    /* blocked storage: the computer is simply asked for a code next time */
  }
}
export function computerRemembered(): boolean {
  return !!config && isRemembered(readRemembered(), nowMs(), config.remember_days)
}

/** Past the window: forget the device and the date, so the next sign-in asks for a code again. */
async function enforceRememberExpiry(): Promise<void> {
  if (!config || !provider) return
  if (!rememberExpired(readRemembered(), nowMs(), config.remember_days)) return
  await provider.forgetThisComputer().catch(() => undefined)
  writeRemembered(null)
}

// ------------------------------------------------------------------ boot

/** ?auth=1 in a mock scenario asks for the cognito-mode screens on invented people. */
function mockAuthRequested(): boolean {
  try {
    const p = new URLSearchParams(window.location.search)
    if (p.has('auth')) {
      const on = ['1', 'true', 'on'].includes((p.get('auth') ?? '').toLowerCase())
      window.sessionStorage.setItem(MOCK_AUTH_KEY, on ? 'on' : 'off')
      return on
    }
    return window.sessionStorage.getItem(MOCK_AUTH_KEY) === 'on'
  } catch {
    return false
  }
}

/** Runs once before the first render. Never throws: any failure reads as basic mode. */
export async function bootAuth(apiBase: string): Promise<void> {
  try {
    if (getMockScenario()) {
      if (!mockAuthRequested()) return
      config = MOCK_CONFIG
      setMockAuth(true)
      const { createMockProvider, expireMockSession, mockRememberedEmails } = await import('./mock')
      provider = createMockProvider()
      installMockHooks(expireMockSession, mockRememberedEmails)
    } else {
      config = await fetchConfig(apiBase)
      if (config.auth !== 'cognito') return
      const { createCognitoProvider } = await import('./cognito')
      provider = createCognitoProvider(config)
    }
    const p = provider
    configureBridge({
      mode: 'cognito',
      accessToken: (o) => p.accessToken(o),
      onUnauthorized: (reason) => void handleUnauthorized(reason),
    })
    set({ phase: 'signed-out' })
    const u = await p.currentUser()
    if (u) {
      await enforceRememberExpiry()
      await finishSignIn(false)
    }
  } catch {
    // Config said cognito but the provider failed: show the sign-in screen, never the data.
    if (config?.auth === 'cognito') set({ phase: 'signed-out', error: 'Sign-in is not available right now. Try again in a moment.' })
  }
}

function installMockHooks(expire: () => void, remembered: () => string[]): void {
  const w = window as unknown as { __katieAuth?: unknown }
  w.__katieAuth = {
    expire,
    remembered,
    state: () => ({ phase: state.phase, step: state.step, role: state.me?.role ?? null }),
    /** Move the stored remembered date back, to test the 30-day rule without waiting. */
    setRememberedDaysAgo: (days: number) => writeRemembered(nowMs() - days * 86_400_000),
    rememberedAt: () => readRemembered(),
    /** The server now sees this person as another role (the People card then gets a 403). */
    setServerRole: (role: 'owner' | 'staff' | 'support' | null) => void import('./mockBackend').then((m) => m.setMockServerRole(role)),
  }
}

// ------------------------------------------------------------------ steps

function applyResult(r: SignInResult): void | Promise<void> {
  switch (r.step) {
    case 'done':
      return finishSignIn(true)
    case 'new-password':
      return set({ phase: 'challenge', step: 'new-password', error: null, busy: false })
    case 'choose-code':
      return set({ phase: 'challenge', step: 'choose-code', choices: r.choices, setup: r.setup, error: null, busy: false })
    case 'setup-app': {
      return provider!.setUpTotp().then((totp) =>
        set({ phase: 'challenge', step: 'setup-app', totp, error: null, busy: false }),
      )
    }
    case 'code':
      return set({ phase: 'challenge', step: 'code', codeKind: r.kind, canSwitch: r.canSwitch, error: null, busy: false })
  }
}

async function step(fn: (p: AuthProvider) => Promise<SignInResult>): Promise<void> {
  const p = provider
  if (!p || state.busy) return
  set({ busy: true, error: null })
  try {
    await applyResult(await fn(p))
  } catch (e) {
    set({ busy: false, error: e instanceof AuthStepError ? e.message : 'Something went wrong. Try again in a moment.' })
  }
}

/** Password step (also the lock screen's unlock). */
export function signIn(email: string, password: string): Promise<void> {
  set({ email: email.trim() })
  return step((p) => p.signIn(email, password))
}
export const submitNewPassword = (pw: string) => step((p) => p.newPassword(pw))
export const chooseCode = (kind: MfaKind) => step((p) => p.chooseMfa(kind))
export const submitSetupCode = (code: string) => step((p) => p.verifyTotpSetup(code))
export const switchCode = (kind: MfaKind) => step((p) => p.switchCode(kind))

/** The six digits, and whether to remember this computer. */
export async function submitCode(code: string, remember: boolean): Promise<void> {
  const p = provider
  if (!p || state.busy) return
  set({ busy: true, error: null })
  try {
    const r = await p.confirmCode(code)
    if (r.step === 'done' && remember) {
      await p.rememberThisComputer().catch(() => undefined)
      writeRemembered(nowMs())
    }
    await applyResult(r)
  } catch (e) {
    set({ busy: false, error: e instanceof AuthStepError ? e.message : 'Something went wrong. Try again in a moment.' })
  }
}

/** Back to the password step from a challenge screen. */
export function cancelChallenge(): void {
  void provider?.signOut().catch(() => undefined)
  set({ phase: unlocking ? 'locked' : 'signed-out', step: null, error: null, busy: false, totp: null })
}

async function finishSignIn(fresh: boolean): Promise<void> {
  const p = provider
  if (!p) return
  try {
    // A code-free sign-in past the window: forget the device now, so the next one asks again.
    if (fresh) await enforceRememberExpiry()
    markAuthOk()
    const me = await authApi.me()
    const wasUnlock = unlocking
    unlocking = false
    set({ phase: 'signed-in', step: null, me, email: me.email, error: null, notice: null, busy: false, totp: null })
    if (fresh) void authApi.session(wasUnlock ? 'unlocked' : 'signed_in', computerRemembered())
    startIdle()
  } catch (e) {
    await p.signOut().catch(() => undefined)
    const forbidden = !!e && typeof e === 'object' && (e as { status?: number }).status === 403
    set({
      phase: unlocking ? 'locked' : 'signed-out', step: null, busy: false, me: null,
      error: forbidden
        ? 'This account is not allowed to open Katie. Ask the practice owner.'
        : 'Signed in, but Katie could not load your account. Try again in a moment.',
    })
  }
}

// ------------------------------------------------------------------ leaving

function dropData(): void {
  stopIdle()
  void qc?.cancelQueries()
  qc?.clear()
}

/** Idle lock: blank the data, forget the token on this computer, ask for the password. */
export async function lock(): Promise<void> {
  if (state.phase !== 'signed-in') return
  const remembered = computerRemembered()
  dropData()
  unlocking = true
  set({ phase: 'locked', step: null, error: null, notice: null, busy: false })
  // The server hears about it while the token still works; then the token goes.
  await authApi.session('locked', remembered)
  await provider?.signOut().catch(() => undefined)
}

export async function signOut(): Promise<void> {
  if (state.phase === 'signed-in') await authApi.session('signed_out', computerRemembered())
  dropData()
  await provider?.signOut().catch(() => undefined)
  unlocking = false
  set({ phase: 'signed-out', step: null, me: null, error: null, notice: null, busy: false, totp: null })
}

/** A 401 from the API: back to the sign-in screen, with the reason in plain words. */
async function handleUnauthorized(reason: UnauthorizedReason): Promise<void> {
  if (state.phase !== 'signed-in') return
  const ticket = ++tickets
  dropData()
  await provider?.signOut().catch(() => undefined)
  if (ticket !== tickets) return
  unlocking = false
  set({ phase: 'signed-out', step: null, me: null, error: null, notice: unauthorizedMessage(reason), busy: false })
}

// ------------------------------------------------------------------ idle

let stopActivity: (() => void) | null = null
function startIdle(): void {
  stopIdle()
  if (!config) return
  void import('./idle').then(({ watchIdle }) => {
    if (state.phase !== 'signed-in') return
    stopActivity = watchIdle(config!.idle_minutes * 60_000, () => void lock())
  })
}
function stopIdle(): void {
  stopActivity?.()
  stopActivity = null
}
