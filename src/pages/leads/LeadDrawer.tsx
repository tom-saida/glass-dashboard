// Lead drawer content (voice-agent/handoff/LEADS-PAGE-SPEC-2026-11-04.md, docs/DESIGN.md 6.13).
// The frame (fixed right, Esc, close button, focus) is the shell's <Drawer>. This renders:
//   header    first name (20/600) and the stage chip; then the number and a language other than
//             English in secondary text
//   Call now  RESERVED: the prompt the next backend piece sends for a missed-consult lead
//   Follow-up the exam, whether texts may go out (and why), the next text (reserved)
//   Update    the taps the stage offers; each posts once and the answered lead replaces the row.
//             Booked asks for the exam's day and time; Lost asks once to confirm; a move the box
//             refuses (409) shows its sentence here. Then the coordinator's one-line note.
//   Quote     one row per option: fee, insurance, patient pays, monthly (down payment under it)
//   History   the lead's events as sentences, oldest first, newest last
// Never shown: the token, the practice slug, the raw consent basis.
import { useEffect, useId, useRef, useState, type FC, type FormEvent, type KeyboardEvent, type SVGAttributes } from 'react'
import { Calendar, Check, CloseSmall, Comment, Mobile, Note, Pause, Person, Reply, Send, Warning } from '@vibe/icons'
import { isApiError, useLead, useLeadAction, useLeadRow, usePracticeTz, type ApiError, type LeadActionBody, type LeadQuote, type LeadRow } from '../../api'
import { DrawerHeading, SkeletonBar, StatusChip, TextButton } from '../../components'
import { capitalizeFirst, formatDateShort, languageName, useNow } from '../../lib'
import {
  DASH,
  applianceName,
  categoryName,
  consentLabel,
  examDetail,
  historyLines,
  historyWhen,
  insuranceText,
  leadName,
  leadPhone,
  leadStageChip,
  leadTaps,
  localDateInput,
  money,
  nextStep,
  refusalSentence,
  slotInPast,
  slotValue,
  type HistoryIcon,
  type LeadTap,
} from './model'
import styles from './LeadDrawer.module.css'

const ICONS: Record<HistoryIcon, FC<SVGAttributes<SVGElement> & { size?: string | number }>> = {
  quote: Send,
  calendar: Calendar,
  check: Check,
  missed: CloseSmall,
  text: Comment,
  reply: Reply,
  note: Note,
  person: Person,
  pause: Pause,
  warning: Warning,
}

const NOTE_MAX = 500

/** What a failed tap says. A refused move (409) is the box's own sentence. */
function problemText(e: ApiError): string {
  if (e.status === 409) return refusalSentence(e.detail) || 'That move is not possible for this lead.'
  if (e.isNotFound) return 'This lead is not on the list any more.'
  if (e.isUnauthorized || e.isForbidden) return 'You are signed out, so that did not save.'
  return 'That did not save. Try again.'
}

function Header({ lead, failed }: { lead: LeadRow | undefined; failed: boolean }) {
  if (!lead && failed) {
    return (
      <header className={styles.header}>
        <div className={styles.line1}>
          <DrawerHeading className={styles.name}>Lead</DrawerHeading>
        </div>
      </header>
    )
  }
  if (!lead) {
    return (
      <header className={styles.header}>
        <div className={styles.line1}>
          <DrawerHeading aria-busy="true">
            <SkeletonBar width={120} height={28} />
            <span className="visually-hidden">Loading lead</span>
          </DrawerHeading>
        </div>
        <div className={styles.line2}>
          <SkeletonBar width={200} height={20} />
        </div>
      </header>
    )
  }
  const chip = leadStageChip(lead.stage)
  const lang = /^en\b/i.test(lead.language || 'en') ? '' : languageName(lead.language)
  return (
    <header className={styles.header}>
      <div className={styles.line1}>
        <DrawerHeading className={styles.name}>{leadName(lead)}</DrawerHeading>
        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
      </div>
      <p className={`${styles.line2} tabular`}>{[leadPhone(lead.phone), lang].filter(Boolean).join(' · ')}</p>
    </header>
  )
}

