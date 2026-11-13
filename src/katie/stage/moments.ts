/**
 * When Katie may appear (docs/research/MONDAY-LLAMA-2026-10-13.md, Part 3: 3.3 and 3.4). A pure
 * module: plain inputs in, `fire | skip | wait` out. No DOM, no GSAP, no imports, so
 * scripts/check-lib.mjs runs it in Node.
 *
 * She is off screen by default and steps in only for these moments (rank 1 is the highest):
 *   1 urgent      a `note` event with urgent === true (after its refetch)
 *   2 first-open  the first time this browser shows the dashboard on a new practice day
 *   3 booking     the day's bookings crossed 1, 5, 10, 20, 30, 40 or 50
 *   4 line-wake   call.started as the day's first call, or 60 min or more after the last one
 *   5 summon      the person pressed the Katie button in the top bar
 * Never a trigger: hover, focus, idle time, timers, navigation, returning to the tab.
 *
 * Caps (3.4): ordinary moments (ranks 2-4) need 15 min since her last exit and at most 6 a
 * practice day; urgent ignores both but keeps 10 min between urgent appearances and 60 s after
 * an exit (it waits for that gap, up to its 2-minute window); a summon is never capped and still
 * resets the cooldown. Everything waits for a quiet moment (1.5 s without keydown, wheel or
 * pointerdown): 20 s at most, urgent 2 min. With the drawer open only urgent waits; with the tab
 * hidden only urgent waits (shown once on return if under 30 min old).
 *
 * The caps live in storage as timestamps, counts and the practice day, never data. Real mode:
 * localStorage, shared by every tab of the browser; the director also claims each appearance
 * across windows (Web Locks, else a katie.showing timestamp), so two visible windows never show
 * two Katies. Mock mode (?mock): sessionStorage, so a fresh
 * demo tab always shows the first-open moment. Every access is wrapped and falls back to memory.
 */

export type MomentKind = 'urgent' | 'first-open' | 'booking' | 'line-wake' | 'summon'

/** 1 is the highest. A higher-ranked moment retargets her while she is on screen. */
export const RANK: Readonly<Record<MomentKind, number>> = {
  urgent: 1,
  'first-open': 2,
  booking: 3,
  'line-wake': 4,
  summon: 5,
}

export const MOMENT_KINDS: readonly MomentKind[] = ['urgent', 'first-open', 'booking', 'line-wake', 'summon']

const MIN = 60_000

/** Between ordinary appearances, from her last exit. */
export const COOLDOWN_MS = 15 * MIN
/** Ordinary appearances (ranks 2-4) per practice day per browser. */
export const DAILY_CAP = 6
/** Between two urgent appearances. */
export const URGENT_SPACING_MS = 10 * MIN
/** An urgent appearance never starts within this of her last exit (it waits). */
export const URGENT_EXIT_GAP_MS = MIN
/** The day's booking count crossing one of these is a milestone. */
export const MILESTONES: readonly number[] = [1, 5, 10, 20, 30, 40, 50]
/** No keydown, wheel or pointerdown for this long before she steps in. */
export const QUIET_MS = 1500
/** How long a moment may wait for its conditions before it is dropped. */
export const WAIT_MS = 20_000
export const URGENT_WAIT_MS = 2 * MIN
/** An urgent note that arrived while the tab was hidden shows on return if younger than this. */
export const HIDDEN_URGENT_MAX_MS = 30 * MIN
/** call.started this long (seconds) after the previous call wakes the line. */
export const LINE_WAKE_GAP_S = 60 * 60

/** Ranks 1, 2 and 5 only under prefers-reduced-motion (3.8): no celebrations, no peeks. */
export function allowedWhenReduced(kind: MomentKind): boolean {
  return kind === 'urgent' || kind === 'first-open' || kind === 'summon'
}

/** Ordinary moments share the cooldown and the daily cap. */
export function isOrdinary(kind: MomentKind): boolean {
  return kind === 'first-open' || kind === 'booking' || kind === 'line-wake'
}

