/**
 * Where Katie stands and where her bubble goes (DESIGN.md 7.2, 7.4, 7.5). Pure functions of
 * plain numbers, so they can be checked without a browser. Every value is a viewport px, the
 * coordinate space of the fixed layer.
 *
 * DESIGN-GLASS 3.7: the app lives in a glass slab inset from the viewport. When the viewport
 * carries its `frame` (the slab's inner box, [data-katie-floor]), her floor is the frame's
 * bottom edge, her home corners and side-edge entries are its left and right edges, and the
 * bubble stays inside it. Without a frame the viewport is the frame, as before.
 */
import type { Shelf } from '../motion/path'

/** --katie-height: her figure height at 1x. */
export const KATIE_H = 96
/** Feet-centre inset from a target's right edge: 16 clear + 20 (half her stance). */
export const SPOT_INSET = 36
/** Feet-centre inset from a shelf's ends, so both feet stay on the card. */
export const SHELF_INSET = 20
/** Home: 24 from the frame's edge + 20. */
export const HOME_INSET = 44
/** Floor span inset from the frame's edges. */
export const FLOOR_INSET = 20
/** Half her body width beside the head (rig 652 x 1544 at 96 px is 40.5 wide). */
export const BODY_HALF = 21
/** Bubble offset from her head, and its margins (7.5). */
export const BUBBLE_GAP = 8
export const BUBBLE_MARGIN = 16
export const RAIL_W = 240
/** Off-screen fallback: a top edge closer than this to the floor is "off screen". */
export const BOTTOM_CLEAR = 8

export type Corner = 'bottom-right' | 'bottom-left'
export type Side = 'left' | 'right'

