import { useLocation } from 'react-router'
import type { CallsRange } from '../api/queries'

export const RANGE_OPTIONS: { value: CallsRange; text: string }[] = [
  { value: 'today', text: 'Today' },
  { value: '7d', text: '7 days' },
  { value: '30d', text: '30 days' },
]

/** `?range=7d` -> "7d"; missing or unknown -> "today". Not PHI, so it lives in the URL. */
export function parseRange(search: string): CallsRange {
  const v = new URLSearchParams(search).get('range')
  return v === '7d' || v === '30d' ? v : 'today'
}

/** The Calls page's range, set by the top bar's ButtonGroup. Use inside a page. */
export function useCallsRange(): CallsRange {
  return parseRange(useLocation().search)
}
