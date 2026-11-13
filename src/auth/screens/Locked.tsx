import { useEffect, useRef, useState, type FormEvent } from 'react'
import { signIn, signOut, useAuthSession } from '../session'
import { Frame } from './Frame'
import styles from './auth.module.css'

/** After the idle lock: the data is gone from the screen; the password brings it back. */
export function Locked({ onForgot }: { onForgot: () => void }) {
  const s = useAuthSession()
  const [password, setPassword] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  useEffect(() => {
    if (s.error) setPassword('')
  }, [s.error])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!password) return
    void signIn(s.email, password)
  }

  return (
    <Frame title="Katie is locked" sub="It locked itself after a while with nothing happening." label="locked" foot={`Katie by SAIDA · Signed in as ${s.email}`}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="auth-unlock">
            Password
          </label>
          <input
            id="auth-unlock"
            ref={ref}
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {s.error && (
          <p className={styles.error} role="alert">
            {s.error}
          </p>
        )}
        <button type="submit" className={styles.button} disabled={s.busy}>
          {s.busy ? 'Unlocking' : 'Unlock'}
        </button>
      </form>
      <button type="button" className={styles.link} onClick={onForgot}>
        Forgot your password?
      </button>
      <button type="button" className={styles.link} onClick={() => void signOut()}>
        Sign out instead
      </button>
    </Frame>
  )
}