/** A box in viewport px: the slab's inner edges. */
export interface Frame {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Viewport {
  w: number
  h: number
  /** The slab's inner box ([data-katie-floor]); absent: the viewport itself. */
  frame?: Frame
}

/** The frame she lives in: the slab's inner box, or the whole viewport. */
export function frameOf(vp: Viewport): Frame {
  return vp.frame ?? { left: 0, top: 0, right: vp.w, bottom: vp.h }
}

export interface Rect {
  left: number
  right: number
  top: number
}

export interface Placement {
  /** feet centre */
  x: number
  y: number
  shelf: Shelf
  /** true: standing on the target's top edge; false: presenting from the floor (7.4 fallback) */
  onCard: boolean
  /** the side of her the target's centre is on: where she faces and where the bubble goes */
  side: Side
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function floorShelf(vp: Viewport): Shelf {
  const f = frameOf(vp)
  return { y: f.bottom, x0: f.left + FLOOR_INSET, x1: f.right - FLOOR_INSET }
}

export function homeX(vp: Viewport, corner: Corner): number {
  const f = frameOf(vp)
  return corner === 'bottom-left' ? f.left + HOME_INSET : f.right - HOME_INSET
}

/** At home she faces into the page. */
export function homeFacing(corner: Corner): Side {
  return corner === 'bottom-left' ? 'right' : 'left'
}

/** How far her presenting hand reaches past her feet centre (measured at 96 px: 43). */
export const PRESENT_REACH = 44

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * The spot on a target (7.2): feet on its top edge at x = right - 36, walkable span inset 20.
 * If the top edge would put her head above the frame (top < frame top + her height) or is
 * within 8 px of the floor, she presents from the floor at the same x instead (7.4).
 *
 * Conflict note: DESIGN.md 7.4 says "top < --katie-height + 8", but 4 and "Vertical budget"
 * put every top-row card at exactly y = 96 so that she fits standing on it. The 8 px margin
 * would send her to the floor for the whole top row, so the rule here is top < 96 (1 px slack).
 *
 * `avoid` (the [data-katie-avoid] regions, e.g. the top bar's Show numbers control): when her
 * figure on the card (her body, and her presenting arm on the side she faces) would cover one,
 * she stands at the nearest x on the shelf that keeps it clear, so on a top-row card she stands
 * left of the top bar's controls instead of under them. With no clear x on the shelf she keeps
 * the usual spot (7.5's accepted overlap). `span` is the walkable top edge when it is wider than
 * the target (a KPI cell stands on its card, so she can stand left of the cell and point to it).
 */
export function spotFor(
  r: Rect,
  vp: Viewport,
  avoid: readonly Box[] = [],
  span: { left: number; right: number } = r,
): Placement {
  const cx = (r.left + r.right) / 2
  const sideAt = (x: number): Side => (cx <= x ? 'left' : 'right')
  const f = frameOf(vp)
  let x = r.right - SPOT_INSET
  const onCard = r.top >= f.top + KATIE_H - 1 && r.top <= f.bottom - BOTTOM_CLEAR
  if (onCard) {
    const x0 = span.left + SHELF_INSET
    const shelf = { y: r.top, x0, x1: Math.max(x0, span.right - SHELF_INSET) }
    x = clearSpotX(x, r.top, shelf.x0, shelf.x1, sideAt, avoid)
    return { x, y: r.top, shelf, onCard, side: sideAt(x) }
  }
  const floor = floorShelf(vp)
  return { x: clamp(x, floor.x0, floor.x1), y: floor.y, shelf: floor, onCard, side: sideAt(x) }
}

/** Her figure's box at feet (x, y), presenting toward `side`: the arm reaches PRESENT_REACH. */
export function figureBox(x: number, y: number, side: Side): Box {
  return {
    left: x - (side === 'left' ? PRESENT_REACH : BODY_HALF),
    right: x + (side === 'right' ? PRESENT_REACH : BODY_HALF),
    top: y - KATIE_H,
    bottom: y,
  }
}

/** Clearance between her figure and an avoided region. */
export const AVOID_GAP = 8

function clearSpotX(
  x: number,
  y: number,
  lo: number,
  hi: number,
  sideAt: (x: number) => Side,
  avoid: readonly Box[],
): number {
  const grow = (b: Box): Box => ({ left: b.left - AVOID_GAP, right: b.right + AVOID_GAP, top: b.top, bottom: b.bottom })
  const boxes = avoid.filter((b) => b.right > b.left && b.bottom > b.top && b.top < y && b.bottom > y - KATIE_H).map(grow)
  if (!boxes.length) return x
  const clear = (cx: number) => !boxes.some((b) => overlaps(figureBox(cx, y, sideAt(cx)), b))
  if (clear(x)) return x
  const candidates: number[] = []
  for (const b of boxes) {
    for (const ext of [BODY_HALF, PRESENT_REACH]) candidates.push(b.left - ext, b.right + ext)
  }
  const ok = candidates
    .filter((c) => c >= lo && c <= hi && clear(c))
    .sort((a, b) => Math.abs(a - x) - Math.abs(b - x))
  return ok[0] ?? x
}

export function homeSpot(vp: Viewport, corner: Corner): Placement {
  const floor = floorShelf(vp)
  return { x: homeX(vp, corner), y: floor.y, shelf: floor, onCard: false, side: homeFacing(corner) }
}

/**
 * The bubble's top-left (7.5): top at her crown, BUBBLE_GAP beside her on `side` (toward the
 * card centre, away from the card's edge). On the side her presenting arm reaches to, the gap is
 * measured from her fingertips (`reach`), so the hand never sits on the bubble. It must stay
 * right of the rail + 16 and inside the frame's right margin, and off the `avoid` boxes (the top bar's
 * title and controls, every [data-katie-avoid] region: for a top-row card her crown is in the
 * top bar).
 *
 * `sizes` are the bubble's measured sizes in order of preference (one line, then the same
 * sentence as two shorter lines). The first candidate that fits and is clear wins, tried in this
 * order: on `side` at her crown (each size), on `side` dropped to just under the boxes it would
 * cover (on a top-row card that is the strip between the top bar's controls and the card, beside
 * the target she points at), then the same on the other side. With none clear: the first size at
 * her crown on the first side that fits (7.5's accepted overlap). Then it is clamped inside the
 * frame with a 16 margin. `size` is the index into `sizes`; `clear` says whether it is clear.
 */
export function bubbleAt(
  feet: { x: number; y: number },
  sizes: readonly { w: number; h: number }[],
  side: Side,
  vp: Viewport,
  opts: { reach?: number; avoid?: Box[] } = {},
): { left: number; top: number; side: Side; size: number; clear: boolean } {
  const f = frameOf(vp)
  const reach = Math.max(BODY_HALF, opts.reach ?? BODY_HALF)
  const avoid = opts.avoid ?? []
  const all = sizes.length ? sizes : [{ w: 0, h: 0 }]
  const other: Side = side === 'left' ? 'right' : 'left'
  type C = { s: Side; i: number; l: number; t: number; crown: boolean }
  const candidates: C[] = []
  for (const s of [side, other]) {
    const near = s === side ? reach : BODY_HALF
    const at = all.map((size, i) => {
      const lo = f.top + BUBBLE_MARGIN
      const clampTop = (t: number) => clamp(t, lo, Math.max(lo, f.bottom - BUBBLE_MARGIN - size.h))
      const l = s === 'left' ? feet.x - near - BUBBLE_GAP - size.w : feet.x + near + BUBBLE_GAP
      const t = clampTop(feet.y - KATIE_H)
      const hit = avoid.filter((b) => overlaps({ left: l, top: t, right: l + size.w, bottom: t + size.h }, b))
      const dropped = hit.length ? clampTop(Math.max(...hit.map((b) => b.bottom)) + BUBBLE_GAP) : t
      return { i, l, t, dropped }
    })
    for (const c of at) candidates.push({ s, i: c.i, l: c.l, t: c.t, crown: true })
    for (const c of at) if (c.dropped !== c.t) candidates.push({ s, i: c.i, l: c.l, t: c.dropped, crown: false })
  }
  const sizeOf = (c: C) => all[c.i]!
  const fits = (c: C) => c.l >= f.left + RAIL_W + BUBBLE_MARGIN && c.l + sizeOf(c).w <= f.right - BUBBLE_MARGIN
  const clear = (c: C) =>
    !avoid.some((b) => overlaps({ left: c.l, top: c.t, right: c.l + sizeOf(c).w, bottom: c.t + sizeOf(c).h }, b))
  const good = candidates.find((c) => fits(c) && clear(c))
  const pick = good ?? candidates.find((c) => c.i === 0 && c.crown && fits(c)) ?? candidates[0]!
  const w = sizeOf(pick).w
  const minL = f.left + BUBBLE_MARGIN
  const left = clamp(pick.l, minL, Math.max(minL, f.right - BUBBLE_MARGIN - w))
  return { left, top: pick.t, side: pick.s, size: pick.i, clear: !!good }
}
