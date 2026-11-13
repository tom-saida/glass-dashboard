/** Small 2D helpers that build Katie's SVG path strings once, at module load. Rig units, y down. */
import type { Vec } from './rig'

export const r1 = (n: number) => Math.round(n * 10) / 10
export const P = (p: Vec) => `${r1(p[0])},${r1(p[1])}`

export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]]
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]]
export const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k]
export const lerp = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
export const len = (a: Vec) => Math.hypot(a[0], a[1])
export const unit = (a: Vec): Vec => mul(a, 1 / (len(a) || 1))
/** Left-hand normal of a direction in y-down space (down -> screen left). */
export const normal = (dir: Vec): Vec => unit([-dir[1], dir[0]])

export function rotate(p: Vec, origin: Vec, deg: number): Vec {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const x = p[0] - origin[0]
  const y = p[1] - origin[1]
  return [origin[0] + x * c - y * s, origin[1] + x * s + y * c]
}

/** Straight segments through the points. */
export function poly(pts: readonly Vec[], closed = true): string {
  const first = pts[0]
  if (!first) return ''
  return `M${P(first)}` + pts.slice(1).map((p) => `L${P(p)}`).join('') + (closed ? 'Z' : '')
}

/**
 * Catmull-Rom curve through the points as cubic Beziers, continuing from the first point
 * (no leading M), so edges can be chained into one path with sharp corners between them.
 */
export function curveThrough(pts: readonly Vec[], closed = false, k = 1 / 6): string {
  const n = pts.length
  if (n < 2) return ''
  const at = (i: number): Vec => {
    if (closed) return pts[((i % n) + n) % n]!
    return pts[Math.max(0, Math.min(n - 1, i))]!
  }
  let d = ''
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1 = add(p1, mul(sub(p2, p0), k))
    const c2 = sub(p2, mul(sub(p3, p1), k))
    d += `C${P(c1)} ${P(c2)} ${P(p2)}`
  }
  return d
}

export const smooth = (pts: readonly Vec[], closed = false) =>
  pts.length ? `M${P(pts[0]!)}${curveThrough(pts, closed)}${closed ? 'Z' : ''}` : ''

/** Offset an open polyline sideways by d along each vertex's averaged left normal. */
export function offset(pts: readonly Vec[], d: number): Vec[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]!
    const b = pts[Math.min(pts.length - 1, i + 1)]!
    return add(p, mul(normal(sub(b, a)), d))
  })
}

/** Y of an x-monotonic polyline at x (clamped to its ends). */
export function yAt(pts: readonly Vec[], x: number): number {
  const sorted = [...pts].sort((a, b) => a[0] - b[0])
  if (x <= sorted[0]![0]) return sorted[0]![1]
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!
    const b = sorted[i + 1]!
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1)
  }
  return sorted[sorted.length - 1]![1]
}

/** The part of an x-monotonic polyline between x0 and x1 (end points interpolated), left to right. */
export function sliceX(pts: readonly Vec[], x0: number, x1: number): Vec[] {
  const sorted = [...pts].sort((a, b) => a[0] - b[0])
  const inner = sorted.filter((p) => p[0] > x0 && p[0] < x1)
  return [[x0, yAt(sorted, x0)], ...inner, [x1, yAt(sorted, x1)]]
}

/**
 * Tapered limb from a to b: half-widths ra, rb (stroke centre lines).
 * `fill` has round caps at both ends; `sideA` / `sideB` are the two side lines (A = left normal).
 */
export function limb(a: Vec, b: Vec, ra: number, rb: number) {
  const n = normal(sub(b, a))
  const a1 = add(a, mul(n, ra))
  const b1 = add(b, mul(n, rb))
  const b2 = sub(b, mul(n, rb))
  const a2 = sub(a, mul(n, ra))
  return {
    n,
    a1,
    a2,
    b1,
    b2,
    fill: `M${P(a1)}L${P(b1)}A${r1(rb)},${r1(rb)} 0 0 0 ${P(b2)}L${P(a2)}A${r1(ra)},${r1(ra)} 0 0 0 ${P(a1)}Z`,
    sideA: `M${P(a1)}L${P(b1)}`,
    sideB: `M${P(a2)}L${P(b2)}`,
  }
}

/** A shade strip along one side of a limb: from the side line inward by frac of the width. */
export function strip(a: Vec, b: Vec, ra: number, rb: number, side: 1 | -1, frac: number, t0 = 0, t1 = 1): string {
  const n = mul(normal(sub(b, a)), side)
  const pa = lerp(a, b, t0)
  const pb = lerp(a, b, t1)
  const wa = ra + (rb - ra) * t0
  const wb = ra + (rb - ra) * t1
  return poly([
    add(pa, mul(n, wa)),
    add(pb, mul(n, wb)),
    add(pb, mul(n, wb - 2 * wb * frac)),
    add(pa, mul(n, wa - 2 * wa * frac)),
  ])
}
