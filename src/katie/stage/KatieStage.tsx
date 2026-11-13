/**
 * Katie on the dashboard, mounted once by the shell above the cards and below the drawer.
 * Self-contained default export so the shell can load it with React.lazy (Katie, GSAP and this
 * module become their own chunk).
 *
 * Occasional Katie (docs/research/MONDAY-LLAMA-2026-10-13.md, Part 3): she is off screen by
 * default and steps in only for a few moments (moments.ts), run by the director (director.ts).
 *
 *   - Not rendered (no listeners, no layer) when Katie is Off in Settings or the viewport is
 *     narrower than 1024 px (matchMedia, reacting to resize).
 *   - <StageLayer /> is the fixed, aria-hidden, pointer-events-none layer with the rig and the
 *     bubble. React feeds the director its inputs: her corner, the drawer, the line state and
 *     status.last_call_at, the stats(1) counts and tz, reduced motion, route changes, and the
 *     top bar's Katie button.
 *   - The caps (cooldown, daily count, first-open day, urgent spacing) live in localStorage,
 *     shared by the browser's tabs, and each appearance is claimed across windows first (Web
 *     Locks, or a katie.showing timestamp), so two visible windows never show two Katies; in mock
 *     mode the caps live in sessionStorage with no claim, so a fresh demo tab shows the first-open
 *     moment.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { qk, useStats, useStatus, type StatsResponse } from '../../api'
import { nowSec } from '../../lib/clock'
import { useSettings } from '../../settings'
import { useDrawerOpenId } from '../../shell/drawerState'
import { getMockScenario } from '../../mock/mode'
import Katie, { type KatieHandle } from '../Katie'
import { createKatieMotion } from '../motion'
import { onSummon } from '../summon'
import { createDirector, type Director, type StageStats } from './director'
import { createCapStore, pickCapStorage, practiceDay, type MomentKind } from './moments'
import { KATIE_H } from './placement'
import styles from './KatieStage.module.css'

const NARROW = '(max-width: 1023px)'
const REDUCED = '(prefers-reduced-motion: reduce)'

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      let mq: MediaQueryList
      try {
        mq = window.matchMedia(query)
      } catch {
        return () => undefined
      }
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => {
      try {
        return window.matchMedia(query).matches
      } catch {
        return false
      }
    },
    () => false,
  )
}

/** Counts, tz and the practice day they count: nothing else of the stats reaches the director. */
function stageStats(s: StatsResponse | undefined): StageStats | null {
  if (!s) return null
  const from = s.range.from
  const day = typeof from === 'number' && Number.isFinite(from) ? practiceDay(from, s.range.tz) : null
  return { calls: s.calls, bookings: s.bookings, urgent: s.urgent, callbacks: s.callbacks, tz: s.range.tz, day }
}

export default function KatieStage() {
  const { katieEnabled } = useSettings()
  const narrow = useMedia(NARROW)
  if (!katieEnabled || narrow) return null
  return <StageLayer />
}

function StageLayer() {
  const { katieHome } = useSettings()
  const reduced = useMedia(REDUCED)
  const drawerOpen = useDrawerOpenId() !== null
  const status = useStatus().data
  const statusOnCall = status?.line === 'on-call'
  const lastCallAt = status?.last_call_at ?? null
  const statsData = useStats(1).data
  const stats = stageStats(statsData)
  const qc = useQueryClient()
  const { pathname } = useLocation()

  const wrapRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const katieRef = useRef<KatieHandle>(null)
  const dirRef = useRef<Director | null>(null)
  // the latest inputs, for the mount effect (it runs once)
  const inputs = useRef({ home: katieHome, drawerOpen, statusOnCall, lastCallAt, stats, reducedMotion: reduced })
  inputs.current = { home: katieHome, drawerOpen, statusOnCall, lastCallAt, stats, reducedMotion: reduced }

  useEffect(() => {
    const wrap = wrapRef.current
    const box = boxRef.current
    const bubble = bubbleRef.current
    const handle = katieRef.current
    if (!wrap || !box || !bubble || !handle) return
    const mock = getMockScenario() !== null
    const motion = createKatieMotion(handle, wrap, {
      heightPx: KATIE_H,
      reducedMotion: inputs.current.reducedMotion,
      pauseWhenHidden: true,
    })
    const caps = createCapStore(pickCapStorage(mock, typeof window === 'undefined' ? null : window))
    const dir = createDirector(motion, box, bubble, inputs.current, {
      caps,
      readStats: () => stageStats(qc.getQueryData<StatsResponse>(qk.stats(1))),
      nowSec,
      crossTab: !mock,
    })
    dirRef.current = dir
    const offSummon = onSummon(() => dir.summon())
    // Playwright hook, mock mode only: state flags, positions, cap timestamps and counts; no data
    const w = window as unknown as { __katieStage?: unknown }
    if (mock)
      w.__katieStage = {
        state: () => dir.debug(),
        trigger: (kind: MomentKind) => dir.trigger(kind),
        caps: () => caps.get(),
        resetCaps: () => dir.resetCaps(),
      }
    return () => {
      dirRef.current = null
      offSummon()
      if (mock) delete w.__katieStage
      dir.destroy()
      motion.destroy()
    }
  }, [qc])

  const statsKey = stats ? `${stats.calls}|${stats.bookings}|${stats.urgent}|${stats.callbacks}|${stats.tz}|${stats.day}` : ''
  useEffect(() => dirRef.current?.setHome(katieHome), [katieHome])
  useEffect(() => dirRef.current?.setDrawerOpen(drawerOpen), [drawerOpen])
  useEffect(() => dirRef.current?.setStatus(statusOnCall, lastCallAt), [statusOnCall, lastCallAt])
  useEffect(() => dirRef.current?.setStats(inputs.current.stats), [statsKey])
  useEffect(() => dirRef.current?.setReducedMotion(reduced), [reduced])
  const firstRoute = useRef(true)
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false
      return
    }
    dirRef.current?.routeChanged()
  }, [pathname])

  return (
    <div className={styles.layer} aria-hidden="true" data-katie-stage="">
      {/* The layer clips her to the slab; the space inside it is the viewport again, so every
          position the director sets stays in viewport px. */}
      <div className={styles.space}>
        <div ref={boxRef} className={styles.bubbleBox}>
          <div ref={bubbleRef} className={styles.bubble} />
        </div>
        <div ref={wrapRef} className={styles.wrapper}>
          <Katie ref={katieRef} height={KATIE_H} />
        </div>
      </div>
    </div>
  )
}
