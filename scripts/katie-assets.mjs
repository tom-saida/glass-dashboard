#!/usr/bin/env node
// Regenerates Katie's raster layers for the paper-doll rig.
//
//   node scripts/katie-assets.mjs
//
// Input : brief/assets/katie/katie-cutout.png (652x673, RGBA, binary alpha, no ICC)
//         brief/assets/katie/katie-master.png (only read to verify the face bytes)
// Output: src/katie/assets/katie-head.webp     head layer  (hair, ponytail, face, ears, neck)
//         src/katie/assets/katie-torso.webp    torso layer (scrub top, sleeves erased, arms erased)
//         src/katie/assets/katie-avatar-{20,40,60}.png  head-only square avatar, 1x/2x/3x
//         src/katie/assets/manifest.ts         where each layer sits in rig coordinates
//
// Rig coordinates = source pixels of the 652x673 art. Each layer is cropped to its
// opaque bounding box and must be placed at (x, y) from the manifest at native size.
//
// Pixel rule: every opaque pixel of the head and torso layers is byte-identical to the
// cutout, and the cutout's interior equals the master's stored bytes (the master carries
// a Philips monitor ICC profile, "PHL 221V8L"; we keep the stored bytes and ship no ICC,
// which is exactly how the cutout renders). The script fails if any check is not exact.

import sharp from 'sharp'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = path.join(ROOT, 'brief/assets/katie')
const CUTOUT = path.join(SRC_DIR, 'katie-cutout.png')
const MASTER = path.join(SRC_DIR, 'katie-master.png')
const OUT = path.join(ROOT, 'src/katie/assets')

// ---- decisions (source px) -------------------------------------------------------------
const BOTTOM = 671 // rows 671-672 are a matting artefact (row 672 is solid black)
const NECK_CUT_Y = 352 // head/torso seam straight through the neck skin
const NECK_X = [262, 388] // columns where the seam is the horizontal neck cut
const OVERLAP = 12 // torso keeps this many source rows above the seam, hidden under the head
const SEAM_START_Y = 400 // below this row the arms are erased outside the torso side lines
const FACE_BOX = { x0: 196, y0: 18, x1: 470, y1: 351 } // head incl. hair, checked vs master
const AVATAR_BOX = { left: 176, top: 60, size: 284 } // square, head only
const AVATAR_SIZES = [20, 40, 60]

// Centre of the dark torso side line per row (read off the art), used as a search guide.
// Left = Katie's right side (viewer's left). Between guide rows we interpolate.
const GUIDE_L = [
  [400, 158], [420, 158.5], [440, 160.5], [460, 163.5], [480, 166.5], [500, 167.5],
  [520, 163.5], [540, 161.5], [560, 162.5], [575, 166], [590, 170.5], [605, 175],
  [620, 178.5], [640, 181.5], [655, 182.5], [670, 183.5],
]
const GUIDE_R = [
  [400, 486.5], [420, 474], [440, 466], [460, 459], [480, 454.5], [500, 451],
  [520, 449.5], [540, 449], [560, 450.5], [575, 451], [590, 450], [605, 447.5],
  [620, 443.5], [640, 439], [655, 436.5], [670, 435],
]
const LINE_HALF = 2 // half the torso line width, used when the line merges with a hem

// ---- helpers ---------------------------------------------------------------------------
const interp = (guide, y) => {
  for (let i = 0; i < guide.length - 1; i++) {
    const [y0, x0] = guide[i]
    const [y1, x1] = guide[i + 1]
    if (y >= y0 && y <= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0)
  }
  return guide[y < guide[0][0] ? 0 : guide.length - 1][1]
}

async function rawOf(file, keepIcc = false) {
  let img = sharp(file)
  if (keepIcc) img = img.keepIccProfile() // read stored bytes, no colour conversion
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, W: info.width, H: info.height }
}