/** How long a moment may wait, from when it arose. */
export function waitWindow(kind: MomentKind, arrivedHidden = false): number {
  if (kind === 'urgent') return arrivedHidden ? HIDDEN_URGENT_MAX_MS : URGENT_WAIT_MS
  return WAIT_MS
}

// ---------------------------------------------------------------------------- the practice day

const dayFormats = new Map<string, Intl.DateTimeFormat>()

/** 'YYYY-MM-DD' of `nowSec` in the practice's time zone (stats.range.tz). */
export function practiceDay(nowSec: number, tz: string): string {
  let f = dayFormats.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    } catch {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    }
    dayFormats.set(tz, f)
  }
  const parts = f.formatToParts(new Date(nowSec * 1000))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

// ---------------------------------------------------------------------------- triggers

/** The milestone the day's bookings crossed going from `before` to `after`, or null. */
export function crossedMilestone(before: number, after: number): number | null {
  let hit: number | null = null
  for (const m of MILESTONES) if (before < m && after >= m) hit = m
  return hit
}

/** The day's bookings as last seen, keyed to the practice day they count. */
export interface BookingsSeen {
  day: string
  seen: number
}

/**
 * The bookings baseline after a stats read on practice day `day`. Within a day it only grows
 * (a cancel does not re-arm a milestone); a new day starts again from that day's count, so a tab
 * left open overnight sees the new day's first booking as a milestone. Counts that belong to
 * another day (`statsDay`: yesterday's, still cached across midnight) are no baseline for today.
 */
export function seeBookings(
  prev: BookingsSeen | null,
  s: { bookings: number; day?: string | null },
  day: string,
): BookingsSeen | null {
  if (s.day && s.day !== day) return prev
  return prev && prev.day === day ? { day, seen: Math.max(prev.seen, s.bookings) } : { day, seen: s.bookings }
}

/** The count before a booking event on practice day `day`: nothing seen today yet is zero. */
export function bookingsBefore(prev: BookingsSeen | null, day: string): number {
  return prev && prev.day === day ? prev.seen : 0
}

/**
 * call.started wakes the line when it is the day's first call (no earlier call, or the last one
 * on another practice day) or comes 60 min or more after the previous call started.
 * `lastCallAt` is status.last_call_at as it was before the event's refetch (seconds).
 */
export function isLineWake(nowSec: number, lastCallAt: number | null | undefined, tz: string): boolean {
  if (lastCallAt == null || !Number.isFinite(lastCallAt)) return true
  if (practiceDay(lastCallAt, tz) !== practiceDay(nowSec, tz)) return true
  return nowSec - lastCallAt >= LINE_WAKE_GAP_S
}

/** First open of the day: where she goes, from the day's counts only. */
export function firstOpenTarget(stats: { urgent: number; calls: number }): 'urgent' | 'first-open' | null {
  if (stats.urgent > 0) return 'urgent'
  if (stats.calls > 0) return 'first-open'
  return null
}

// ---------------------------------------------------------------------------- caps

export interface CapState {
  /** ms of her last exit (any appearance), or null */
  lastExit: number | null
  /** ms of the last urgent appearance, or null */
  lastUrgent: number | null
  /** practice day the ordinary count belongs to, and the count */
  countDay: string | null
  dayCount: number
  /** practice day the first-open moment was used (or passed over) */
  firstOpenDay: string | null
}

export const EMPTY_CAPS: Readonly<CapState> = {
  lastExit: null,
  lastUrgent: null,
  countDay: null,
  dayCount: 0,
  firstOpenDay: null,
}

/** Ordinary appearances so far on `day`. */
export function countOn(caps: CapState, day: string): number {
  return caps.countDay === day ? caps.dayCount : 0
}

// ---------------------------------------------------------------------------- the decision

export interface DecideInput {
  kind: MomentKind
  /** ms (the same clock as the caps) */
  now: number
  /** ms when the moment arose */
  arrivedAt: number
  /** it arose, or waited, while the tab was hidden */
  arrivedHidden?: boolean
  caps: CapState
  /** the practice day now */
  day: string
  reduced: boolean
  drawerOpen: boolean
  hidden: boolean
  /** ms of the last keydown, wheel or pointerdown (null: none yet) */
  lastInputAt: number | null
  /** the rank of the appearance on screen now, or null when she is off screen */
  onScreenRank: number | null
  /** she is in her exit animation now (onScreenRank is null then): the caps count her as having
   *  left at `now`, so nothing turns her straight back past the cooldown or the urgent exit gap */
  exiting?: boolean
}

