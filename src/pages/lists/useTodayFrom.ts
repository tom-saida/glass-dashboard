import { useStats } from '../../api'
import { getPracticeTz, nowSec, zonedMidnight } from '../../lib'

/**
 * Local midnight today in the practice tz: stats(1).range.from, or computed locally once stats
 * has failed. undefined while stats is still loading (sentences stay silent until then).
 */
export function useTodayFrom(): number | undefined {
  const s = useStats(1)
  if (s.data) return s.data.range.from
  if (s.isError) return zonedMidnight(nowSec(), getPracticeTz(), 0)
  return undefined
}
