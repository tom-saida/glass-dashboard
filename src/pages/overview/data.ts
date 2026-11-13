// Small shared selectors for the Overview widgets.

import { useStats } from '../../api'
import { getPracticeTz, nowSec, zonedMidnight } from '../../lib'

/** Local midnight that starts "today": stats(1).range.from, computed locally until it loads. */
export function useTodayFrom(): number {
  const from = useStats(1).data?.range.from
  return from ?? zonedMidnight(nowSec(), getPracticeTz(), 0)
}
