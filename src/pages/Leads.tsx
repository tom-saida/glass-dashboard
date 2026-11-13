// Leads (voice-agent/handoff/LEADS-PAGE-SPEC-2026-11-04.md, docs/DESIGN.md 6.13): everyone who got
// a quote and has not followed through. Four counts on top (tap one to filter), then the list,
// newest stage change first as the box serves it. The default is the open leads; the filter
// lives in the URL (?show=). A row opens the lead in a drawer over this page (/leads/:id), where
// the coordinator's taps are. The list asks again on focus and every 60 s (no live events yet).

import { Fragment, useCallback, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Mobile } from '@vibe/icons'
import { useLeads, usePracticeTz, type LeadRow, type LeadsFilter } from '../api'
import { Card, EmptyState, ErrorLine, SkeletonBar, StatusChip, TextButton, linkRowProps, rowLinkClass, useOpenLead } from '../components'
import { formatWhen, useNow } from '../lib'
import { Col, PageGrid, useDrawerOpenId } from '../shell'
import {
  CHEVRON_COLUMN,
  ChevronCell,
  ColGroup,
  CountTitle,
  HeadRow,
  Identity,
  listStyles as s,
  type ListColumn,
} from './lists/parts'
import {
  DASH,
  LEAD_FILTERS,
  agoLabel,
  examLine,
  leadCounts,
  leadFilterLabel,
  leadName,
  leadPhone,
  leadStageChip,
  leadsFilterSearch,
  leadsSentence,
  leadsTitle,
  nextStep,
  parseLeadsFilter,
  quoteLine,
  touchLabel,
  type NextStep,
} from './leads/model'
import styles from './leads/leads.module.css'

/**
 * Widths include the cell padding (16, and 20 at the table's edges). Lead holds a first name over
 * a revealed "(813) 555-0141" at 12px; Stage the widest chip ("Consult booked") over the exam
 * line; Quote flexes and wraps; Next text is the column reserved for the follow-up ladder (a
 * "Texts stopped" chip today) and carries the "call now" prompt when the box sends one.
 */
const COLUMNS: readonly ListColumn[] = [
  { key: 'lead', label: 'Lead', width: 148 },
  { key: 'stage', label: 'Stage', width: 188 },
  { key: 'quote', label: 'Quote', width: 'flex' },
  { key: 'touch', label: 'Last touch', width: 140 },
  { key: 'next', label: 'Next text', width: 132 },
  CHEVRON_COLUMN,
]

/** A whole-row link that opens the lead's drawer (the same construction as the call rows, P8). */
function useLeadRowOpen() {
  const openLead = useOpenLead()
  return (leadId: string, label: string) => ({
    row: {
      className: `${rowLinkClass} ${s.openRow}`,
      onClick: (e: MouseEvent<HTMLTableRowElement>) => {
        if ((e.target as HTMLElement).closest('a,button,[role="link"]')) return
        openLead(leadId, e.currentTarget.querySelector<HTMLElement>('[data-lead-row]'))
      },
    },
    link: {
      ...linkRowProps((el) => openLead(leadId, el)),
      className: `${s.rowCellLink ?? ''} ${styles.who}`,
      'data-lead-row': leadId,
      'aria-label': label,
    },
  })
}

/**
 * Text whose parts stay whole: the line breaks at a separator, never inside "patient pays $3,900",
 * "no check-in" or "Wed 4:00 PM".
 */
function Pieces({ parts, sep }: { parts: readonly string[]; sep: string }) {
  return (
    <>
      {parts.map((piece, i) => (
        <Fragment key={i}>
          {i > 0 && sep}
          <span className={styles.piece}>{piece}</span>
        </Fragment>
      ))}
    </>
  )
}

