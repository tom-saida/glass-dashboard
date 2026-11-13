import { useEffect, useRef, useState, type FormEvent } from 'react'
import { newPasswordProblem, MIN_PASSWORD } from '../helpers'
import { cancelChallenge, submitNewPassword, useAuthSession } from '../session'
import { Frame } from './Frame'
import styles from './auth.module.css'

/** First sign-in with the temporary password: choose your own. */
export function NewPassword() {
  const s = useAuthSession()
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [local, setLocal] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const problem = newPasswordProblem(pw, again)
    if (problem) return setLocal(problem)
    setLocal(null)
    void submitNewPassword(pw)
  }
  const error = local ?? s.error

  return (
    <Frame title="Choose a password" sub="You signed in with a temporary one. Pick one only you know." label="new-password">
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="auth-new">
            New password
          </label>
          <input
            id="auth-new"
            ref={ref}
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="auth-new2">
            Type it again
          </label>
          <input
            id="auth-new2"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </div>
        <p className={styles.hint}>At least {MIN_PASSWORD} characters. A few unrelated words work well.</p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={styles.button} disabled={s.busy}>
          {s.busy ? 'Saving' : 'Save password'}
        </button>
      </form>
      <button type="button" className={styles.link} onClick={cancelChallenge}>
        Back to sign in
      </button>
    </Frame>
  )
}