/** Exam, texting and the next text: three short facts. */
function FollowUp({ lead, now, tz }: { lead: LeadRow; now: number; tz: string }) {
  const step = nextStep(lead, now, tz)
  const consent = consentLabel(lead.consent_basis)
  const exam = examDetail(lead, now, tz)
  const texts = lead.texts_stopped
    ? `Stopped${lead.sms_stopped_at ? ` ${formatDateShort(lead.sms_stopped_at, tz)}` : ''}: they texted STOP`
    : consent
      ? `Allowed: ${consent}`
      : 'Allowed'
  return (
    <section className={styles.block} aria-label="Follow-up">
      <h3 className={styles.blockTitle}>Follow-up</h3>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Exam</dt>
          <dd className="tabular">{exam || DASH}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Texts</dt>
          <dd className="tabular">{texts}</dd>
        </div>
        <div className={styles.fact} data-next-text="">
          <dt>Next text</dt>
          <dd className="tabular">
            {step.text.kind === 'due' ? `${step.text.when} · ${step.text.label}` : step.text.kind === 'stopped' ? 'None: texts are stopped' : 'None scheduled'}
          </dd>
        </div>
      </dl>
    </section>
  )
}

type Asking = 'slot' | 'lost' | null

/** What the hidden status line says after a tap saved (a screen reader hears it; the chip shows it). */
const SAVED: Record<string, string> = {
  happened: 'Marked came in.',
  started: 'Marked started.',
  lost: 'Marked lost.',
  paused: 'Follow-up paused.',
  reopen: 'Lead reopened.',
  booked: 'Booking saved.',
  missed: 'Marked no-show.',
  note: 'Note saved.',
}

/**
 * The taps of the lead's stage, the two questions (Booked, Lost) and the note. Mounted per lead
 * (the parent keys it by lead id), so a pending tap, its error or a half-typed form never
 * follows the drawer to another lead.
 */
