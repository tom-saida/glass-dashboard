import { useEffect, useState, type FormEvent } from 'react'
import { cleanCode } from '../helpers'
import { cancelChallenge, submitSetupCode, useAuthSession } from '../session'
import { CodeBoxes } from './CodeBoxes'
import { Frame } from './Frame'
import styles from './auth.module.css'

/** Scan the QR code (or type the secret) into an authenticator app, then enter its first code. */
export function SetUpApp() {
  const s = useAuthSession()
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const uri = s.totp?.uri

  useEffect(() => {
    if (!uri) return
    let live = true
    void import('qrcode')
      .then((m) => m.toDataURL(uri, { margin: 1, width: 176, errorCorrectionLevel: 'M' }))
      .then((d) => live && setQr(d))
      .catch(() => live && setQr(null))
    return () => {
      live = false
    }
  }, [uri])

  useEffect(() => {
    if (s.error) setCode('')
  }, [s.error])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (cleanCode(code).length === 6) void submitSetupCode(code)
  }
  const copy = () => {
    const secret = s.totp?.secret
    if (!secret) return
    void navigator.clipboard
      ?.writeText(secret)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }

  return (
    <Frame title="Set up the app" sub="Scan this with an authenticator app, then enter the code it shows." label="setup-app">
      {qr ? (
        <img className={styles.qr} src={qr} width={176} height={176} alt="QR code for your authenticator app" />
      ) : (
        <div className={styles.qr} aria-hidden="true" />
      )}
      <p className={styles.hint} style={{ textAlign: 'center', margin: '0 0 6px' }}>
        Cannot scan it? Type this key into the app instead.
      </p>
      <div className={styles.secretRow}>
        <code className={styles.secret} data-secret="">
          {s.totp?.secret ?? ''}
        </code>
        <button type="button" className={styles.small} onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <form className={styles.form} onSubmit={submit} noValidate>
        <CodeBoxes value={code} onChange={setCode} disabled={s.busy} groupLabel="First code from the app" />
        {s.error && (
          <p className={styles.error} role="alert">
            {s.error}
          </p>
        )}
        <button type="submit" className={styles.button} disabled={s.busy || cleanCode(code).length < 6}>
          {s.busy ? 'Checking' : 'Finish setup'}
        </button>
      </form>
      <button type="button" className={styles.link} onClick={cancelChallenge}>
        Back to sign in
      </button>
    </Frame>
  )
}
