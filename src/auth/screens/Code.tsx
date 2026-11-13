import { useEffect, useState, type FormEvent } from 'react'
import { cleanCode } from '../helpers'
import { cancelChallenge, getAuthConfig, submitCode, switchCode, useAuthSession } from '../session'
import { CodeBoxes } from './CodeBoxes'
import { Frame } from './Frame'
import styles from './auth.module.css'

/** The six-digit code from the app or the email, with the remember-this-computer box. */
export function Code() {
  const s = useAuthSession()
  const days = getAuthConfig()?.remember_days ?? 30
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(false)
  const kind = s.codeKind ?? 'app'

  // A wrong code empties the boxes; the error stays until the next try.
  useEffect(() => {
    if (s.error) setCode('')
  }, [s.error])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (cleanCode(code).length === 6) void submitCode(code, remember)
  }
  const other = kind === 'app' ? 'email' : 'app'

  return (
    <Frame
      title="One more step"
      sub={kind === 'app' ? 'Enter the 6-digit code from your authenticator app' : 'Enter the 6-digit code we emailed you'}
      label="code"
      foot={`Katie by SAIDA · Signing in as ${s.email}`}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <CodeBoxes value={code} onChange={setCode} disabled={s.busy} groupLabel="Six-digit code" />
        <label className={styles.check}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember this computer for {days} days
        </label>
        {s.error && (
          <p className={styles.error} role="alert">
            {s.error}
          </p>
        )}
        <button type="submit" className={styles.button} disabled={s.busy || cleanCode(code).length < 6}>
          {s.busy ? 'Checking' : 'Continue'}
        </button>
      </form>
      {s.canSwitch && (
        <button type="button" className={styles.link} disabled={s.busy} onClick={() => void switchCode(other)}>
          {other === 'email' ? 'Use my email code instead' : 'Use my authenticator app instead'}
        </button>
      )}
      <button type="button" className={styles.link} onClick={cancelChallenge}>
        Back to sign in
      </button>
    </Frame>
  )
}
