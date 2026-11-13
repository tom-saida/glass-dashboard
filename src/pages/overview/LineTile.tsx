import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  getAuthState,
  subscribeAuthState,
  useBookings,
  useCall,
  useLatestCalls,
  useNotes,
  useStatus,
  type CallEvent,
} from '../../api'
import { Card, SkeletonBar, linkRowProps, useOpenCall } from '../../components'
import { formatClock, formatElapsed, formatWhen, joinBotTexts, useNow } from '../../lib'
import { bookingLabel, callName, type BookingLike } from '../../lib/reason'
import { useDashEvent } from '../../live'
import { useTodayFrom } from './data'
import { sayLine } from './say'
import styles from './overview.module.css'

/** How long the outcome of a call that just ended stays on the tile (P12). */
const HOLD_MS = 30_000

interface Said {
  who: 'Caller' | 'Katie'
  text: string
}

/** The last thing said on the call: the caller's last turn or Katie's last reply (all its sentences). */
function lastSaid(events: CallEvent[] | undefined): Said | null {
  if (!events?.length) return null
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as CallEvent
    if (e.kind === 'turn.caller' && e.data.text.trim()) return { who: 'Caller', text: e.data.text.trim() }
    if (e.kind === 'turn.bot') {
      const texts = events.filter((x) => x.kind === 'turn.bot' && x.turn === e.turn).map((x) => (x.kind === 'turn.bot' ? x.data.text : ''))
      const text = joinBotTexts(texts)
      if (text) return { who: 'Katie', text }
    }
  }
  return null
}

/**
 * On a call, the booking line stands from the booking event until the caller speaks again (Katie's
 * read-back keeps it up); after that the turns take the line back. At hang-up it returns for 30 s.
 */
function bookingIsCurrent(events: CallEvent[] | undefined): boolean {
  if (!events) return false
  const b = events.findIndex((e) => e.kind === 'booking')
  if (b < 0) return false
  return !events.slice(b + 1).some((e) => e.kind === 'turn.caller')
}

/** The booking this call made, from the bookings list (has new_patient) or its booking event. */
function callBooking(
  callId: string,
  bookings: BookingLike[] | undefined,
  events: CallEvent[] | undefined,
): { label: string; slot: string } | null {
  const fromList = bookings?.find((b) => b.call_id === callId)
  if (fromList?.slot) return { label: bookingLabel(fromList), slot: fromList.slot }
  const ev = events?.find((e) => e.kind === 'booking')
  if (ev && ev.kind === 'booking') return { label: bookingLabel({ reason: ev.data.reason }), slot: ev.data.slot }
  return null
}

const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)

/**
 * 6.1 Line tile as the live stage (P12). Idle: "Open · last call 8:55 PM". On a call: a steady
 * orange dot, the caller's name (or masked number) and a ticking timer, and under it the last
 * thing said, updated every turn; once a booking lands that line reads "Booked … · slot". After
 * the call ends the outcome stays for 30 s, then the tile goes idle. No pulse; Katie's listening spot.
 */
