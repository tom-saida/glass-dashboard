// Pure helpers for sign-in (no React, no browser): remembered-computer date math, role order,
// the People table's sorting and labels, and the Activity card's sentences. scripts/check-lib.mjs
// tests every one of them.
import type { ActivityRow, Person, Role } from './types.ts'

// ------------------------------------------------------------------ remembered computer

const DAY_MS = 86_400_000

/** Reads the stored date (an ISO string or epoch ms). Garbage reads as "not remembered". */
export function parseRememberedAt(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = /^\d{10,}$/.test(raw) ? Number(raw) : Date.parse(raw)
  return Number.isFinite(n) ? n : null
}

/** True when more than `days` days have passed since `rememberedAtMs`. Exactly `days` is not over. */
export function rememberExpired(rememberedAtMs: number | null, nowMs: number, days: number): boolean {
  if (rememberedAtMs === null) return false
  // A date in the future (a clock change) counts as just remembered, never as expired.
  return nowMs - rememberedAtMs > days * DAY_MS
}

/** Whole days left on this computer's code-free sign-in (0 when over or never remembered). */
export function rememberDaysLeft(rememberedAtMs: number | null, nowMs: number, days: number): number {
  if (rememberedAtMs === null) return 0
  const left = days - (nowMs - rememberedAtMs) / DAY_MS
  return left <= 0 ? 0 : Math.ceil(left)
}

/** Remembered and still inside the window. */
export function isRemembered(rememberedAtMs: number | null, nowMs: number, days: number): boolean {
  return rememberedAtMs !== null && !rememberExpired(rememberedAtMs, nowMs, days)
}

// ------------------------------------------------------------------ roles

/** owner first, then support, then staff (the server's order). */
export const ROLE_ORDER: readonly Role[] = ['owner', 'support', 'staff']

export function roleRank(role: string): number {
  const i = (ROLE_ORDER as readonly string[]).indexOf(role)
  return i === -1 ? ROLE_ORDER.length : i
}

/** Owners and SAIDA support see People and Activity; staff never do. */
export function canManagePeople(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'support'
}

/** Only an owner flips the support switch (support cannot turn itself back on). */
export function canToggleSupport(role: string | null | undefined): boolean {
  return role === 'owner'
}

export function roleLabel(role: string): string {
  if (role === 'owner') return 'Owner'
  if (role === 'support') return 'Support'
  if (role === 'staff') return 'Staff'
  return role
}

/** Role order, then name, then email; the support row always last. */
export function sortPeople<T extends Pick<Person, 'role' | 'name' | 'email' | 'is_support'>>(people: readonly T[]): T[] {
  return [...people].sort((a, b) => {
    if (a.is_support !== b.is_support) return a.is_support ? 1 : -1
    const r = roleRank(a.role) - roleRank(b.role)
    if (r !== 0) return r
    const n = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
    return n !== 0 ? n : a.email.localeCompare(b.email, 'en', { sensitivity: 'base' })
  })
}

export function stateLabel(state: string): string {
  switch (state) {
    case 'invited':
      return 'Invited'
    case 'active':
      return 'Active'
    case 'reset':
      return 'Password reset'
    case 'disabled':
      return 'Removed'
    default:
      return state
  }
}

export function mfaLabel(mfa: string): string {
  if (mfa === 'app') return 'Authenticator app'
  if (mfa === 'email') return 'Email code'
  return 'Not set up'
}

export type PersonAction = 'reset-password' | 'reset-code' | 'resend' | 'remove'

/** The row actions that make sense for this person; never on the support row or yourself (remove). */
export function personActions(p: Pick<Person, 'state' | 'is_support' | 'enabled'>, isSelf: boolean): PersonAction[] {
  if (p.is_support || !p.enabled || p.state === 'disabled') return []
  const out: PersonAction[] =
    p.state === 'invited' ? ['resend'] : p.state === 'reset' ? ['reset-password', 'reset-code'] : ['reset-password', 'reset-code']
  if (!isSelf) out.push('remove')
  return out
}

export function actionLabel(a: PersonAction): string {
  if (a === 'reset-password') return 'Reset password'
  if (a === 'reset-code') return 'Reset code'
  if (a === 'resend') return 'Send invite again'
  return 'Remove'
}

// ------------------------------------------------------------------ plain-words checks

export const MIN_PASSWORD = 12

/** A new password is acceptable to ask Cognito about: the pool's own rules decide the rest. */
export function newPasswordProblem(pw: string, again: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (pw !== again) return 'The two passwords are not the same.'
  return null
}