export type Verdict = 'fire' | 'skip' | 'wait'

export interface Decision {
  verdict: Verdict
  /** why (for the checks and the mock debug hook) */
  reason: string
  /** wait: the earliest ms worth deciding again (the timer the runner sets) */
  at?: number
}

const skip = (reason: string): Decision => ({ verdict: 'skip', reason })
const wait = (reason: string, at: number): Decision => ({ verdict: 'wait', reason, at })

/**
 * fire, skip or wait, from plain inputs. The caller fires on 'fire' (and records it with
 * recordShow), drops the moment on 'skip', and decides again at `at` on 'wait'.
 */
export function decide(i: DecideInput): Decision {
  const { kind, now } = i
  const caps = i.exiting ? recordExit(i.caps, now) : i.caps
  if (i.reduced && !allowedWhenReduced(kind)) return skip('reduced motion')

  // asked for: no cap, no wait (the click itself is the input)
  if (kind === 'summon') {
    if (i.hidden) return skip('tab hidden')
    return { verdict: 'fire', reason: 'asked for' }
  }

  const deadline = i.arrivedAt + waitWindow(kind, i.arrivedHidden)
  if (now > deadline) return skip('waited too long')

  if (i.hidden) return kind === 'urgent' ? wait('tab hidden', deadline) : skip('tab hidden')

  // a lower- or equal-ranked moment never interrupts the one on screen
  if (i.onScreenRank !== null && RANK[kind] >= i.onScreenRank) return skip('she is on screen for a higher moment')

  if (i.drawerOpen) return kind === 'urgent' ? wait('drawer open', deadline) : skip('drawer open')

  if (kind === 'urgent') {
    if (caps.lastUrgent !== null && now - caps.lastUrgent < URGENT_SPACING_MS) return skip('urgent spacing')
    if (i.onScreenRank === null && caps.lastExit !== null && now - caps.lastExit < URGENT_EXIT_GAP_MS) {
      const at = caps.lastExit + URGENT_EXIT_GAP_MS
      return at > deadline ? skip('exit gap outlasts the window') : wait('60 s after her exit', at)
    }
  } else {
    if (kind === 'first-open' && caps.firstOpenDay === i.day) return skip('first open already shown today')
    if (countOn(caps, i.day) >= DAILY_CAP) return skip('daily cap')
    if (caps.lastExit !== null && now - caps.lastExit < COOLDOWN_MS) return skip('cooldown')
  }

  if (i.lastInputAt !== null && now - i.lastInputAt < QUIET_MS) {
    const at = i.lastInputAt + QUIET_MS
    return at > deadline ? skip('never quiet') : wait('not quiet', at)
  }
  return { verdict: 'fire', reason: 'ok' }
}

/**
 * The caps after an appearance starts. `pointsAtUrgent`: a first open that went to the urgent
 * callbacks also starts the urgent spacing, so the urgent note already in that sentence does not
 * bring her back to say it again (3.3: a second urgent note inside 10 minutes adds nothing).
 */
export function recordShow(caps: CapState, kind: MomentKind, now: number, day: string, pointsAtUrgent = false): CapState {
  const next = { ...caps }
  if (kind === 'urgent' || (kind === 'first-open' && pointsAtUrgent)) next.lastUrgent = now
  if (isOrdinary(kind)) {
    next.dayCount = countOn(caps, day) + 1
    next.countDay = day
  }
  if (kind === 'first-open') next.firstOpenDay = day
  return next
}

/** The caps after she leaves (every appearance, the asked-for one too). */
export function recordExit(caps: CapState, now: number): CapState {
  return { ...caps, lastExit: now }
}

// ---------------------------------------------------------------------------- storage

