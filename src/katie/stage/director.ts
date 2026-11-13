/**
 * Katie's appearance runner (docs/research/MONDAY-LLAMA-2026-10-13.md, Part 3). She is off
 * screen by default. A moment (moments.ts decides which, and when) brings her in once:
 *
 *   show(moment) -> travel (walk in from her corner's side edge) or rise (from below the bottom
 *   edge) -> hold her widget's own data-katie sentence for clamp(3 + chars / 25, 4, 9) s ->
 *   exit (a hop down to the floor if she stands on a card, then sink out of view).
 *
 * Any pointerdown, wheel, scroll or Escape, the drawer opening or a route change ends the hold
 * at once and runs the exit. Those listeners exist only while she is on screen; off screen her
 * idle timelines are stopped, nothing observes layout and nothing runs per frame.
 *
 * What she reads: event kinds, the note's `urgent` flag, the counts in stats(1) and
 * status.last_call_at. Never a name, reason, caller or slot from an event payload. Every word
 * she says is the data-katie attribute of an element on the current page; the targets are found
 * by their data-katie-moment attribute (urgent, first-open, booking, summary), not by selectors
 * that know the pages.
 */
import gsap from 'gsap'
import type { KatieMotion } from '../motion'
import { CELEBRATE_TOTAL, HOLD, PRESENT, holdSeconds } from '../motion/timing'
import { onDashEvent } from '../../live'
import { effectiveZoom } from '../../lib'
import {
  BODY_HALF,
  KATIE_H,
  PRESENT_REACH,
  bubbleAt,
  floorShelf,
  frameOf,
  homeFacing,
  homeSpot,
  spotFor,
  type Box,
  type Corner,
  type Frame,
  type Placement,
  type Side,
  type Viewport,
} from './placement'
import { fitBubble } from './fitBubble'
import {
  MOMENT_KINDS,
  RANK,
  crossedMilestone,
  decide,
  firstOpenTarget,
  isLineWake,
  practiceDay,
  recordExit,
  recordShow,
  SHOWING_STALE_MS,
  bookingsBefore,
  seeBookings,
  type BookingsSeen,
  type CapStore,
  type Decision,
  type MomentKind,
} from './moments'

/** stats(1) counts and the practice tz: all the stage reads from the stats. */
export interface StageStats {
  calls: number
  bookings: number
  urgent: number
  callbacks: number
  tz: string
  /** the practice day these counts belong to (practiceDay(range.from, tz)), or null */
  day: string | null
}

export interface DirectorInputs {
  home: Corner
  drawerOpen: boolean
  reducedMotion: boolean
  statusOnCall: boolean
  /** status.last_call_at (seconds), as rendered: read at call.started, it is the value before the refetch */
  lastCallAt: number | null
  stats: StageStats | null
}

export interface DirectorDeps {
  caps: CapStore
  /** stats(1) straight from the query cache (fresh once an event's refetch has resolved) */
  readStats: () => StageStats | null
  /** the practice clock in seconds (nowSec: the fixtures' time in mock mode) */
  nowSec: () => number
  /**
   * Real mode: claim each appearance across this browser's windows before she steps in (Web
   * Locks, or a katie.showing timestamp in the cap storage), so two visible windows never show
   * two Katies. Mock mode keeps every tab on its own (per-tab caps), so false there.
   */
  crossTab: boolean
}

export interface Director {
  setHome(c: Corner): void
  setDrawerOpen(open: boolean): void
  setReducedMotion(on: boolean): void
  setStatus(onCall: boolean, lastCallAt: number | null): void
  setStats(s: StageStats | null): void
  routeChanged(): void
  /** The top bar's Katie button (rank 5): scroll the top widget into view, focus it, bring her. */
  summon(): void
  /** Mock checks: force a moment through the caps (its trigger condition is skipped). */
  trigger(kind: MomentKind): Decision
  resetCaps(): void
  destroy(): void
  /** For Playwright checks in mock mode only (flags, positions, labels; no data). */
  debug(): Record<string, unknown>
}

type Mode = 'walk' | 'rise' | 'peek-listen' | 'peek-face'

interface Appearance {
  kind: MomentKind
  rank: number
  el: Element | null
  mode: Mode
  placement: Placement
  phase: 'enter' | 'hold' | 'exit'
  arrived: boolean
  /** scroll position when she came in: a scroll event that did not move the page is not a wave-off */
  scroll: { x: number; y: number }
  /** how she is coming in: a walk / hop path (retargetable), a rise from below, or a fade */
  entry: 'path' | 'rise' | 'fade'
}

interface Waiting {
  arrivedAt: number
  arrivedHidden: boolean
}

