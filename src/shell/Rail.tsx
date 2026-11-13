import { Link } from 'react-router'
import { Calendar, Comment, Home, Mobile, Reply, Settings, Team } from '@vibe/icons'
import type { FC, SVGAttributes } from 'react'
import { useNotes, useStats, useStatus } from '../api/queries'
import { isActionNote } from '../lib/reason'
import { practiceName } from '../lib/text'
import styles from './Shell.module.css'
import { useMascotAvatar } from '../katie/avatar'

interface NavItem {
  to: string
  label: string
  Icon: FC<SVGAttributes<SVGElement> & { size?: string | number }>
  end?: boolean
}

// The same drawing as the top bar's Katie button (one construction at every size, FINDINGS 6.6).
// The avatar follows the mascot look chosen on Settings (src/katie/avatar.ts).

// DESIGN 5: Vibe has no handset icon; SmartCall carries an AI sparkle and is banned.
const NAV: NavItem[] = [
  { to: '/', label: 'Overview', Icon: Home, end: true },
  { to: '/calls', label: 'Calls', Icon: Mobile },
  { to: '/bookings', label: 'Bookings', Icon: Calendar },
  { to: '/leads', label: 'Leads', Icon: Team },
  { to: '/callbacks', label: 'Callbacks', Icon: Reply },
  { to: '/texts', label: 'Texts', Icon: Comment },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

export function Rail({ activePath }: { activePath: string }) {
  const status = useStatus()
  const avatar = useMascotAvatar()
  const stats = useStats(1)
  const notes = useNotes()
  const practice = practiceName(status.data?.practice)
  // The same count as Overview's "Callbacks waiting": today's notes the desk must act on (not
  // FYI, not "note is informational"). stats.callbacks counts every non-FYI note, so it is not
  // used here; nothing shows until the notes are in.
  const from = stats.data?.range.from
  const waiting = from != null && notes.rows ? notes.rows.filter((n) => n.ts >= from && isActionNote(n)).length : 0

  return (
    <nav className={styles.rail} aria-label="Main">
      {/* P17: Katie's head is the product mark; the practice, the owner's own name, is row 2.
          No "Demo practice" line: the top bar's Demo control says it. */}
      <div className={styles.wordmark}>
        <span className={styles.brandRow}>
          <img
            className={styles.mark}
            src={avatar.a40}
            srcSet={`${avatar.a40} 1.5x, ${avatar.a60} 2.5x`}
            width={24}
            height={24}
            alt=""
          />
          <span className={styles.brand}>Katie</span>
        </span>
        <span className={styles.practice} title={practice.name || undefined}>
          {practice.name}
        </span>
      </div>
      <ul className={styles.nav}>
        {NAV.map(({ to, label, Icon, end }) => {
          // The drawer route (/calls/:id) keeps its background page's item active.
          const active = end ? activePath === to : activePath === to || activePath.startsWith(to + '/')
          return (
            <li key={to}>
              <Link to={to} className={styles.item} aria-current={active ? 'page' : undefined}>
                <Icon size={20} className={styles.icon} aria-hidden />
                <span>{label}</span>
                {to === '/callbacks' && waiting > 0 && (
                  <span className={styles.count} aria-label={`${waiting} waiting`}>
                    {waiting}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
      <span className={styles.made}>Made by SAIDA</span>
    </nav>
  )
}