/** The Storage methods used (window.localStorage / sessionStorage, or a test double). */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const CAP_KEYS = {
  lastExit: 'katie.lastExit',
  lastUrgent: 'katie.lastUrgent',
  dayCount: 'katie.dayCount',
  firstOpenDay: 'katie.firstOpenDay',
} as const

/** The cross-tab claim when Web Locks are missing: ms when a tab put her on screen. */
export const SHOWING_KEY = 'katie.showing'
/** A claim older than this is stale (a tab closed mid-appearance); an appearance is under 15 s. */
export const SHOWING_STALE_MS = 20_000

/**
 * Where the caps live: sessionStorage in mock mode (per tab), localStorage otherwise (shared by
 * the browser's tabs). Reading the property itself can throw (blocked storage): null then.
 */
export function pickCapStorage(
  mock: boolean,
  win: { localStorage?: StorageLike; sessionStorage?: StorageLike } | null | undefined,
): StorageLike | null {
  if (!win) return null
  try {
    return (mock ? win.sessionStorage : win.localStorage) ?? null
  } catch {
    return null
  }
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function num(v: string | null): number | null {
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function parseCaps(get: (k: string) => string | null): CapState {
  const counted = get(CAP_KEYS.dayCount) ?? ''
  const m = /^(\d{4}-\d{2}-\d{2}):(\d{1,3})$/.exec(counted)
  const day = get(CAP_KEYS.firstOpenDay)
  return {
    lastExit: num(get(CAP_KEYS.lastExit)),
    lastUrgent: num(get(CAP_KEYS.lastUrgent)),
    countDay: m ? (m[1] as string) : null,
    dayCount: m ? Number(m[2]) : 0,
    firstOpenDay: day && DAY_RE.test(day) ? day : null,
  }
}

function serialise(c: CapState): Record<string, string | null> {
  return {
    [CAP_KEYS.lastExit]: c.lastExit === null ? null : String(Math.round(c.lastExit)),
    [CAP_KEYS.lastUrgent]: c.lastUrgent === null ? null : String(Math.round(c.lastUrgent)),
    [CAP_KEYS.dayCount]: c.countDay === null ? null : `${c.countDay}:${Math.max(0, Math.floor(c.dayCount))}`,
    [CAP_KEYS.firstOpenDay]: c.firstOpenDay,
  }
}

export interface CapStore {
  /** Read fresh every time (another tab may have changed them). */
  get(): CapState
  set(c: CapState): void
  reset(): void
  /** where they live now: 'storage' or 'memory' (storage missing or throwing) */
  backend(): 'storage' | 'memory'
  /** the cross-tab claim fallback (SHOWING_KEY): a timestamp, or null */
  showingAt(): number | null
  setShowing(ms: number | null): void
}

/**
 * The caps in `storage` (from pickCapStorage), every access in try/catch. A memory copy keeps
 * the last written state, so a throwing or missing storage still caps this tab.
 */
export function createCapStore(storage: StorageLike | null): CapStore {
  let memory: CapState = { ...EMPTY_CAPS }
  let showing: number | null = null
  let usable = storage !== null
  return {
    get() {
      if (!storage || !usable) return { ...memory }
      try {
        return parseCaps((k) => storage.getItem(k))
      } catch {
        usable = false
        return { ...memory }
      }
    },
    set(c) {
      memory = { ...c }
      if (!storage || !usable) return
      try {
        for (const [k, v] of Object.entries(serialise(c))) {
          if (v === null) storage.removeItem(k)
          else storage.setItem(k, v)
        }
      } catch {
        usable = false
      }
    },
    reset() {
      this.set({ ...EMPTY_CAPS })
      this.setShowing(null)
    },
    backend: () => (storage && usable ? 'storage' : 'memory'),
    showingAt() {
      if (!storage || !usable) return showing
      try {
        return num(storage.getItem(SHOWING_KEY))
      } catch {
        usable = false
        return showing
      }
    },
    setShowing(ms) {
      showing = ms === null ? null : Math.round(ms)
      if (!storage || !usable) return
      try {
        if (showing === null) storage.removeItem(SHOWING_KEY)
        else storage.setItem(SHOWING_KEY, String(showing))
      } catch {
        usable = false
      }
    },
  }
}
