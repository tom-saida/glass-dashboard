import { getAuthConfig } from '../session'
import { Frame } from './Frame'
import styles from './auth.module.css'

/** There is no self-serve reset: the owner or SAIDA sets a temporary password. */
export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const mail = getAuthConfig()?.support_email ?? ''
  return (
    <Frame title="Forgot your password?" sub="Someone at the practice can set a new one." label="forgot">
      <p className={styles.body}>
        Ask the practice owner to reset your password from Settings. They will email you a temporary one, and you choose
        your own the next time you sign in.
      </p>
      {mail && (
        <p className={styles.body}>
          If you are the owner, or nobody else can, write to SAIDA support at <a href={`mailto:${mail}`}>{mail}</a>.
        </p>
      )}
      <button type="button" className={styles.button} onClick={onBack}>
        Back to sign in
      </button>
    </Frame>
  )
}
