// Settings > People (owner and SAIDA support only): who can sign in, and the actions on each person.
// Every action asks first, in a dialog. Server errors are shown as they come ({"error": "..."}).
import { useId, useState, type FormEvent } from 'react'
import { Toggle } from '@vibe/core'
import { authApi, usePeople, useRefreshPeople } from '../../api/authApi'
import { isApiError } from '../../api/client'
import { Card, EmptyLine, ErrorLine, SkeletonRows } from '../../components'
import { formatWhen } from '../../lib'
import {
  actionLabel,
  canToggleSupport,
  firstNameOf,
  looksLikeEmail,
  mfaLabel,
  personActions,
  roleLabel,
  sortPeople,
  stateLabel,
  tsToSec,
  type PersonAction,
} from '../../auth/helpers'
import { getAuthConfig, useAuthSession } from '../../auth/session'
import type { Person } from '../../auth/types'
import { Dialog } from './Dialog'
import styles from './people.module.css'

const firstName = (p: Pick<Person, 'name' | 'email'>) => firstNameOf(p.name || p.email)

function say(e: unknown): string {
  if (isApiError(e)) return e.detail ?? (e.isForbidden ? 'Not allowed.' : 'That did not work. Try again in a moment.')
  return 'That did not work. Try again in a moment.'
}

function lastSignIn(p: Person): string {
  const sec = tsToSec(p.last_sign_in)
  return sec === null ? 'Never' : formatWhen(sec)
}

function dialogCopy(a: PersonAction, p: Person): { title: string; body: string[]; go: string; danger: boolean } {
  const f = firstName(p)
  switch (a) {
    case 'remove':
      return {
        title: `Remove ${p.name}?`,
        body: [
          `${f} is signed out of Katie on every computer and phone right now and cannot sign in again, including with a remembered computer.`,
          `${f}'s name stays on the calls they viewed, for the practice's records.`,
        ],
        go: `Remove ${f}`,
        danger: true,
      }
    case 'reset-password':
      return {
        title: `Reset ${f}'s password?`,
        body: [`We email ${p.email} a temporary password. ${f} chooses a new one the next time they sign in.`],
        go: 'Reset password',
        danger: false,
      }
    case 'reset-code':
      return {
        title: `Reset ${f}'s sign-in code?`,
        body: [
          `${f} sets up the authenticator app or the email code again at the next sign-in, and every remembered computer asks for a code again.`,
        ],
        go: 'Reset code',
        danger: false,
      }
    default:
      return {
        title: `Send ${f} the invite again?`,
        body: [`We email ${p.email} a new invite with a temporary password.`],
        go: 'Send invite',
        danger: false,
      }
  }
}

const DONE: Record<PersonAction, string> = {
  remove: 'Removed.',
  'reset-password': 'Password reset. A temporary one is on its way by email.',
  'reset-code': 'Code reset. They set it up again at the next sign-in.',
  resend: 'Invite sent again.',
}

