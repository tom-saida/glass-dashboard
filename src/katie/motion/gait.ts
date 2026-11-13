/**
 * The walk cycle as a pure function of its phase (0..1 = one 0.55 s two-leg cycle), in the
 * rig's frame (facing right; the facing group mirrors it). DESIGN.md 7.3: hips +-25, the
 * trailing knee bends 0 -> 20, arms counter-swing +-15 with elbows -10, head rigid.
 *
 *   phase 0    contact A: L leg leading (hip -25), R trailing (hip +25, knee 16)
 *   phase 0.25 passing:   hips 0, the swinging R knee at its 20 deg peak
 *   phase 0.5  contact B: mirror of A
 *   phase 0.75 passing:   the swinging L knee at its peak
 *
 * Each contact pose equals pose.ts PRESETS.walkA / walkB exactly. The body bob is not part of
 * this function: the controller lowers the body by groundOffset(pose) every frame, so the
 * soles always touch the shelf and the body dips at each contact (about 3 px at 96 px).
 */
import { WALK } from './timing'

export const GAIT_JOINTS = [
  'shoulderL',
  'elbowL',
  'shoulderR',
  'elbowR',
  'hipL',
  'kneeL',
  'ankleL',
  'hipR',
  'kneeR',
  'ankleR',
] as const
export type GaitJoint = (typeof GAIT_JOINTS)[number]
export type GaitPose = Record<GaitJoint, number>

/** One leg at its own phase p (0 = trailing contact, 0.5 = leading contact). */
function leg(p: number): { hip: number; knee: number; ankle: number } {
  const q = ((p % 1) + 1) % 1
  // hip: +25 (trailing) at 0 -> -25 (leading) at 0.5 -> +25
  const hip = WALK.hip * Math.cos(2 * Math.PI * q)
  if (q < 0.5) {
    // swing: the knee goes from its contact bend over the 20 deg peak to straight
    const s = q / 0.5
    const knee = WALK.kneeContact * (1 - s) + (WALK.kneePeak - WALK.kneeContact / 2) * Math.sin(Math.PI * s)
    // the toe lifts through the swing (counter to the knee bend) so it clears the shelf
    const ankle = WALK.ankleTrail + (WALK.ankleLead - WALK.ankleTrail) * s - 25 * Math.sin(Math.PI * s)
    return { hip, knee, ankle }
  }
  // stance: straight, then bending to the trailing contact value as the foot pushes off; the
  // ankle goes flat by mid-stance (so the sole, not the toe, carries her at passing) and then
  // to its trailing contact value
  const s = (q - 0.5) / 0.5
  const knee = WALK.kneeContact * s * s
  const ankle = s < 0.5 ? WALK.ankleLead * (1 - 2 * s) : WALK.ankleTrail * (2 * s - 1)
  return { hip, knee, ankle }
}

export function gaitPose(phase: number): GaitPose {
  const r = leg(phase) // R trails at contact A
  const l = leg(phase + 0.5)
  const swing = WALK.arm * Math.cos(2 * Math.PI * phase)
  return {
    shoulderL: swing,
    shoulderR: -swing,
    elbowL: WALK.elbow,
    elbowR: WALK.elbow,
    hipL: l.hip,
    kneeL: l.knee,
    ankleL: l.ankle,
    hipR: r.hip,
    kneeR: r.knee,
    ankleR: r.ankle,
  }
}
