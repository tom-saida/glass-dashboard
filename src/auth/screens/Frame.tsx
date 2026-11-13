import type { ReactNode } from 'react'
import { getAuthConfig } from '../session'
import styles from './auth.module.css'
import { useMascotAvatar } from '../../katie/avatar'


/**
 * The room behind the sign-in pane (the same markup the shell uses, without the glass objects):
 * styles/glass.css paints it per the stored look. Then one glass pane in the middle.
 */
export function Frame({
  title,
  sub,
  children,
  foot,
  label,
}: {
  title: string
  sub?: string
  children: ReactNode
  foot?: string
  /** data-screen, for the verifier and for support to say which screen someone is on. */
  label: string
}) {
  const practice = getAuthConfig()?.practice
  const avatar = useMascotAvatar()
  return (
    <>
      <div className="env" aria-hidden="true">
        <div className="field">
          <div className="field-sun" />
          <div className="field-win" />
          <div className="field-disc" />
          <div className="field-bar" />
          <div className="field-leaf" />
          <div className="field-leaf field-leaf-2" />
          <div className="field-leaf field-leaf-3" />
        </div>
      </div>
      <main className={styles.stage}>
        <section
          className={styles.pane}
          data-screen={label}
          aria-labelledby="auth-title"
          style={{ backdropFilter: 'blur(14px) saturate(1.6)', WebkitBackdropFilter: 'blur(14px) saturate(1.6)' }}
        >
          <div className={styles.avatar}>
            <img src={avatar.a60} width={60} height={60} alt="" />
          </div>
          <h1 id="auth-title" className={styles.title}>
            {title}
          </h1>
          <p className={styles.sub}>{sub ?? practice ?? 'Practice dashboard'}</p>
          {children}
          <p className={styles.foot}>{foot ?? 'Katie by SAIDA · Only people this practice added can sign in'}</p>
        </section>
      </main>
    </>
  )
}
