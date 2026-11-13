// Call drawer content (DESIGN.md 6.8, plan P11: the drawer as a document). The frame (fixed right,
// Esc, close button, focus) is the shell's <Drawer>. This renders:
//   header   the name (20/600) or the number, the outcome chip; then the masked number, the day
//            and time, the length and a language other than English, in secondary text
//   Outcome  one line per action in the order it happened; each line scrolls to its row
//   transcript rows: speaker (64) + m:ss from the start (tabular) + the words at 14/20, no bubbles;
//            Katie's rows carry a 2px rule on the left and her 16px head; event rows 12/16
//            secondary with a 16px icon. A live call keeps streaming in.
import { useCallback, useLayoutEffect, useMemo, useRef, type FC, type SVGAttributes } from 'react'
import { Calendar, Check, CloseSmall, Comment, Mobile, Note, Person, Reply, Warning } from '@vibe/icons'
import { isApiError, useBookings, useCall, useCallRow, useNotes, usePracticeTz, useSms, type CallRow } from '../../api'
import { CallChip, DrawerHeading, SkeletonBar, TextButton } from '../../components'
import {
  formatClock,
  formatDateShort,
  formatDuration,
  formatElapsed,
  hasConversation,
  languageName,
  localDayNumber,
  nowSec,
  useNow,
} from '../../lib'
import { callName, displayName } from '../../lib/reason'
import { useMascotAvatar } from '../../katie/avatar'
import { buildDocument, formatOffset, nameFromEvents, outcomeFromLists, type DocIcon, type DocRow, type OutcomeLine } from './document'
import styles from './CallDrawer.module.css'

export interface CallDrawerProps {
  callId: string
}

type HeaderCall = Pick<
  CallRow,
  'call_id' | 'caller' | 'started_at' | 'duration_s' | 'disposition' | 'status' | 'language' | 'greeted_as'
>

const ICONS: Record<DocIcon, FC<SVGAttributes<SVGElement> & { size?: string | number }>> = {
  call: Mobile,
  person: Person,
  calendar: Calendar,
  booked: Check,
  cancel: CloseSmall,
  note: Note,
  text: Comment,
  reply: Reply,
  warning: Warning,
}

function Icon({ name }: { name: DocIcon }) {
  const C = ICONS[name]
  return <C className={styles.icon} size={16} aria-hidden="true" />
}

/** "Tue 9:14 AM" within the last six days, else "Mon, Oct 12 · 4:12 PM". */
function whenLabel(ts: number, tz: string): string {
  const days = localDayNumber(nowSec(), tz) - localDayNumber(ts, tz)
  const date = formatDateShort(ts, tz)
  if (days >= 0 && days < 7) return `${date.split(',')[0]} ${formatClock(ts, tz)}`
  return `${date} · ${formatClock(ts, tz)}`
}