export function PeopleCard() {
  const q = usePeople()
  const me = useAuthSession().me
  const refresh = useRefreshPeople()
  const [confirm, setConfirm] = useState<{ action: PersonAction; person: Person } | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const people = q.data ? sortPeople(q.data.people) : []
  const supportRow = people.find((p) => p.is_support) ?? null
  const humans = people.filter((p) => !p.is_support)
  const supportOn = q.data?.support_enabled ?? false
  const supportMail = supportRow?.email ?? getAuthConfig()?.support_email ?? ''

  const close = () => {
    setConfirm(null)
    setAdding(false)
    setDialogError(null)
  }

  const run = async () => {
    if (!confirm || busy) return
    setBusy(true)
    setDialogError(null)
    try {
      await authApi.personAction(confirm.person.username, confirm.action)
      setStatus(DONE[confirm.action])
      setProblem(null)
      close()
      await refresh()
    } catch (e) {
      setDialogError(say(e))
    } finally {
      setBusy(false)
    }
  }

  const flipSupport = async (on: boolean) => {
    setProblem(null)
    setStatus(null)
    try {
      await authApi.setSupport(on)
      setStatus(on ? 'SAIDA support can sign in again.' : 'SAIDA support can no longer sign in.')
      await refresh()
    } catch (e) {
      setProblem(say(e))
    }
  }

  return (
    <Card title="People who can sign in" data-card="people">
      <p className={styles.lead}>
        Each person has their own login and their own code. Remove someone and they are signed out everywhere at once.
      </p>
      {q.isPending ? (
        <SkeletonRows rows={3} columns={[{ width: 220, bar: '70%' }, { width: 100, bar: '60%' }, { width: '1fr', bar: '40%' }]} />
      ) : q.isError ? (
        <ErrorLine onRetry={() => void q.refetch()}>
          {isApiError(q.error) && q.error.isForbidden ? 'Not allowed.' : "Couldn't load the people. Trying again."}
        </ErrorLine>
      ) : humans.length === 0 && !supportRow ? (
        <EmptyLine>No one is on the list yet.</EmptyLine>
      ) : (
        <table className={styles.table}>
          <colgroup>
            <col style={{ width: '31%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '12%' }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Person</th>
              <th>Status</th>
              <th>Sign-in code</th>
              <th>Last signed in</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {humans.map((p) => {
              const acts = personActions(p, !!me && p.email.toLowerCase() === me.email.toLowerCase())
              return (
                <tr key={p.username} data-person={p.email} className={p.enabled ? undefined : styles.removed}>
                  <td>
                    <span className={styles.name}>
                      {p.name}{' '}
                      <span className={`${styles.chip} ${styles.role} ${p.role === 'owner' ? styles.chipOwner : ''}`}>{roleLabel(p.role)}</span>
                    </span>
                    <span className={styles.email}>{p.email}</span>
                  </td>
                  <td>
                    <span
                      className={`${styles.chip} ${p.state === 'active' ? styles.chipOk : p.state === 'disabled' ? '' : styles.chipWait}`}
                    >
                      {stateLabel(p.state)}
                    </span>
                  </td>
                  <td>{mfaLabel(p.mfa)}</td>
                  <td>{lastSignIn(p)}</td>
                  <td>
                    <div className={styles.actions}>
                      {acts.map((a) => (
                        <button
                          key={a}
                          type="button"
                          className={`${styles.act} ${a === 'remove' ? styles.danger : ''}`}
                          aria-label={`${actionLabel(a)}: ${p.name}`}
                          onClick={() => {
                            setDialogError(null)
                            setConfirm({ action: a, person: p })
                          }}
                        >
                          {actionLabel(a)}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}
            <SupportRow person={supportRow} email={supportMail} on={supportOn} canFlip={canToggleSupport(me?.role)} onFlip={flipSupport} />
          </tbody>
        </table>
      )}
      <div className={styles.add}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => {
            setDialogError(null)
            setAdding(true)
          }}
        >
          Add a person
        </button>
        They get an email with a temporary password, then choose their own and set up their code.
      </div>
      {status && (
        <p className={styles.status} role="status">
          {status}
        </p>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      <p className={styles.note}>
        Who viewed what is kept for the practice&apos;s records: every sign-in and every opened call is logged with the
        person&apos;s name.
      </p>

      {confirm && (
        <Dialog dialogId={confirm.action} title={dialogCopy(confirm.action, confirm.person).title} onClose={close}>
          {dialogCopy(confirm.action, confirm.person).body.map((t) => (
            <p key={t}>{t}</p>
          ))}
          {dialogError && (
            <p className={styles.dialogError} role="alert">
              {dialogError}
            </p>
          )}
          <div className={styles.dialogRow}>
            <button type="button" className={styles.dialogButton} data-autofocus="" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className={`${styles.dialogButton} ${dialogCopy(confirm.action, confirm.person).danger ? styles.dialogDanger : styles.dialogGo}`}
              disabled={busy}
              onClick={() => void run()}
            >
              {dialogCopy(confirm.action, confirm.person).go}
            </button>
          </div>
        </Dialog>
      )}
      {adding && (
        <AddDialog
          onClose={close}
          onAdded={async (email) => {
            setStatus(`Invite sent to ${email}.`)
            setProblem(null)
            close()
            await refresh()
          }}
        />
      )}
    </Card>
  )
}

function SupportRow({
  person,
  email,
  on,
  canFlip,
  onFlip,
}: {
  person: Person | null
  email: string
  on: boolean
  canFlip: boolean
  onFlip: (on: boolean) => void
}) {
  const id = useId()
  return (
    <tr data-person="support">
      <td>
        <span className={styles.name}>
          SAIDA support <span className={`${styles.chip} ${styles.role} ${styles.chipSupport}`}>Support</span>
        </span>
        <span className={styles.email}>{email ? `${email} · only when you ask` : 'Only when you ask'}</span>
      </td>
      <td>
        <span className={`${styles.chip} ${on ? styles.chipOk : ''}`}>{on ? 'Access on' : 'Access off'}</span>
      </td>
      <td>{person ? mfaLabel(person.mfa) : 'Authenticator app'}</td>
      <td>{person ? lastSignIn(person) : 'Never'}</td>
      <td>
        <div className={styles.actions}>
          <span className={styles.supportToggle}>
            <span aria-hidden="true">{on ? 'On' : 'Off'}</span>
            <Toggle
              id={id}
              size="small"
              areLabelsHidden
              aria-label="SAIDA support access"
              isSelected={on}
              disabled={!canFlip}
              onChange={(v: boolean) => onFlip(v)}
            />
          </span>
        </div>
      </td>
    </tr>
  )
}

function AddDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'staff' | 'owner'>('staff')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = { e: useId(), n: useId(), r: useId() }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!looksLikeEmail(email)) return setError('Enter their work email address.')
    if (!name.trim()) return setError('Enter their name.')
    setBusy(true)
    setError(null)
    try {
      await authApi.addPerson({ email: email.trim(), name: name.trim(), role })
      await onAdded(email.trim())
    } catch (e) {
      setError(say(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog dialogId="add" title="Add a person" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor={ids.e}>
            Work email
          </label>
          <input id={ids.e} className={styles.formInput} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor={ids.n}>
            Name
          </label>
          <input id={ids.n} className={styles.formInput} type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor={ids.r}>
            Role
          </label>
          <select id={ids.r} className={styles.formInput} value={role} onChange={(e) => setRole(e.target.value === 'owner' ? 'owner' : 'staff')}>
            <option value="staff">Staff: calls, bookings, callbacks and texts</option>
            <option value="owner">Owner: everything, plus People and Activity</option>
          </select>
        </div>
        {error && (
          <p className={styles.dialogError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogRow}>
          <button type="button" className={styles.dialogButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`${styles.dialogButton} ${styles.dialogGo}`} disabled={busy}>
            Send invite
          </button>
        </div>
      </form>
    </Dialog>
  )
}