export function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

/** Digits only, at most six (a pasted "482 719" works). */
export function cleanCode(v: string): string {
  return v.replace(/\D/g, '').slice(0, 6)
}

// ------------------------------------------------------------------ activity

/** An epoch (seconds or ms) or an ISO string, as epoch seconds; null when unreadable. */
export function tsToSec(ts: number | string | null | undefined): number | null {
  if (ts === null || ts === undefined || ts === '') return null
  if (typeof ts === 'number') return Number.isFinite(ts) ? (ts > 1e11 ? Math.floor(ts / 1000) : ts) : null
  const n = Number(ts)
  if (Number.isFinite(n) && /^\d+(\.\d+)?$/.test(ts.trim())) return n > 1e11 ? Math.floor(n / 1000) : n
  const d = Date.parse(ts)
  return Number.isFinite(d) ? Math.floor(d / 1000) : null
}

/** "jamie.lee@x.com" -> "Jamie Lee". The Activity rows carry an email, not a name. */
export function nameFromEmail(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0] ?? ''
  const words = local.split(/[._-]+/).filter(Boolean)
  if (words.length === 0) return 'Someone'
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

/** email (lower case) -> the name the People list holds, so Activity can say "Marisol", not "Staff". */
export type NameMap = Readonly<Record<string, string>>

/** "Dr. Priya Raman" -> "Priya"; "Marisol Vega" -> "Marisol". */
export function firstNameOf(full: string): string {
  const words = full.trim().split(/\s+/).filter((w) => !/^(dr|mr|mrs|ms|miss|prof)\.?$/i.test(w))
  return words[0] ?? full.trim()
}

function who(email: string | null | undefined, names?: NameMap): string {
  const full = email ? names?.[email.toLowerCase()] : undefined
  return full ? firstNameOf(full) : nameFromEmail(email)
}

function actor(row: Pick<ActivityRow, 'email' | 'role'>, names?: NameMap): string {
  return row.role === 'support' ? 'SAIDA support' : who(row.email, names)
}

/**
 * One plain sentence per row ("Jamie opened a call"). Never a phone number, a call id or an
 * address: the row's target is used only when it names a person (an email).
 */
export function activitySentence(row: Pick<ActivityRow, 'email' | 'role' | 'action' | 'target'>, names?: NameMap): string {
  const me = actor(row, names)
  // Only an email names a person; any other target (a call id, a number) never reaches the sentence.
  const target = row.target && /^[^\s@]+@[^\s@]+$/.test(row.target) ? who(row.target, names) : null
  switch (row.action) {
    case 'view_call':
      return `${me} opened a call`
    case 'reveal_numbers':
      return `${me} revealed a number`
    case 'signed_in':
      return `${me} signed in`
    case 'signed_out':
      return `${me} signed out`
    case 'locked':
      return `${me}'s screen locked after a while`
    case 'unlocked':
      return `${me} unlocked the screen`
    case 'denied':
      return `${me} was turned away`
    case 'person_added':
      return target ? `${me} added ${target}` : `${me} added a person`
    case 'person_removed':
      return target ? `${me} removed ${target}` : `${me} removed a person`
    case 'password_reset':
      return target ? `${me} reset the password for ${target}` : `${me} reset a password`
    case 'code_reset':
      return target ? `${me} reset the sign-in code for ${target}` : `${me} reset a sign-in code`
    case 'invite_resent':
      return target ? `${me} sent ${target} the invite again` : `${me} sent an invite again`
    case 'support_enabled':
      return `${me} turned SAIDA support access on`
    case 'support_disabled':
      return `${me} turned SAIDA support access off`
    default:
      return `${me} ${row.action.replace(/_/g, ' ')}`.trim()
  }
}

/** The people to offer in the Activity filter: one entry per email, sorted by name. */
export function activityPeople(rows: readonly Pick<ActivityRow, 'email'>[], names?: NameMap): { email: string; name: string }[] {
  const seen = new Map<string, string>()
  for (const r of rows) if (r.email && !seen.has(r.email)) seen.set(r.email, names?.[r.email.toLowerCase()] ?? nameFromEmail(r.email))
  return [...seen.entries()]
    .map(([email, name]) => ({ email, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.email.localeCompare(b.email))
}

export function filterActivity<T extends Pick<ActivityRow, 'email'>>(rows: readonly T[], email: string | null): T[] {
  return email ? rows.filter((r) => r.email === email) : [...rows]
}
