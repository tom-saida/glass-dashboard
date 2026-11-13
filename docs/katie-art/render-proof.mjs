#!/usr/bin/env node
// Renders docs/katie-art/proof.png from rig.json and the generated assets.
//   node scripts/katie-assets.mjs && node docs/katie-art/render-proof.mjs
// Uses Playwright's bundled headless Chromium on a file:// URL; no server.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const rig = JSON.parse(await readFile(path.join(HERE, 'rig.json'), 'utf8'))
const manifest = await readFile(path.join(ROOT, 'src/katie/assets/manifest.ts'), 'utf8')
const layer = (name) => {
  const m = manifest.match(new RegExp(`${name}: KatieLayer = \\{ href: \\w+, x: (\\d+), y: (\\d+), width: (\\d+), height: (\\d+) \\}`))
  if (!m) throw new Error('manifest missing ' + name)
  const [, x, y, w, h] = m.map(Number)
  return { x, y, w, h }
}
const HEAD = layer('KATIE_HEAD')
const TORSO = layer('KATIE_TORSO')
const A = '../../src/katie/assets/'
const P = rig.palette
const J = rig.joints
const L = rig.limbs
const INK = rig.stroke.ink
const SW = rig.stroke.silhouette

const img = (file, l, extra = '') => `<image href="${A}${file}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" ${extra}/>`
const headImg = (extra = '') => img('katie-head.webp', HEAD, extra)
const torsoImg = (extra = '') => img('katie-torso.webp', TORSO, extra)
const pts = (a) => a.map((p) => p.join(',')).join(' ')

// tapered capsule from a to b
function capsule([ax, ay], [bx, by], wa, wb, fill) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy)
  const nx = -dy / len, ny = dx / len
  const ra = wa / 2, rb = wb / 2
  const p = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`
  return `<path d="M${p(ax + nx * ra, ay + ny * ra)} L${p(bx + nx * rb, by + ny * rb)} A${rb},${rb} 0 0 0 ${p(bx - nx * rb, by - ny * rb)} L${p(ax - nx * ra, ay - ny * ra)} A${ra},${ra} 0 0 0 ${p(ax + nx * ra, ay + ny * ra)} Z" fill="${fill}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`
}
const rot = (a, [x, y]) => `rotate(${a || 0} ${x} ${y})`

function shoe([ax, ay], s) {
  const g = rig.ground
  const heel = ax - s.heelBehindAnkle, toe = ax + s.toeAheadOfAnkle, top = g - s.height
  return `<path d="M${heel},${g} L${toe - 26},${g} Q${toe},${g} ${toe},${g - 24} Q${toe - 6},${g - 46} ${ax + 34},${top + 22} L${ax + 18},${top} L${heel + 8},${top} Q${heel},${top + 30} ${heel},${g} Z" fill="${P.proposedShoeUpper}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>
  <path d="M${heel + 3},${g - s.sole} L${toe - 6},${g - s.sole}" stroke="${INK}" stroke-width="${rig.stroke.interior}" fill="none" stroke-linecap="round"/>
  <path d="M${ax + 6},${top + 18} l26,10 M${ax + 2},${top + 32} l30,10" stroke="${P.proposedShoeShade}" stroke-width="6" stroke-linecap="round"/>`
}

function leg(side, pose) {
  const hip = J.hip[side], knee = J.knee[side], ankle = J.ankle[side]
  const hemY = L.shin.pantsHemY
  const hem = [ankle[0], hemY]
  return `<g transform="${rot(pose['hip.' + side], hip)}">
    ${capsule(hip, knee, L.thigh.widthAtHip, L.thigh.widthAtKnee, P.scrubLit)}
    <g transform="${rot(pose['knee.' + side], knee)}">
      <g transform="${rot(pose['ankle.' + side], ankle)}">${shoe(ankle, L.shoe)}</g>
      ${capsule(knee, hem, L.shin.widthAtKnee, L.shin.widthAtHem, P.scrubLit)}
    </g>
  </g>`
}

