import { isCognitoMode, signOut, useAuthSession } from '../auth/session'
import styles from './Shell.module.css'

/** Cognito mode: "Signed in as <name>" and Sign out, before the other top-bar controls. */
export function AccountLine() {
  const s = useAuthSession()
  if (!isCognitoMode() || s.phase !== 'signed-in' || !s.me) return null
  return (
    <span className={styles.account} data-account="">
      <span className={styles.accountText}>
        <span className={styles.accountLabel}>Signed in as </span>
        <strong>{s.me.name || s.me.email}</strong>
      </span>
      <button type="button" className={styles.accountButton} onClick={() => void signOut()}>
        Sign out
      </button>
    </span>
  )
}
