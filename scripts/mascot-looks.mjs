// mascot-looks.mjs: recolours Katie's shipped layers into the alternative mascot looks.
//
//   node scripts/mascot-looks.mjs
//
// Reads src/katie/assets/katie-{head,torso}.webp and katie-avatar-{20,40,60}.png, writes
// src/katie/assets/looks/<id>-{head,torso}.webp and <id>-avatar-{20,40,60}.png for every look
// below, and src/katie/looks.generated.ts with the matching colours for the drawn parts (arms,
// hands, legs, eyelids), so the rasters and the SVG always agree: both go through the same map.
//
// Each look moves three colour families of the art, found by hue: hair (the yellow-orange
// band), skin (the red-orange band, lips and blush included) and scrubs (the blue band). Every
// pixel keeps its offset from the family's reference colour, so the art's shading survives: hue
// shifts by the same angle, saturation scales, lightness maps so that the reference lands on the
// target and black and white stay put. Outlines, eye whites, glasses and shoes are untouched.
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(ROOT, 'src/katie/assets')
const OUT = join(ASSETS, 'looks')

// Reference colours: the lit tone of each family in Katie's art (docs/KATIE-ART.md section 3).
const REF = { hair: '#e1b068', skin: '#fbaf85', scrub: '#668bc1' }

// The looks. `name` is shown in Settings; the targets are the lit tone of each family.
export const LOOKS = [
  { id: 'plum', name: 'Plum', hair: '#5b3b29', skin: '#c98a62', scrub: '#8b62b8' },
  { id: 'teal', name: 'Teal', hair: '#b4532c', skin: '#fdc6a6', scrub: '#3c9c97' },
  { id: 'rose', name: 'Rose', hair: '#2f2a2b', skin: '#8f5b3d', scrub: '#cf6a90' },
]

// Katie's drawn-part colours (src/katie/rig.ts COLOR) and the family each belongs to.
const DRAWN = {
  scrubLit: ['#668bc1', 'scrub'],
  scrubShade: ['#46699d', 'scrub'],
  scrubHighlight: ['#8db3dc', 'scrub'],
  skin: ['#fbaf85', 'skin'],
  skinShade: ['#d78064', 'skin'],
  skinLens: ['#f5c8b3', 'skin'],
}

// Eye boxes in source px (KATIE-ART section 4), widened a little; the head layer starts at
// (199, 8). The iris (#b28d6f) sits in the skin hue band, so inside these boxes only strongly
// saturated pixels (the skin seen through the lens) count as skin.
const EYES = [
  [228 - 199, 176 - 8, 300 - 199, 218 - 8],
  [331 - 199, 176 - 8, 400 - 199, 218 - 8],
]

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}
const clamp01 = (v) => Math.min(1, Math.max(0, v))

/** Which family a pixel belongs to, or null (outline, whites, glasses, shoes, brows). */
function family(h, s, l, inEye) {
  if (h >= 195 && h <= 240 && s >= 0.2 && l >= 0.18 && l <= 0.95) return 'scrub'
  if (h >= 28 && h <= 50 && s >= 0.25 && l >= 0.2) return 'hair'
  // Dark warm pixels: the hair's strand lines, the brows, and the soft edge where skin or hair
  // meets the ink. They follow the hair, so dark hair gets dark strands and matching brows.
  if (h >= 8 && h < 28 && s >= 0.2 && l >= 0.06 && l < 0.42) return 'hair'
  if ((h < 28 || h >= 345) && s >= 0.3 && l >= 0.42) {
    if (inEye && s < 0.45) return null
    return 'skin'
  }
  return null
}