function bboxOf(buf, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (buf[(y * W + x) * 4 + 3]) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

const fail = (msg) => {
  console.error('katie-assets: ' + msg)
  process.exit(1)
}

// ---- load ------------------------------------------------------------------------------
const meta = await sharp(CUTOUT).metadata()
if (meta.width !== 652 || meta.height !== 673) fail(`unexpected cutout size ${meta.width}x${meta.height}`)
if (meta.icc) fail('cutout carries an ICC profile; the byte-identity rule assumes it does not')
const src = await rawOf(CUTOUT)
const master = await rawOf(MASTER, true)
const { W, H } = src
const S = src.data
const px = (x, y) => (y * W + x) * 4
const opaque = (x, y) => S[px(x, y) + 3] > 0
const dark = (x, y) => opaque(x, y) && Math.max(S[px(x, y)], S[px(x, y) + 1], S[px(x, y) + 2]) < 75
const blue = (x, y) => {
  const i = px(x, y)
  return S[i + 3] > 0 && S[i + 2] > S[i] + 25 && S[i + 2] > S[i + 1]
}

// ---- 1. head/torso seam: cut(x) = first row that belongs to the torso -----------------
// Outside the neck the seam is the top edge of the scrub's shoulder outline (scan down to
// the first scrub-blue pixel, then up through the dark outline). Through the neck it is a
// straight cut at NECK_CUT_Y, where the skin is flat and the outlines run vertically.
// "Head-like" = hair or skin colour; the walk up from the scrub stops there (or at
// transparency), so outlines and the cutout's dark matte rim stay with the torso.
const HEAD_MAX_Y = 400 // nothing of the head reaches below this row (ponytail ends ~367)
const headLike = (x, y) => {
  const i = px(x, y)
  const r = S[i], g = S[i + 1], b = S[i + 2]
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  return S[i + 3] > 0 && mx > 110 && (mx - mn) / mx > 0.2 && r >= g && g >= b
}
const cut = new Int32Array(W)
for (let x = 0; x < W; x++) {
  let yb = -1
  for (let y = 300; y < BOTTOM; y++) if (blue(x, y)) { yb = y; break }
  let top = yb < 0 ? HEAD_MAX_Y : Math.min(yb, HEAD_MAX_Y)
  while (top > 0 && opaque(x, top - 1) && !blue(x, top - 1) && !headLike(x, top - 1)) top--
  cut[x] = x >= NECK_X[0] && x <= NECK_X[1] ? Math.min(NECK_CUT_Y, top) : top
}

// ---- 2. arm erase: keep only what lies between the two torso side lines ---------------
function traceSide(guide, side) {
  const keep = new Map()
  for (let y = SEAM_START_Y; y < BOTTOM; y++) {
    const g = interp(guide, y)
    // collect dark runs in a window around the guide
    const runs = []
    let s = -1
    for (let x = Math.floor(g) - 7; x <= Math.ceil(g) + 8; x++) {
      const d = dark(x, y)
      if (d && s < 0) s = x
      if (!d && s >= 0) { runs.push([s, x - 1]); s = -1 }
    }
    let best = null
    for (const r of runs) {
      const c = (r[0] + r[1]) / 2
      if (Math.abs(c - g) <= 4 && (!best || Math.abs(c - g) < Math.abs((best[0] + best[1]) / 2 - g))) best = r
    }
    let edge
    if (best && best[1] - best[0] + 1 <= 7) edge = side === 'L' ? best[0] : best[1]
    else edge = side === 'L' ? Math.round(g - LINE_HALF) : Math.round(g + LINE_HALF)
    // never step more than one pixel outside the line (hem ends and matte spikes)
    edge = side === 'L' ? Math.max(edge, Math.round(g) - LINE_HALF - 1) : Math.min(edge, Math.round(g) + LINE_HALF + 1)
    keep.set(y, edge)
  }
  // running median over 9 rows removes one-row spikes where hem lines meet the side line
  const smooth = new Map()
  for (const y of keep.keys()) {
    const win = []
    for (let d = -4; d <= 4; d++) if (keep.has(y + d)) win.push(keep.get(y + d))
    win.sort((a, b) => a - b)
    smooth.set(y, win[win.length >> 1])
  }
  return smooth
}
const keepL = traceSide(GUIDE_L, 'L')
const keepR = traceSide(GUIDE_R, 'R')
const inTorsoColumns = (x, y) => y < SEAM_START_Y || (x >= keepL.get(y) && x <= keepR.get(y))

// ---- 3. build full-canvas layers -------------------------------------------------------
const head = Buffer.alloc(W * H * 4)
const torso = Buffer.alloc(W * H * 4)
for (let y = 0; y < BOTTOM; y++)
  for (let x = 0; x < W; x++) {
    if (!opaque(x, y)) continue
    const i = px(x, y)
    if (y < cut[x]) S.copy(head, i, i, i + 4)
    if (y >= cut[x] - OVERLAP && inTorsoColumns(x, y)) S.copy(torso, i, i, i + 4)
  }

// ---- 4. write cropped lossless layers --------------------------------------------------
await mkdir(OUT, { recursive: true })
async function writeLayer(name, buf) {
  const box = bboxOf(buf, W, H)
  const file = path.join(OUT, name)
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .webp({ lossless: true, effort: 6, exact: false })
    .toFile(file)
  return { file, ...box }
}
const headOut = await writeLayer('katie-head.webp', head)
const torsoOut = await writeLayer('katie-torso.webp', torso)

// ---- 5. avatar (head layer only, so no shoulders) --------------------------------------
const avatarFiles = []
for (const size of AVATAR_SIZES) {
  const file = path.join(OUT, `katie-avatar-${size}.png`)
  await sharp(head, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: AVATAR_BOX.left, top: AVATAR_BOX.top, width: AVATAR_BOX.size, height: AVATAR_BOX.size })
    .resize(size, size, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(file)
  avatarFiles.push(file)
}

// ---- 6. verify -------------------------------------------------------------------------
async function decodeAt(layer) {
  const { data, info } = await sharp(layer.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.width !== layer.w || info.height !== layer.h) fail(`${layer.file} decoded at wrong size`)
  return (x, y) => {
    const lx = x - layer.x, ly = y - layer.y
    if (lx < 0 || ly < 0 || lx >= layer.w || ly >= layer.h) return null
    const i = (ly * layer.w + lx) * 4
    return data[i + 3] ? data.subarray(i, i + 4) : null
  }
}
const headAt = await decodeAt(headOut)
const torsoAt = await decodeAt(torsoOut)
const M = master.data
let layerMax = 0, layerPx = 0, faceMax = 0, facePx = 0, compMax = 0, compPx = 0, faceEdgeSkipped = 0
const nearTransparent = (x, y, r) => {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const X = x + dx, Y = y + dy
      if (X < 0 || Y < 0 || X >= W || Y >= H || !opaque(X, Y)) return true
    }
  return false
}
for (let y = 0; y < BOTTOM; y++)
  for (let x = 0; x < W; x++) {
    const i = px(x, y)
    for (const at of [headAt, torsoAt]) {
      const p = at(x, y)
      if (!p) continue
      layerPx++
      for (let k = 0; k < 4; k++) layerMax = Math.max(layerMax, Math.abs(p[k] - S[i + k]))
    }
    // composite at rest (head over torso) vs cutout, everywhere the torso columns are kept
    if (opaque(x, y) && inTorsoColumns(x, y)) {
      const p = headAt(x, y) || torsoAt(x, y)
      compPx++
      if (!p) compMax = 255
      else for (let k = 0; k < 4; k++) compMax = Math.max(compMax, Math.abs(p[k] - S[i + k]))
    }
    // face box vs the master's stored bytes (the cutout re-matted a 1-px silhouette rim)
    const hp = headAt(x, y)
    if (hp && x >= FACE_BOX.x0 && x <= FACE_BOX.x1 && y >= FACE_BOX.y0 && y <= FACE_BOX.y1) {
      if (nearTransparent(x, y, 3)) { faceEdgeSkipped++; continue }
      facePx++
      for (let k = 0; k < 3; k++) faceMax = Math.max(faceMax, Math.abs(hp[k] - M[i + k]))
    }
  }

