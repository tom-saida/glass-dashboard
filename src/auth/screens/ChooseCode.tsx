import { cancelChallenge, chooseCode, useAuthSession } from '../session'
import { Frame } from './Frame'
import styles from './auth.module.css'

/** Authenticator app or emailed code: to set one up (first time) or to use now (both are set up). */
export function ChooseCode() {
  const s = useAuthSession()
  const setup = s.setup
  return (
    <Frame
      title={setup ? 'Set up your code' : 'One more step'}
      sub={
        setup
          ? 'Every sign-in needs a code as well as your password. Pick how you want to get it.'
          : 'Pick where to get your code this time.'
      }
      label="choose-code"
    >
      <div className={styles.choices}>
        {s.choices.includes('app') && (
          <button type="button" className={styles.choice} disabled={s.busy} onClick={() => void chooseCode('app')}>
            <span className={styles.choiceTitle}>Authenticator app</span>
            <span className={styles.choiceText}>
              {setup ? 'A free app on your phone gives you a new code every 30 seconds.' : 'Open the app and read the six digits.'}
            </span>
          </button>
        )}
        {s.choices.includes('email') && (
          <button type="button" className={styles.choice} disabled={s.busy} onClick={() => void chooseCode('email')}>
            <span className={styles.choiceTitle}>Email me a code</span>
            <span className={styles.choiceText}>We send six digits to your work email each time you sign in.</span>
          </button>
        )}
      </div>
      {s.error && (
        <p className={styles.error} role="alert">
          {s.error}
        </p>
      )}
      <button type="button" className={styles.link} onClick={cancelChallenge}>
        Back to sign in
      </button>
    </Frame>
  )
}
