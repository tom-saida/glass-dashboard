/**
 * Path data for every drawn part of Katie, computed once from the rig geometry (rig units).
 * Every path is in REST coordinates; the joint groups in Katie.tsx rotate them about the pivots.
 * Style rules (docs/KATIE-ART.md): one lit tone + one shade shape per part, ink #1b1b1e,
 * 4.5 on silhouettes, 3 on interior lines, 2 on the sleeve seam, round caps and joins.
 */
import { ARM, JOINT, LEG, PELVIS, SHOE, SW, TOP, type Side, type Vec } from './rig'
import { EYE_TRACE, SLEEVE_SHADING } from './traced'
import {
  add,
  curveThrough,
  limb,
  mul,
  offset,
  P,
  poly,
  r1,
  sliceX,
  smooth,
  strip,
  sub,
  unit,
  yAt,
} from './geometry'

const half = (outer: number) => (outer - SW) / 2
const mirror = (s: Side) => (s === 'L' ? -1 : 1)

// ---- traces from rig.json (outer silhouette edge of the art, rest pose) -------------------------
const SLEEVE_TRACE: Record<Side, { outer: Vec[]; hem: Vec[]; inner: Vec[]; fold: Vec[] }> = {
  L: {
    outer: [[156, 389], [147, 400], [137, 420], [130, 440], [124, 460], [117, 480], [110, 500], [102, 520], [94, 540], [89, 552], [88, 558]],
    hem: [[88, 558], [96, 567], [100, 570], [110, 576], [120, 584], [130, 588], [140, 592], [150, 596], [160, 599], [171, 600]],
    inner: [[171, 600], [169, 590], [165, 580], [163, 570], [161, 560], [160, 540], [162, 520], [166, 500], [168, 490], [166, 480], [163, 460], [160, 440], [158, 420], [158, 400], [156, 389]],
    fold: [[98, 546], [110, 554], [120, 561], [130, 567], [140, 572], [150, 576], [160, 580], [168, 583]],
  },
  R: {
    outer: [[498, 388], [509, 400], [518, 420], [525, 440], [532, 460], [538, 480], [545, 500], [553, 520], [561, 540], [566, 552], [567, 558]],
    hem: [[567, 558], [562, 566], [550, 573], [540, 578], [530, 583], [520, 588], [510, 592], [500, 596], [490, 599], [480, 601], [470, 603], [452, 603]],
    inner: [[452, 603], [452, 590], [454, 580], [454, 570], [452, 560], [450, 540], [451, 520], [452, 500], [455, 480], [461, 460], [467, 440], [475, 420], [486, 400], [498, 388]],
    fold: [[553, 546], [540, 555], [530, 561], [520, 566], [510, 571], [500, 575], [490, 579], [480, 581], [470, 584], [459, 586]],
  },
}

/** Body side lines from the shoulder point down (rig.json traces.torsoSide, outer edge). */
const TORSO_SIDE: Record<Side, Vec[]> = {
  L: [[156.5, 392], [158, 400], [158, 410], [158, 420], [159, 430], [160, 440], [161, 450], [163, 460], [165, 470], [166, 480], [168, 490], [166, 500], [163, 510]],
  R: [[495, 392], [486, 400], [481, 410], [475, 420], [470, 430], [467, 440], [465, 450], [461, 460], [457, 470], [455, 480], [454, 490], [452, 500], [451, 510]],
}

/**
 * Overlap tabs: lit scrub under each sleeve cap, reaching about 14 units into the torso just
 * below its shoulder outline, so an inward swing never opens a notch at the shoulder corner.
 * At rest each tab repeats what the raster has there (lit blue, the highlight band on top).
 */
const TAB: Record<Side, { fill: Vec[]; highlight: Vec[] }> = {
  L: {
    fill: [[157.5, 393.5], [163, 391], [166, 389], [170, 387], [174, 385], [178, 384], [179, 400], [177, 420], [172, 438], [164, 448], [160.5, 446], [159, 430], [158, 410]],
    highlight: [[158, 394], [163, 391.5], [166, 389.5], [170, 387.5], [174, 385.5], [178, 384.5], [178, 390], [174, 392], [170, 394], [166, 397], [163, 399], [160, 402]],
  },
  R: {
    fill: [[497, 393], [495, 394], [490, 389.5], [486, 387.5], [482, 385.5], [478, 383.5], [474, 382], [470, 381], [467, 394], [464, 410], [462, 424], [463, 436], [468, 439], [475, 420], [486, 400]],
    highlight: [[495, 394.5], [490, 390], [486, 388], [482, 386], [478, 384], [474, 382.5], [470, 381.5], [470, 387], [474, 389], [478, 391], [482, 393], [486, 395], [490, 399], [494, 402]],
  },
}

