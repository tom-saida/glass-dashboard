/**
 * Katie's motion layer (GSAP 3). See controller.ts for the API and DESIGN.md 7.3 for every
 * number (all of them live in timing.ts). path.ts is the pure L-route planner the integration
 * step feeds with cached card rectangles.
 */
export { createKatieMotion } from './controller'
export type { KatieMotion, KatieMotionOptions, KatieMotionState } from './controller'
export { planPath, walkDuration, hopDuration, hopArc } from './path'
export type { Shelf, PathStep, Point, PlanOptions } from './path'
export { gaitPose } from './gait'
export * as MOTION from './timing'
