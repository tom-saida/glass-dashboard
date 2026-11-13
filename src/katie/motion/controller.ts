/**
 * Katie's motion controller: every state of DESIGN.md 7.3 on top of the static rig.
 *
 *   const m = createKatieMotion(handle, wrapperEl, { heightPx: 96, bubble: bubbleEl })
 *   m.setFloor({ y: innerHeight, x0: 20, x1: innerWidth - 20 })
 *   m.enterFromRight(homeX, innerHeight)          // first load
 *   m.startIdle()                                 // breath, blink, weight shift (keeps running)
 *   await m.goTo(spotX, { y: rect.top, x0: rect.left + 20, x1: rect.right - 20 })
 *   m.present('left')                             // arm + bubble 150 ms later
 *   m.goTo(otherX, otherShelf)                    // retarget at any time, even mid-hop
 *
 * Coordinates: `x` / `y` are her FEET CENTRE in the wrapper's parent px (the fixed layer). The
 * wrapper is moved only with GSAP x / y (with `anchor`, xPercent / yPercent put the feet centre
 * on that point). Everything else is a transform on a rig <g> (KatieHandle). Nothing here reads
 * layout: positions come from gsap.getProperty, shelves are plain numbers given by the caller.
 *
 * Every animation the controller creates goes through `track()`, so pauseAll() / resumeAll()
 * (tab hidden) and destroy() reach all of them, including the idle timers.
 *
 * Reduced motion: moves fade the wrapper out (120 ms), set the position, fade in (120 ms);
 * poses are set instantly; no breath, weight shift, bob or celebrate; a blink is an instant lid
 * swap; the bubble appears with no delay or fade.
 */
import gsap from 'gsap'
import type { KatieHandle } from '../Katie'
import { groundOffset, PIVOT, REST_POSE, sideOpacity, svgOrigin, type Facing, type JointName, type Pose } from '../pose'
import { FEET, VIEW_H, VIEW_W } from '../rig'
import { gaitPose, GAIT_JOINTS } from './gait'
import { hopArc, hopDuration, planPath, walkDuration, type PathStep, type Shelf } from './path'
import { CELEBRATE, DESIGN_HEIGHT_PX, HOP, IDLE, LISTEN, PRESENT, REDUCED, REST, RISE, SINK, WALK } from './timing'

export type { Shelf, PathStep } from './path'

export interface KatieMotionOptions {
  /** CSS height of the figure; px amounts in timing.ts scale by heightPx / 96. Default 96. */
  heightPx?: number
  /** Anchor the wrapper at the feet centre (xPercent / yPercent). Default true. */
  anchor?: boolean
  /** Start in reduced-motion mode. Default: matchMedia('(prefers-reduced-motion: reduce)'). */
  reducedMotion?: boolean
  /** The speech bubble element; the controller only animates its opacity and y. */
  bubble?: HTMLElement | null
  /** The floor shelf (feet y and walkable span). Default: y 0, unbounded. */
  floor?: Shelf
  /** Pause everything while the tab is hidden (visibilitychange). Default true. */
  pauseWhenHidden?: boolean
}

export interface KatieMotionState {
  x: number
  y: number
  facing: Facing
  shelf: Shelf
  idle: boolean
  travelling: boolean
  airborne: boolean
  presenting: boolean
  listening: boolean
  celebrating: boolean
  resting: boolean
  walkingInPlace: boolean
  reducedMotion: boolean
  paused: boolean
  /** below the viewport (after sink() or hide()), or not placed yet: nothing of her shows */
  offscreen: boolean
}

export interface KatieMotion {
  /** Put her down at (x, y) on `shelf` (default: the floor if y is the floor's, else a point). */
  placeAt(x: number, y: number, shelf?: Shelf, facing?: Facing): void
  setFloor(floor: Shelf): void
  setBubble(el: HTMLElement | null): void
  startIdle(): void
  stopIdle(): void
  /** Walk along the current shelf to x (clamped to it). Resolves true on arrival, false if killed. */
  walkTo(x: number): Promise<boolean>
  /** One hop to (x, y), landing on `shelf` (default as in placeAt). */
  hopTo(x: number, y: number, shelf?: Shelf): Promise<boolean>
  /** The L-shaped route (path.ts) to x on `shelf`: walk, hop, step. */
  goTo(x: number, shelf: Shelf): Promise<boolean>
  /** Run explicit steps (from planPath or hand-made). */
  run(steps: PathStep[]): Promise<boolean>
  /** First load: start at fromX (default innerWidth + 40) on the floor and walk to homeX. */
  enterFromRight(homeX: number, floorY: number, fromX?: number): Promise<boolean>
  /**
   * Come up into view at x: wrapper y from y + RISE.px to y (the floor by default), then the
   * hop's land squash. Below the viewport's bottom edge she is hidden by it. Reduced motion: a
   * 120 ms fade in at (x, y).
   */
  rise(x: number, y?: number, shelf?: Shelf, facing?: Facing): Promise<boolean>
  /**
   * Go down out of view: wrapper y to the floor + SINK.px. Reduced motion: a 120 ms fade out.
   * `{ direct: true }` (a wave-off on a card): no hop; from where she is now straight down to the
   * floor + SINK.px over SINK.dropDur (wrapper y only, no opacity).
   */
  sink(opts?: { direct?: boolean }): Promise<boolean>
  /** Out of view now, no tween (below the floor, as after sink()). */
  hide(): void
  /** Face the card centre on `side` and extend the near arm; bubble 150 ms later. */
  present(side: 'left' | 'right'): void
  unpresent(): void
  /** Hand to the ear (held), or drop it. Facing left by default (DESIGN.md 7.3). */
  listen(on: boolean, facing?: Facing): void
  /** Bounce + double nod, then back to the prior pose. Queued while travelling. */
  celebrate(): void
  /** Eyes closed, shoulders dropped, slow breath; off wakes her with a blink. */
  rest(on: boolean): void
  /** The walk cycle without travel (playground inspection). */
  walkInPlace(on: boolean): void
  /** Kill the running path; she lands / settles where she is. The next move starts from there. */
  kill(): void
  pauseAll(): void
  resumeAll(): void
  setReducedMotion(on: boolean): void
  /** Stop every animation now and leave the rig as it is (e.g. before driving it by hand). */
  halt(): void
  /** halt() and put the rig back to rest, facing right, eyes open. */
  reset(): void
  destroy(): void
  getState(): KatieMotionState
}