function Header({
  call,
  name,
  listCaller,
  now,
  tz,
  failed,
}: {
  call: HeaderCall | undefined
  name: string | undefined
  /** The number a booking, note or text of this call carries (when no call row is loaded). */
  listCaller: string | undefined
  now: number
  tz: string
  /** The call could not be loaded and no list row knows it: a plain heading, no skeleton. */
  failed: boolean
}) {
  if (!call && failed && listCaller) {
    // An older call outside the loaded range: who it was, from the lists, without a time.
    const who = displayName({ name, caller: listCaller })
    return (
      <header className={styles.header}>
        <div className={styles.line1}>
          <DrawerHeading className={`${styles.caller} ${who.secondary ? '' : 'tabular'}`}>{who.primary}</DrawerHeading>
        </div>
        {who.secondary && <p className={`${styles.line2} tabular`}>{who.secondary}</p>}
      </header>
    )
  }
  if (!call && failed) {
    return (
      <header className={styles.header}>
        <div className={styles.line1}>
          <DrawerHeading className={styles.caller}>Call</DrawerHeading>
        </div>
      </header>
    )
  }
  if (!call) {
    return (
      <header className={styles.header}>
        <div className={styles.line1}>
          <DrawerHeading aria-busy="true">
            <SkeletonBar width={160} height={28} />
            <span className="visually-hidden">Loading call</span>
          </DrawerHeading>
        </div>
        <div className={styles.line2}>
          <SkeletonBar width={240} height={20} />
        </div>
      </header>
    )
  }
  const live = call.status === 'live'
  const who = displayName({ name, caller: call.caller })
  const lang = /^en\b/i.test(call.language) ? '' : languageName(call.language)
  const parts = [
    who.secondary,
    whenLabel(call.started_at, tz),
    live ? formatElapsed(call.started_at, now) : formatDuration(call.duration_s),
    lang,
  ]
  return (
    <header className={styles.header}>
      <div className={styles.line1}>
        <DrawerHeading className={`${styles.caller} ${who.secondary ? '' : 'tabular'}`}>{who.primary}</DrawerHeading>
        <CallChip row={call} />
      </div>
      <p className={`${styles.line2} tabular`}>{parts.filter(Boolean).join(' · ')}</p>
    </header>
  )
}

