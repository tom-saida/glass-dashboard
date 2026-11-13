import { useSyncExternalStore } from 'react'
import { getAuthState, subscribeAuthState } from '../api/client'
import styles from './Shell.module.css'

/**
 * Real mode: one line in the top bar when the API answers 401 (the basic-auth session is gone,
 * or in development the proxy's DASH_USER / DASH_PASS pair is wrong). Widgets keep their own
 * error lines; this says why, once. Polling and the stream pause until a request succeeds.
 */
export function SessionLine() {
  const state = useSyncExternalStore(subscribeAuthState, getAuthState, getAuthState)
  if (state === 'ok') return null
  return (
    <p className={styles.session} role="alert">
      {import.meta.env.DEV
        ? 'The API refused the dev proxy’s sign-in (DASH_USER / DASH_PASS).'
        : 'Signed out. Reload the page to sign in again.'}
      <button type="button" className={styles.sessionButton} onClick={() => window.location.reload()}>
        Reload
      </button>
    </p>
  )
}