/** The Next text cell: the call prompt (when the box asks for one), then the text that is due. */
function NextCell({ step }: { step: NextStep }) {
  const { text, call } = step
  return (
    <>
      {call && (
        <>
          <span className={styles.callNow} data-call-now="">
            <Mobile size={12} aria-hidden="true" />
            Call now
          </span>
          {call.reason && <p className={styles.sub}>{call.reason}</p>}
        </>
      )}
      {text.kind === 'stopped' ? (
        <span className={`${styles.chipLine} ${call ? styles.nextGap : ''}`}>
          <StatusChip tone="neutral">Texts stopped</StatusChip>
        </span>
      ) : text.kind === 'due' ? (
        <div className={call ? styles.nextGap : undefined} data-next-text="">
          <p className={`${styles.line} ${s.tabular}`}>{text.when}</p>
          <p className={styles.sub}>{text.label}</p>
        </div>
      ) : call ? null : (
        <span className={s.secondary}>
          <span aria-hidden="true">{DASH}</span>
          <span className="visually-hidden">No text scheduled</span>
        </span>
      )}
    </>
  )
}

const EMPTY: Partial<Record<LeadsFilter, { title: string; hint: string }>> = {
  open: { title: 'No open leads.', hint: 'Choose All leads to see started, paused and lost ones.' },
  all: { title: 'No leads yet.', hint: 'A lead shows here when a quote goes out.' },
}

