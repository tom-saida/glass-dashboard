/**
 * Katie's pose model: degrees per joint plus a few body offsets, the pivots GSAP rotates about,
 * the named presets, and the helpers that put a pose on the rig.
 *
 * Angles are SVG degrees (positive = clockwise on screen), each relative to its parent, in the
 * rig's own frame (facing right). L / R are SCREEN left / right of the rig facing right
 * (rig.json sL / sR): L is Katie's own right side. Offsets are rig units (1544 = her height).
 */
import gsap from 'gsap'
import { FEET, GROUND, JOINT, SHOE, type Vec } from './rig'
import { rotate } from './geometry'

export const JOINT_NAMES = [
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
] as const
export type JointName = (typeof JOINT_NAMES)[number]

export interface Pose extends Record<JointName, number> {
  /** Whole body offset, screen sense (not mirrored by facing), rig units. */
  x: number
  y: number
  /** Whole body rotation about the feet centre, degrees. */
  lean: number
  /** Pelvis + legs sideways shift (weight shift), rig frame. */
  hipsX: number
  /** Torso + head + arms vertical shift (breath, shoulder drop), rig units; + is down. */
  chestY: number
}

export type Facing = 'left' | 'right'

export const REST_POSE: Pose = {
  x: 0,
  y: 0,
  lean: 0,
  hipsX: 0,
  chestY: 0,
  neck: 0,
  shoulderL: 0,
  elbowL: 0,
  wristL: 0,
  shoulderR: 0,
  elbowR: 0,
  wristR: 0,
  hipL: 0,
  kneeL: 0,
  ankleL: 0,
  hipR: 0,
  kneeR: 0,
  ankleR: 0,
}

/** The point each joint group rotates about (GSAP `svgOrigin`), in rest coordinates. */
export const PIVOT: Record<JointName, Vec> & { body: Vec; facing: Vec } = {
  neck: JOINT.neck,
  shoulderL: JOINT.shoulder.L,
  elbowL: JOINT.elbow.L,
  wristL: JOINT.wrist.L,
  shoulderR: JOINT.shoulder.R,
  elbowR: JOINT.elbow.R,
  wristR: JOINT.wrist.R,
  hipL: JOINT.hip.L,
  kneeL: JOINT.knee.L,
  ankleL: JOINT.ankle.L,
  hipR: JOINT.hip.R,
  kneeR: JOINT.knee.R,
  ankleR: JOINT.ankle.R,
  body: FEET,
  facing: FEET,
}

export const svgOrigin = (p: Vec) => `${p[0]} ${p[1]}`

/** Slider ranges for the playground; the art holds together inside them. */
export const JOINT_RANGE: Record<JointName, readonly [number, number]> = {
  neck: [-5, 5],
  shoulderL: [-140, 140],
  elbowL: [-150, 20],
  wristL: [-60, 60],
  shoulderR: [-140, 140],
  elbowR: [-150, 20],
  wristR: [-60, 60],
  hipL: [-50, 50],
  kneeL: [-5, 90],
  ankleL: [-40, 40],
  hipR: [-50, 50],
  kneeR: [-5, 90],
  ankleR: [-40, 40],
}

export const OFFSET_RANGE = {
  x: [-200, 200],
  y: [-200, 200],
  lean: [-10, 10],
  hipsX: [-48, 48],
  chestY: [-48, 48],
} as const

/**
 * Opacity of the torso side stroke for a shoulder angle. The raster's body side is only a thin
 * seam between the shoulder point and y 490; once the sleeve swings away from it (outward more
 * than about 10 degrees) the drawn 4.5 stroke takes over the silhouette.
 */
export function sideOpacity(side: 'L' | 'R', shoulderDeg: number): number {
  const outward = side === 'L' ? shoulderDeg : -shoulderDeg
  return Math.max(0, Math.min(1, (outward - 4) / 6))
}

/** The rig groups a pose is applied to (see KatieHandle in Katie.tsx). */
export interface PoseTargets extends Record<Exclude<JointName, 'neck'>, SVGGElement> {
  body: SVGGElement
  facing: SVGGElement
  hips: SVGGElement
  torso: SVGGElement
  head: SVGGElement
  sideL: SVGGElement
  sideR: SVGGElement
  tabL: SVGGElement
  tabR: SVGGElement
}

/**
 * Puts a pose on the rig with gsap.set, so later GSAP tweens start from the same transforms and
 * every joint group carries its svgOrigin. Facing is only set when given.
 */
