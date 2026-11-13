import { useEffect, useRef, useState, type FormEvent } from 'react'
import { looksLikeEmail } from '../helpers'
import { signIn, useAuthSession } from '../session'
import { Frame } from './Frame'
import styles from './auth.module.css'

/** Email and password. Used for the first sign-in and, with `email` fixed, for the lock screen. */
export function SignIn({ onForgot }: { onForgot: () => void }) {
  const s = useAuthSession()
  const [email, setEmail] = useState(s.email)
  const [password, setPassword] = useState('')
  const [local, setLocal] = useState<string | null>(null)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => first.current?.focus(), [])
  // A wrong password clears the field, and the error stays until the next try.
  useEffect(() => {
    if (s.error) setPassword('')
  }, [s.error])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!looksLikeEmail(email)) return setLocal('Enter the email address you were invited with.')
    if (!password) return setLocal('Enter your password.')
    setLocal(null)
    void signIn(email, password)
  }
  const error = local ?? s.error

  return (
    <Frame title="Katie" label="sign-in">
      <form className={styles.form} onSubmit={submit} noValidate>
        {s.notice && (
          <p className={styles.notice} role="status">
            {s.notice}
          </p>
        )}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="auth-email">
            Work email
          </label>
          <input
            id="auth-email"
            ref={first}
            className={styles.input}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={styles.button} disabled={s.busy}>
          {s.busy ? 'Signing in' : 'Sign in'}
        </button>
      </form>
      <button type="button" className={styles.link} onClick={onForgot}>
        Forgot your password?
      </button>
    </Frame>
  )
}
