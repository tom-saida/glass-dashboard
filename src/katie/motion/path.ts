/**
 * Katie's route planner (DESIGN.md 7.3 "path"). Pure functions of plain numbers: no DOM, no
 * GSAP, no imports, so the integration step can feed it cached card rectangles and it can be
 * unit-tested in Node (scripts in the scratchpad load it with type stripping).
 *
 * Coordinates are her feet centre in the stage's px. A shelf is a walkable horizontal edge:
 * the floor, or a card's top edge with x0..x1 the span her feet centre may use (the caller
 * insets the card rect, e.g. left + 20 .. right - 20).
 *
 * The route is L-shaped:
 *   1. walk along the current shelf to the target column (clamped to the shelf; if the shelf
 *      ends first, walk to its end);
 *   2. one hop onto the target shelf;
 *   3. a step of at most `step` px to the exact spot.
 * Same shelf (same y): walk only. Going down to another card: the same L (walk to the column,
 * hop, step), since her layer is above the cards and she drops across the face of the one she
 * leaves. Going down to the floor (`toFloor`): walk to the shelf end nearest the target, hop off
 * it (landing `step` px past the edge), then walk to the spot (DESIGN.md 7.3 "path").
 */

export interface Shelf {
  /** top edge (feet) y */
  y: number
  /** walkable span of the feet centre */
  x0: number
  x1: number
}

export interface Point {
  x: number
  y: number
}

export type PathStep =
  | { kind: 'walk'; x: number; y: number }
  | { kind: 'hop'; x: number; y: number; shelf: Shelf }

export interface PlanOptions {
  /** max final step after a hop up, and how far past the edge she lands when hopping down (px) */
  step?: number
  /** shelves whose y differ by less than this are the same shelf (px) */
  sameShelf?: number
  /** walks shorter than this are dropped (px) */
  minMove?: number
  /** the target shelf is the floor: going down, step off the shelf end nearest the target */
  toFloor?: boolean
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const clampTo = (x: number, s: Shelf) => clamp(x, Math.min(s.x0, s.x1), Math.max(s.x0, s.x1))

/**
 * Plans the route from `from` (standing on `current`) to `target.x` on `target.shelf`.
 * Returns the steps in order; an empty list means she is already there.
 */
export function planPath(
  from: Point,
  current: Shelf,
  target: { x: number; shelf: Shelf },
  opts: PlanOptions = {},
): PathStep[] {
  const step = opts.step ?? 24
  const same = opts.sameShelf ?? 1
  const minMove = opts.minMove ?? 0.5
  const dest = target.shelf
  const spotX = clampTo(target.x, dest)
  const steps: PathStep[] = []
  let x = from.x
  const walk = (toX: number, y: number) => {
    if (Math.abs(toX - x) >= minMove) steps.push({ kind: 'walk', x: toX, y })
    x = toX
  }

  // same shelf: walk only (two cards in one row share a top edge; she walks across the gap)
  if (Math.abs(dest.y - current.y) < same) {
    walk(spotX, dest.y)
    return steps
  }

  if (dest.y > current.y && opts.toFloor) {
    // going down to the floor: step off an end of the current shelf. Prefer an end whose landing point
    // (one step past the edge, clamped to the target shelf) is not back under the shelf she
    // left; among those, the end nearest the target. Otherwise the end nearest the target.
    const lo = Math.min(current.x0, current.x1)
    const hi = Math.max(current.x0, current.x1)
    const ends = [
      { end: lo, out: -1 },
      { end: hi, out: 1 },
    ].map((e) => {
      const land = clampTo(e.end + e.out * step, dest)
      return { ...e, ok: !(land > lo && land < hi), d: Math.abs(spotX - e.end) }
    })
    const usable = ends.filter((e) => e.ok)
    const pickFrom = usable.length ? usable : ends
    const best = pickFrom.reduce((a, b) => (b.d < a.d ? b : a))
    const { end, out } = best
    walk(end, current.y)
    const landX = clampTo(end + out * step, dest)
    steps.push({ kind: 'hop', x: landX, y: dest.y, shelf: dest })
    x = landX
    walk(spotX, dest.y)
    return steps
  }

  // going up, or down to another card: walk to the target column (or the shelf end), hop,
  // then a short step
  walk(clampTo(spotX, current), current.y)
  const landX = clampTo(spotX + clamp(x - spotX, -step, step), dest)
  steps.push({ kind: 'hop', x: landX, y: dest.y, shelf: dest })
  x = landX
  walk(spotX, dest.y)
  return steps
}

/** Travel time of a walk (DESIGN.md 7.3): clamp(dist / speed, min, max) seconds. */
export function walkDuration(dist: number, speedPx = 420, min = 0.25, max = 1.4): number {
  return clamp(Math.abs(dist) / speedPx, min, max)
}

/** Air time of a hop: clamp(0.25 + |dy| / 2000, 0.25, 0.45) seconds (dy in design px). */
export function hopDuration(dyDesignPx: number, base = 0.25, perPx = 2000, min = 0.25, max = 0.45): number {
  return clamp(base + Math.abs(dyDesignPx) / perPx, min, max)
}

/**
 * Splits a hop's air time at the apex (apex y = min(startY, endY) - apexPx) so the rise and
 * the fall take the time a thrown body would: t ~ sqrt(height). Returns [apexY, riseTime].
 * `minApexY` keeps the apex at or below that y (pass her height so her crown, feet y - height,
 * never leaves the top of the viewport); it never lifts the apex above either end, so a landing
 * on a top-row card (end y = her height) rises straight onto it and decelerates into it.
 */
export function hopArc(
  startY: number,
  endY: number,
  air: number,
  apexPx: number,
  minApexY = -Infinity,
): [number, number] {
  const low = Math.min(startY, endY)
  const apexY = Math.max(low - apexPx, Math.min(minApexY, low))
  const rise = Math.sqrt(Math.max(0, startY - apexY))
  const fall = Math.sqrt(Math.max(0, endY - apexY))
  const tUp = rise + fall > 0 ? (air * rise) / (rise + fall) : air / 2
  return [apexY, tUp]
}