function Update({ lead, now, tz }: { lead: LeadRow; now: number; tz: string }) {
  const act = useLeadAction(lead.lead_id)
  const [asking, setAsking] = useState<Asking>(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [reason, setReason] = useState('')
  // null = not edited: the field shows the lead's note.
  const [draft, setDraft] = useState<string | null>(null)
  const [saved, setSaved] = useState('')
  const ids = useId()
  const taps = leadTaps(lead.stage)
  const busy = act.isPending
  const note = draft ?? lead.note ?? ''
  const noteChanged = draft !== null && draft.trim() !== (lead.note ?? '').trim()
  const root = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // Where focus goes once a tap has settled: a disabled button, or one that is gone, cannot keep it.
  const focusNext = useRef<'heading' | 'note' | null>(null)

  // This lead moved to another stage (a tap, or a poll): the open question no longer applies.
  useEffect(() => {
    setAsking(null)
    setReason('')
  }, [lead.stage])

  useEffect(() => {
    if (busy || !focusNext.current) return
    const want = focusNext.current
    focusNext.current = null
    const el = want === 'note' ? root.current?.querySelector<HTMLElement>('[data-lead-note]') : heading.current
    el?.focus({ preventScroll: true })
  })

  const focusTap = (action: string) => {
    root.current?.querySelector<HTMLElement>(`[data-lead-tap="${action}"]`)?.focus({ preventScroll: true })
  }

  const send = (body: LeadActionBody, after?: () => void) => {
    if (busy) return
    setSaved('')
    focusNext.current = body.action === 'note' ? 'note' : 'heading'
    act.mutate(body, {
      onSuccess: () => {
        setSaved(SAVED[body.action] ?? 'Saved.')
        after?.()
      },
    })
  }

  const onTap = (tap: LeadTap) => {
    act.reset()
    setSaved('')
    if (tap.asks === 'slot') setAsking(asking === 'slot' ? null : 'slot')
    else if (tap.asks === 'confirm') setAsking(asking === 'lost' ? null : 'lost')
    else {
      setAsking(null)
      send({ action: tap.action })
    }
  }

  const slot = slotValue(date, time)
  const slotPast = slotInPast(date, time, now, tz)
  const submitSlot = (e: FormEvent) => {
    e.preventDefault()
    if (!slot || slotPast) return
    send({ action: 'booked', slot_label: slot }, () => {
      setAsking(null)
      setDate('')
      setTime('')
    })
  }
  const submitLost = (e: FormEvent) => {
    e.preventDefault()
    const why = reason.trim()
    send(why ? { action: 'lost', note: why } : { action: 'lost' }, () => setAsking(null))
  }
  const submitNote = (e: FormEvent) => {
    e.preventDefault()
    if (!noteChanged) return
    send({ action: 'note', note: note.trim() }, () => setDraft(null))
  }
  // Closing a question by hand (Cancel, Esc) drops what was typed and puts focus back on the tap
  // that opened it.
  const closeAsk = () => {
    const opener = asking === 'slot' ? 'booked' : asking === 'lost' ? 'lost' : null
    setAsking(null)
    setDate('')
    setTime('')
    setReason('')
    if (opener) focusTap(opener)
  }
  // Esc closes the open question, not the drawer (the drawer skips a prevented Esc).
  const escCloses = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeAsk()
    }
  }

  return (
    <section ref={root} className={styles.block} aria-label="Update" aria-busy={busy || undefined}>
      <h3 ref={heading} className={styles.blockTitle} tabIndex={-1}>
        Update
      </h3>
      {taps.length > 0 ? (
        <div className={styles.taps} role="group" aria-label="Move this lead">
          {taps.map((tap) => (
            <button
              key={tap.action}
              type="button"
              className={[styles.tap, tap.primary ? styles.tapPrimary : '', tap.action === 'lost' ? styles.tapDanger : ''].join(' ')}
              onClick={() => onTap(tap)}
              disabled={busy}
              aria-expanded={tap.asks ? asking === (tap.asks === 'slot' ? 'slot' : 'lost') : undefined}
              data-lead-tap={tap.action}
            >
              {tap.label}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.quiet}>{lead.stage === 'started' ? 'Started treatment. Nothing more to do here.' : 'No moves for this stage.'}</p>
      )}

      {asking === 'slot' && (
        <form className={styles.ask} onSubmit={submitSlot} onKeyDown={escCloses} data-lead-ask="slot">
          <p className={styles.askTitle}>When is the exam?</p>
          <div className={styles.askRow}>
            <label className={styles.field} htmlFor={`${ids}-date`}>
              <span className={styles.fieldLabel}>Day</span>
              <input
                id={`${ids}-date`}
                className={styles.input}
                type="date"
                value={date}
                min={localDateInput(now, tz)}
                onChange={(e) => setDate(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label className={styles.field} htmlFor={`${ids}-time`}>
              <span className={styles.fieldLabel}>Time</span>
              <input
                id={`${ids}-time`}
                className={styles.input}
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </label>
          </div>
          {slotPast && (
            <p className={styles.askHint} role="alert" data-lead-slot-past="">
              That time has already passed.
            </p>
          )}
          <div className={styles.askButtons}>
            <button type="submit" className={`${styles.tap} ${styles.tapPrimary}`} disabled={busy || !slot || slotPast}>
              Save booking
            </button>
            <button type="button" className={styles.tap} onClick={closeAsk} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {asking === 'lost' && (
        <form className={styles.ask} onSubmit={submitLost} onKeyDown={escCloses} data-lead-ask="lost">
          <p className={styles.askTitle}>Mark {leadName(lead)} as lost?</p>
          <p className={styles.askHint}>Follow-up stops. You can reopen the lead later.</p>
          <label className={styles.field} htmlFor={`${ids}-why`}>
            <span className={styles.fieldLabel}>Why (optional, saved as the note)</span>
            <input
              id={`${ids}-why`}
              className={styles.input}
              type="text"
              value={reason}
              maxLength={NOTE_MAX}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </label>
          <div className={styles.askButtons}>
            <button type="submit" className={`${styles.tap} ${styles.tapDangerFill}`} disabled={busy}>
              Mark lost
            </button>
            <button type="button" className={styles.tap} onClick={closeAsk} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {act.isError && (
        <p className={styles.problem} role="alert" data-lead-problem="">
          {problemText(act.error)}
        </p>
      )}
      <p className="visually-hidden" role="status" data-lead-saved="">
        {saved}
      </p>

      <form className={styles.noteForm} onSubmit={submitNote}>
        <label className={styles.field} htmlFor={`${ids}-note`}>
          <span className={styles.fieldLabel}>Note</span>
          <input
            id={`${ids}-note`}
            className={styles.input}
            type="text"
            value={note}
            maxLength={NOTE_MAX}
            placeholder="One line for the desk"
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            data-lead-note=""
          />
        </label>
        <button type="submit" className={styles.tap} disabled={busy || !noteChanged}>
          Save note
        </button>
      </form>
    </section>
  )
}

/** The rest of the practice's sentence after its own name ("Comprehensive treatment: full ..."). */
function categorySentence(quote: LeadQuote): string {
  const label = (quote.category_label ?? '').trim()
  const i = label.indexOf(':')
  const rest = i >= 0 ? label.slice(i + 1).trim() : label
  return rest && rest.toLowerCase() !== categoryName(quote).toLowerCase() ? capitalizeFirst(rest) : ''
}

function Quote({ quote }: { quote: LeadQuote | null }) {
  if (!quote || quote.options.length === 0) {
    return (
      <section className={styles.block} aria-label="Quote">
        <h3 className={styles.blockTitle}>Quote</h3>
        <p className={styles.quiet}>The quote is not on file.</p>
      </section>
    )
  }
  const sentence = categorySentence(quote)
  const fee = quote.consult_fee
  return (
    <section className={styles.block} aria-label="Quote">
      <h3 className={styles.blockTitle}>Quote</h3>
      <p className={styles.plan}>{categoryName(quote) || 'Treatment'}</p>
      {sentence && <p className={styles.planHint}>{sentence}</p>}
      <table className={styles.quote}>
        <thead>
          <tr>
            <th scope="col">Option</th>
            <th scope="col" className={styles.num}>
              Fee
            </th>
            <th scope="col" className={styles.num}>
              Insurance
            </th>
            <th scope="col" className={styles.num}>
              Patient pays
            </th>
            <th scope="col" className={styles.num}>
              Monthly
            </th>
          </tr>
        </thead>
        <tbody>
          {quote.options.map((o, i) => {
            const ins = insuranceText(o)
            return (
              <tr key={`${o.appliance}-${i}`}>
                <th scope="row">{applianceName(o)}</th>
                <td className={styles.num}>{money(o.total)}</td>
                <td className={styles.num}>
                  {capitalizeFirst(ins)}
                  {o.insurance_status === 'estimated' && <span className={styles.cellSub}>estimated</span>}
                </td>
                <td className={styles.num}>{money(o.patient)}</td>
                <td className={styles.num}>
                  {money(o.monthly)}
                  {o.down != null && <span className={styles.cellSub}>{money(o.down)} down</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {fee != null && <p className={styles.planHint}>{fee > 0 ? `Exam fee ${money(fee)}.` : 'The exam is free.'}</p>}
    </section>
  )
}

export default function LeadDrawer({ leadId }: { leadId: string }) {
  const tz = usePracticeTz()
  const row = useLeadRow(leadId)
  const detail = useLead(leadId)
  const now = useNow(60_000)
  const lead = detail.data?.lead ?? row
  const events = detail.data?.events
  const failed = detail.isError && !detail.data
  const step = lead ? nextStep(lead, now, tz) : null

  let history
  if (events) {
    const lines = historyLines(events, tz)
    history =
      lines.length > 0 ? (
        <ol className={styles.history}>
          {lines.map((l) => {
            const Icon = ICONS[l.icon]
            return (
              <li key={l.key} className={styles.event}>
                <span className={`${styles.when} tabular`}>{historyWhen(l.ts, now, tz)}</span>
                <Icon className={styles.icon} size={16} aria-hidden="true" />
                <span className={styles.what}>
                  {l.text}
                  {l.quote && <span className={styles.said}>“{l.quote}”</span>}
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className={styles.quiet}>Nothing recorded yet.</p>
      )
  } else if (failed) {
    const notFound = isApiError(detail.error) && detail.error.isNotFound
    history = notFound ? (
      <p className={styles.quiet}>This lead is not on the list any more.</p>
    ) : (
      <p className={styles.quiet} role="status">
        The history could not be loaded. <TextButton onClick={() => void detail.refetch()}>Retry</TextButton>
      </p>
    )
  } else {
    history = (
      <div className={styles.history} role="group" aria-busy="true" aria-label="Loading history">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={styles.event} aria-hidden="true">
            <span className={styles.when}>
              <SkeletonBar width={72} height={12} />
            </span>
            <span />
            <span className={styles.what}>
              <SkeletonBar width={i % 2 ? '70%' : '52%'} height={14} />
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.root} data-lead-id={leadId}>
      <Header lead={lead} failed={failed} />
      <div className={styles.scroll} tabIndex={0} role="region" aria-label="Lead details">
        {lead && step?.call && (
          <section className={styles.callBlock} aria-label="Call now" data-call-now="">
            <Mobile className={styles.callIcon} size={20} aria-hidden="true" />
            <div>
              <p className={styles.callTitle}>Call {leadName(lead)} now</p>
              <p className={`${styles.callText} tabular`}>{[leadPhone(lead.phone), step.call.reason].filter(Boolean).join(' · ')}</p>
            </div>
          </section>
        )}
        {lead && <FollowUp lead={lead} now={now} tz={tz} />}
        {lead && <Update key={lead.lead_id} lead={lead} now={now} tz={tz} />}
        {lead && <Quote quote={lead.quote} />}
        <section className={styles.block} aria-label="History">
          <h3 className={styles.blockTitle}>History</h3>
          {history}
        </section>
      </div>
    </div>
  )
}