function Outcome({ lines, onGo }: { lines: OutcomeLine[]; onGo: (target: string) => void }) {
  if (lines.length === 0) return null
  return (
    <section className={styles.outcome} aria-label="Outcome">
      <h3 className={styles.outcomeTitle}>Outcome</h3>
      <ul className={styles.outcomeList}>
        {lines.map((l) => (
          <li key={l.key}>
            {l.target ? (
              <button type="button" className={styles.outcomeLine} onClick={() => onGo(l.target as string)}>
                <Icon name={l.icon} />
                <span className={styles.outcomeText}>{l.text}</span>
              </button>
            ) : (
              <span className={styles.outcomeLine}>
                <Icon name={l.icon} />
                <span className={styles.outcomeText}>{l.text}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function TranscriptSkeleton() {
  return (
    <div className={styles.transcript} role="group" aria-busy="true" aria-label="Loading transcript">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={`${styles.row} ${i % 2 ? styles.katieRow : ''}`} aria-hidden="true">
          <span className={styles.speaker}>
            <SkeletonBar width={40} height={12} />
          </span>
          <span className={styles.at}>
            <SkeletonBar width={24} height={12} />
          </span>
          <span className={styles.text}>
            <SkeletonBar width={i % 2 ? '90%' : '64%'} height={14} />
          </span>
        </div>
      ))}
    </div>
  )
}

function Row({ row }: { row: DocRow }) {
  const id = `doc-${row.key}`
  const avatar = useMascotAvatar()
  if (row.type === 'event') {
    return (
      <div id={id} className={`${styles.row} ${styles.eventRow}`} tabIndex={-1}>
        <span className={styles.speaker}>
          <Icon name={row.icon} />
        </span>
        <span className={`${styles.at} tabular`}>{formatOffset(row.at)}</span>
        <span className={styles.text}>{row.text}</span>
      </div>
    )
  }
  const katie = row.type === 'katie'
  return (
    <div id={id} className={`${styles.row} ${katie ? styles.katieRow : ''}`} tabIndex={-1}>
      <span className={styles.speaker}>
        {katie && (
          <img
            className={styles.avatar}
            src={avatar.a20}
            srcSet={`${avatar.a40} 2x, ${avatar.a60} 3x`}
            width={16}
            height={16}
            alt=""
            decoding="async"
          />
        )}
        {katie ? 'Katie' : 'Caller'}
      </span>
      <span className={`${styles.at} tabular`}>{formatOffset(row.at)}</span>
      <p className={styles.text}>{row.text}</p>
    </div>
  )
}

export default function CallDrawer({ callId }: CallDrawerProps) {
  const tz = usePracticeTz()
  const row = useCallRow(callId)
  const detail = useCall(callId)
  const bookings = useBookings()
  const notes = useNotes()
  const sms = useSms()
  // The list row first (instant header), then the loaded call; a live status from either wins
  // until both agree the call ended.
  const call: HeaderCall | undefined = detail.data?.call ?? row
  const live = call?.status === 'live'
  const now = useNow(1000, live)

  const events = detail.data?.events
  const myBookings = useMemo(() => (bookings.rows ?? []).filter((b) => b.call_id === callId), [bookings.rows, callId])
  const doc = useMemo(
    () =>
      events && call
        ? buildDocument(
            events,
            { started_at: call.started_at, duration_s: call.duration_s, disposition: call.disposition, status: call.status },
            myBookings,
            tz,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, call?.started_at, call?.duration_s, call?.disposition, call?.status, myBookings, tz],
  )
  // No transcript (a 404 on an older call): the outcome comes from the list rows.
  const outcome = useMemo(
    () => doc?.outcome ?? (detail.isError ? outcomeFromLists(callId, bookings.rows, notes.rows, sms.rows, tz) : []),
    [doc, detail.isError, callId, bookings.rows, notes.rows, sms.rows, tz],
  )
  const name =
    (events && nameFromEvents(events)) ??
    callName({ call_id: callId, greeted_as: call?.greeted_as ?? '' }, bookings.rows, notes.rows)
  const listCaller =
    (bookings.rows ?? []).find((b) => b.call_id === callId)?.caller ??
    (notes.rows ?? []).find((n) => n.call_id === callId)?.caller ??
    (sms.rows ?? []).find((t) => t.call_id === callId)?.phone

  // Live calls stay pinned to the bottom unless the reader has scrolled up.
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinned = useRef<boolean>(live)
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }, [])
  const rowCount = doc?.rows.length ?? 0
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [rowCount, outcome.length])
  useLayoutEffect(() => {
    // A different call swapped in: start at its top, or at the bottom when it is live.
    pinned.current = live
    const el = scrollRef.current
    if (el) el.scrollTop = live ? el.scrollHeight : 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId])

  const go = useCallback((target: string) => {
    const el = document.getElementById(`doc-${target}`)
    if (!el) return
    pinned.current = false
    for (const old of document.querySelectorAll('[data-followed]')) old.removeAttribute('data-followed')
    el.setAttribute('data-followed', '')
    el.addEventListener('blur', () => el.removeAttribute('data-followed'), { once: true })
    el.scrollIntoView({ block: 'center' })
    el.focus({ preventScroll: true })
  }, [])

  let body
  if (detail.isPending) {
    body = <TranscriptSkeleton />
  } else if (detail.isError && !detail.data) {
    const notFound = isApiError(detail.error) && detail.error.isNotFound
    body = (
      <div className={styles.transcript}>
        {notFound ? (
          <p className={styles.state}>The transcript for this call isn&apos;t available.</p>
        ) : (
          <p className={styles.state} role="status">
            This call could not be loaded.{' '}
            <TextButton onClick={() => void detail.refetch()}>Retry</TextButton>
          </p>
        )}
      </div>
    )
  } else if (events && !hasConversation(events)) {
    body = (
      <div className={styles.transcript}>
        <p className={styles.state}>No conversation was recorded on this call.</p>
      </div>
    )
  } else {
    body = (
      <div className={styles.transcript}>
        <h3 className="visually-hidden">Transcript</h3>
        {(doc?.rows ?? []).map((r) => (
          <Row key={r.key} row={r} />
        ))}
      </div>
    )
  }

  return (
    <div className={styles.root} data-call-id={callId}>
      <Header call={call} name={name} listCaller={listCaller} now={now} tz={tz} failed={detail.isError && !detail.data} />
      <div
        ref={scrollRef}
        className={styles.scroll}
        onScroll={onScroll}
        tabIndex={0}
        role="region"
        aria-label="Call details"
      >
        <Outcome lines={outcome} onGo={go} />
        {body}
      </div>
    </div>
  )
}