const AVOID = '[data-katie-avoid]'
/** DESIGN-GLASS 3.7: the slab. Her floor is its inner bottom edge, her corners its inner sides. */
const FLOOR = '[data-katie-floor]'
/** The page's scroller: the content scrolls inside the slab, not the window. */
const SCROLLER_ID = 'content'
const TARGET = '[data-katie]'
const LINE_TILE = '[data-line-tile]'
const moment = (m: string) => `[data-katie-moment~="${m}"]`
/** first-open waits this long after the stats arrive (or a route change), so the page has laid out */
const FIRST_OPEN_SETTLE_MS = 800
/** DESIGN-GLASS 8.5: the slab tilts in on page load. Her first measurement waits for its
 *  animations to finish, at most this long. */
const SLAB_SETTLE_CAP_MS = 1500
const THROTTLE_MS = 100
/** Summon: a widget whose top edge is under the top bar or this close to the floor is scrolled
 *  so its top sits TOP_GAP under the scroller's top (the top bar's bottom edge): the content's
 *  own top padding, where a top-row card sits and she can stand on it inside the slab. */
const TOP_GAP = 40
const BOTTOM_ROOM = 24
const LOG_MAX = 30
/** the cross-tab claim (Web Locks name) */
const CLAIM_LOCK = 'katie-appearance'
/** the storage fallback's random wait before it reads the claim (two tabs rarely tie) */
const CLAIM_JITTER_MS = 150
/** she does not walk back in to say the same sentence at the same widget inside this */
const SAME_SENTENCE_MS = 10 * 60_000