// ---- sleeves --------------------------------------------------------------------------------
function sleeve(s: Side) {
  const t = SLEEVE_TRACE[s]
  const m = mirror(s)
  // stroke centre lines: half a stroke inside the traced silhouette; the inner edge sits on the
  // raster's body line below y 490 (1.5 toward the body) and on the thin seam above it
  const outer = offset(t.outer, m * (SW / 2))
  const hem = offset(t.hem, m * (SW / 2))
  const inner = t.inner.map((p, i, a) => {
    const k = Math.max(0, Math.min(1, (p[1] - 485) / 10))
    return offset(a, -m * 1.5 * k)[i]!
  })
  const fill = `M${P(outer[0]!)}${curveThrough(outer)}${curveThrough(hem)}${curveThrough(inner)}Z`
  const seamSplit = inner.findIndex((p) => p[1] <= 490)
  const innerLow = inner.slice(0, seamSplit + 1)
  const innerHigh = inner.slice(seamSplit)
  const sh = SLEEVE_SHADING[s === 'L' ? 'sL' : 'sR']
  return {
    hem,
    fill,
    tab: poly(TAB[s].fill),
    tabHighlight: poly(TAB[s].highlight),
    shade: sh.shade.map((p) => poly(p as Vec[])).join(''),
    highlight: sh.highlight.map((p) => poly(p as Vec[])).join(''),
    outline: `M${P(outer[0]!)}${curveThrough(outer)}${curveThrough(hem)}${curveThrough(innerLow)}`,
    seam: smooth(innerHigh),
    fold: smooth(t.fold),
  }
}

// ---- arms -----------------------------------------------------------------------------------
/** Where the arm leaves the sleeve, on the hem (x of the outer and inner side lines). */
// (outer edges at the art's arm below the hem: skin 116-175 and 471-540 at y 618)
const ARM_TOP_X: Record<Side, { outer: number; inner: number }> = {
  L: { outer: 116.5, inner: 172 },
  R: { outer: 540.5, inner: 467.5 },
}

function arm(s: Side, hem: Vec[]) {
  const m = mirror(s)
  const E = JOINT.elbow[s]
  const W = JOINT.wrist[s]
  const a = ARM[s]
  const rE = half(a.elbow)
  const rW = half(a.wrist)
  const top = ARM_TOP_X[s]
  const x0 = Math.min(top.outer, top.inner)
  const x1 = Math.max(top.outer, top.inner)
  // the upper arm's top runs along the hem centre line, 3 units up, under the sleeve
  const hemSpan = sliceX(hem, x0, x1)
  const topLine = hemSpan.map((p): Vec => [p[0], p[1] - 3])
  const outerTop: Vec = [top.outer, yAt(topLine, top.outer)]
  const innerTop: Vec = [top.inner, yAt(topLine, top.inner)]
  const outerBot: Vec = [E[0] + m * rE, E[1]]
  const innerBot: Vec = [E[0] - m * rE, E[1]]
  // walk: outer top -> outer bottom -> round cap -> inner bottom -> inner top -> along the hem back
  const topBack = (m === 1 ? [...topLine] : [...topLine].reverse()) as Vec[] // inner -> outer
  // the cap arc goes from outerBot to innerBot through the bottom: sweep 0 for L (left to right), 1 for R
  const sweep = s === 'L' ? 0 : 1
  const upperFill =
    `M${P(outerTop)}L${P(outerBot)}A${r1(rE)},${r1(rE)} 0 0 ${sweep} ${P(innerBot)}L${P(innerTop)}` +
    topBack.map((p) => `L${P(p)}`).join('') +
    'Z'
  // one shade shape (clipped to the upper arm): the sleeve's cast shadow under the hem, and the
  // inner side toward the body, run on through the round elbow cap
  const band = [...hemSpan, ...hemSpan.map((p): Vec => [p[0], p[1] + 15]).reverse()]
  const innerStrip = poly([
    [innerTop[0] + 4 * m * -1, innerTop[1]],
    [innerBot[0] - m * 4, innerBot[1] + rE + 4],
    [innerBot[0] + m * rE * 0.52, innerBot[1] + rE + 4],
    [innerTop[0] + m * (x1 - x0) * 0.24, innerTop[1] + 12],
  ])
  const fore = limb(E, W, rE, rW)
  // limb() normal points to screen left for a downward limb: that is the outer side for L
  const foreOuter = s === 'L' ? fore.sideA : fore.sideB
  const foreInner = s === 'L' ? fore.sideB : fore.sideA
  const crease: Vec[] = [
    [E[0] - m * rE * 0.15, E[1] - 2],
    [E[0] - m * rE * 0.55, E[1] + 5],
    [E[0] - m * rE * 0.95, E[1] - 6],
  ]
  return {
    upperFill,
    upperShade: poly(band) + innerStrip,
    upperOuter: `M${P(outerTop)}L${P(outerBot)}`,
    upperInner: `M${P(innerTop)}L${P(innerBot)}`,
    elbowDisc: { cx: E[0], cy: E[1], r: rE },
    foreFill: fore.fill,
    foreShade: strip(E, W, rE + 6, rW + 6, s === 'L' ? -1 : 1, 0.3, -0.2, 1.2),
    foreOuter,
    foreInner,
    crease: `M${P(crease[0]!)}Q${P(crease[1]!)} ${P(crease[2]!)}`,
  }
}

