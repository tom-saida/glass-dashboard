import { useEffect, useState } from 'react'
import { nowSec } from './clock.ts'

/**
 * Re-renders every `intervalMs` and returns nowSec(). Pass `active=false` to stop ticking
 * (e.g. when no call is live), so idle pages do not re-render every second.
 */
export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(nowSec)
  useEffect(() => {
    if (!active) return
    setNow(nowSec())
    const t = window.setInterval(() => setNow(nowSec()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs, active])
  return now
}
