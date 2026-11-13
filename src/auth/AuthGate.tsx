import { useEffect, useState, type ReactNode } from 'react'
import { ChooseCode } from './screens/ChooseCode'
import { Code } from './screens/Code'
import { ForgotPassword } from './screens/ForgotPassword'
import { Locked } from './screens/Locked'
import { NewPassword } from './screens/NewPassword'
import { SetUpApp } from './screens/SetUpApp'
import { SignIn } from './screens/SignIn'
import { useAuthSession } from './session'

/**
 * Wraps the routes. Basic mode and signed-in people see the app; everyone else sees the right
 * sign-in screen. While locked or signed out the app is not mounted at all, so no data page,
 * no stream and no Katie exist behind the screen.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const s = useAuthSession()
  const [forgot, setForgot] = useState(false)
  useEffect(() => setForgot(false), [s.phase, s.step])

  if (s.phase === 'basic' || s.phase === 'signed-in') return <>{children}</>
  if (forgot) return <ForgotPassword onBack={() => setForgot(false)} />
  if (s.phase === 'locked') return <Locked onForgot={() => setForgot(true)} />
  if (s.phase === 'challenge') {
    switch (s.step) {
      case 'new-password':
        return <NewPassword />
      case 'choose-code':
        return <ChooseCode />
      case 'setup-app':
        return <SetUpApp />
      case 'code':
        return <Code />
      default:
        break
    }
  }
  return <SignIn onForgot={() => setForgot(true)} />
}