// ---- 7. manifest -----------------------------------------------------------------------
const manifest = `// Generated by scripts/katie-assets.mjs. Do not edit by hand.
// Rig coordinates are source pixels of brief/assets/katie (652 x 673). Place each layer
// at (x, y) with its native width and height; head draws above torso.
import headHref from './katie-head.webp'
import torsoHref from './katie-torso.webp'
import avatar20 from './katie-avatar-20.png'
import avatar40 from './katie-avatar-40.png'
import avatar60 from './katie-avatar-60.png'

export interface KatieLayer {
  href: string
  x: number
  y: number
  width: number
  height: number
}

export const KATIE_HEAD: KatieLayer = { href: headHref, x: ${headOut.x}, y: ${headOut.y}, width: ${headOut.w}, height: ${headOut.h} }
export const KATIE_TORSO: KatieLayer = { href: torsoHref, x: ${torsoOut.x}, y: ${torsoOut.y}, width: ${torsoOut.w}, height: ${torsoOut.h} }

/** Head/torso seam through the neck; the head layer pivots here. */
export const KATIE_NECK_PIVOT = { x: 322, y: ${NECK_CUT_Y} } as const

/** Head-only avatar: use src = avatar20, srcSet with 2x and 3x. */
export const KATIE_AVATAR = { src: avatar20, srcSet: \`\${avatar40} 2x, \${avatar60} 3x\` } as const
`
await writeFile(path.join(OUT, 'manifest.ts'), manifest)

// ---- 8. report -------------------------------------------------------------------------
const files = [headOut.file, torsoOut.file, ...avatarFiles]
let total = 0
const sizes = []
for (const f of files) {
  const { size } = await stat(f)
  total += size
  sizes.push([path.relative(ROOT, f), size])
}
const report = {
  head: { x: headOut.x, y: headOut.y, w: headOut.w, h: headOut.h },
  torso: { x: torsoOut.x, y: torsoOut.y, w: torsoOut.w, h: torsoOut.h },
  layerVsCutout: { pixels: layerPx, maxChannelDiff: layerMax },
  compositeAtRestVsCutout: { pixels: compPx, maxChannelDiff: compMax },
  faceVsMasterStoredBytes: { box: FACE_BOX, pixels: facePx, maxChannelDiff: faceMax, rimPixelsSkipped: faceEdgeSkipped },
  sizes,
  totalBytes: total,
}
console.log(JSON.stringify(report, null, 2))
if (layerMax !== 0) fail('layer pixels differ from the cutout')
if (compMax !== 0) fail('head over torso does not reproduce the cutout at rest')
if (faceMax !== 0) fail('face differs from the master')
if (total > 300 * 1024) fail(`assets total ${total} bytes, over the 300 KB budget`)
