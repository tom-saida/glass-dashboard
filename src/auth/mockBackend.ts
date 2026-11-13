// The mock API for the auth endpoints (me, people, activity, support, session, config), in memory.
// Loaded only when a mock scenario is on and ?auth=1 asks for the cognito-mode screens. The
// people and the activity are invented (Harborline Orthodontics, the demo practice).
import type { ActivityRow, PeopleResponse, Person, Role } from './types.ts'
import { MOCK_USERS, findMockUser, mockRememberedEmails, mockSessionEmail } from './mock.ts'
import { nowSec } from '../lib/clock.ts'

export interface MockResponse {
  status: number
  body: unknown
}

const ok = (body: unknown = { ok: true }): MockResponse => ({ status: 200, body })
const err = (status: number, error: string): MockResponse => ({ status, body: { error } })

const base = () => nowSec()

function seedPeople(): Person[] {
  const t = base()
  return [
    { username: 'u-owner', email: 'owner@harborline.example', name: 'Dr. Priya Raman', role: 'owner', state: 'active', mfa: 'app', last_sign_in: t - 3600, is_support: false, enabled: true },
    { username: 'u-staff', email: 'staff@harborline.example', name: 'Marisol Vega', role: 'staff', state: 'active', mfa: 'app', last_sign_in: t - 7200, is_support: false, enabled: true },
    { username: 'u-front', email: 'frontdesk@harborline.example', name: 'Jessica Lane', role: 'staff', state: 'active', mfa: 'email', last_sign_in: t - 86400, is_support: false, enabled: true },
    { username: 'u-new', email: 'newperson@harborline.example', name: 'Devon Okafor', role: 'staff', state: 'invited', mfa: 'none', last_sign_in: null, is_support: false, enabled: true },
    { username: 'u-support', email: 'support@example.com', name: 'SAIDA support', role: 'support', state: 'active', mfa: 'app', last_sign_in: t - 6 * 86400, is_support: true, enabled: true },
  ]
}

function seedActivity(): ActivityRow[] {
  const t = base()
  const row = (i: number, ago: number, email: string, role: Role, action: string, target: string | null): ActivityRow => ({
    id: i, ts: t - ago, sub: `sub-${email.split('@')[0]}`, email, role, action, target, ip: '203.0.113.10',
  })
  return [
    row(9, 600, 'staff@harborline.example', 'staff', 'view_call', 'call'),
    row(8, 900, 'staff@harborline.example', 'staff', 'reveal_numbers', null),
    row(7, 3600, 'owner@harborline.example', 'owner', 'signed_in', null),
    row(6, 7300, 'staff@harborline.example', 'staff', 'signed_in', null),
    row(5, 86400, 'frontdesk@harborline.example', 'staff', 'view_call', 'call'),
    row(4, 90000, 'owner@harborline.example', 'owner', 'person_added', 'newperson@harborline.example'),
    row(3, 172800, 'owner@harborline.example', 'owner', 'code_reset', 'frontdesk@harborline.example'),
  ]
}

let people: Person[] | null = null
let activity: ActivityRow[] | null = null
let supportEnabled = true
let nextId = 100

function state() {
  people ??= seedPeople()
  activity ??= seedActivity()
  return { people, activity }
}

/** Test hook: the server now sees this person as another role (a demotion while a page is open). */
let serverRole: Role | null = null
export function setMockServerRole(r: Role | null): void {
  serverRole = r
}

function actorRow(): { email: string; role: Role; sub: string } | null {
  const email = mockSessionEmail()
  const u = email ? findMockUser(email) : undefined
  return u ? { email: u.email, role: serverRole ?? u.role, sub: `sub-${u.email.split('@')[0]}` } : null
}

function log(action: string, target: string | null): void {
  const a = actorRow()
  if (!a) return
  state().activity.unshift({ id: nextId++, ts: base(), sub: a.sub, email: a.email, role: a.role, action, target, ip: '203.0.113.10' })
}