type Anim = gsap.core.Animation
type Joint = JointName
type Setter = (v: number) => void

const JOINTS: readonly Joint[] = [
  'neck',
  'shoulderL',
  'elbowL',
  'wristL',
  'shoulderR',
  'elbowR',
  'wristR',
  'hipL',
  'kneeL',
  'ankleL',
  'hipR',
  'kneeR',
  'ankleR',
]
/** Joints the walk cycle drives (blending everything else in them to rest), head included. */
const GAIT_DRIVEN: readonly Joint[] = [...GAIT_JOINTS, 'wristL', 'wristR', 'neck']
const ZERO: Record<Joint, number> = Object.fromEntries(JOINTS.map((j) => [j, 0])) as Record<Joint, number>
/** Rig units per screen px at the design height: px amounts that live on rig groups. */
const U_PER_DESIGN_PX = VIEW_H / DESIGN_HEIGHT_PX

const prefersReduced = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function createKatieMotion(
  handle: KatieHandle,
  wrapper: HTMLElement | SVGElement,
  opts: KatieMotionOptions = {},
): KatieMotion {
  const heightPx = opts.heightPx ?? DESIGN_HEIGHT_PX
  /** screen px per design px (1 at 96 px) */
  const S = heightPx / DESIGN_HEIGHT_PX
  let reduced = opts.reducedMotion ?? prefersReduced()
  let bubble: HTMLElement | null = opts.bubble ?? null
  let floor: Shelf = opts.floor ?? { y: 0, x0: -1e6, x1: 1e6 }
  let shelf: Shelf = floor

  const el = (j: Joint): SVGGElement => (j === 'neck' ? handle.head : handle[j])

  // ---- animation bookkeeping -------------------------------------------------------------
  const live = new Set<Anim>()
  let pausedAnims: Anim[] = []
  let paused = false
  function track<T extends Anim>(a: T): T {
    if (live.size > 48) for (const x of live) if (x.totalProgress() >= 1 && !x.paused()) live.delete(x)
    live.add(a)
    if (paused) {
      a.pause()
      pausedAnims.push(a)
    }
    return a
  }
  function drop(a: Anim | null | undefined) {
    if (!a) return
    a.kill()
    live.delete(a)
  }

  // ---- setters (written every frame by the proxy-driven loops) ----------------------------
  const rot = Object.fromEntries(JOINTS.map((j) => [j, gsap.quickSetter(el(j), 'rotation') as Setter])) as Record<
    Joint,
    Setter
  >
  const setBodyY = gsap.quickSetter(handle.body, 'y') as Setter
  const setTorsoY = gsap.quickSetter(handle.torso, 'y') as Setter
  const setOpacity = {
    sideL: gsap.quickSetter(handle.sideL, 'opacity') as Setter,
    sideR: gsap.quickSetter(handle.sideR, 'opacity') as Setter,
    tabL: gsap.quickSetter(handle.tabL, 'opacity') as Setter,
    tabR: gsap.quickSetter(handle.tabR, 'opacity') as Setter,
  }
  const getRot = (j: Joint) => Number(gsap.getProperty(el(j), 'rotation')) || 0
  const sides = (sl: number, sr: number) => {
    const oL = sideOpacity('L', sl)
    const oR = sideOpacity('R', sr)
    setOpacity.sideL(oL)
    setOpacity.tabL(1 - oL)
    setOpacity.sideR(oR)
    setOpacity.tabR(1 - oR)
  }

  // chest: breath (0..1 of IDLE.breathU up) and the rest drop (rig units down) share torso y
  const chest = { breath: 0, drop: 0 }
  const renderChest = () => setTorsoY(chest.drop - IDLE.breathU * chest.breath)
  // eyes: 1 open .. 0 closed
  const eyes = { v: 1 }
  const renderEyes = () => handle.setEyes(eyes.v)

  // ---- wrapper ---------------------------------------------------------------------------
  if (opts.anchor ?? true) gsap.set(wrapper, { xPercent: -(FEET[0] / VIEW_W) * 100, yPercent: -100 })
  const pos = () => ({
    x: Number(gsap.getProperty(wrapper, 'x')) || 0,
    y: Number(gsap.getProperty(wrapper, 'y')) || 0,
  })

  // ---- facing ----------------------------------------------------------------------------
  let facing: Facing = Number(gsap.getProperty(handle.facing, 'scaleX')) < 0 ? 'left' : 'right'
  function setFacing(f: Facing) {
    if (f === facing) return
    facing = f
    gsap.set(handle.facing, { scaleX: f === 'left' ? -1 : 1, svgOrigin: svgOrigin(PIVOT.facing) })
  }

  /** A timeline tweening joint rotations (and keeping the side strokes in step). */
  function poseTl(p: Partial<Record<Joint, number>>, dur: number, ease: string): gsap.core.Timeline {
    const tl = gsap.timeline()
    const keys = Object.keys(p) as Joint[]
    for (const j of keys) {
      if (dur <= 0 || reduced) tl.set(el(j), { rotation: p[j] }, 0)
      else tl.to(el(j), { rotation: p[j], duration: dur, ease }, 0)
    }
    if (keys.some((k) => k === 'shoulderL' || k === 'shoulderR')) {
      tl.eventCallback('onUpdate', () => handle.syncSides())
      tl.call(() => handle.syncSides())
    }
    return tl
  }

  // ---- bubble ----------------------------------------------------------------------------
  let bubbleTl: Anim | null = null
  function showBubble(delay: number) {
    if (!bubble) return
    drop(bubbleTl)
    if (reduced) {
      gsap.set(bubble, { autoAlpha: 1, y: 0 })
      return
    }
    bubbleTl = track(
      gsap.fromTo(
        bubble,
        { autoAlpha: 0, y: PRESENT.bubbleRisePx * S },
        { autoAlpha: 1, y: 0, duration: PRESENT.bubbleIn, delay, ease: PRESENT.bubbleEase },
      ),
    )
  }
  function hideBubble() {
    if (!bubble) return
    drop(bubbleTl)
    bubbleTl = null
    if (reduced || Number(gsap.getProperty(bubble, 'opacity')) === 0) {
      gsap.set(bubble, { autoAlpha: 0 })
      return
    }
    bubbleTl = track(gsap.to(bubble, { autoAlpha: 0, duration: PRESENT.bubbleOut, ease: 'power1.out' }))
  }
  if (bubble) gsap.set(bubble, { autoAlpha: 0 })

  // ---- flags -----------------------------------------------------------------------------
  let idleOn = false
  let resting = false
  let listening = false
  let presenting = false
  let celebrating = false
  let inPlace = false
  let pendingCelebrate = false
  let pending: (() => void) | null = null
  let offscreen = false

  // ---- idle: breath ----------------------------------------------------------------------
  let breathTl: Anim | null = null
  function startBreath(period: number) {
    drop(breathTl)
    breathTl = null
    if (reduced) {
      chest.breath = 0
      renderChest()
      return
    }
    const half = period / 2
    const tl = gsap.timeline()
    if (chest.breath > 0.01)
      tl.to(chest, { breath: 0, duration: chest.breath * half, ease: IDLE.breathEase, onUpdate: renderChest })
    tl.to(chest, { breath: 1, duration: half, ease: IDLE.breathEase, yoyo: true, repeat: -1, onUpdate: renderChest })
    breathTl = track(tl)
  }
  function stopBreath() {
    drop(breathTl)
    breathTl = null
    if (chest.breath > 0 && !reduced)
      breathTl = track(gsap.to(chest, { breath: 0, duration: 0.2, ease: 'power1.out', onUpdate: renderChest }))
    else {
      chest.breath = 0
      renderChest()
    }
  }

  // ---- idle: blink -----------------------------------------------------------------------
  let blinkTimer: Anim | null = null
  let blinkTl: Anim | null = null
  function blink() {
    drop(blinkTl)
    if (reduced) {
      eyes.v = 0
      renderEyes()
      blinkTl = track(
        gsap.delayedCall(REDUCED.blinkHold, () => {
          eyes.v = 1
          renderEyes()
        }),
      )
      return
    }
    blinkTl = track(
      gsap
        .timeline()
        .to(eyes, { v: 0, duration: IDLE.blinkClose, ease: 'power1.in', onUpdate: renderEyes })
        .to(eyes, { v: 1, duration: IDLE.blinkOpen, ease: 'power1.out', onUpdate: renderEyes }, `+=${IDLE.blinkHold}`),
    )
  }
  function scheduleBlink() {
    drop(blinkTimer)
    blinkTimer = null
    if (!idleOn || resting) return
    blinkTimer = track(
      gsap.delayedCall(gsap.utils.random(IDLE.blinkEvery[0], IDLE.blinkEvery[1]), () => {
        blink()
        scheduleBlink()
      }),
    )
  }

  // ---- idle: weight shift ----------------------------------------------------------------
  let shiftTimer: Anim | null = null
  let shiftTl: Anim | null = null
  function scheduleShift() {
    drop(shiftTimer)
    shiftTimer = null
    if (!idleOn || reduced) return
    const wait = IDLE.shiftEvery + gsap.utils.random(-IDLE.shiftJitter, IDLE.shiftJitter)
    shiftTimer = track(
      gsap.delayedCall(wait, () => {
        doShift()
        scheduleShift()
      }),
    )
  }
  function doShift() {
    if (path || gaitOn() || listening || celebrating || resting || reduced) return
    drop(shiftTl)
    const dir = Math.random() < 0.5 ? -1 : 1
    const e = IDLE.shiftEase
    shiftTl = track(
      gsap
        .timeline()
        .to(handle.hips, { x: dir * IDLE.shiftU, duration: IDLE.shiftIn, ease: e }, 0)
        .to(handle.body, { rotation: -dir * IDLE.shiftLean, duration: IDLE.shiftIn, ease: e }, 0)
        .to(handle.hips, { x: 0, duration: IDLE.shiftOut, ease: e }, IDLE.shiftIn + IDLE.shiftHold)
        .to(handle.body, { rotation: 0, duration: IDLE.shiftOut, ease: e }, IDLE.shiftIn + IDLE.shiftHold),
    )
  }
  function stopShift() {
    drop(shiftTl)
    shiftTl = null
    const hx = Number(gsap.getProperty(handle.hips, 'x')) || 0
    const lean = Number(gsap.getProperty(handle.body, 'rotation')) || 0
    if (hx === 0 && lean === 0) return
    if (reduced) gsap.set([handle.hips, handle.body], { x: 0, rotation: 0 })
    else
      shiftTl = track(
        gsap
          .timeline()
          .to(handle.hips, { x: 0, duration: WALK.settle, ease: 'power1.out' }, 0)
          .to(handle.body, { rotation: 0, duration: WALK.settle, ease: 'power1.out' }, 0),
      )
  }

  // ---- walk cycle (a phase proxy driving the joints through quickSetters) -----------------
  const gait = { phase: 0.25, amp: 0 }
  let gaitFrom: Record<Joint, number> = { ...ZERO }
  let gaitTween: Anim | null = null
  let ampTween: Anim | null = null
  const gaitOn = () => gaitTween !== null
  const blended: Partial<Pose> = {}
  function renderGait() {
    const g = gaitPose(gait.phase)
    const a = gait.amp
    for (const j of GAIT_DRIVEN) {
      const target = (g as Partial<Record<Joint, number>>)[j] ?? 0
      const v = gaitFrom[j] * (1 - a) + target * a
      blended[j] = v
      rot[j](v)
    }
    // feet on the shelf in every frame: this is the bob (deepest at the two contacts)
    setBodyY(groundOffset(blended))
    sides(blended.shoulderL ?? 0, blended.shoulderR ?? 0)
  }
  function startGait() {
    if (reduced) return
    drop(armTl)
    armTl = null
    if (gaitTween) {
      // already walking (a retarget): blend back in if it was settling
      drop(ampTween)
      ampTween = track(gsap.to(gait, { amp: 1, duration: WALK.blendIn, ease: 'power1.out', onUpdate: renderGait }))
      return
    }
    for (const j of GAIT_DRIVEN) gaitFrom[j] = getRot(j)
    gait.phase = 0.25 // passing: hips at 0, so the legs leave the standing pose without a jump
    gait.amp = 0
    gaitTween = track(
      gsap.to(gait, { phase: 1.25, duration: WALK.cycle, ease: 'none', repeat: -1, onUpdate: renderGait }),
    )
    ampTween = track(gsap.to(gait, { amp: 1, duration: WALK.blendIn, ease: 'power1.out', onUpdate: renderGait }))
  }
  /** Stop the cycle: settle to the standing pose in 150 ms, or cut it now (a hop takes over). */
  function stopGait(settle: boolean) {
    if (!gaitTween) return
    drop(ampTween)
    ampTween = null
    if (!settle) {
      drop(gaitTween)
      gaitTween = null
      return
    }
    gaitFrom = { ...ZERO }
    ampTween = track(
      gsap.to(gait, {
        amp: 0,
        duration: WALK.settle,
        ease: 'power1.inOut',
        onUpdate: renderGait,
        onComplete: () => {
          renderGait()
          drop(gaitTween)
          gaitTween = null
          ampTween = null
        },
      }),
    )
  }

  // ---- arm poses (present / listen) ------------------------------------------------------
  let armTl: Anim | null = null
  /** Tween to a standing pose: every joint at rest except those in `p`; body back on its feet. */
  function armTo(p: Partial<Record<Joint, number>>, dur: number, ease: string) {
    drop(armTl)
    const tl = poseTl({ ...ZERO, ...p }, dur, ease)
    if (Number(gsap.getProperty(handle.body, 'y')) !== 0 && !celebrating) {
      if (dur <= 0 || reduced) tl.set(handle.body, { y: 0 }, 0)
      else tl.to(handle.body, { y: 0, duration: dur, ease }, 0)
    }
    armTl = track(tl)
  }

  // ---- celebrate -------------------------------------------------------------------------
  let celebrateTl: Anim | null = null
  function cancelCelebrate() {
    if (!celebrateTl) return
    drop(celebrateTl)
    celebrateTl = null
    celebrating = false
    gsap.set(handle.body, { y: 0, scaleX: 1, scaleY: 1 })
    gsap.set(handle.head, { y: 0 })
  }

  // ---- paths -----------------------------------------------------------------------------
  let path: gsap.core.Timeline | null = null
  let settle: (ok: boolean) => void = () => undefined
  /** Set while she is in the air: where the current hop lands. */
  let air: { x: number; y: number; shelf: Shelf } | null = null

  function killPath() {
    if (!path) return
    drop(path)
    path = null
    const s = settle
    settle = () => undefined
    s(false)
  }

  const defaultShelf = (x: number, y: number): Shelf => (Math.abs(y - floor.y) < 1 ? floor : { y, x0: x, x1: x })

  function onArrive() {
    if (pendingCelebrate) {
      pendingCelebrate = false
      celebrate()
    }
    const p = pending
    pending = null
    p?.()
  }

  type Step = PathStep | { kind: 'fall'; x: number; y: number; shelf: Shelf }

  function run(input: PathStep[]): Promise<boolean> {
    killPath()
    offscreen = false
    let steps: Step[] = input
    // retarget mid-air: first come down where the current hop was going, then go on from there
    if (air) steps = [{ kind: 'fall', ...air }, ...input]
    if (resting) rest(false)
    if (presenting) {
      presenting = false
      hideBubble()
    } else hideBubble()
    listening = false
    inPlace = false
    cancelCelebrate()
    drop(armTl)
    armTl = null
    stopShift()

    return new Promise<boolean>((resolve) => {
      settle = resolve
      const tl = gsap.timeline({
        onComplete: () => {
          if (path !== tl) return
          live.delete(tl)
          path = null
          settle = () => undefined
          resolve(true)
          onArrive()
        },
      })
      path = tl
      track(tl)

      if (reduced) {
        const last = steps[steps.length - 1]
        if (!last) {
          // already there: make sure she is visible (a killed fade-in can leave her part-faded)
          tl.set(wrapper, { opacity: 1 }, 0)
          return
        }
        const from = pos()
        const endShelf = [...steps].reverse().find((s) => s.kind !== 'walk') as Extract<Step, { shelf: Shelf }> | undefined
        tl.to(wrapper, { opacity: 0, duration: REDUCED.fade, ease: 'none' })
        tl.call(() => {
          if (Math.abs(last.x - from.x) >= 1) setFacing(last.x < from.x ? 'left' : 'right')
          gsap.set(wrapper, { x: last.x, y: last.y })
          air = null
          if (endShelf) shelf = endShelf.shelf
          gsap.set(handle.body, { y: 0, scaleX: 1, scaleY: 1 })
          handle.setPose(REST_POSE)
          renderChest()
        })
        tl.to(wrapper, { opacity: 1, duration: REDUCED.fade, ease: 'none' })
        return
      }

      // a killed path can leave the body squashed or a crouch pose behind
      const sx = Number(gsap.getProperty(handle.body, 'scaleX'))
      const sy = Number(gsap.getProperty(handle.body, 'scaleY'))
      if (sx !== 1 || sy !== 1) tl.to(handle.body, { scaleX: 1, scaleY: 1, duration: 0.1, ease: 'power1.out' }, 0)

      let cur = pos()
      steps.forEach((step, i) => {
        if (step.kind === 'walk') {
          const dx = step.x - cur.x
          const dur = walkDuration(dx / S, WALK.speedPx, WALK.minDur, WALK.maxDur)
          tl.call(() => {
            if (Math.abs(dx) >= 0.5) setFacing(dx < 0 ? 'left' : 'right')
            startGait()
          })
          tl.to(wrapper, { x: step.x, duration: dur, ease: WALK.travelEase })
          cur = { x: step.x, y: cur.y }
          return
        }
        const dx = step.x - cur.x
        const label = `air${i}`
        if (step.kind === 'fall') {
          // finish an interrupted hop: straight down to its landing point
          tl.call(() => stopGait(false))
          tl.add(poseTl({ ...ZERO }, 0.12, 'power1.in'), label)
          tl.to(wrapper, { x: step.x, y: step.y, duration: 0.15, ease: HOP.downEase }, label)
        } else {
          const air_ = hopDuration((step.y - cur.y) / S, HOP.airBase, HOP.airPerPx, HOP.airMin, HOP.airMax)
          const [apexY, tUp] = hopArc(cur.y, step.y, air_, HOP.apexPx * S, heightPx)
          const tDown = air_ - tUp
          tl.call(() => {
            if (Math.abs(dx) >= 1) setFacing(dx < 0 ? 'left' : 'right')
            stopGait(false)
          })
          // crouch
          tl.add(poseTl({ ...ZERO, kneeL: HOP.crouchKnee, kneeR: HOP.crouchKnee }, HOP.crouch, HOP.crouchEase))
          tl.to(handle.body, { scaleY: HOP.crouchScaleY, y: 0, duration: HOP.crouch, ease: HOP.crouchEase }, '<')
          // air: x linear, y up to the apex (power2.out) and down (power2.in)
          tl.addLabel(label)
          tl.call(() => {
            air = { x: step.x, y: step.y, shelf: step.shelf }
          }, undefined, label)
          tl.to(wrapper, { x: step.x, duration: air_, ease: 'none' }, label)
          tl.to(wrapper, { y: apexY, duration: tUp, ease: HOP.upEase }, label)
          tl.to(wrapper, { y: step.y, duration: tDown, ease: HOP.downEase }, `${label}+=${tUp}`)
          tl.to(handle.body, { scaleY: 1, duration: HOP.crouch, ease: 'power1.out' }, label)
          const tuck = Math.min(0.12, tUp)
          const untuck = Math.min(0.12, tDown)
          tl.add(
            poseTl({ hipL: HOP.flightHip, hipR: HOP.flightHip, kneeL: HOP.flightKnee, kneeR: HOP.flightKnee }, tuck, 'power1.out'),
            label,
          )
          tl.add(poseTl({ hipL: 0, hipR: 0, kneeL: 0, kneeR: 0 }, untuck, 'power1.in'), `${label}+=${air_ - untuck}`)
        }
        // land: squash, then back to 1
        tl.call(() => {
          air = null
          shelf = step.shelf
        })
        tl.to(handle.body, { scaleY: HOP.landScaleY, scaleX: HOP.landScaleX, duration: HOP.land, ease: 'power1.out' })
        tl.to(handle.body, { scaleY: 1, scaleX: 1, duration: HOP.recover, ease: HOP.recoverEase })
        cur = { x: step.x, y: step.y }
      })
      // arrival: the cycle settles to the standing pose in 150 ms
      tl.call(() => stopGait(true))
      tl.to({}, { duration: WALK.settle })
    })
  }

  // ---- public ----------------------------------------------------------------------------
  function placeAt(x: number, y: number, s?: Shelf, f?: Facing) {
    killPath()
    air = null
    offscreen = false
    gsap.set(wrapper, { x, y, opacity: 1 })
    shelf = s ?? defaultShelf(x, y)
    if (f) setFacing(f)
  }

  function walkTo(x: number) {
    const lo = Math.min(shelf.x0, shelf.x1)
    const hi = Math.max(shelf.x0, shelf.x1)
    const tx = Math.min(hi, Math.max(lo, x))
    const p = air ? { x: air.x, y: air.y } : pos()
    const y = air ? air.y : shelf.y
    return run(Math.abs(tx - p.x) >= 0.5 ? [{ kind: 'walk', x: tx, y }] : [])
  }

  function hopTo(x: number, y: number, s?: Shelf) {
    return run([{ kind: 'hop', x, y, shelf: s ?? defaultShelf(x, y) }])
  }

  function goTo(x: number, target: Shelf) {
    const from = air ? { x: air.x, y: air.y } : pos()
    const on = air ? air.shelf : shelf
    const toFloor = Math.abs(target.y - floor.y) < 1
    return run(planPath(from, on, { x, shelf: target }, { step: HOP.stepPx * S, toFloor }))
  }

  function enterFromRight(homeX: number, floorY: number, fromX?: number) {
    if (Math.abs(floor.y - floorY) >= 1) floor = { ...floor, y: floorY }
    const start = fromX ?? (typeof window !== 'undefined' ? window.innerWidth : 0) + 40 * S
    placeAt(start, floorY, floor, 'left')
    return run([{ kind: 'walk', x: homeX, y: floorY }])
  }

  /** Clears poses and flags before a rise or a sink (what run() does before a path). */
  function clearForMove() {
    killPath()
    air = null
    if (resting) rest(false)
    presenting = false
    hideBubble()
    listening = false
    inPlace = false
    pendingCelebrate = false
    pending = null
    cancelCelebrate()
    drop(armTl)
    armTl = null
    stopShift()
    stopGait(false)
  }

  /** A path-like timeline (killPath / kill / pause reach it); resolves true when it completes. */
  function moveTl(build: (tl: gsap.core.Timeline) => void, after?: () => void): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      settle = resolve
      const tl = gsap.timeline({
        onComplete: () => {
          if (path !== tl) return
          live.delete(tl)
          path = null
          settle = () => undefined
          after?.()
          resolve(true)
          onArrive()
        },
      })
      path = tl
      track(tl)
      build(tl)
    })
  }

  function rise(x: number, y: number = floor.y, s?: Shelf, f?: Facing) {
    clearForMove()
    offscreen = false
    shelf = s ?? defaultShelf(x, y)
    if (f) setFacing(f)
    gsap.set(handle.body, { y: 0, scaleX: 1, scaleY: 1 })
    handle.setPose(REST_POSE)
    renderChest()
    if (reduced) {
      gsap.set(wrapper, { x, y, opacity: 0 })
      return moveTl((tl) => {
        tl.to(wrapper, { opacity: 1, duration: REDUCED.fade, ease: 'none' })
      })
    }
    gsap.set(wrapper, { x, y: y + RISE.px * S, opacity: 1 })
    return moveTl((tl) => {
      tl.to(wrapper, { y, duration: RISE.dur, ease: RISE.ease })
      tl.to(handle.body, { scaleY: HOP.landScaleY, scaleX: HOP.landScaleX, duration: HOP.land, ease: 'power1.out' })
      tl.to(handle.body, { scaleY: 1, scaleX: 1, duration: HOP.recover, ease: HOP.recoverEase })
    })
  }

  function sink(opts?: { direct?: boolean }) {
    const wasAir = air
    clearForMove()
    const direct = !!opts?.direct && !reduced
    // a sink mid-hop starts from where the hop was landing (a direct drop leaves her where she is)
    if (wasAir && !direct) gsap.set(wrapper, { x: wasAir.x, y: wasAir.y })
    const done = () => {
      offscreen = true
      shelf = floor
      gsap.set(wrapper, { y: floor.y + SINK.px * S, opacity: 1 })
    }
    if (direct) {
      // 3.9: transforms only; she drops from the card she stands on straight out of view
      armTo({ ...ZERO }, SINK.dropDur, 'power1.in')
      gsap.set(handle.body, { scaleX: 1, scaleY: 1 })
      return moveTl((tl) => {
        tl.to(wrapper, { y: floor.y + SINK.px * S, duration: SINK.dropDur, ease: SINK.dropEase })
      }, done)
    }
    if (reduced) {
      return moveTl((tl) => {
        tl.to(wrapper, { opacity: 0, duration: REDUCED.fade, ease: 'none' })
      }, done)
    }
    // arms down while she goes (poses are relative to rest, so the sink reads as one move)
    armTo({ ...ZERO }, SINK.dur, 'power1.in')
    gsap.set(handle.body, { scaleX: 1, scaleY: 1 })
    return moveTl((tl) => {
      tl.to(wrapper, { y: floor.y + SINK.px * S, duration: SINK.dur, ease: SINK.ease })
    }, done)
  }

  function hide() {
    clearForMove()
    drop(armTl)
    armTl = null
    offscreen = true
    shelf = floor
    gsap.set(handle.body, { y: 0, scaleX: 1, scaleY: 1 })
    handle.setPose(REST_POSE)
    gsap.set(wrapper, { y: floor.y + SINK.px * S, opacity: 1 })
  }

  function startIdle() {
    idleOn = true
    startBreath(resting ? REST.breathPeriod : IDLE.breathPeriod)
    scheduleBlink()
    scheduleShift()
  }

  function stopIdle() {
    idleOn = false
    drop(blinkTimer)
    blinkTimer = null
    drop(shiftTimer)
    shiftTimer = null
    stopBreath()
    stopShift()
  }

  function present(side: 'left' | 'right') {
    if (path) {
      pending = () => present(side)
      return
    }
    presenting = true
    listening = false
    inPlace = false
    stopGait(false)
    setFacing(side)
    armTo(
      { shoulderR: PRESENT.shoulder, elbowR: PRESENT.elbow, wristR: PRESENT.wrist, neck: PRESENT.neck, shoulderL: 0, elbowL: 0, wristL: 0 },
      PRESENT.arm,
      PRESENT.armEase,
    )
    showBubble(PRESENT.bubbleDelay)
  }

  function unpresent() {
    if (pending) pending = null
    presenting = false
    hideBubble()
    if (path || gaitOn()) return
    armTo({ shoulderR: 0, elbowR: 0, wristR: 0, neck: 0 }, PRESENT.arm, PRESENT.armBackEase)
  }

  function listen(on: boolean, f: Facing = 'left') {
    if (on) {
      if (path) {
        pending = () => listen(true, f)
        return
      }
      listening = true
      presenting = false
      inPlace = false
      stopGait(false)
      stopShift()
      setFacing(f)
      armTo(
        { shoulderR: LISTEN.shoulder, elbowR: LISTEN.elbow, wristR: LISTEN.wrist, neck: LISTEN.neck, shoulderL: 0, elbowL: 0, wristL: 0 },
        LISTEN.in,
        LISTEN.ease,
      )
      return
    }
    if (!listening) return
    listening = false
    armTo({ shoulderR: 0, elbowR: 0, wristR: 0, neck: 0 }, LISTEN.out, LISTEN.ease)
  }

  function celebrate() {
    if (reduced) return
    if (path) {
      pendingCelebrate = true
      return
    }
    if (celebrating) return
    celebrating = true
    stopShift()
    // The nod is the full 4 deg inside the art's neck limit (pose.ts: -5..5). While listening the
    // head already sits at 3 deg toward the hand, so the nod runs from a base that leaves room
    // (3 -> 1, during the bounce up) and the head goes back to neck0 at the end.
    const neck0 = getRot('neck')
    const NECK_MAX = 5
    const base = Math.min(neck0, NECK_MAX - CELEBRATE.nod)
    const nodTo = base + CELEBRATE.nod
    const bounceU = (CELEBRATE.bouncePx * U_PER_DESIGN_PX)
    const tl = gsap.timeline({
      onComplete: () => {
        celebrating = false
        live.delete(tl)
        celebrateTl = null
      },
    })
    tl.to(handle.body, { y: -bounceU, duration: CELEBRATE.up, ease: CELEBRATE.upEase })
    if (base !== neck0) tl.to(handle.head, { rotation: base, duration: CELEBRATE.up, ease: 'power1.inOut' }, 0)
    tl.to(handle.body, { y: 0, duration: CELEBRATE.down, ease: CELEBRATE.downEase })
    tl.addLabel('land')
    tl.to(handle.body, { scaleY: HOP.landScaleY, scaleX: HOP.landScaleX, duration: HOP.land, ease: 'power1.out' })
    tl.to(handle.body, { scaleY: 1, scaleX: 1, duration: HOP.recover, ease: HOP.recoverEase })
    let t = 0
    for (let n = 0; n < 2; n++) {
      tl.to(handle.head, { rotation: nodTo, y: CELEBRATE.nodDipU, duration: CELEBRATE.nodDown, ease: 'power1.inOut' }, `land+=${t}`)
      t += CELEBRATE.nodDown
      const back = n === 1 ? neck0 : base
      tl.to(handle.head, { rotation: back, y: 0, duration: CELEBRATE.nodUp, ease: 'power1.inOut' }, `land+=${t}`)
      t += CELEBRATE.nodUp
    }
    celebrateTl = track(tl)
  }

  let restTl: Anim | null = null
  function rest(on: boolean) {
    if (on === resting) return
    drop(restTl)
    restTl = null
    if (on) {
      resting = true
      drop(blinkTimer)
      blinkTimer = null
      drop(blinkTl)
      blinkTl = null
      stopShift()
      if (reduced) {
        eyes.v = 0
        chest.drop = REST.dropU
        renderEyes()
        renderChest()
      } else
        restTl = track(
          gsap
            .timeline()
            .to(eyes, { v: 0, duration: REST.lids, ease: 'sine.inOut', onUpdate: renderEyes }, 0)
            .to(chest, { drop: REST.dropU, duration: REST.drop, ease: REST.dropEase, onUpdate: renderChest }, 0),
        )
      if (idleOn) startBreath(REST.breathPeriod)
      return
    }
    resting = false
    if (reduced) {
      eyes.v = 1
      chest.drop = 0
      renderEyes()
      renderChest()
      blink()
    } else {
      // lids open in 120 ms, then one blink; shoulders up in 300 ms
      restTl = track(
        gsap
          .timeline()
          .to(eyes, { v: 1, duration: REST.wakeLids, ease: 'power1.out', onUpdate: renderEyes }, 0)
          .to(chest, { drop: 0, duration: REST.wakeUp, ease: 'power1.out', onUpdate: renderChest }, 0)
          .to(eyes, { v: 0, duration: IDLE.blinkClose, ease: 'power1.in', onUpdate: renderEyes }, REST.wakeLids + 0.05)
          .to(eyes, { v: 1, duration: IDLE.blinkOpen, ease: 'power1.out', onUpdate: renderEyes }, `>+${IDLE.blinkHold}`),
      )
    }
    if (idleOn) {
      startBreath(IDLE.breathPeriod)
      scheduleBlink()
      scheduleShift()
    }
  }

  function walkInPlace(on: boolean) {
    if (on) {
      if (path || reduced) return
      inPlace = true
      presenting = false
      listening = false
      hideBubble()
      stopShift()
      startGait()
    } else {
      inPlace = false
      stopGait(true)
    }
  }

  function kill() {
    const wasAir = air
    killPath()
    if (wasAir) {
      // land where the hop was going rather than hang in the air
      air = wasAir
      void run([])
      return
    }
    pendingCelebrate = false
    pending = null
    if (gaitOn()) stopGait(true)
    else if (!reduced) {
      const sx = Number(gsap.getProperty(handle.body, 'scaleX'))
      const sy = Number(gsap.getProperty(handle.body, 'scaleY'))
      if (sx !== 1 || sy !== 1) track(gsap.to(handle.body, { scaleX: 1, scaleY: 1, duration: 0.1 }))
      if (!presenting && !listening) armTo({ ...ZERO }, WALK.settle, 'power1.out')
    }
  }

  function pauseAll() {
    if (paused) return
    paused = true
    pausedAnims = []
    for (const a of live) {
      if (a.totalProgress() >= 1 && a.repeat() === 0) {
        live.delete(a)
        continue
      }
      if (!a.paused()) {
        a.pause()
        pausedAnims.push(a)
      }
    }
  }

  function resumeAll() {
    if (!paused) return
    paused = false
    for (const a of pausedAnims) if (live.has(a)) a.resume()
    pausedAnims = []
  }

  function halt() {
    killPath()
    for (const a of live) a.kill()
    live.clear()
    pausedAnims = []
    paused = false
    breathTl = blinkTimer = blinkTl = shiftTimer = shiftTl = armTl = celebrateTl = restTl = bubbleTl = null
    gaitTween = ampTween = null
    idleOn = resting = listening = presenting = celebrating = inPlace = false
    pendingCelebrate = false
    pending = null
    air = null
    chest.breath = 0
    chest.drop = 0
    eyes.v = 1
  }

  function reset() {
    halt()
    handle.setPose({}, 'right')
    handle.setEyes(1)
    facing = 'right'
    gsap.set(handle.head, { y: 0 })
    gsap.set(handle.body, { scaleX: 1, scaleY: 1 })
    if (bubble) gsap.set(bubble, { autoAlpha: 0 })
    gsap.set(wrapper, { opacity: 1 })
  }

  function setReducedMotion(on: boolean) {
    if (on === reduced) return
    reduced = on
    if (on) {
      stopGait(false)
      inPlace = false
      drop(shiftTl)
      shiftTl = null
      gsap.set([handle.hips, handle.body], { x: 0, rotation: 0 })
      gsap.set(handle.body, { y: 0 })
    }
    if (idleOn) startIdle()
  }

  const onVisibility = () => (document.hidden ? pauseAll() : resumeAll())
  const bindVisibility = (opts.pauseWhenHidden ?? true) && typeof document !== 'undefined'
  if (bindVisibility) document.addEventListener('visibilitychange', onVisibility)

  function destroy() {
    halt()
    if (bindVisibility) document.removeEventListener('visibilitychange', onVisibility)
  }

  return {
    placeAt,
    setFloor: (f) => {
      const onFloor = shelf === floor
      floor = f
      if (onFloor) shelf = f
    },
    setBubble: (b) => {
      bubble = b
      if (b) gsap.set(b, { autoAlpha: 0 })
    },
    startIdle,
    stopIdle,
    walkTo,
    hopTo,
    goTo,
    run,
    enterFromRight,
    rise,
    sink,
    hide,
    present,
    unpresent,
    listen,
    celebrate,
    rest,
    walkInPlace,
    kill,
    pauseAll,
    resumeAll,
    setReducedMotion,
    halt,
    reset,
    destroy,
    getState: () => {
      const p = pos()
      return {
        x: p.x,
        y: p.y,
        facing,
        shelf,
        idle: idleOn,
        travelling: path !== null,
        airborne: air !== null,
        presenting,
        listening,
        celebrating,
        resting,
        walkingInPlace: inPlace,
        reducedMotion: reduced,
        paused,
        offscreen,
      }
    },
  }
}