export function createDirector(
  motion: KatieMotion,
  bubbleBox: HTMLElement,
  bubble: HTMLElement,
  initial: DirectorInputs,
  deps: DirectorDeps,
): Director {
  let { home, drawerOpen, statusOnCall, lastCallAt, stats, reducedMotion: reduced } = initial
  const { caps } = deps
  let destroyed = false

  /** The slab's inner box (inside its border), or none: the viewport is the frame then. */
  const readFrame = (): Frame | undefined => {
    const el = document.querySelector(FLOOR)
    if (!el) return undefined
    const r = el.getBoundingClientRect()
    const left = r.left + el.clientLeft
    const top = r.top + el.clientTop
    if (el.clientWidth <= 0 || el.clientHeight <= 0) return undefined
    return { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight }
  }
  const vp = (): Viewport => ({ w: window.innerWidth, h: window.innerHeight, frame: readFrame() })
  /** Where the page is scrolled: the content scroller inside the slab, else the window. */
  const scroller = (): HTMLElement | null => document.getElementById(SCROLLER_ID)
  const scrollPos = () => {
    const el = scroller()
    return el ? { x: el.scrollLeft, y: el.scrollTop } : { x: window.scrollX, y: window.scrollY }
  }
  const now = () => Date.now()
  const tz = () => stats?.tz ?? 'America/New_York'
  const today = () => practiceDay(deps.nowSec(), tz())

  // ---------------------------------------------------------------- the day's bookings
  /** the day's bookings as last seen, keyed to the practice day they count (a tab left open
   *  overnight starts the new day from zero, so its first booking is a milestone again) */
  let booked: BookingsSeen | null = null
  function noteBookings(s: StageStats | null) {
    if (s) booked = seeBookings(booked, s, today())
  }
  noteBookings(stats)

  // ---------------------------------------------------------------- timers
  const timers = new Set<number>()
  function later(ms: number, fn: () => void): number {
    const id = window.setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }
  function cancel(id: number | null) {
    if (id == null) return
    window.clearTimeout(id)
    timers.delete(id)
  }

  // ---------------------------------------------------------------- quiet moments
  let lastInputAt: number | null = null
  const onInput = () => {
    lastInputAt = now()
  }

  // ---------------------------------------------------------------- appearance log (mock debug)
  const log: { kind: MomentKind; mode: Mode; target: string; at: number; end?: string }[] = []
  const label = (el: Element | null) => {
    if (!el) return 'corner'
    if (el.hasAttribute('data-line-tile')) return 'line-tile'
    const kpi = el.getAttribute('data-kpi')
    if (kpi) return `kpi:${kpi}`
    const title = el.querySelector('h2')?.textContent?.trim()
    return title ? title.slice(0, 32) : (el.getAttribute('data-katie-moment') ?? 'widget')
  }

  // ---------------------------------------------------------------- the slab's entrance
  /** false until the slab's entrance has settled: nothing measures the frame before then. */
  let settled = false
  /** Resolves when [data-katie-floor]'s running animations have finished, or after the cap. */
  function slabSettled(): Promise<void> {
    const el = document.querySelector(FLOOR)
    let running: Animation[] = []
    try {
      running = el && typeof el.getAnimations === 'function' ? el.getAnimations().filter((a) => a.playState !== 'finished') : []
    } catch {
      running = []
    }
    if (!running.length) return Promise.resolve()
    return new Promise<void>((resolve) => {
      let cap: number | null = null
      const done = () => {
        cancel(cap)
        resolve()
      }
      cap = later(SLAB_SETTLE_CAP_MS, done)
      void Promise.all(running.map((a) => a.finished.then(() => undefined, () => undefined))).then(done)
    })
  }

  // ---------------------------------------------------------------- the queue
  const queue = new Map<MomentKind, Waiting>()
  let pumpTimer: number | null = null
  let app: Appearance | null = null
  let token = 0

  function request(kind: MomentKind) {
    if (destroyed) return
    if (!queue.has(kind)) queue.set(kind, { arrivedAt: now(), arrivedHidden: document.hidden })
    pump()
  }

  function decideFor(kind: MomentKind, w: Waiting): Decision {
    return decide({
      kind,
      now: now(),
      arrivedAt: w.arrivedAt,
      arrivedHidden: w.arrivedHidden,
      caps: caps.get(),
      day: today(),
      reduced,
      drawerOpen,
      hidden: document.hidden,
      lastInputAt,
      onScreenRank: app && app.phase !== 'exit' ? app.rank : null,
      // mid-exit counts as already gone: the cooldown and the urgent exit gap run from now
      exiting: app?.phase === 'exit',
    })
  }

  // ---------------------------------------------------------------- the cross-tab claim
  /** this tab holds the claim (released when she is off screen) */
  let release: (() => void) | null = null
  /** a claim is being asked for: pump waits for it */
  let claiming = false

  function letGo() {
    const r = release
    release = null
    r?.()
  }

  /** true: this tab may put her on screen (no other window of the browser has her now). */
  function claim(): Promise<boolean> {
    if (!deps.crossTab || release) return Promise.resolve(true)
    let locks: LockManager | undefined
    try {
      locks = navigator.locks
    } catch {
      locks = undefined
    }
    if (locks && typeof locks.request === 'function') {
      return new Promise<boolean>((resolve) => {
        locks
          .request(CLAIM_LOCK, { ifAvailable: true }, (lock) => {
            if (!lock) {
              resolve(false)
              return undefined
            }
            // held for the whole appearance; offScreen (or destroy) lets it go
            return new Promise<void>((done) => {
              release = done
              resolve(true)
            })
          })
          .catch(() => resolve(true))
      })
    }
    // no Web Locks (an insecure context): a timestamp in the cap storage, read after a jitter
    return new Promise<boolean>((resolve) => {
      later(Math.random() * CLAIM_JITTER_MS, () => {
        const at = caps.showingAt()
        if (at !== null && Math.abs(now() - at) < SHOWING_STALE_MS) {
          resolve(false)
          return
        }
        const mine = Math.round(now())
        caps.setShowing(mine)
        release = () => {
          if (caps.showingAt() === mine) caps.setShowing(null)
        }
        resolve(true)
      })
    })
  }

  /** Decide every waiting moment, highest rank first; fire at most one; re-arm the timer. */
  function pump() {
    cancel(pumpTimer)
    pumpTimer = null
    if (destroyed || claiming || !settled) return
    let next = Infinity
    const kinds = MOMENT_KINDS.filter((k) => queue.has(k)).sort((a, b) => RANK[a] - RANK[b])
    for (const kind of kinds) {
      const w = queue.get(kind)
      if (!w) continue
      const d = decideFor(kind, w)
      if (d.verdict === 'wait') {
        next = Math.min(next, d.at ?? now() + 1000)
        continue
      }
      queue.delete(kind)
      if (d.verdict === 'skip') {
        // a first-open passed over by the caps is used up for the day; one that could not be
        // shown (drawer, hidden tab, no quiet moment) stays for the next page or return
        if (kind === 'first-open' && /cooldown|daily cap|already shown/.test(d.reason)) {
          caps.set({ ...caps.get(), firstOpenDay: today() })
        }
        continue
      }
      if (!app && deps.crossTab) {
        // off screen in real mode: claim the appearance across windows first, then decide again
        // (another window may have shown her, and written the caps, while this one waited)
        claiming = true
        void claim().then((ok) => {
          claiming = false
          if (destroyed) {
            letGo()
            return
          }
          if (!ok) {
            // another window has her on screen: this one adds nothing (urgent or ordinary)
            pump()
            return
          }
          const again = decideFor(kind, w)
          if (again.verdict === 'wait') queue.set(kind, w)
          if (again.verdict !== 'fire' || !fire(kind)) {
            if (!app) letGo()
          } else dropLower(kind)
          pump()
        })
        return
      }
      if (!fire(kind)) continue
      dropLower(kind)
      break
    }
    if (Number.isFinite(next) && queue.size) pumpTimer = later(Math.max(0, next - now()) + 5, pump)
  }

  /** what is still waiting is lower ranked than what she is doing now: drop it */
  function dropLower(kind: MomentKind) {
    for (const k of [...queue.keys()]) if (RANK[k] > RANK[kind]) queue.delete(k)
  }

  /** Find the moment's target on this page and show her. false: nothing here to show. */
  function fire(kind: MomentKind): boolean {
    const q = (sel: string) => document.querySelector(sel)
    switch (kind) {
      case 'urgent': {
        const el = q(moment('urgent'))
        if (el) return show(kind, el, 'walk')
        // a dashboard page without a callbacks widget: a silent peek toward the rail
        if (q(TARGET)) return show(kind, null, 'peek-face')
        return false
      }
      case 'first-open': {
        const s = stats
        const where = s ? firstOpenTarget(s) : null
        const el = where ? q(moment(where)) : null
        // no widget for it here: the day's flag stays unset for the next page
        return el ? show(kind, el, 'walk', where === 'urgent') : false
      }
      case 'booking': {
        const el = q(moment('booking'))
        return el ? show(kind, el, 'rise') : false
      }
      case 'line-wake':
        return show(kind, null, 'peek-listen')
      case 'summon': {
        const el = summonTarget()
        return el ? show(kind, el, 'walk') : false
      }
    }
  }

  function summonTarget(): Element | null {
    const q = (sel: string) => document.querySelector(sel)
    const s = stats
    if (s && (s.urgent > 0 || s.callbacks > 0)) {
      const el = q(moment('urgent'))
      if (el) return el
    }
    if (statusOnCall) {
      const el = q(LINE_TILE)
      if (el) return el
    }
    return q(moment('summary')) ?? q(TARGET)
  }

  // ---------------------------------------------------------------- placement
  let avoidRects: Box[] = []
  function readAvoid(): Box[] {
    avoidRects = Array.from(document.querySelectorAll(AVOID), (a) => {
      const r = a.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }).filter((b) => b.right > b.left && b.bottom > b.top)
    return avoidRects
  }

  /** The target's spot; a KPI cell stands on its card's top edge. Layout is read here only. */
  function placementOf(el: Element | null): Placement {
    const v = vp()
    if (!el) return homeSpot(v, home)
    const r = el.getBoundingClientRect()
    let top = r.top
    let span: { left: number; right: number } | undefined
    const card = el.parentElement?.closest('section')
    if (card) {
      const cr = card.getBoundingClientRect()
      if (Math.abs(cr.top - r.top) <= 2) {
        top = cr.top
        span = { left: cr.left, right: cr.right }
      }
    }
    return spotFor({ left: r.left, right: r.right, top }, v, readAvoid(), span)
  }

  // ---------------------------------------------------------------- show / hold / exit
  let holdTimer: number | null = null

  /** what she last said, where and when (memory only: never stored, logged or sent) */
  let lastSaid: { el: Element; text: string; at: number } | null = null

  function show(kind: MomentKind, el: Element | null, mode: Mode, pointsAtUrgent = false): boolean {
    if (kind !== 'summon' && el && lastSaid && lastSaid.el === el && now() - lastSaid.at < SAME_SENTENCE_MS) {
      // the widget still says what she said there a few minutes ago: nothing new to point at
      if ((el.getAttribute('data-katie') ?? '').trim() === lastSaid.text) return false
    }
    const t = ++token
    cancel(holdTimer)
    holdTimer = null
    const st = motion.getState()
    const wasOff = st.offscreen
    const v = vp()
    const floor = floorShelf(v)
    motion.setFloor(floor)
    const placement = placementOf(el)
    // One instant for the appearance: the caps (its spacing and cooldown run from it) and the log
    // entry carry the same ms. Two reads of the clock here could straddle a tick (the scroll and
    // label reads between them can force layout), and the verifier compares the two.
    const at = now()
    caps.set(recordShow(caps.get(), kind, at, today(), pointsAtUrgent))
    app = {
      kind,
      rank: RANK[kind],
      el,
      mode,
      placement,
      phase: 'enter',
      arrived: false,
      scroll: scrollPos(),
      entry: reduced ? 'fade' : !wasOff || mode === 'walk' ? 'path' : 'rise',
    }
    log.push({ kind, mode, target: label(el), at })
    if (log.length > LOG_MAX) log.shift()
    hideBubble()
    watch(el)
    attachOnScreen()
    motion.startIdle()

    const peek = mode === 'peek-listen' || mode === 'peek-face'
    const facing: Side = mode === 'peek-face' ? 'left' : homeFacing(home)
    let move: Promise<boolean>
    if (reduced) {
      // 3.8: no walk, rise, hop or celebrate: a 120 ms fade in at the spot
      move = motion.rise(placement.x, placement.y, placement.shelf, peek ? facing : undefined)
    } else if (!wasOff) {
      // retarget while on screen (a higher moment, or asked for during the exit)
      if (st.y > floor.y + 1) motion.placeAt(st.x, floor.y, floor, st.facing)
      move = motion.goTo(placement.x, placement.shelf)
    } else if (mode === 'walk') {
      // from just outside the slab's side edge (its layer clips her to the slab)
      const f = frameOf(v)
      const fromX = home === 'bottom-left' ? f.left - 40 : f.right + 40
      motion.placeAt(fromX, floor.y, floor, home === 'bottom-left' ? 'right' : 'left')
      move = motion.goTo(placement.x, placement.shelf)
    } else if (mode === 'rise') {
      move = motion.rise(placement.x, floor.y, floor).then((ok) => {
        if (!ok || t !== token || !app) return false
        // the spot as it is now (a layout change during the rise updates it)
        app.entry = 'path'
        const p = app.placement
        return p.onCard ? motion.goTo(p.x, p.shelf) : true
      })
    } else {
      move = motion.rise(placement.x, floor.y, floor, facing)
    }
    void move.then((ok) => {
      if (!ok || t !== token || !app || app.phase !== 'enter') return
      app.arrived = true
      arrive(t)
    })
    return true
  }

  function arrive(t: number) {
    if (!app) return
    const a = app
    a.phase = 'hold'
    // the layout moved while she faded or rose in: stand on the spot as it is now
    const at = motion.getState()
    if (!at.travelling && (Math.abs(at.x - a.placement.x) >= 0.5 || Math.abs(at.y - a.placement.y) >= 0.5)) {
      motion.placeAt(a.placement.x, a.placement.y, a.placement.shelf, at.facing)
    }
    if (a.mode === 'peek-listen') {
      motion.listen(true, homeFacing(home))
      holdFor(HOLD.peek)
      return
    }
    if (a.mode === 'peek-face') {
      face('left')
      holdFor(HOLD.peek)
      return
    }
    const present = () => {
      if (t !== token || !app) return
      const text = sentence()
      if (text && app.el) lastSaid = { el: app.el, text, at: now() }
      if (text) motion.present(app.placement.side)
      else face(app.placement.side)
      syncBubble()
      holdFor(holdSeconds(text.length) + (text ? PRESENT.bubbleDelay : 0))
    }
    if (a.mode === 'rise' && !reduced) {
      // a booking milestone: the bounce and double nod first (no confetti, no sparkles)
      motion.celebrate()
      later(CELEBRATE_TOTAL * 1000, present)
    } else present()
  }

  function holdFor(seconds: number) {
    cancel(holdTimer)
    holdTimer = later(seconds * 1000, () => {
      holdTimer = null
      exit('hold over')
    })
  }

  function face(side: Side) {
    const s = motion.getState()
    if (s.facing === side) return
    motion.placeAt(s.x, s.y, s.shelf, side)
  }

  function exit(why: string) {
    if (!app || app.phase === 'exit') return
    const t = ++token
    app.phase = 'exit'
    const entry = log[log.length - 1]
    if (entry && !entry.end) entry.end = why
    cancel(holdTimer)
    holdTimer = null
    hideBubble()
    textObserver.disconnect()
    const st = motion.getState()
    const floor = floorShelf(vp())
    motion.setFloor(floor)
    const onCard = Math.abs(st.y - floor.y) >= 1 && !st.offscreen
    if (onCard && !reduced && why !== 'hold over') {
      // waved off (3.5: 'immediate'): no hop down, she drops straight out of view (3.9: no fade)
      void motion.sink({ direct: true }).then((ok) => {
        if (ok && t === token) offScreen()
      })
      return
    }
    const down = onCard && !reduced ? motion.hopTo(st.x, floor.y, floor) : Promise.resolve(true)
    void down
      .then((ok) => (ok && t === token ? motion.sink() : false))
      .then((ok) => {
        if (ok && t === token) offScreen()
      })
  }

  /** She is gone: record the exit, drop the on-screen listeners, stop every idle timeline. */
  function offScreen() {
    if (!app) return
    app = null
    caps.set(recordExit(caps.get(), now()))
    letGo()
    detachOnScreen()
    textObserver.disconnect()
    motion.stopIdle()
    gsap.killTweensOf(bubble)
    gsap.set(bubble, { autoAlpha: 0 })
    bubbleShown = false
    // a waiting urgent note may be allowed now, or after the 60 s gap
    pump()
  }

  /** Out at once, no animation (tab hidden, Katie turned off). */
  function vanish(why: string) {
    if (!app) return
    token++
    const entry = log[log.length - 1]
    if (entry && !entry.end) entry.end = why
    cancel(holdTimer)
    holdTimer = null
    motion.hide()
    offScreen()
  }

  // ---------------------------------------------------------------- dismissal (on screen only)
  const dismiss = (why: string) => () => exit(why)
  const onPointerDown = dismiss('pointerdown')
  const onWheel = dismiss('wheel')
  const onScroll = () => {
    if (!app) return
    // a scroll event that left the page where it was when she came in (the summon's own
    // scrollIntoView) is not the person scrolling
    const at = scrollPos()
    if (Math.abs(at.y - app.scroll.y) < 1 && Math.abs(at.x - app.scroll.x) < 1) return
    exit('scroll')
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') exit('escape')
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => scheduleRefresh()) : null
  let onScreenBound = false
  function attachOnScreen() {
    if (onScreenBound) return
    onScreenBound = true
    const opts = { passive: true, capture: true } as const
    document.addEventListener('pointerdown', onPointerDown, opts)
    document.addEventListener('wheel', onWheel, opts)
    document.addEventListener('keydown', onKey, true)
    // element scroll events do not bubble: the content scroller's reach the document's capture
    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', scheduleRefresh, { passive: true })
    const content = scroller()
    if (ro && content) {
      ro.observe(content)
      // the scroller keeps its size inside the slab: the page inside it is what grows
      if (content.firstElementChild) ro.observe(content.firstElementChild)
    }
  }
  function detachOnScreen() {
    if (!onScreenBound) return
    onScreenBound = false
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('wheel', onWheel, true)
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', scheduleRefresh)
    ro?.disconnect()
    cancel(refreshTimer)
    refreshTimer = null
    cancelAnimationFrame(refreshRaf)
    refreshRaf = 0
  }

  // ---------------------------------------------------------------- layout changes (on screen only)
  let lastRefresh = 0
  let refreshTimer: number | null = null
  let refreshRaf = 0
  function scheduleRefresh() {
    if (!app || refreshTimer != null || refreshRaf) return
    const wait = Math.max(0, THROTTLE_MS - (performance.now() - lastRefresh))
    refreshTimer = later(wait, () => {
      refreshTimer = null
      refreshRaf = requestAnimationFrame(() => {
        refreshRaf = 0
        lastRefresh = performance.now()
        refresh()
      })
    })
  }

  function refresh() {
    if (!app || app.phase === 'exit') return
    motion.setFloor(floorShelf(vp()))
    if (app.el && !app.el.isConnected) {
      exit('target gone')
      return
    }
    const next = placementOf(app.el)
    const prev = app.placement
    app.placement = next
    const st = motion.getState()
    const moved = Math.abs(next.x - prev.x) >= 0.5 || Math.abs(next.y - prev.y) >= 0.5 || next.onCard !== prev.onCard
    if (!app.arrived || st.travelling) {
      // coming in: only a walk / hop path is retargeted, and only when the spot moved (a rise
      // or a fade reads app.placement when it lands)
      if (!moved || app.entry !== 'path' || app.phase !== 'enter') return
      const t = token
      void motion.goTo(next.x, next.shelf).then((ok) => {
        if (!ok || t !== token || !app || app.phase !== 'enter') return
        app.arrived = true
        arrive(t)
      })
      return
    }
    if (next.onCard !== prev.onCard) {
      // the card moved above the viewport or back: step to the new spot, keep the hold
      void motion.goTo(next.x, next.shelf).then((ok) => {
        if (!ok || !app || app.phase !== 'hold') return
        if (sentence()) motion.present(app.placement.side)
        if (bubbleShown) placeBubble(true)
      })
      return
    }
    if (Math.abs(next.x - st.x) >= 0.5 || Math.abs(next.y - st.y) >= 0.5) {
      const presenting = st.presenting
      motion.placeAt(next.x, next.y, next.shelf, st.facing)
      if (presenting) motion.present(next.side)
      if (bubbleShown) placeBubble(true)
    }
  }

  // ---------------------------------------------------------------- bubble
  let bubbleShown = false
  let bubbleText = ''
  let bubbleSide: Side = 'left'

  const sentence = (): string => (app?.el?.getAttribute('data-katie') ?? '').trim()

  function bubbleWanted(): boolean {
    if (!app || !app.arrived || app.phase !== 'hold' || !app.el) return false
    if (app.mode === 'peek-listen' || app.mode === 'peek-face') return false
    return !!sentence()
  }

  /** The top bar's left and right groups: a top-row bubble should not cover the page title. */
  function topBarBoxes(): Box[] {
    const prev = document.getElementById('content')?.previousElementSibling
    const bar = prev && prev.tagName === 'HEADER' ? prev : document.querySelector('header')
    if (!bar) return []
    return Array.from(bar.children).map((c) => {
      const r = c.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    })
  }
  let avoid: Box[] = []

  let bubbleSizes: { w: number; h: number; css: string }[] = []
  let bubbleSizeIdx = 0
  function applySize(i: number) {
    if (i === bubbleSizeIdx) return
    const sz = bubbleSizes[i]
    if (!sz) return
    bubbleSizeIdx = i
    bubble.style.width = sz.css
  }
  function placeBubble(measure = false) {
    if (!app) return
    const s = motion.getState()
    if (measure) avoid = [...(s.y - KATIE_H < 64 ? topBarBoxes() : []), ...readAvoid()]
    const p = bubbleAt({ x: s.x, y: s.y }, bubbleSizes, app.placement.side, vp(), {
      reach: s.presenting ? PRESENT_REACH : BODY_HALF,
      avoid,
    })
    applySize(p.size)
    bubbleSide = p.side
    bubbleBox.style.transform = `translate3d(${Math.round(p.left)}px, ${Math.round(p.top)}px, 0)`
  }

  function setText(text: string) {
    if (text === bubbleText) return
    bubbleText = text
    bubble.textContent = text
    const two = { ...fitBubble(bubble, 2), css: bubble.style.width }
    const one = { ...fitBubble(bubble), css: bubble.style.width }
    bubbleSizes = two.h > one.h ? [one, two] : [one]
    bubbleSizeIdx = 0
  }
  const onFonts = () => {
    if (!bubbleText) return
    const t = bubbleText
    bubbleText = ''
    setText(t)
    if (bubbleShown) placeBubble(true)
  }
  document.fonts?.addEventListener?.('loadingdone', onFonts)

  function syncBubble() {
    if (!bubbleWanted()) {
      if (bubbleShown) hideBubble()
      return
    }
    setText(sentence())
    placeBubble(!bubbleShown)
    if (bubbleShown) return
    bubbleShown = true
    gsap.killTweensOf(bubble)
    if (reduced) gsap.set(bubble, { autoAlpha: 1, y: 0 })
    else
      gsap.fromTo(
        bubble,
        { autoAlpha: 0, y: PRESENT.bubbleRisePx },
        { autoAlpha: 1, y: 0, duration: PRESENT.bubbleIn, delay: PRESENT.bubbleDelay, ease: PRESENT.bubbleEase },
      )
  }

  function hideBubble() {
    gsap.killTweensOf(bubble)
    const wasShown = bubbleShown
    bubbleShown = false
    if (reduced || !wasShown || Number(gsap.getProperty(bubble, 'opacity')) === 0) gsap.set(bubble, { autoAlpha: 0 })
    else gsap.to(bubble, { autoAlpha: 0, duration: PRESENT.bubbleOut, ease: 'power1.out' })
  }

  // the target's sentence changes while she holds it: update in place (the hold keeps its length)
  const textObserver = new MutationObserver(() => {
    if (!app || app.phase !== 'hold') return
    const s = sentence()
    if (bubbleShown && s) {
      setText(s)
      placeBubble(true)
    } else syncBubble()
  })
  function watch(el: Element | null) {
    textObserver.disconnect()
    if (el) textObserver.observe(el, { attributes: true, attributeFilter: ['data-katie'] })
  }

  // ---------------------------------------------------------------- first open of the day
  let firstOpenTimer: number | null = null
  function checkFirstOpen(delay = FIRST_OPEN_SETTLE_MS) {
    cancel(firstOpenTimer)
    firstOpenTimer = later(delay, () => {
      firstOpenTimer = null
      const s = stats
      if (!s || document.hidden) return
      const day = today()
      if (caps.get().firstOpenDay === day) return
      if (!firstOpenTarget(s)) {
        // nothing overnight: no filler appearance, and none later today
        caps.set({ ...caps.get(), firstOpenDay: day })
        return
      }
      request('first-open')
    })
  }

  // ---------------------------------------------------------------- tab hidden
  const onVisibility = () => {
    if (document.hidden) {
      vanish('tab hidden')
      for (const [k, w] of [...queue]) {
        if (k === 'urgent') w.arrivedHidden = true
        else queue.delete(k)
      }
      cancel(pumpTimer)
      pumpTimer = null
      cancel(firstOpenTimer)
      firstOpenTimer = null
      return
    }
    pump()
    checkFirstOpen()
  }

  // ---------------------------------------------------------------- live events
  const offStarted = onDashEvent('call.started', () => {
    // last_call_at as rendered is the value before this event's refetch
    if (isLineWake(deps.nowSec(), lastCallAt, tz())) request('line-wake')
  })
  const offBooking = onDashEvent('booking', (_e, { refreshed }) => {
    // the count before this booking, on today's practice day (none seen today yet: zero)
    const before = bookingsBefore(booked, today())
    void refreshed.then(
      () => {
        const s = deps.readStats()
        if (!s) return
        noteBookings(s)
        if (crossedMilestone(before, s.bookings) !== null) request('booking')
      },
      () => undefined,
    )
  })
  const offNote = onDashEvent('note', (e, { refreshed }) => {
    // the urgent flag only; never the name or the reason
    if (e.data?.urgent !== true) return
    void refreshed.then(
      () => request('urgent'),
      () => request('urgent'),
    )
  })

  // ---------------------------------------------------------------- the top bar's Katie button
  function summon() {
    if (destroyed || document.hidden) return
    // the slab is still tilting in: summon once it has settled
    if (!settled) {
      void settling.then(summon)
      return
    }
    const el = summonTarget()
    if (!el) return
    // useful without her too: the widget comes into view (its top edge below the top bar,
    // where she can stand on it) and takes focus. The content scrolls inside the slab.
    const r = el.getBoundingClientRect()
    const box = scroller()
    const topClear = (box ? box.getBoundingClientRect().top : 56) + TOP_GAP
    const floorY = floorShelf(vp()).y
    if (r.top < topClear - 16 || r.top > floorY - KATIE_H - BOTTOM_ROOM) {
      // r.top is viewport px; the scroller scrolls in its own px (the look's text size zooms it).
      const zoom = box ? effectiveZoom(box) : 1
      ;(box ?? window).scrollBy({ top: (r.top - topClear) / zoom, behavior: 'instant' as ScrollBehavior })
    }
    if (el instanceof HTMLElement) {
      if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      el.focus({ preventScroll: true })
    }
    queue.delete('summon')
    const d = decideFor('summon', { arrivedAt: now(), arrivedHidden: false })
    if (d.verdict === 'fire') fire('summon')
  }

  // ---------------------------------------------------------------- always-on listeners (cheap)
  const passive = { passive: true, capture: true } as const
  document.addEventListener('keydown', onInput, true)
  document.addEventListener('wheel', onInput, passive)
  document.addEventListener('pointerdown', onInput, passive)
  document.addEventListener('visibilitychange', onVisibility)

  // ---------------------------------------------------------------- start: off screen
  motion.setFloor(floorShelf(vp()))
  motion.hide()
  gsap.set(bubble, { autoAlpha: 0 })
  if (stats) checkFirstOpen()
  // 8.5: her floor and corners are read again from the settled slab, then the queue runs.
  const settling = slabSettled().then(() => {
    if (destroyed) return
    settled = true
    motion.setFloor(floorShelf(vp()))
    pump()
  })

  return {
    setHome(c) {
      home = c
    },
    setDrawerOpen(open) {
      if (open === drawerOpen) return
      drawerOpen = open
      if (open) exit('drawer')
      else {
        pump()
        checkFirstOpen()
      }
    },
    setReducedMotion(on) {
      if (on === reduced) return
      reduced = on
      motion.setReducedMotion(on)
    },
    setStatus(onCall, last) {
      statusOnCall = onCall
      lastCallAt = last
    },
    setStats(s) {
      const had = stats !== null
      stats = s
      noteBookings(s)
      if (!had && s) checkFirstOpen()
    },
    routeChanged() {
      exit('route')
      if (stats) checkFirstOpen()
    },
    summon,
    trigger(kind) {
      if (kind === 'summon') {
        summon()
        return { verdict: 'fire', reason: 'asked for' }
      }
      const w = { arrivedAt: now(), arrivedHidden: document.hidden }
      const d = decideFor(kind, w)
      if (d.verdict === 'skip') return d
      queue.set(kind, w)
      pump()
      return d
    },
    resetCaps() {
      caps.reset()
      lastSaid = null
    },
    destroy() {
      destroyed = true
      token++
      letGo()
      for (const id of timers) window.clearTimeout(id)
      timers.clear()
      detachOnScreen()
      textObserver.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', onFonts)
      offStarted()
      offBooking()
      offNote()
      document.removeEventListener('keydown', onInput, true)
      document.removeEventListener('wheel', onInput, true)
      document.removeEventListener('pointerdown', onInput, true)
      document.removeEventListener('visibilitychange', onVisibility)
      gsap.killTweensOf(bubble)
      app = null
    },
    debug() {
      const s = motion.getState()
      const active = gsap.globalTimeline.getChildren(true, true, true).filter((a) => a.isActive()).length
      return {
        moment: app?.kind ?? null,
        phase: app?.phase ?? null,
        mode: app?.mode ?? null,
        dest: app ? label(app.el) : null,
        arrived: app?.arrived ?? false,
        onCard: app?.placement.onCard ?? null,
        spot: app ? { x: app.placement.x, y: app.placement.y } : null,
        bubbleShown,
        bubbleSide,
        x: s.x,
        y: s.y,
        facing: s.facing,
        travelling: s.travelling,
        presenting: s.presenting,
        listening: s.listening,
        celebrating: s.celebrating,
        idle: s.idle,
        offscreen: s.offscreen,
        reduced: s.reducedMotion,
        paused: s.paused,
        waiting: [...queue].map(([k, w]) => ({ kind: k, age: now() - w.arrivedAt, hidden: w.arrivedHidden })),
        caps: caps.get(),
        capsBackend: caps.backend(),
        day: today(),
        log: log.map((l) => ({ ...l })),
        activeTweens: active,
        onScreenListeners: onScreenBound,
      }
    },
  }
}
