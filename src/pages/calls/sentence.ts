// Katie's sentence for the Calls table card (DESIGN.md 7.6, "Calls page").
// Pure module (relative .ts imports) so node can check it on the fixtures.

import type { CallsRange } from '../../api/queries.ts'
import type { OutcomeFilter } from '../../lib/chips.ts'
import { capitalizeFirst } from '../../lib/text.ts'
import { countWord, katieLine } from '../../lib/katie.ts'
import { languageName } from '../../lib/time.ts'

const RANGE_WORDS: Record<CallsRange, string> = {
  today: 'today',
  '7d': 'in the last 7 days',
  '30d': 'in the last 30 days',
}

export interface CallsSentenceInput {
  range: CallsRange
  outcome: OutcomeFilter
  /** Totals for the range (stats?days=N); used when no filter is set. */
  totals: { calls: number; booked: number; languages: Record<string, number> } | null
  /** Rows shown after the outcome filter (the count when a filter is set). */
  filteredCount: number
}

/** "Eight calls today, six of them booked." Empty string = Katie stands silently. */
export function callsSentence({ range, outcome, totals, filteredCount }: CallsSentenceInput): string {
  const r = RANGE_WORDS[range]
  const n = filteredCount
  const N = (k: number) => capitalizeFirst(countWord(k))

  switch (outcome) {
    case 'all': {
      if (!totals || totals.calls <= 0) return ''
      const { calls, booked } = totals
      let s: string
      if (calls === 1) s = booked > 0 ? `One call ${r}, and it was booked.` : `One call ${r}, and nothing was booked.`
      else if (booked === 0) s = `${N(calls)} calls ${r}, none of them booked.`
      else if (booked === calls) s = `${N(calls)} calls ${r}, all of them booked.`
      else s = `${N(calls)} calls ${r}, ${countWord(booked)} of them booked.`
      const other = Object.entries(totals.languages)
        .filter(([code, k]) => k > 0 && !/^en\b/i.test(code))
        .sort((a, b) => b[1] - a[1])
      for (const [code, k] of other) {
        const lang = languageName(code)
        s += k === 1 ? ` One was in ${lang}.` : ` ${N(k)} were in ${lang}.`
      }
      return katieLine(s)
    }
    case 'booked':
      if (n <= 0) return ''
      return katieLine(n === 1 ? `One call ended in a booking ${r}.` : `${N(n)} calls ended in a booking ${r}.`)
    case 'no-booking':
      if (n <= 0) return ''
      return katieLine(
        n === 1 ? `One call ended without a booking ${r}.` : `${N(n)} calls ended without a booking ${r}.`,
      )
    case 'live':
      if (n <= 0) return ''
      return katieLine(n === 1 ? 'One call is on the line now.' : `${N(n)} calls are on the line now.`)
    case 'dropped':
      if (n <= 0) return ''
      return katieLine(
        n === 1 ? `One call dropped when the line restarted ${r}.` : `${N(n)} calls dropped when the line restarted ${r}.`,
      )
    default:
      return ''
  }
}