function arm(side, pose) {
  const s = J.shoulder[side], e = J.elbow[side], w = J.wrist[side]
  const tip = [w[0], w[1] + L.hand.length]
  const sleeve = rig.traces.sleeve[side]
  return `<g transform="${rot(pose['shoulder.' + side], s)}">
    ${capsule(s, e, L.upperArm.widthAtSleeveHem[side], L.upperArm.widthAtElbow[side], P.skinLit)}
    <g transform="${rot(pose['elbow.' + side], e)}">
      ${capsule(e, w, L.forearm.widthAtElbow[side], L.forearm.widthAtWrist[side], P.skinLit)}
      ${capsule(w, tip, L.hand.width[side], L.hand.width[side] * 0.8, P.skinLit)}
      <circle cx="${w[0]}" cy="${w[1]}" r="7" class="j"/>
      <circle cx="${tip[0]}" cy="${tip[1]}" r="5" class="j2"/>
    </g>
    <polygon points="${pts(sleeve.outline)}" fill="${P.scrubLit}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>
    <polyline points="${pts(sleeve.hemFold)}" fill="none" stroke="${INK}" stroke-width="${rig.stroke.interior}" stroke-linecap="round"/>
    <circle cx="${e[0]}" cy="${e[1]}" r="7" class="j"/>
  </g>`
}