/**
 * The hand, drawn once for the screen-right side in local units (wrist at 0,0, fingers down),
 * thumb toward the body; the left hand is the mirror image. A simple four-finger cartoon hand:
 * three fingers and a thumb.
 */
export const HAND = {
  palm:
    'M-23,-8C-26,12 -30,34 -30,58L-30,94C-30,104 -24,108 -19,108C-14,108 -11,104 -10,99' +
    'C-9,108 -4,114 1,114C6,114 10,108 10,101C11,108 16,110 20,109C26,108 29,102 29,94' +
    'L30,56C30,32 27,12 23,-8Z',
  shade: 'M-34,-8L-34,96L-25,96C-21,84 -19,70 -19,56C-19,40 -16,22 -12,-8Z',
  fingers: 'M-10,99C-10,90 -10,82 -9,74M10,101C10,92 10,84 10,76',
  thumbFill: 'M-20,6C-32,10 -42,26 -42,44C-42,58 -38,68 -31,70C-24,72 -21,64 -22,56C-23,46 -19,34 -12,26Z',
  thumbLine: 'M-20,6C-32,10 -42,26 -42,44C-42,58 -38,68 -31,70C-24,72 -21,64 -22,56C-23,46 -19,34 -12,26',
} as const

/** Per-side placement of the shared hand drawing (translate to the wrist, mirror for L). */
export function handTransform(s: Side): string {
  const W = JOINT.wrist[s]
  const k = ARM[s].handL / 114
  return `translate(${W[0]} ${W[1]}) scale(${r1(mirror(s) * k)} ${r1(k)})`
}

// ---- torso side lines -----------------------------------------------------------------------
function side(s: Side) {
  // half a stroke toward the body from the traced outer edge
  return smooth(offset(TORSO_SIDE[s], mirror(s) * (SW / 2)))
}

// ---- lower scrub top, pelvis ----------------------------------------------------------------
function lowerTop() {
  const L = TOP.sideL
  const R = TOP.sideR
  const cL = L[L.length - 1]!
  const cR = R[R.length - 1]!
  const ctrl: Vec = [310, 2 * TOP.hemCentreY - TOP.hemY]
  const Rrev = [...R].reverse()
  const fill =
    `M${P(L[0]!)}${curveThrough(L)}Q${P(ctrl)} ${P(cR)}${curveThrough(Rrev)}Z`
  // hem fold: the hem curve raised by the band height, inset to the side lines
  const fy = TOP.hemY - TOP.band
  const foldL: Vec = [cL[0] + 1.5, fy]
  const foldR: Vec = [cR[0] - 1.5, fy]
  const fold = `M${P(foldL)}Q${P([310, ctrl[1] - TOP.band])} ${P(foldR)}`
  return {
    fill,
    sideL: smooth(L),
    sideR: smooth(R),
    hem: `M${P(cL)}Q${P(ctrl)} ${P(cR)}`,
    fold,
  }
}

/**
 * Pants top. Each thigh carries a full disc of radius rH around its hip joint (round top cap +
 * body), so the pelvis only has to cover what lies above the hip line and the crotch gusset
 * between the two hip discs; the thighs swing under it without opening a gap.
 */
