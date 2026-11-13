// The Cognito provider on Amplify Auth v6 (SRP). Configured at runtime from /api/dash/config.
// Amplify keeps the access token in memory, the refresh token and the device key in localStorage
// (accepted: "remember this computer" needs them). Nothing here logs an email, a code or a token.
import { Amplify } from 'aws-amplify'
import {
  confirmSignIn,
  fetchAuthSession,
  forgetDevice,
  getCurrentUser,
  rememberDevice,
  signIn,
  signOut,
  type SignInOutput,
} from 'aws-amplify/auth'
import {
  AuthStepError,
  type AuthConfig,
  type AuthProvider,
  type MfaKind,
  type ProviderUser,
  type SignInResult,
  type TotpSetup,
} from './types.ts'

type Next = SignInOutput['nextStep']

const APP_NAME = 'Katie'

/** Amplify's error names to plain words. Unknown errors say nothing about why (no account hints). */
function plain(err: unknown): AuthStepError {
  const name = err && typeof err === 'object' ? String((err as { name?: unknown }).name ?? '') : ''
  switch (name) {
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      return new AuthStepError('That email and password do not match. Check them and try again.')
    case 'PasswordResetRequiredException':
      return new AuthStepError('Your password was reset. Ask the practice owner for a new temporary one.')
    case 'UserNotConfirmedException':
      return new AuthStepError('This account is not ready yet. Ask the practice owner to send the invite again.')
    case 'CodeMismatchException':
    case 'EnableSoftwareTokenMFAException':
      return new AuthStepError('That code is not right. Check it and try again.')
    case 'ExpiredCodeException':
      return new AuthStepError('That code has expired. Sign in again to get a new one.')
    case 'InvalidPasswordException':
    case 'InvalidParameterException':
      return new AuthStepError('That password does not meet the rules. Try a longer one with a mix of characters.')
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return new AuthStepError('Too many tries. Wait a few minutes and try again.')
    case 'NetworkError':
      return new AuthStepError('Could not reach the sign-in service. Check your connection and try again.')
    case 'UserAlreadyAuthenticatedException':
      return new AuthStepError('Someone is already signed in on this computer. Reload the page.')
    default:
      return new AuthStepError('Something went wrong signing in. Try again in a moment.')
  }
}

const kindOf = (t: string): MfaKind | null => (t === 'TOTP' ? 'app' : t === 'EMAIL' ? 'email' : null)
const typeOf = (k: MfaKind): 'TOTP' | 'EMAIL' => (k === 'app' ? 'TOTP' : 'EMAIL')

export function createCognitoProvider(config: AuthConfig): AuthProvider {
  if (!config.user_pool_id || !config.client_id) throw new Error('Cognito config is incomplete')
  Amplify.configure({ Auth: { Cognito: { userPoolId: config.user_pool_id, userPoolClientId: config.client_id } } })

  // Held only while a challenge is open (cleared on done, failure and sign-out): the typed email
  // for the email-setup step, the totp details, and the password for "use my email code instead".
  let pendingEmail = ''
  let pendingPassword: string | null = null
  let totp: TotpSetup | null = null
  let choices: MfaKind[] = []

  const forget = () => {
    pendingPassword = null
    totp = null
    choices = []
  }

  async function mapStep(out: SignInOutput): Promise<SignInResult> {
    const next: Next = out.nextStep
    switch (next.signInStep) {
      case 'DONE':
        forget()
        return { step: 'done' }
      case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
        return { step: 'new-password' }
      case 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION':
      case 'CONTINUE_SIGN_IN_WITH_MFA_SETUP_SELECTION': {
        choices = (next.allowedMFATypes ?? ['TOTP', 'EMAIL']).map(kindOf).filter((k): k is MfaKind => k !== null)
        return { step: 'choose-code', choices, setup: next.signInStep === 'CONTINUE_SIGN_IN_WITH_MFA_SETUP_SELECTION' }
      }
      case 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP': {
        const d = next.totpSetupDetails
        totp = { secret: d.sharedSecret, uri: d.getSetupUri(APP_NAME, pendingEmail).toString() }
        return { step: 'setup-app' }
      }
      case 'CONTINUE_SIGN_IN_WITH_EMAIL_SETUP':
        // The invite went to this address, so the email code is set up for it; no extra screen.
        return mapStep(await confirmSignIn({ challengeResponse: pendingEmail }))
      case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
        return { step: 'code', kind: 'app', canSwitch: choices.includes('email') && pendingPassword !== null }
      case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
        return { step: 'code', kind: 'email', canSwitch: choices.includes('app') && pendingPassword !== null }
      default:
        // SMS, custom challenges, first-factor selection: not used by this pool.
        throw new AuthStepError('This sign-in step is not available. Ask the practice owner or SAIDA support.')
    }
  }

  async function run(fn: () => Promise<SignInOutput>): Promise<SignInResult> {
    try {
      return await mapStep(await fn())
    } catch (err) {
      if (err instanceof AuthStepError) throw err
      throw plain(err)
    }
  }

  const provider: AuthProvider = {
    async currentUser(): Promise<ProviderUser | null> {
      try {
        const s = await fetchAuthSession()
        if (!s.tokens?.accessToken) return null
        const u = await getCurrentUser()
        const email = s.tokens.idToken?.payload?.email
        return { email: typeof email === 'string' ? email : u.signInDetails?.loginId ?? '' }
      } catch {
        return null
      }
    },

    async signIn(email, password) {
      pendingEmail = email.trim()
      // A stale local session would make Amplify refuse a new sign-in.
      await signOut().catch(() => undefined)
      pendingPassword = password
      choices = []
      return run(() => signIn({ username: pendingEmail, password, options: { authFlowType: 'USER_SRP_AUTH' } }))
    },

    newPassword: (password) => run(() => confirmSignIn({ challengeResponse: password })),

    chooseMfa: (kind) => run(() => confirmSignIn({ challengeResponse: typeOf(kind) })),

    async setUpTotp() {
      if (!totp) throw new AuthStepError('There is no authenticator app to set up right now. Sign in again.')
      return totp
    },

    verifyTotpSetup: (code) => run(() => confirmSignIn({ challengeResponse: code })),

    confirmCode: (code) => run(() => confirmSignIn({ challengeResponse: code })),

    async switchCode(kind) {
      if (pendingPassword === null) throw new AuthStepError('Sign in again to switch the code.')
      const pw = pendingPassword
      await signOut().catch(() => undefined)
      pendingPassword = pw
      const first = await run(() => signIn({ username: pendingEmail, password: pw, options: { authFlowType: 'USER_SRP_AUTH' } }))
      if (first.step === 'choose-code') return provider.chooseMfa(kind)
      return first
    },

    async rememberThisComputer() {
      await rememberDevice()
    },

    async forgetThisComputer() {
      await forgetDevice()
    },

    async signOut() {
      forget()
      await signOut()
    },

    async accessToken(opts) {
      try {
        const s = await fetchAuthSession({ forceRefresh: !!opts?.forceRefresh })
        return s.tokens?.accessToken?.toString() ?? null
      } catch {
        return null
      }
    },
  }
  return provider
}
