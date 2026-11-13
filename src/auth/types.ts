// Sign-in types shared by the providers, the session store, the screens and the API client.
// Nothing here holds a secret; tokens never leave the provider.

export type Role = 'owner' | 'staff' | 'support'
export type MfaKind = 'app' | 'email'

/** GET /api/dash/config (public). The Cognito fields exist only when auth is "cognito". */
export interface AuthConfig {
  auth: 'basic' | 'cognito'
  idle_minutes: number
  remember_days: number
  support_email: string
  /** The practice's name, when the box says it (the plan's config has it; optional here). */
  practice?: string
  region?: string
  user_pool_id?: string
  client_id?: string
}

/** GET /api/dash/me. */
export interface Me {
  sub: string
  email: string
  name: string
  role: Role
  is_support: boolean
  mode: string
  remembered: boolean
}

/** What the person sees next. `done` means signed in. */
export type SignInResult =
  | { step: 'done' }
  | { step: 'new-password' }
  /** Choose which second step to use (both are set up) or to set up. */
  | { step: 'choose-code'; choices: MfaKind[]; setup: boolean }
  | { step: 'setup-app' }
  | { step: 'code'; kind: MfaKind; canSwitch: boolean }

export interface TotpSetup {
  /** The shared secret, shown as copyable text next to the QR code. */
  secret: string
  /** The otpauth:// URI the QR code encodes. */
  uri: string
}

/** The signed-in person as the provider knows it (before /me). */
export interface ProviderUser {
  email: string
  name?: string
}

export interface AuthProvider {
  /** The person with a live session on this computer, if any (restores after a reload). */
  currentUser(): Promise<ProviderUser | null>
  signIn(email: string, password: string): Promise<SignInResult>
  newPassword(password: string): Promise<SignInResult>
  chooseMfa(kind: MfaKind): Promise<SignInResult>
  setUpTotp(): Promise<TotpSetup>
  verifyTotpSetup(code: string): Promise<SignInResult>
  confirmCode(code: string): Promise<SignInResult>
  /** Switch the pending code to the other kind (re-runs the password step in memory). */
  switchCode(kind: MfaKind): Promise<SignInResult>
  rememberThisComputer(): Promise<void>
  forgetThisComputer(): Promise<void>
  /** Local sign-out (this computer). The server-side record is the caller's POST /session. */
  signOut(): Promise<void>
  /** The access token, or null. Amplify refreshes it; the mock returns a fixed string. */
  accessToken(opts?: { forceRefresh?: boolean }): Promise<string | null>
}

/** Why the API sent a person back to the sign-in screen. */
export type UnauthorizedReason = 'sign in' | 'expired' | 'signed out'

/** A rejected step in plain words (thrown by providers, shown by the screens). */
export class AuthStepError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthStepError'
  }
}

export interface Person {
  username: string
  email: string
  name: string
  role: Role
  state: 'invited' | 'active' | 'disabled' | 'reset'
  mfa: 'app' | 'email' | 'none'
  last_sign_in: number | string | null
  is_support: boolean
  enabled: boolean
}

export interface PeopleResponse {
  people: Person[]
  support_enabled: boolean
}

export interface ActivityRow {
  id: string | number
  ts: number | string
  sub: string
  email: string
  role: Role | string
  action: string
  target: string | null
  ip: string | null
}
