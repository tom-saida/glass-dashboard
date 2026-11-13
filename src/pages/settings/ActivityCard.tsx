// Settings > Activity (owner and SAIDA support only): the last 30 days of who did what, in plain
// sentences, with a filter by person. The server never sends a phone number or a transcript.
import { useId, useMemo, useState } from 'react'
import { useActivity, usePeople } from '../../api/authApi'
import { isApiError } from '../../api/client'
import { Card, EmptyLine, ErrorLine, SkeletonRows, TextButton } from '../../components'
import { formatWhen } from '../../lib'
import { activityPeople, activitySentence, filterActivity, tsToSec, type NameMap } from '../../auth/helpers'
import styles from './people.module.css'

const PAGE = 25

export function ActivityCard() {
  const q = useActivity(30)
  const [who, setWho] = useState('')
  const [shown, setShown] = useState(PAGE)
  const selectId = useId()
  const rows = q.data ?? []
  // The People list (same owner/support access) turns emails into names.
  const list = usePeople().data?.people
  const names = useMemo<NameMap>(() => Object.fromEntries((list ?? []).map((p) => [p.email.toLowerCase(), p.name])), [list])
  const people = useMemo(() => activityPeople(rows, names), [rows, names])
  const filtered = useMemo(() => filterActivity(rows, who || null), [rows, who])

  return (
    <Card
      title="Activity, last 30 days"
      data-card="activity"
      headerRight={
        <span className={styles.filter}>
          <label htmlFor={selectId}>Person</label>
          <select
            id={selectId}
            className={styles.select}
            value={who}
            onChange={(e) => {
              setWho(e.target.value)
              setShown(PAGE)
            }}
          >
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.email} value={p.email}>
                {p.name}
              </option>
            ))}
          </select>
        </span>
      }
    >
      {q.isPending ? (
        <SkeletonRows rows={4} columns={[{ width: '1fr', bar: '50%' }]} />
      ) : q.isError ? (
        <ErrorLine onRetry={() => void q.refetch()}>
          {isApiError(q.error) && q.error.isForbidden ? 'Not allowed.' : "Couldn't load the activity. Trying again."}
        </ErrorLine>
      ) : filtered.length === 0 ? (
        <EmptyLine>{who ? 'Nothing from this person in the last 30 days.' : 'No activity yet.'}</EmptyLine>
      ) : (
        <>
          <ul className={styles.feed}>
            {filtered.slice(0, shown).map((r) => {
              const sec = tsToSec(r.ts)
              return (
                <li key={r.id} className={styles.feedRow} data-activity={r.action}>
                  <span>{activitySentence(r, names)}</span>
                  <span className={styles.when}>{sec === null ? '' : formatWhen(sec)}</span>
                </li>
              )
            })}
          </ul>
          {filtered.length > shown && (
            <div className={styles.more}>
              <TextButton onClick={() => setShown((n) => n + PAGE)}>Show more</TextButton>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
