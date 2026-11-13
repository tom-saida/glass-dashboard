// Helpers for the sentences pages put in `data-katie` (DESIGN.md 7.6). The templates
// themselves live in src/pages/overview/say.ts, src/pages/lists/sentences.ts and
// src/pages/calls/sentence.ts; these keep them consistent. Pure module: node runs it, and every
// template on the fixtures, in scripts/check-lib.mjs.

import { capitalizeFirst, truncateAtWord } from './text.ts'

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** 0 -> "no", 1..10 -> words, 11+ -> digits. */
export function countWord(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n) && n >= 0 && n <= 10) return WORDS[n] as string
  return String(n)
}

/** count(3, 'call') -> "three calls"; count(1, 'call') -> "one call"; count(0, 'note') -> "no notes". */
export function count(n: number, singular: string, plural: string = singular + 's'): string {
  return `${countWord(n)} ${n === 1 ? singular : plural}`
}

/** Pick the singular or plural noun without the number. */
export function plural(n: number, singular: string, pluralForm: string = singular + 's'): string {
  return n === 1 ? singular : pluralForm
}

/**
 * The cap on a sentence. The brief allows up to 160, but the bubble must stay at one or two
 * lines with fewer than 80 characters per line (DESIGN 7.5): two balanced lines of about 70
 * leave room for the word-wrap loss, 160 would need 80 or more on a line.
 */
export const KATIE_MAX_CHARS = 140

/** No-break space: keeps "(656) ***-0150" and "5:35 PM" on one line of the bubble. */
const NBSP = '\u00a0'

/**
 * Final pass for any sentence: trims, capitalises, replaces "!" with ".", ties a phone number's
 * area code to the rest and a clock time to its AM / PM with a no-break space, and cuts at a
 * word boundary to KATIE_MAX_CHARS characters (never inside those pairs).
 * null/undefined/blank -> "" (she stands silently).
 */
export function katieLine(s: string | null | undefined): string {
  if (!s) return ''
  // the collapse also turns U+00A0 into a space, so the no-break spaces go in after it
  const t = s
    .replace(/!/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\(\d{3}\)) (?=[\d*])/g, `$1${NBSP}`)
    .replace(/(\d) (AM|PM)\b/g, `$1${NBSP}$2`)
  if (!t) return ''
  return truncateAtWord(capitalizeFirst(t), KATIE_MAX_CHARS)
}

/**
 * Props that make any element a Katie target (used for the KPI cells, which are targets
 * inside one card). Focusable, because keyboard focus counts as hover.
 */
export function katieTargetProps(sentence: string | null | undefined): {
  'data-katie': string
  tabIndex: 0
} {
  return { 'data-katie': katieLine(sentence), tabIndex: 0 }
}