/** Called for every mock request in auth mode: 401 when nobody is signed in. */
export function mockAuthGate(): MockResponse | null {
  return mockSessionEmail() ? null : err(401, 'expired')
}

export function mockAuthRoute(method: 'GET' | 'POST', path: string, body: unknown, params: URLSearchParams): MockResponse {
  const a = actorRow()
  if (!a) return err(401, 'sign in')

  if (path === '/me' && method === 'GET') {
    const u = MOCK_USERS.find((x) => x.email === a.email)
    return ok({
      sub: a.sub, email: a.email, name: u?.name ?? a.email, role: a.role, is_support: a.role === 'support',
      mode: 'cognito', remembered: mockRememberedEmails().includes(a.email),
    })
  }

  if (path === '/session' && method === 'POST') {
    const ev = body && typeof body === 'object' ? (body as { event?: unknown }).event : null
    if (ev === 'signed_in' || ev === 'signed_out' || ev === 'locked' || ev === 'unlocked') log(ev, null)
    return ok()
  }

  // People and Activity: owner and support only.
  if (a.role === 'staff') return err(403, 'not allowed')
  const { people: ps, activity: act } = state()

  if (path === '/people' && method === 'GET') {
    const res: PeopleResponse = { people: ps.map((p) => ({ ...p })), support_enabled: supportEnabled }
    return ok(res)
  }
  if (path === '/people' && method === 'POST') {
    const b = (body ?? {}) as { email?: unknown; name?: unknown; role?: unknown }
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    const role = b.role === 'owner' || b.role === 'staff' ? b.role : null
    if (!email || !name || !role) return err(400, 'Enter an email, a name and a role.')
    if (ps.some((p) => p.email === email)) return err(409, 'Someone with that email is already on the list.')
    const person: Person = { username: `u-${nextId++}`, email, name, role, state: 'invited', mfa: 'none', last_sign_in: null, is_support: false, enabled: true }
    ps.push(person)
    log('person_added', email)
    return ok({ ok: true, person })
  }
  if (path === '/support' && method === 'POST') {
    if (a.role !== 'owner') return err(403, 'Only the practice owner can change this.')
    supportEnabled = !!(body && typeof body === 'object' && (body as { enabled?: unknown }).enabled)
    log(supportEnabled ? 'support_enabled' : 'support_disabled', null)
    return ok({ ok: true, support_enabled: supportEnabled })
  }
  const m = /^\/people\/([^/]+)\/(remove|reset-password|reset-code|resend)$/.exec(path)
  if (m && method === 'POST') {
    const p = ps.find((x) => x.username === decodeURIComponent(m[1] as string))
    if (!p) return err(404, 'That person is not on the list.')
    const act2 = m[2]
    if (act2 === 'remove') {
      if (p.email === a.email) return err(400, 'You cannot remove yourself.')
      if (p.role === 'owner' && ps.filter((x) => x.role === 'owner' && x.enabled).length <= 1) return err(400, 'A practice needs at least one owner.')
      p.enabled = false
      p.state = 'disabled'
      log('person_removed', p.email)
    } else if (act2 === 'reset-password') {
      p.state = 'reset'
      log('password_reset', p.email)
    } else if (act2 === 'reset-code') {
      p.mfa = 'none'
      log('code_reset', p.email)
    } else {
      log('invite_resent', p.email)
    }
    return ok()
  }
  if (path === '/activity' && method === 'GET') {
    const days = Math.max(1, Math.min(365, Number(params.get('days')) || 30))
    const since = base() - days * 86400
    return ok({ activity: act.filter((r) => typeof r.ts === 'number' && r.ts >= since) })
  }
  return err(404, 'not found')
}

/** Test hook for the verifier: back to the seed. */
export function resetMockAuthBackend(): void {
  people = null
  activity = null
  supportEnabled = true
  serverRole = null
}