export function applyPose(t: PoseTargets, partial: Partial<Pose>, facing?: Facing) {
  const p: Pose = { ...REST_POSE, ...partial }
  gsap.set(t.body, { x: p.x, y: p.y, rotation: p.lean, svgOrigin: svgOrigin(PIVOT.body) })
  if (facing) gsap.set(t.facing, { scaleX: facing === 'left' ? -1 : 1, svgOrigin: svgOrigin(PIVOT.facing) })
  gsap.set(t.hips, { x: p.hipsX })
  gsap.set(t.torso, { y: p.chestY })
  for (const j of JOINT_NAMES) {
    gsap.set(j === 'neck' ? t.head : t[j], { rotation: p[j], svgOrigin: svgOrigin(PIVOT[j]) })
  }
  const oL = sideOpacity('L', p.shoulderL)
  const oR = sideOpacity('R', p.shoulderR)
  gsap.set(t.sideL, { opacity: oL })
  gsap.set(t.sideR, { opacity: oR })
  // the overlap tabs only matter for inward swings; they would show as patches on outward ones
  gsap.set(t.tabL, { opacity: 1 - oL })
  gsap.set(t.tabR, { opacity: 1 - oR })
}

/**
 * How far the body must move down (rig units) for the lowest sole point to touch the ground
 * in this pose, ignoring `y` and `lean`. Negative means a foot is already below the ground.
 */
export function groundOffset(partial: Partial<Pose>): number {
  const p: Pose = { ...REST_POSE, ...partial }
  let lowest = -Infinity
  for (const s of ['L', 'R'] as const) {
    const A = JOINT.ankle[s]
    const sole: Vec[] = [
      [A[0] - SHOE.heel + 3, GROUND],
      [A[0] - SHOE.heel + 20, GROUND],
      [A[0] + SHOE.toe - 18, GROUND],
      [A[0] + SHOE.toe, GROUND - 20],
    ]
    for (const q of sole) {
      let r = rotate(q, A, p[`ankle${s}` as const])
      r = rotate(r, JOINT.knee[s], p[`knee${s}` as const])
      r = rotate(r, JOINT.hip[s], p[`hip${s}` as const])
      lowest = Math.max(lowest, r[1])
    }
  }
  return GROUND - lowest
}

export interface Preset {
  label: string
  pose: Partial<Pose>
  facing: Facing
  eyes: number
}

const walkA: Partial<Pose> = {
  hipL: -25,
  kneeL: 0,
  ankleL: 12,
  hipR: 25,
  kneeR: 16,
  ankleR: 6,
  shoulderL: 15,
  shoulderR: -15,
  elbowL: -10,
  elbowR: -10,
}
const walkB: Partial<Pose> = {
  hipL: 25,
  kneeL: 16,
  ankleL: 6,
  hipR: -25,
  kneeR: 0,
  ankleR: 12,
  shoulderL: -15,
  shoulderR: 15,
  elbowL: -10,
  elbowR: -10,
}

/** Named poses for the playground (and as reference values for the motion layer). */
export const PRESETS: Record<'rest' | 'walkA' | 'walkB' | 'present' | 'listen' | 'eyesClosed', Preset> = {
  rest: { label: 'Rest', pose: {}, facing: 'right', eyes: 1 },
  walkA: { label: 'Walk contact A', pose: { ...walkA, y: groundOffset(walkA) }, facing: 'right', eyes: 1 },
  walkB: { label: 'Walk contact B', pose: { ...walkB, y: groundOffset(walkB) }, facing: 'right', eyes: 1 },
  // facing left, so the rig's R arm is the near arm toward a card on her left (DESIGN.md 7.1)
  present: {
    label: 'Present toward left',
    pose: { shoulderR: -70, elbowR: -20, wristR: -25, neck: -2 },
    facing: 'left',
    eyes: 1,
  },
  // tuned from DESIGN.md's -120 / -128 so the drawn palm lands on the ear (418, 212) with the
  // fingers up into the hair, clear of the glasses frame
  listen: {
    label: 'Listen, hand to ear',
    pose: { shoulderR: -122, elbowR: -136, wristR: 55, neck: 3 },
    facing: 'left',
    eyes: 1,
  },
  eyesClosed: { label: 'Eyes closed (rest)', pose: { chestY: 32 }, facing: 'right', eyes: 0 },
}