export function LineTile() {
  const status = useStatus()
  const latest = useLatestCalls(10)
  const bookings = useBookings()
  const notes = useNotes()
  const todayFrom = useTodayFrom()
  const openCall = useOpenCall()
  // DATA-6: a 401 is never retried, so the sub-line must not promise it.
  const auth = useSyncExternalStore(subscribeAuthState, getAuthState, getAuthState)

  const data = status.data
  const onCall = !status.isError && data?.line === 'on-call'
  const liveRow = onCall ? latest.data?.find((r) => r.status === 'live') : undefined

  // The call that just ended, held for HOLD_MS (real time, not the mock clock).
  const [ended, setEnded] = useState<{ callId: string; at: number } | null>(null)
  useDashEvent('call.ended', (e) => setEnded({ callId: e.call_id, at: Date.now() }))
  useEffect(() => {
    if (!ended) return
    const t = window.setTimeout(() => setEnded(null), Math.max(0, ended.at + HOLD_MS - Date.now()))
    return () => window.clearTimeout(t)
  }, [ended])

  // Every stream event invalidates its call's detail, so this follows the call turn by turn.
  const stageId = liveRow?.call_id ?? (!onCall ? ended?.callId : undefined)
  const detail = useCall(stageId)
  const events = detail.data?.call.call_id === stageId ? detail.data?.events : undefined
  const now = useNow(1000, !!liveRow)

  const liveName = liveRow ? callName(liveRow, bookings.rows, notes.rows) : undefined
  const sentence = sayLine({ status: data, statusError: status.isError, liveRow, todayFrom, liveName })

  let body
  let tone: 'live' | 'idle' | 'none' = 'none'
  if (status.isError) {
    body = (
      <>
        <p className={styles.lineStatus}>Can't reach the line right now</p>
        <p className={`${styles.lineSub} tabular`}>{auth === 'signed-out' ? ' ' : 'Trying again'}</p>
      </>
    )
  } else if (!data) {
    body = (
      <>
        <div className={styles.lineStatus}>
          <SkeletonBar width={160} height={24} />
        </div>
        <div className={`${styles.lineSaid} ${styles.lineSkel}`}>
          <SkeletonBar width={200} height={14} />
        </div>
      </>
    )
  } else if (onCall) {
    tone = 'live'
    const booked = liveRow && bookingIsCurrent(events) ? callBooking(liveRow.call_id, bookings.rows, events) : null
    const said = lastSaid(events)
    body = (
      <>
        <p className={styles.lineStatus}>
          <span className={`${styles.dot} ${styles.dotLive}`} aria-hidden="true" />
          <span className={styles.lineWho}>On a call{liveRow ? ` · ${liveName ?? liveRow.caller}` : ''}</span>
          {liveRow && <span className={`${styles.lineTimer} tabular`}>{formatElapsed(liveRow.started_at, now)}</span>}
        </p>
        {/* One line, replaced per turn (no animation: the text changing is the motion). */}
        <p className={`${styles.lineSaid} ${booked ? styles.lineSaidWrap : ''}`} data-line-said="">
          {booked ? (
            <span className={styles.lineOutcome}>
              Booked {lower(booked.label)} · <span className={`${styles.nowrap} tabular`}>{booked.slot}</span>
            </span>
          ) : said ? (
            <>
              <span className={styles.lineSpeaker}>{said.who}:</span> {said.text}
            </>
          ) : (
            <span className={styles.lineSpeaker}>Answering…</span>
          )}
        </p>
      </>
    )
  } else {
    tone = 'idle'
    const last = data.last_call_at
    const lastText =
      last == null ? 'Open · no calls yet' : `Open · last call ${last >= todayFrom ? formatClock(last) : formatWhen(last)}`
    const heldRow = ended ? latest.data?.find((r) => r.call_id === ended.callId) : undefined
    const held = ended ? callBooking(ended.callId, bookings.rows, events) : null
    let outcome: ReactNode = null
    if (ended && held)
      outcome = (
        <>
          Booked {lower(held.label)} · <span className={`${styles.nowrap} tabular`}>{held.slot}</span>
        </>
      )
    else if (ended && heldRow && heldRow.notes > 0) outcome = 'Call ended · callback note left'
    else if (ended && heldRow) outcome = 'Call ended · no booking'
    body = (
      <>
        <p className={styles.lineStatus}>
          <span className={`${styles.dot} ${styles.dotIdle}`} aria-hidden="true" />
          <span className={`${styles.lineWho} tabular`}>{lastText}</span>
        </p>
        <p className={`${styles.lineSaid} ${outcome ? `${styles.lineHeld} ${styles.lineSaidWrap}` : ''}`} data-line-said="">
          {outcome ? <span className={styles.lineOutcome}>{outcome}</span> : ' '}
        </p>
      </>
    )
  }

  // a11y-10 / a11y-09: the Card <section> stays a plain section (Katie's target, data-katie and
  // data-line-tile stay on it). On a call, the link is the div inside it that fills the card,
  // named by its own visible text. The section itself is never a tab stop (hover and focus no
  // longer summon Katie).
  const linkId = liveRow?.call_id ?? (ended && !onCall ? ended.callId : undefined)
  const link = linkId ? linkRowProps((el) => openCall(linkId, el), styles.lineInner) : null

  return (
    <Card katie={sentence} className={styles.lineCard} data-line-tile="" data-line-state={tone}>
      <div {...(link ?? { className: styles.lineInner })}>
        <p className={styles.label}>Line</p>
        <div className={styles.lineBody}>{body}</div>
      </div>
    </Card>
  )
}
