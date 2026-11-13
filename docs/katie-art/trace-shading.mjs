#!/usr/bin/env node
// Traces the shading shapes the drawn rig parts copy from the art, and writes
// src/katie/traced.ts (generated; do not edit by hand).
//
//   node docs/katie-art/trace-shading.mjs
//
// Input: brief/assets/katie/katie-cutout.png (stored bytes, no ICC) and docs/katie-art/rig.json.
// - Sleeves: inside each traced sleeve outline, the pixels nearest the scrub highlight and the
//   scrub shade (rig.json palette) are traced as polygons (pixel-edge contours, Douglas-Peucker
//   at 1.3 px). The drawn sleeve paints them over its lit fill, so at rest it repeats the art.
// - Eyes: the eye almond (whites, iris, pupil, lash band) inside each lens is flood-filled from
//   the iris centre; its contour (dilated 1 px to cover the anti-aliased rim) is the eyelid shape,
//   and its per-column lowest pixel is the closed-lid lash line.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const rig = JSON.parse(await readFile(path.join(HERE, 'rig.json'), 'utf8'))
const { data, info } = await sharp(path.join(ROOT, 'brief/assets/katie/katie-cutout.png'))
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const W = info.width, H = info.height
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const P = rig.palette
const ROLES = { ink: hex(P.outline), hi: hex(P.scrubHighlight), lit: hex(P.scrubLit), sh: hex(P.scrubShade), skin: hex(P.skinLit), skinSh: hex(P.skinShade) }
const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]] }
function role(x, y) {
  const p = px(x, y); if (!p[3]) return 'none'
  let best = '', bd = Infinity
  for (const [n, c] of Object.entries(ROLES)) { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = n } }
  return best
}
function inPoly(pts, x, y) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c } return c }

// boundary loops of a mask, via directed pixel edges
function contours(m) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x]
  const next = new Map(), key = (x, y) => x + ',' + y
  const add = (x0, y0, x1, y1) => { const k = key(x0, y0); if (!next.has(k)) next.set(k, []); next.get(k).push([x1, y1]) }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y)) continue
    if (!at(x, y - 1)) add(x, y, x + 1, y)
    if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1)
    if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1)
    if (!at(x - 1, y)) add(x, y + 1, x, y)
  }
  const out = []
  for (const [k] of next) {
    while (next.get(k)?.length) {
      const pts = [k.split(',').map(Number)]; let cur = k
      for (let g = 0; g < 1e5; g++) { const l = next.get(cur); if (!l?.length) break; const [nx, ny] = l.pop(); if (!l.length) next.delete(cur); const nk = key(nx, ny); if (nk === k) break; pts.push([nx, ny]); cur = nk }
      let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0 }
      if (a / 2 > 25) out.push({ area: a / 2, pts })
    }
  }
  return out.sort((a, b) => b.area - a.area)
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1]; let md = 0, mi = 0
  for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i]; const d = Math.abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / (Math.hypot(bx - ax, by - ay) || 1); if (d > md) { md = d; mi = i } }
  return md > eps ? rdp(pts.slice(0, mi + 1), eps).slice(0, -1).concat(rdp(pts.slice(mi), eps)) : [pts[0], pts[pts.length - 1]]
}
function simplifyLoop(p, eps) {
  let fi = 0, fd = 0; p.forEach(([x, y], i) => { const d = Math.hypot(x - p[0][0], y - p[0][1]); if (d > fd) { fd = d; fi = i } })
  return [...rdp(p.slice(0, fi + 1), eps).slice(0, -1), ...rdp([...p.slice(fi), p[0]], eps).slice(0, -1)]
}
const dilate = (m, n = 1) => { for (let k = 0; k < n; k++) { const c = m.slice(); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!m[y * W + x] && (m[y * W + x - 1] || m[y * W + x + 1] || m[(y - 1) * W + x] || m[(y + 1) * W + x])) c[y * W + x] = 1; m.set(c) } return m }

const out = { sleeve: {}, eye: {} }
for (const side of ['sL', 'sR']) {
  const poly = rig.traces.sleeve[side].outline
  const shapes = {}
  for (const [name, roles, keep] of [['shade', ['sh'], 2], ['highlight', ['hi'], 2]]) {
    const m = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inPoly(poly, x + 0.5, y + 0.5) && roles.includes(role(x, y))) m[y * W + x] = 1
    shapes[name] = contours(m).slice(0, keep).map((c) => simplifyLoop(c.pts, 1.3))
  }
  out.sleeve[side] = shapes
}
// eyes
const isEye = (x, y) => { const [r, , b] = px(x, y); return !(r - b > 35 && r > 180) }
const EYE = { sL: { seed: rig.landmarks.eyeCenter.sL, box: [228, 176, 297, 216] }, sR: { seed: rig.landmarks.eyeCenter.sR, box: [331, 176, 400, 216] } }
for (const [side, { seed, box }] of Object.entries(EYE)) {
  const [x0, y0, x1, y1] = box, m = new Uint8Array(W * H), st = [seed]
  m[seed[1] * W + seed[0]] = 1
  while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || m[ny * W + nx] || !isEye(nx, ny)) continue; m[ny * W + nx] = 1; st.push([nx, ny]) } }
  // lowest eye pixel per column (the closed-lid line follows the lower lid)
  const lower = []
  let crest = Infinity
  for (let x = x0; x <= x1; x++) { let lo = -1; for (let y = y0; y <= y1; y++) if (m[y * W + x]) { lo = y; crest = Math.min(crest, y) } if (lo >= 0) lower.push([x + 0.5, lo + 1]) }
  dilate(m, 1)
  out.eye[side] = { lid: simplifyLoop(contours(m)[0].pts, 0.9), lower: rdp(lower, 0.8), crest }
}

const fmt = (pts) => '[' + pts.map(([x, y]) => `[${+x.toFixed(1)},${+y.toFixed(1)}]`).join(',') + ']'
const ts = `// Generated by docs/katie-art/trace-shading.mjs from brief/assets/katie/katie-cutout.png.
// Do not edit by hand. Rig units (source pixels of the 652 x 673 art), y down.
export type Pt = readonly [number, number]

/** Scrub highlight and shade regions of each sleeve, traced from the art at rest. */
export const SLEEVE_SHADING: Record<'sL' | 'sR', { shade: readonly (readonly Pt[])[]; highlight: readonly (readonly Pt[])[] }> = {
${['sL', 'sR'].map((s) => `  ${s}: {\n    shade: [${out.sleeve[s].shade.map(fmt).join(', ')}],\n    highlight: [${out.sleeve[s].highlight.map(fmt).join(', ')}],\n  },`).join('\n')}
}

/** Eye almond per eye (lid fill, dilated 1 px), its lower-lid line, and the crest row. */
export const EYE_TRACE: Record<'sL' | 'sR', { lid: readonly Pt[]; lower: readonly Pt[]; crest: number }> = {
${['sL', 'sR'].map((s) => `  ${s}: {\n    lid: ${fmt(out.eye[s].lid)},\n    lower: ${fmt(out.eye[s].lower)},\n    crest: ${out.eye[s].crest},\n  },`).join('\n')}
}
`
await writeFile(path.join(ROOT, 'src/katie/traced.ts'), ts)
console.log('wrote src/katie/traced.ts', JSON.stringify(Object.fromEntries(Object.entries(out.eye).map(([k, v]) => [k, { lid: v.lid.length, lower: v.lower.length, crest: v.crest }]))))