export default function Leads() {
  // Inside <Routes location={…}> this is the page's own location, also while a drawer is open.
  const location = useLocation()
  const navigate = useNavigate()
  const drawerId = useDrawerOpenId('lead')
  const filter = parseLeadsFilter(location.search)
  const tz = usePracticeTz()
  // "3 days ago" and "Tomorrow" move with the clock; a minute is fine enough.
  const now = useNow(60_000)
  const list = useLeads(filter)
  const rowOpen = useLeadRowOpen()

  const setFilter = useCallback(
    (next: LeadsFilter) => {
      const search = leadsFilterSearch(location.search, next)
      if (drawerId) {
        // Keep the open drawer; only the page underneath changes.
        navigate(`/leads/${encodeURIComponent(drawerId)}`, {
          replace: true,
          state: { background: { ...location, pathname: '/leads', search } },
        })
      } else {
        navigate({ pathname: '/leads', search }, { replace: true })
      }
    },
    [drawerId, location, navigate],
  )

  const { query, rows, summary } = list
  const loading = !rows && query.isPending
  const failed = !rows && query.isError
  const counts = leadCounts(summary)
  const title = leadsTitle(filter, rows?.length, summary)
  const sentence = leadsSentence(summary)
  const none = (summary?.total ?? rows?.length ?? 0) === 0

  const select = (
    <span className={styles.filter}>
      <select className={styles.select} aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as LeadsFilter)}>
        {LEAD_FILTERS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  )

  const renderRow = (lead: LeadRow) => {
    const chip = leadStageChip(lead.stage)
    const exam = examLine(lead, now, tz)
    const quote = quoteLine(lead.quote)
    const step = nextStep(lead, now, tz)
    const name = leadName(lead)
    const open = rowOpen(lead.lead_id, `Lead ${name}, ${chip.label}`)
    const current = drawerId === lead.lead_id
    return (
      <tr key={lead.lead_id} {...open.row} className={`${open.row.className} ${current ? styles.current : ''}`}>
        <td>
          <span {...open.link}>
            <Identity primary={name} secondary={leadPhone(lead.phone)} />
          </span>
        </td>
        <td className={styles.cell}>
          <span className={styles.chipLine}>
            <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
          </span>
          {exam.text && (
            <p className={`${styles.sub} ${s.tabular} ${exam.warn ? styles.warn : ''}`}>
              <Pieces parts={exam.text.split(' · ')} sep=" · " />
            </p>
          )}
        </td>
        <td className={styles.cell}>
          {quote.plan ? (
            <>
              <p className={styles.line}>{quote.plan}</p>
              {quote.figures.length > 0 && (
                <p className={`${styles.sub} ${s.tabular}`}>
                  <Pieces parts={[...quote.figures, ...(quote.more > 0 ? [`+${quote.more} more`] : [])]} sep=" · " />
                </p>
              )}
            </>
          ) : (
            <span className={s.secondary}>{DASH}</span>
          )}
        </td>
        <td className={styles.cell}>
          {lead.last_touch_at != null ? (
            <>
              <p className={`${styles.line} ${s.tabular}`} title={formatWhen(lead.last_touch_at, tz, now)}>
                {agoLabel(lead.last_touch_at, now, tz)}
              </p>
              <p className={styles.sub}>
                <Pieces parts={touchLabel(lead.last_touch).split(', ')} sep=", " />
              </p>
            </>
          ) : (
            <span className={s.secondary}>{DASH}</span>
          )}
        </td>
        <td className={styles.cell}>
          <NextCell step={step} />
        </td>
        <ChevronCell />
      </tr>
    )
  }

  let below = null
  if (failed) {
    below = <ErrorLine className={s.ruled} onRetry={() => void query.refetch()} />
  } else if (rows && rows.length === 0) {
    const label = leadFilterLabel(filter)
    const copy = none ? EMPTY.all : EMPTY[filter]
    below = (
      <div className={s.emptyWrap}>
        {copy ? (
          <EmptyState title={copy.title} hint={copy.hint} rows={3} />
        ) : (
          <EmptyState filtered={label} title={`No leads match ${label}.`} hint="Choose Open leads to see everyone still in play." rows={3} />
        )}
      </div>
    )
  } else if (rows && list.canShowMore) {
    below = (
      <div className={s.footer}>
        <TextButton onClick={list.showMore} disabled={query.isFetching && query.isPlaceholderData}>
          Show more
        </TextButton>
      </div>
    )
  }

  return (
    <PageGrid>
      {counts.map((c) => {
        const active = filter === c.filter
        return (
          <Col key={c.key} span={3} stretch>
            <Card className={styles.countCard}>
              <button
                type="button"
                className={styles.countButton}
                aria-pressed={active}
                onClick={() => setFilter(active ? 'open' : c.filter)}
                data-lead-count={c.key}
              >
                <span className={styles.countLabel}>
                  <span className={`${styles.dot} ${styles[`dot_${c.key}`] ?? ''}`} aria-hidden="true" />
                  <span className={styles.countLabelText}>{c.label}</span>
                </span>
                <span className={`${styles.countNumber} tabular ${c.accent && (c.value ?? 0) > 0 ? styles.countAccent : ''}`}>
                  {c.value != null ? c.value : summary !== undefined || query.isError ? '–' : <SkeletonBar width={40} height={24} />}
                </span>
                <span className={styles.countHint}>{c.hint}</span>
              </button>
            </Card>
          </Col>
        )
      })}
      <Col span={12}>
        <Card title={<CountTitle>{title || ' '}</CountTitle>} headerRight={select} katie={sentence} katieMoment={['summary']}>
          <table className={[s.table, s.wrapTable, styles.table].join(' ')} aria-busy={loading || undefined}>
            <caption className="visually-hidden">Leads, newest stage change first</caption>
            <ColGroup columns={COLUMNS} />
            <HeadRow columns={COLUMNS} />
            {loading && <LeadsSkeleton />}
            {rows && rows.length > 0 && <tbody>{rows.map(renderRow)}</tbody>}
          </table>
          {below}
        </Card>
      </Col>
    </PageGrid>
  )
}

/** Six rows at a loaded row's usual size: two lines in every column but the last. */
function LeadsSkeleton() {
  const two = (a: number | string, b: number | string) => (
    <>
      <span className={styles.skLine}>
        <SkeletonBar width={a} height={14} />
      </span>
      <span className={styles.skLineSmall}>
        <SkeletonBar width={b} height={10} />
      </span>
    </>
  )
  return (
    <tbody aria-busy="true">
      {Array.from({ length: 6 }, (_, r) => (
        <tr key={r} aria-hidden="true">
          <td>{two('52%', '84%')}</td>
          <td>
            <span className={styles.skLine}>
              <SkeletonBar width={96} height={20} />
            </span>
            <span className={styles.skLineSmall}>
              <SkeletonBar width="72%" height={10} />
            </span>
          </td>
          <td>{two('64%', '88%')}</td>
          <td>{two('60%', '80%')}</td>
          <td>
            <span className={styles.skLine}>
              <SkeletonBar width={24} height={14} />
            </span>
          </td>
          <td />
        </tr>
      ))}
    </tbody>
  )
}
