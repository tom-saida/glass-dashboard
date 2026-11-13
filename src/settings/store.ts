// Per-browser settings (DESIGN.md 6.11, conflict 28). Only toggle state is stored, never data.
// Every storage access is wrapped: private windows and blocked storage throw, and the app
// must still work with the defaults.

import { getMockScenario, setMockScenario, type MockScenario } from '../mock/mode'

export type KatieHome = 'bottom-right' | 'bottom-left'

/** The mascot's look (src/katie/mascot.ts): the original Katie or one of her recoloured looks. */
export type MascotId = 'katie' | 'plum' | 'teal' | 'rose'
export const MASCOT_IDS: readonly MascotId[] = ['katie', 'plum', 'teal', 'rose']

export interface Settings {
  /** Adds reveal=1 to list/detail requests. Off by default. */
  showNumbers: boolean
  /**
   * Katie: Occasional (true, the default) or Off (false; stored as katie.enabled = '0'). Occasional
   * means she steps in for a few moments and then gets out of the way.
   */
  katieEnabled: boolean
  /** Katie's corner: the side she enters from and where she peeks. */
  katieHome: KatieHome
  /** The mascot's look; 'katie' (the original) by default. */
  mascot: MascotId
  /**
   * Dev only (import.meta.env.DEV): API base, default "/api/dash". A same-origin path only
   * (see sanitizeApiBase). Production builds never read or use it: the base is a constant.
   */
  apiBase: string
}

export const DEFAULT_API_BASE = '/api/dash'

/**
 * The dev API base must be a same-origin absolute path ("/api/dash", "/other/api/dash"). Anything
 * else (a full URL, "//host", a relative path) falls back to the default, so patient data can
 * never be requested from, or credentials sent to, another origin. The Vite dev proxy forwards
 * /api/dash to DASH_API_TARGET; point the proxy there instead of the base.
 */
export function sanitizeApiBase(v: string | null | undefined): string {
  const s = (v ?? '').trim().replace(/\/+$/, '')
  if (!s || !s.startsWith('/') || s.startsWith('//') || /[\s\\?#]/.test(s)) return DEFAULT_API_BASE
  return s
}

const KEYS = {
  showNumbers: 'katie.showNumbers',
  katieEnabled: 'katie.enabled',
  katieHome: 'katie.home',
  mascot: 'katie.mascot',
} as const
/** Dev only; referenced only inside import.meta.env.DEV branches, so production drops it. */
const API_BASE_KEY = 'katie.apiBase'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    /* storage blocked: the in-memory value still applies for this tab */
  }
}

export function sanitizeMascot(v: string | null | undefined): MascotId {
  return MASCOT_IDS.find((id) => id === v) ?? 'katie'
}

function load(): Settings {
  const home = read(KEYS.katieHome)
  return {
    showNumbers: read(KEYS.showNumbers) === '1',
    katieEnabled: read(KEYS.katieEnabled) !== '0',
    katieHome: home === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    mascot: sanitizeMascot(read(KEYS.mascot)),
    apiBase: import.meta.env.DEV ? sanitizeApiBase(read(API_BASE_KEY)) : DEFAULT_API_BASE,
  }
}

let state: Settings = load()
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function getSettings(): Settings {
  return state
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...state, ...patch }
  if (patch.showNumbers !== undefined) write(KEYS.showNumbers, patch.showNumbers ? '1' : null)
  if (patch.katieEnabled !== undefined) write(KEYS.katieEnabled, patch.katieEnabled ? null : '0')
  if (patch.katieHome !== undefined) write(KEYS.katieHome, patch.katieHome === 'bottom-left' ? 'bottom-left' : null)
  if (patch.mascot !== undefined) {
    next.mascot = sanitizeMascot(patch.mascot)
    write(KEYS.mascot, next.mascot === 'katie' ? null : next.mascot)
  }
  if (patch.apiBase !== undefined) {
    const v = import.meta.env.DEV ? sanitizeApiBase(patch.apiBase) : DEFAULT_API_BASE
    next.apiBase = v
    if (import.meta.env.DEV) write(API_BASE_KEY, v === DEFAULT_API_BASE ? null : v)
  }
  state = next
  emit()
}

// Another tab changed a setting: follow it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('katie.')) {
      state = load()
      emit()
    }
  })
}

export { getMockScenario, setMockScenario, type MockScenario }