function pelvis() {
  const rH = half(LEG.thighHip)
  const HL = JOINT.hip.L
  const HR = JOINT.hip.R
  const yT = PELVIS.top
  const yH = HL[1]
  // sides: straight down from under the top's hem to each hip disc's outermost point
  const lT: Vec = [HL[0] - rH - 2, yT]
  const lH: Vec = [HL[0] - rH, yH]
  const rT: Vec = [HR[0] + rH + 2, yT]
  const rHp: Vec = [HR[0] + rH, yH]
  // gusset: from the hip line down to a point on each disc's inner rim (angle g), then a
  // shallow V to the crotch point
  const g = (38 * Math.PI) / 180
  const arcL: Vec = [HL[0] + rH * Math.cos(g), yH + rH * Math.sin(g)]
  const arcR: Vec = [HR[0] - rH * Math.cos(g), yH + rH * Math.sin(g)]
  const crotch: Vec = [(HL[0] + HR[0]) / 2, PELVIS.crotchY]
  // the gusset is wider than the cusp between the discs so it also hides the two thighs' inner
  // side lines, which meet at the centre, down to the crotch point
  const gw = 14
  const fill =
    `M${P(lT)}L${P(lH)}L${P([crotch[0] - gw, yH])}L${P(arcL)}L${P(crotch)}L${P(arcR)}` +
    `L${P([crotch[0] + gw, yH])}L${P(rHp)}L${P(rT)}Z`
  // the scrub top's cast shadow across the pants, just under its hem
  const hemY = (x: number) => {
    const t = (x - 180) / 260
    return TOP.hemY + 4 * (TOP.hemCentreY - TOP.hemY) * t * (1 - t)
  }
  const xs = Array.from({ length: 9 }, (_, i) => lH[0] - 4 + ((rHp[0] - lH[0] + 8) * i) / 8)
  const top = xs.map((x): Vec => [x, hemY(x) - 2])
  const bottom = xs.map((x): Vec => [x, hemY(x) + 16]).reverse()
  const ys = TOP.hemY - 8
  return {
    fill,
    shade: poly([...top, ...bottom]),
    clip: fill,
    sides: `M${P([lT[0] + ((lH[0] - lT[0]) * (ys - yT)) / (yH - yT), ys])}L${P(lH)}` +
      `M${P([rT[0] + ((rHp[0] - rT[0]) * (ys - yT)) / (yH - yT), ys])}L${P(rHp)}`,
    crotch: `M${P(arcL)}L${P(crotch)}L${P(arcR)}`,
  }
}

// ---- legs -----------------------------------------------------------------------------------
function leg(s: Side) {
  const H = JOINT.hip[s]
  const K = JOINT.knee[s]
  const A = JOINT.ankle[s]
  const rH = half(LEG.thighHip)
  const rK = half(LEG.thighKnee)
  const rHem = half(LEG.shinHem)
  const inward: 1 | -1 = s === 'L' ? -1 : 1 // limb() normal is screen left; the inner side of L is +x
  const thigh = limb(H, K, rH, rK)
  const hemC: Vec = [A[0], LEG.pantsHemY]
  const n = thigh.n // (-1, 0) for a vertical limb
  const k1 = add(K, mul(n, rK))
  const k2 = sub(K, mul(n, rK))
  const h1 = add(hemC, mul(n, rHem))
  const h2 = sub(hemC, mul(n, rHem))
  const shinFill = `M${P(k1)}L${P(h1)}L${P(h2)}L${P(k2)}A${r1(rK)},${r1(rK)} 0 0 0 ${P(k1)}Z`
  const fy = LEG.pantsHemY - LEG.hemBand
  const f1 = add([A[0], fy], mul(n, rHem + 0.3))
  const f2 = sub([A[0], fy], mul(n, rHem + 0.3))
  return {
    thighFill: thigh.fill,
    // sides plus the round top cap: the cap's arc bridges the pelvis side and a swung thigh
    thighLine: `M${P(thigh.b2)}L${P(thigh.a2)}A${r1(rH)},${r1(rH)} 0 0 0 ${P(thigh.a1)}L${P(thigh.b1)}`,
    thighShade: strip(H, add(K, [0, rK]), rH + 6, rK + 6, inward, 0.22, 0.1, 1),
    kneeDisc: { cx: K[0], cy: K[1], r: rK },
    shinFill,
    shinShade: strip(add(K, [0, -rK]), hemC, rK + 6, rHem + 6, inward, 0.22, 0, 1),
    shinSides: `M${P(k1)}L${P(h1)}L${P(h2)}L${P(k2)}`,
    shinFold: `M${P(f1)}L${P(f2)}`,
  }
}

