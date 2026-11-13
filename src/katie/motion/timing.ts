/**
 * Every timing, easing and amplitude of Katie's motion, straight from DESIGN.md 7.3 (section in
 * brackets). Seconds, degrees, and either rig units (`U`, 1544 = her height, scale-free) or
 * screen px at the 96 px figure (`PX`, multiplied by height / 96 for a larger figure).
 * Nothing else in src/katie/motion hard-codes a motion number.
 */

/** Katie's design height; every PX value below is at this height. */
export const DESIGN_HEIGHT_PX = 96

export const IDLE = {
  /** breath: torso + head + arms up 32 U (2 px), 3.0 s loop, sine.inOut, yoyo */
  breathU: 32,
  breathPeriod: 3.0,
  breathEase: 'sine.inOut',
  /** blink: close 60 ms, hold 40 ms, open 80 ms; next blink a random 3-6 s later */
  blinkClose: 0.06,
  blinkHold: 0.04,
  blinkOpen: 0.08,
  blinkEvery: [3, 6] as const,
  /** weight shift: pelvis + legs x +-32 U, whole body rotation +-1 deg at the feet */
  shiftU: 32,
  shiftLean: 1,
  shiftEvery: 10,
  shiftJitter: 2,
  shiftIn: 0.6,
  shiftHold: 2,
  shiftOut: 0.6,
  shiftEase: 'power1.inOut',
} as const

export const WALK = {
  /** one full two-leg cycle (two contacts) */
  cycle: 0.55,
  hip: 25,
  /** the trailing knee bends 0 -> 20 deg (contact value tuned to 16 in pose.ts PRESETS.walkA) */
  kneeContact: 16,
  kneePeak: 20,
  /** ankles at contact (pose.ts walk presets): leading 12, trailing 6 */
  ankleLead: 12,
  ankleTrail: 6,
  arm: 15,
  elbow: -10,
  /** nominal body bob at each contact (3 px). Not applied directly: the controller lowers the
   *  body by groundOffset(pose) every frame so the soles stay on the shelf, which measures 54 U
   *  (3.4 px) at the contacts and about -6 U at passing (Playwright, 2026-10-12). */
  bobU: 48,
  /** travel: duration = clamp(dist / speed, min, max), power1.inOut */
  speedPx: 420,
  minDur: 0.25,
  maxDur: 1.4,
  travelEase: 'power1.inOut',
  /** the cycle blends in on start and settles to the standing pose on arrival */
  blendIn: 0.15,
  settle: 0.15,
} as const

export const HOP = {
  crouch: 0.08,
  crouchScaleY: 0.94,
  crouchKnee: 15,
  crouchEase: 'power1.out',
  /** air time = clamp(base + |dy| / perPx, min, max) s */
  airBase: 0.25,
  airPerPx: 2000,
  airMin: 0.25,
  airMax: 0.45,
  /** apex = min(startY, endY) - 40 px */
  apexPx: 40,
  upEase: 'power2.out',
  downEase: 'power2.in',
  flightHip: -15,
  flightKnee: 30,
  landScaleY: 0.92,
  landScaleX: 1.04,
  land: 0.09,
  recover: 0.12,
  recoverEase: 'power2.out',
  /** the final step from the landing point to the spot is at most 24 px */
  stepPx: 24,
} as const

export const PRESENT = {
  /** near arm (rig R once she faces the card) and a slight head turn; pose.ts PRESETS.present */
  shoulder: -70,
  elbow: -20,
  wrist: -25,
  neck: -2,
  arm: 0.25,
  armEase: 'power2.out',
  armBackEase: 'power2.inOut',
  /** bubble: 150 ms after arrival, opacity 0 -> 1 and y 4 -> 0 px over 150 ms */
  bubbleDelay: 0.15,
  bubbleIn: 0.15,
  bubbleRisePx: 4,
  bubbleEase: 'power1.out',
  bubbleOut: 0.08,
} as const

export const LISTEN = {
  /** tuned in KATIE-ART.md 9 from DESIGN.md's -120 / -128 so the palm lands on the ear */
  shoulder: -122,
  elbow: -136,
  wrist: 55,
  neck: 3,
  in: 0.35,
  ease: 'power2.inOut',
  /** call ended: drop the arm in 300 ms */
  out: 0.3,
} as const

export const CELEBRATE = {
  /** bounce up 12 px (as rig units on the body, so it scales with the figure) */
  bouncePx: 12,
  up: 0.16,
  upEase: 'power2.out',
  down: 0.2,
  downEase: 'power2.in',
  /** nod twice: head 4 deg down (+ a 6 U dip, the art's head-offset limit) 120 ms, up 160 ms */
  nod: 4,
  nodDipU: 6,
  nodDown: 0.12,
  nodUp: 0.16,
} as const

export const REST = {
  dropU: 32,
  lids: 0.4,
  drop: 0.6,
  dropEase: 'sine.inOut',
  breathPeriod: 4.5,
  wakeLids: 0.12,
  wakeUp: 0.3,
} as const

export const REDUCED = {
  fade: 0.12,
  /** an instant lid swap: closed for this long, then open */
  blinkHold: 0.12,
} as const

/** Occasional appearances (docs/research/MONDAY-LLAMA-2026-10-13.md 3.5): she rises into view
 *  from below the viewport's bottom edge, and sinks back out of it. */
export const RISE = {
  /** wrapper y from (landing y + px) to the landing y, then the hop's land squash */
  px: 100,
  dur: 0.32,
  ease: 'power2.out',
} as const

export const SINK = {
  /** wrapper y to the floor + px (her crown ends below the viewport) */
  px: 100,
  dur: 0.26,
  ease: 'power2.in',
  /** waved off on a card (3.5 'immediate'): no hop down; she drops straight from where she stands
   *  to the floor + px in one wrapper-y tween (transforms only, 3.9), so the whole exit stays near
   *  0.25 s instead of hop + sink (about 1.15 s) */
  dropDur: 0.25,
  dropEase: 'power2.in',
} as const

export const HOLD = {
  /** hold = clamp(base + chars / charsPerSec, min, max) seconds (3.5; our estimate) */
  base: 3,
  charsPerSec: 25,
  min: 4,
  max: 9,
  /** a peek (line wakes up, or the urgent fallback on a page without a callbacks widget) */
  peek: 3,
} as const

/** How long she holds a sentence of `chars` characters on screen, in seconds. */
export function holdSeconds(chars: number): number {
  return Math.min(HOLD.max, Math.max(HOLD.min, HOLD.base + Math.max(0, chars) / HOLD.charsPerSec))
}

/** The celebrate's length (bounce up and down, then two nods from the landing). */
export const CELEBRATE_TOTAL = CELEBRATE.up + CELEBRATE.down + 2 * (CELEBRATE.nodDown + CELEBRATE.nodUp)

export const BUBBLE_HIDE = PRESENT.bubbleOut
