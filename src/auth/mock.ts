// The mock provider: ?mock=...&auth=1 and the verifier. No network, no real accounts. The people
// are invented (Harborline Orthodontics is the demo practice); every code is 000000; any
// password signs in except the literal "wrong-password" (so the wrong-password line can be
// shown) and the temporary-password person must choose a new one first. Nothing here is a
// credential.
import {
  AuthStepError,
  type AuthProvider,
  type MfaKind,
  type ProviderUser,
  type SignInResult,
  type TotpSetup,
} from './types.ts'
import { cleanCode } from './helpers.ts'

export const MOCK_CODE = '000000'
export const MOCK_BAD_PASSWORD = 'wrong-password'
export const MOCK_TEMP_PASSWORD = 'temporary-1'

export interface MockUser {
  email: string
  name: string
  role: 'owner' | 'staff' | 'support'
  /** Which second steps this person has set up. */
  mfa: MfaKind[]
  /** Signs in with a temporary password the first time. */
  temp?: boolean
}

export const MOCK_USERS: readonly MockUser[] = [
  { email: 'owner@harborline.example', name: 'Dr. Priya Raman', role: 'owner', mfa: ['app'] },
  { email: 'staff@harborline.example', name: 'Marisol Vega', role: 'staff', mfa: ['app', 'email'] },
  { email: 'frontdesk@harborline.example', name: 'Jessica Lane', role: 'staff', mfa: ['email'] },
  { email: 'newperson@harborline.example', name: 'Devon Okafor', role: 'staff', mfa: [], temp: true },
  { email: 'support@example.com', name: 'SAIDA support', role: 'support', mfa: ['app'] },
]

const SESSION_KEY = 'katie.mock.signedIn'
const DEVICES_KEY = 'katie.mock.devices'

function store(kind: 'session' | 'local'): Storage | null {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

export function findMockUser(email: string): MockUser | undefined {
  const e = email.trim().toLowerCase()
  return MOCK_USERS.find((u) => u.email === e)
}

/** The mock backend asks who holds the session (and whether it was forced to expire). */
let expired = false
export function mockSessionEmail(): string | null {
  if (expired) return null
  return store('session')?.getItem(SESSION_KEY) ?? null
}
export function expireMockSession(): void {
  expired = true
}

const remembered = (): string[] => {
  try {
    const v: unknown = JSON.parse(store('local')?.getItem(DEVICES_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const saveRemembered = (list: string[]) => store('local')?.setItem(DEVICES_KEY, JSON.stringify(list))

let seq = 0

export function createMockProvider(): AuthProvider {
  let user: MockUser | null = null
  let afterNewPassword = false

  const finish = (): SignInResult => {
    const u = user
    if (!u) throw new AuthStepError('Sign in again.')
    store('session')?.setItem(SESSION_KEY, u.email)
    expired = false
    return { step: 'done' }
  }

  const codeStep = (kind: MfaKind): SignInResult => {
    return { step: 'code', kind, canSwitch: !!user && user.mfa.length > 1 }
  }

  /** After the password (and a new one, if needed): what the second step looks like. */
  function afterPassword(u: MockUser): SignInResult {
    if (u.mfa.length === 0) return { step: 'choose-code', choices: ['app', 'email'], setup: true }
    if (remembered().includes(u.email)) return finish()
    if (u.mfa.length === 2) return { step: 'choose-code', choices: ['app', 'email'], setup: false }
    return codeStep(u.mfa[0] as MfaKind)
  }

  const bad = (m: string) => new AuthStepError(m)

  return {
    async currentUser(): Promise<ProviderUser | null> {
      const email = mockSessionEmail()
      const u = email ? findMockUser(email) : undefined
      return u ? { email: u.email, name: u.name } : null
    },

    async signIn(email, pw) {
      const u = findMockUser(email)
      if (!u || !pw || pw === MOCK_BAD_PASSWORD) throw bad('That email and password do not match. Check them and try again.')
      user = u
      afterNewPassword = false
      if (u.temp && pw !== MOCK_TEMP_PASSWORD && !store('local')?.getItem(`katie.mock.set.${u.email}`)) {
        throw bad('That email and password do not match. Check them and try again.')
      }
      if (u.temp && !store('local')?.getItem(`katie.mock.set.${u.email}`)) return { step: 'new-password' }
      return afterPassword(u)
    },

    async newPassword(pw) {
      if (!user) throw bad('Sign in again.')
      if (pw.length < 12) throw bad('That password does not meet the rules. Try a longer one with a mix of characters.')
      store('local')?.setItem(`katie.mock.set.${user.email}`, '1')
      afterNewPassword = true
      return afterPassword({ ...user, mfa: user.mfa })
    },

    async chooseMfa(kind) {
      if (!user) throw bad('Sign in again.')
      if (user.mfa.length === 0 || afterNewPassword) {
        // Setting up: the app needs a QR; the email code needs nothing more.
        if (kind === 'app') return { step: 'setup-app' }
        return { step: 'code', kind: 'email', canSwitch: false }
      }
      return codeStep(kind)
    },

    async setUpTotp(): Promise<TotpSetup> {
      const secret = 'JBSWY3DPEHPK3PXP'
      return { secret, uri: `otpauth://totp/Katie:${encodeURIComponent(user?.email ?? 'person')}?secret=${secret}&issuer=Katie` }
    },

    async verifyTotpSetup(code) {
      if (cleanCode(code) !== MOCK_CODE) throw bad('That code is not right. Check it and try again.')
      return finish()
    },

    async confirmCode(code) {
      if (cleanCode(code) !== MOCK_CODE) throw bad('That code is not right. Check it and try again.')
      return finish()
    },

    async switchCode(kind) {
      if (!user) throw bad('Sign in again.')
      return codeStep(kind)
    },

    async rememberThisComputer() {
      if (user) saveRemembered([...new Set([...remembered(), user.email])])
    },

    async forgetThisComputer() {
      const email = user?.email ?? mockSessionEmail()
      if (email) saveRemembered(remembered().filter((e) => e !== email))
    },

    async signOut() {
      store('session')?.removeItem(SESSION_KEY)
      user = null
    },

    async accessToken() {
      return mockSessionEmail() ? `mock-access-${++seq}` : null
    },
  }
}

/** Test hook: the remembered computers (emails only). */
export function mockRememberedEmails(): string[] {
  return remembered()
}