function figure(pose, label) {
  const lt = L.lowerTop
  const pel = L.pelvis
  const bones = []
  const sk = (a, b) => bones.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`)
  return `<figure><svg viewBox="-170 -10 992 1564" width="380" height="${Math.round((380 * 1564) / 992)}">
    ${[0, 1, 2, 3, 4, 5].map((k) => { const y = rig.head.crown + (k * (rig.ground - rig.head.crown)) / 5; return `<line x1="-150" x2="-110" y1="${y}" y2="${y}" class="tick"/><text x="-150" y="${y - 8}" class="tl">${k}H</text>` }).join('')}
    <line x1="-170" x2="822" y1="${rig.ground}" y2="${rig.ground}" class="ground"/>
    ${leg('sR', pose)}
    ${leg('sL', pose)}
    <path d="M186,${pel.top} L434,${pel.top} L440,${pel.crotchY} Q310,${pel.crotchY + 26} 180,${pel.crotchY} Z" fill="${P.scrubLit}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>
    <path d="M${lt.sides.sL[0][0]},${lt.from} L${lt.sides.sR[0][0]},${lt.from} L${lt.sides.sR[1][0]},${lt.hemY} Q310,${lt.hemCentreY + 4} ${lt.sides.sL[1][0]},${lt.hemY} Z" fill="${P.scrubShade}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>
    <path d="M${lt.sides.sL[1][0] + 2},${lt.hemY - lt.hemBand} Q310,${lt.hemCentreY - lt.hemBand + 4} ${lt.sides.sR[1][0] - 2},${lt.hemY - lt.hemBand}" fill="none" stroke="${INK}" stroke-width="${rig.stroke.interior}"/>
    ${torsoImg()}
    ${arm('sL', pose)}
    ${arm('sR', pose)}
    <g transform="${rot(pose.neck, J.neck)}">${headImg()}</g>
    <g class="bones">${(() => { sk(J.neck, [322, 800]); sk(J.shoulder.sL, J.shoulder.sR); sk(J.hip.sL, J.hip.sR); return bones.join('') })()}</g>
    ${[J.neck, J.shoulder.sL, J.shoulder.sR, J.hip.sL, J.hip.sR].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" class="j"/>`).join('')}
    ${['sL', 'sR'].map((s) => `<g transform="${rot(pose['hip.' + s], J.hip[s])}"><circle cx="${J.knee[s][0]}" cy="${J.knee[s][1]}" r="8" class="j"/><g transform="${rot(pose['knee.' + s], J.knee[s])}"><circle cx="${J.ankle[s][0]}" cy="${J.ankle[s][1]}" r="8" class="j"/></g></g>`).join('')}
    <line x1="-170" x2="822" y1="${J.hipLineY}" y2="${J.hipLineY}" class="guide"/>
  </svg><figcaption>${label}</figcaption></figure>`
}

const Lm = rig.landmarks
const box = ([x0, y0, x1, y1], cls = 'lm') => `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" class="${cls}"/>`
const hline = (y, cls = 'guide') => `<line x1="0" x2="652" y1="${y}" y2="${y}" class="${cls}"/>`
const dot = ([x, y], cls = 'j') => `<circle cx="${x}" cy="${y}" r="6" class="${cls}"/>`
const landmarks = `<svg viewBox="0 0 652 673" width="652" height="673" class="checker">
  ${torsoImg()}${headImg()}
  ${hline(Lm.crown[1])}${hline(Lm.chin[1])}${hline(Lm.armpitY)}${hline(rig.head.crown)}
  <line x1="${Lm.headTorsoSeam.neckCutX[0]}" x2="${Lm.headTorsoSeam.neckCutX[1]}" y1="${Lm.headTorsoSeam.neckCutY}" y2="${Lm.headTorsoSeam.neckCutY}" class="seam"/>
  ${box(Lm.eyeBox.sL, 'eye')}${box(Lm.eyeBox.sR, 'eye')}${box(Lm.lensRingOuter.sL)}${box(Lm.lensRingOuter.sR)}
  ${box(Lm.ear.sL)}${box(Lm.ear.sR)}${box(Lm.pocket)}${box(Lm.mouth)}
  <polyline points="${pts(Lm.collarOuterV)}" class="trace"/><polyline points="${pts(Lm.collarInnerV)}" class="trace"/>
  <polyline points="${pts(rig.traces.torsoSide.sL)}" class="trace2"/><polyline points="${pts(rig.traces.torsoSide.sR)}" class="trace2"/>
  <polygon points="${pts(rig.traces.sleeve.sL.outline)}" class="trace"/><polygon points="${pts(rig.traces.sleeve.sR.outline)}" class="trace"/>
  <polyline points="${pts(rig.traces.sleeve.sL.hemFold)}" class="trace"/><polyline points="${pts(rig.traces.sleeve.sR.hemFold)}" class="trace"/>
  ${dot(Lm.hairTop, 'j2')}${dot(Lm.crown, 'j2')}${dot(Lm.chin, 'j2')}${dot(Lm.eyeCenter.sL, 'j2')}${dot(Lm.eyeCenter.sR, 'j2')}
  ${dot(Lm.shoulderPoint.sL, 'j2')}${dot(Lm.shoulderPoint.sR, 'j2')}${dot(J.shoulder.sL)}${dot(J.shoulder.sR)}${dot(J.neck)}
  ${dot(Lm.armpit.sL, 'j2')}${dot(Lm.armpit.sR, 'j2')}
  <text x="6" y="${Lm.crown[1] - 4}" class="tl">crown 22</text><text x="6" y="${Lm.chin[1] - 4}" class="tl">chin 326</text>
  <text x="6" y="${Lm.armpitY - 4}" class="tl">armpit line 600</text><text x="392" y="346" class="tl">seam 352</text>
</svg>`

const seamView = (t, label) => `<figure><svg viewBox="236 296 250 100" width="375" height="150" class="checker">${torsoImg()}<g transform="${t}">${headImg()}</g></svg><figcaption>${label}</figcaption></figure>`
const N = J.neck
const seams = [
  seamView('', 'rest (identical to source)'),
  seamView('translate(0 -3)', 'head 3 px up (body bob)'),
  seamView('translate(0 3)', 'head 3 px down'),
  seamView(`rotate(-4 ${N[0]} ${N[1]})`, 'nod -4 deg'),
  seamView(`rotate(4 ${N[0]} ${N[1]})`, 'nod +4 deg'),
].join('')

const swatches = Object.entries(P)
  .map(([k, v]) => `<div class="sw"><span style="background:${v}"></span><b>${v}</b><i>${k}</i></div>`)
  .join('')

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Katie art proof</title>
<style>
  body{margin:0;padding:32px;background:#fff;font:13px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#323338;width:1860px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:28px 0 10px}
  p{margin:0 0 8px;color:#676879;max-width:900px}
  .row{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}
  figure{margin:0} figcaption{color:#676879;margin-top:4px}
  .checker{background:conic-gradient(#e6e9ef 25%,#fff 0 50%,#e6e9ef 0 75%,#fff 0) 0 0/16px 16px;border:1px solid #d0d4e4}
  svg .j{fill:#e2445c;stroke:#fff;stroke-width:2} svg .j2{fill:#0073ea;stroke:#fff;stroke-width:1.5}
  svg .guide{stroke:#0073ea;stroke-width:1.5;stroke-dasharray:8 6} svg .ground{stroke:#323338;stroke-width:3}
  svg .tick{stroke:#323338;stroke-width:3} svg .tl{font:22px Helvetica,Arial;fill:#0073ea}
  svg .lm{fill:none;stroke:#0073ea;stroke-width:1.5} svg .eye{fill:rgba(0,200,117,.25);stroke:#00c875;stroke-width:1.5}
  svg .trace{fill:none;stroke:#ff158a;stroke-width:1.5;stroke-dasharray:4 3} svg .trace2{fill:none;stroke:#fdab3d;stroke-width:2}
  svg .seam{stroke:#e2445c;stroke-width:2} svg .bones line{stroke:#e2445c;stroke-width:3;stroke-dasharray:10 8}
  .sw{display:flex;align-items:center;gap:8px;width:290px;margin:0 0 6px} .sw span{width:40px;height:24px;border:1px solid #c3c6d4;border-radius:4px}
  .sw b{font-family:Menlo,monospace;font-weight:500;width:70px} .sw i{font-style:normal;color:#676879}
  .sws{display:flex;flex-wrap:wrap;width:920px}
  .layers figure svg{width:326px;height:336px}
</style></head><body>
<h1>Katie art proof</h1>
<p>Raster layers from scripts/katie-assets.mjs (lossless WebP, opaque pixels byte-identical to the cutout). Coordinates are source pixels; the rig viewBox is 0 0 652 1544 with the feet on y = 1544. Drawn parts here are grey-box stand-ins built from rig.json to check proportions, not the final drawing.</p>
<h2>1. Layers on a checkerboard</h2>
<div class="row layers">
  <figure><svg viewBox="0 0 652 673" class="checker">${torsoImg()}</svg><figcaption>torso ${TORSO.w}x${TORSO.h} at (${TORSO.x}, ${TORSO.y}); sleeves and arms erased</figcaption></figure>
  <figure><svg viewBox="0 0 652 673" class="checker">${headImg()}</svg><figcaption>head ${HEAD.w}x${HEAD.h} at (${HEAD.x}, ${HEAD.y})</figcaption></figure>
  <figure><svg viewBox="0 0 652 673" class="checker">${torsoImg()}${headImg()}</svg><figcaption>head over torso at rest</figcaption></figure>
  <figure><div class="row" style="gap:12px;align-items:flex-end">
    <img src="${A}katie-avatar-60.png" width="60" height="60" class="checker">
    <img src="${A}katie-avatar-40.png" width="40" height="40" class="checker">
    <img src="${A}katie-avatar-20.png" width="20" height="20" class="checker">
    <img src="${A}katie-avatar-60.png" width="20" height="20" style="border-radius:50%;background:#f6f7fb">
    <img src="${A}katie-avatar-60.png" width="120" height="120" style="image-rendering:pixelated" class="checker">
  </div><figcaption>avatar 60 / 40 / 20, 20 px in a circle, 60 px enlarged</figcaption></figure>
</div>
<h2>2. Head/torso seam under motion (neck region, 1.5x)</h2>
<div class="row">${seams}</div>
<h2>3. Landmarks (blue boxes: lenses, ears, mouth, pocket; green: eye boxes for lids; pink dashed: collar, sleeve traces; orange: torso side lines; red: pivots)</h2>
<div class="row">${landmarks}
  <div><h2 style="margin-top:0">Palette (sampled from the cutout's bytes; "proposed" = not in the art)</h2><div class="sws">${swatches}</div></div>
</div>
<h2>4. Five heads tall: rest, walk contact (hip +-25, knee 20, arms +-15), listen (sR shoulder -120, elbow -128)</h2>
<div class="row">${figure(rig.poses.rest, 'rest')}${figure(rig.poses.walkContact, 'walk contact')}${figure(rig.poses.listen, 'listen: hand to ear')}</div>
</body></html>`

const htmlPath = path.join(HERE, 'proof.html')
await writeFile(htmlPath, html)
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1924, height: 1000 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('requestfailed', (r) => errors.push('failed ' + r.url()))
  await page.goto(pathToFileURL(htmlPath).href)
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  await page.screenshot({ path: path.join(HERE, 'proof.png'), fullPage: true })
  if (errors.length) console.error(errors.join('\n'))
  console.log('wrote docs/katie-art/proof.png')
} finally {
  await browser.close()
}