/** The map for one family: reference -> target, keeping each pixel's offset from the reference. */
function makeMap(refHex, targetHex) {
  const [hr, sr, lr] = rgbToHsl(...hexToRgb(refHex))
  const [ht, st, lt] = rgbToHsl(...hexToRgb(targetHex))
  const dh = ht - hr
  const ks = sr > 0 ? st / sr : 1
  return (h, s, l) => {
    const l2 = l <= lr ? (l * lt) / lr : 1 - ((1 - l) * (1 - lt)) / (1 - lr)
    return hslToRgb(h + dh, clamp01(s * ks), clamp01(l2))
  }
}

async function recolour(file, look, { eyes = false } = {}) {
  const { data, info } = await sharp(join(ASSETS, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const maps = {
    hair: makeMap(REF.hair, look.hair),
    skin: makeMap(REF.skin, look.skin),
    scrub: makeMap(REF.scrub, look.scrub),
  }
  const counts = { hair: 0, skin: 0, scrub: 0 }
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4
      if (data[i + 3] === 0) continue
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
      const inEye = eyes && EYES.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)
      const fam = family(h, s, l, inEye)
      if (!fam) continue
      const [r, g, b] = maps[fam](h, s, l)
      data[i] = Math.round(r); data[i + 1] = Math.round(g); data[i + 2] = Math.round(b)
      counts[fam]++
    }
  }
  return { img: sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }), counts }
}

mkdirSync(OUT, { recursive: true })
const palettes = {}
for (const look of LOOKS) {
  const head = await recolour('katie-head.webp', look, { eyes: true })
  await head.img.webp({ lossless: true }).toFile(join(OUT, `${look.id}-head.webp`))
  const torso = await recolour('katie-torso.webp', look)
  await torso.img.webp({ lossless: true }).toFile(join(OUT, `${look.id}-torso.webp`))
  for (const px of [20, 40, 60]) {
    const av = await recolour(`katie-avatar-${px}.png`, look)
    await av.img.png({ compressionLevel: 9 }).toFile(join(OUT, `${look.id}-avatar-${px}.png`))
  }
  const maps = { hair: makeMap(REF.hair, look.hair), skin: makeMap(REF.skin, look.skin), scrub: makeMap(REF.scrub, look.scrub) }
  palettes[look.id] = Object.fromEntries(
    Object.entries(DRAWN).map(([k, [hex, fam]]) => [k, rgbToHex(maps[fam](...rgbToHsl(...hexToRgb(hex))))]),
  )
  console.log(look.id, 'head', head.counts, 'torso', torso.counts)
}

const ts = `// Generated by scripts/mascot-looks.mjs. Do not edit by hand.
// The alternative mascot looks: Katie's art recoloured (hair, skin, scrubs). The drawn parts'
// colours went through the same map as the rasters, so the two always match.
${LOOKS.map((l) => `import ${l.id}Head from './assets/looks/${l.id}-head.webp'
import ${l.id}Torso from './assets/looks/${l.id}-torso.webp'
import ${l.id}Avatar20 from './assets/looks/${l.id}-avatar-20.png'
import ${l.id}Avatar40 from './assets/looks/${l.id}-avatar-40.png'
import ${l.id}Avatar60 from './assets/looks/${l.id}-avatar-60.png'`).join('\n')}

export interface GeneratedLook {
  id: string
  name: string
  head: string
  torso: string
  avatar20: string
  avatar40: string
  avatar60: string
  colors: Record<'scrubLit' | 'scrubShade' | 'scrubHighlight' | 'skin' | 'skinShade' | 'skinLens', string>
}

export const GENERATED_LOOKS: readonly GeneratedLook[] = [
${LOOKS.map((l) => `  {
    id: '${l.id}',
    name: '${l.name}',
    head: ${l.id}Head,
    torso: ${l.id}Torso,
    avatar20: ${l.id}Avatar20,
    avatar40: ${l.id}Avatar40,
    avatar60: ${l.id}Avatar60,
    colors: ${JSON.stringify(palettes[l.id])},
  },`).join('\n')}
]
`
writeFileSync(join(ROOT, 'src/katie/looks.generated.ts'), ts)
console.log('wrote src/katie/looks.generated.ts')