/** White sneaker in profile, toe toward +x (the facing direction), local to the ankle. */
function shoe(s: Side) {
  const A = JOINT.ankle[s]
  const g = 1544 - A[1] // ankle to ground: 66
  const sole = g - SHOE.sole
  const heel = -SHOE.heel
  const toe = SHOE.toe
  const top = -22 // collar, hidden under the pants hem
  const body =
    `M${heel + 3},${g}L${toe - 18},${g}C${toe - 4},${g} ${toe + 2},${g - 8} ${toe},${sole - 4}` +
    `C${toe - 2},${sole - 16} ${toe - 16},${sole - 26} ${toe - 38},${sole - 31}` +
    `C${toe - 60},${sole - 36} ${toe - 76},${sole - 46} ${toe - 86},${top + 10}L${toe - 92},${top}` +
    `L${heel + 6},${top}C${heel},${top + 20} ${heel - 2},${sole - 10} ${heel},${sole + 4}C${heel},${g - 4} ${heel},${g} ${heel + 3},${g}Z`
  const soleFill =
    `M${heel + 3},${g}L${toe - 18},${g}C${toe - 4},${g} ${toe + 2},${g - 8} ${toe},${sole - 4}L${toe - 6},${sole}L${heel},${sole}C${heel},${g - 4} ${heel},${g} ${heel + 3},${g}Z`
  const soleLine = `M${heel + 1},${sole}L${toe - 6},${sole}`
  const shade = `M${heel + 2},${top + 14}C${heel + 1},${top + 40} ${heel + 1},${sole - 14} ${heel + 2},${sole - 2}L${heel + 34},${sole - 2}C${heel + 22},${sole - 14} ${heel + 14},${top + 36} ${heel + 12},${top + 14}Z`
  // laces: three short ink dashes across the vamp
  const v0: Vec = [toe - 86, top + 10]
  const v1: Vec = [toe - 38, sole - 31]
  const dir = unit(sub(v1, v0))
  const into: Vec = [-dir[1], dir[0]] // below the vamp line, inside the shoe
  const laces = [0.3, 0.52, 0.74]
    .map((t) => {
      const p = add(v0, mul(sub(v1, v0), t))
      return `M${P(add(p, mul(into, 4)))}L${P(add(add(p, mul(into, 15)), mul(dir, 5)))}`
    })
    .join('')
  return { transform: `translate(${A[0]} ${A[1]})`, body, soleFill, soleLine, shade, laces }
}

// ---- eyelids --------------------------------------------------------------------------------
function lid(s: 'sL' | 'sR') {
  const e = EYE_TRACE[s]
  const xs = e.lid.map((p) => p[0])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  return {
    fill: smooth(e.lid as Vec[], true),
    lash: smooth(e.lower as Vec[]),
    origin: [r1(cx), e.crest - 1] as Vec,
  }
}

// ---- torso raster clip ----------------------------------------------------------------------
/**
 * The torso layer keeps a few rows of the original sleeves just under each shoulder corner
 * (the asset erases outside the side lines only from y 400 down). The drawn sleeves cover them
 * at rest; once a sleeve swings away they would show as a dark spur, so the torso image is
 * clipped along the seam there. Measured on katie-torso.webp (rows 389-401).
 */
const TORSO_CLIP: Vec[] = [
  [140, 330], [515, 330], [515, 383], [497, 383], [497, 390], [494.5, 393], [491, 396], [489.5, 400],
  [489.5, 402], [515, 402], [515, 675], [140, 675], [140, 402], [157.5, 402], [157.5, 397], [155.5, 392],
  [155.5, 384], [140, 384],
]

// ---- assembled ------------------------------------------------------------------------------
const sleeveL = sleeve('L')
const sleeveR = sleeve('R')

export const PARTS = {
  sleeve: { L: sleeveL, R: sleeveR },
  arm: { L: arm('L', sleeveL.hem), R: arm('R', sleeveR.hem) },
  side: { L: side('L'), R: side('R') },
  lowerTop: lowerTop(),
  pelvis: pelvis(),
  leg: { L: leg('L'), R: leg('R') },
  shoe: { L: shoe('L'), R: shoe('R') },
  lid: { L: lid('sL'), R: lid('sR') },
  torsoClip: poly(TORSO_CLIP),
} as const
