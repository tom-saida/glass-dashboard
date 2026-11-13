// The look of the glass (docs/DESIGN-GLASS.md section 9): every ingredient of the pane, its edge,
// the cards and the type is a per-browser setting that Settings edits live. One JSON value under
// katie.look; a missing or broken value means the default preset. Storage access is wrapped: a
// private window or blocked storage throws, and the look still applies for this tab. Nothing here
// is data about calls or people.

export type Backdrop = 'room' | 'room-clear' | 'photo' | 'field'
export type Tint = 'light' | 'dark'
export type EdgeStyle = 'shipped' | 'crisp' | 'gradient'
export type TextSize = 'shipped' | 'larger' | 'largest'

export interface Look {
  /** What is behind the glass: the shipped office, the same office less graded, a dusk office photo, a colour field with shapes. */
  backdrop: Backdrop
  /** Light glass with dark ink, or dark glass with white ink. */
  tint: Tint
  /** The pane's fill opacity, 0.15 to 0.95. */
  paneA: number
  /** The pane's blur, 0 to 40 px. */
  blur: number
  /** Colour boost under the blur, 1 to 1.9. */
  sat: number
  /** The pane's corner radius, 12 to 52 px. */
  radius: number
  /** The edge: the shipped 4 px soft ring, one crisp hairline, or a gradient rim lit at two corners. */
  edge: EdgeStyle
  /** A feathered band inside the edge, 0 to 36 px. */
  edgeG: number
  /** A one-pixel light along the top and left, a shade along the bottom. */
  lit: boolean
  /** A diagonal highlight across the pane. */
  sheen: boolean
  /** The pane's drop shadow. */
  shadow: boolean
  /** The shipped 60 px white glow inside the edge. */
  glow: boolean
  /** A faint noise texture. */
  grain: boolean
  /** Bends the backdrop near the edge (an SVG displacement filter; Chromium only). */
  lens: boolean
  /** The three glass objects at the corners. */
  objects: boolean
  /** Card fill opacity, 0.2 to 0.95. */
  cardA: number
  /** A one-pixel white edge on the cards. */
  cardEdge: boolean
  /** Cards blur what is behind them (the pane and the room). */
  cardBlur: boolean
  /** Card corner radius, 8 to 28 px. */
  cardR: number
  /** Everything inside the pane at 100, 107 or 114 %, the KPI numbers at 28, 34 or 40 px. */
  textSize: TextSize
  /** Text drawn with the browser's default smoothing instead of the thinner antialiased mode. */
  crispText: boolean
}

export type PresetName = 'shipped' | 'recipe' | 'tweak' | 'apple'

/** The four reference looks (Settings shows them as Daylight, Frost, Dusk and Original). "tweak" is the default: the researched recipe with Tom's 11-02 changes. */
export const PRESETS: Readonly<Record<PresetName, Readonly<Look>>> = {
  shipped: {
    backdrop: 'room',
    tint: 'light',
    paneA: 0.72,
    blur: 28,
    sat: 1.25,
    radius: 24,
    edge: 'shipped',
    edgeG: 0,
    lit: false,
    sheen: false,
    shadow: true,
    glow: true,
    grain: false,
    lens: false,
    objects: true,
    cardA: 0.72,
    cardEdge: true,
    cardBlur: true,
    cardR: 16,
    textSize: 'shipped',
    crispText: false,
  },
  recipe: {
    backdrop: 'field',
    tint: 'light',
    paneA: 0.26,
    blur: 18,
    sat: 1.6,
    radius: 44,
    edge: 'crisp',
    edgeG: 0,
    lit: true,
    sheen: true,
    shadow: true,
    glow: false,
    grain: false,
    lens: false,
    objects: false,
    cardA: 0.6,
    cardEdge: true,
    cardBlur: false,
    cardR: 20,
    textSize: 'larger',
    crispText: true,
  },
  tweak: {
    backdrop: 'field',
    tint: 'light',
    paneA: 0.26,
    blur: 14,
    sat: 1.6,
    radius: 44,
    edge: 'gradient',
    edgeG: 18,
    lit: true,
    sheen: true,
    shadow: true,
    glow: false,
    grain: false,
    lens: false,
    objects: false,
    cardA: 0.6,
    cardEdge: true,
    cardBlur: false,
    cardR: 20,
    textSize: 'larger',
    crispText: true,
  },
  apple: {
    backdrop: 'photo',
    tint: 'dark',
    paneA: 0.24,
    blur: 14,
    sat: 1.6,
    radius: 36,
    edge: 'gradient',
    edgeG: 16,
    lit: true,
    sheen: false,
    shadow: true,
    glow: false,
    grain: false,
    lens: true,
    objects: false,
    cardA: 0.36,
    cardEdge: true,
    cardBlur: false,
    cardR: 20,
    textSize: 'larger',
    crispText: true,
  },
}

export const DEFAULT_PRESET: PresetName = 'tweak'
export const DEFAULT_LOOK: Readonly<Look> = PRESETS[DEFAULT_PRESET]

export const LOOK_RANGES = {
  paneA: { min: 0.15, max: 0.95, step: 0.01 },
  blur: { min: 0, max: 40, step: 1 },
  sat: { min: 1, max: 1.9, step: 0.05 },
  radius: { min: 12, max: 52, step: 2 },
  edgeG: { min: 0, max: 36, step: 1 },
  cardA: { min: 0.2, max: 0.95, step: 0.01 },
  cardR: { min: 8, max: 28, step: 1 },
} as const

type NumberKey = keyof typeof LOOK_RANGES

const KEY = 'katie.look'

const BACKDROPS: readonly Backdrop[] = ['room', 'room-clear', 'photo', 'field']
const TINTS: readonly Tint[] = ['light', 'dark']
const EDGES: readonly EdgeStyle[] = ['shipped', 'crisp', 'gradient']
const TEXT_SIZES: readonly TextSize[] = ['shipped', 'larger', 'largest']

/** A number, or a plain decimal string ("14", "0.26"); null, "", [] and "0x10" are not numbers here. */
function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v)
  return null
}

function clampNumber(key: NumberKey, v: unknown, fallback: number): number {
  const n = asNumber(v)
  if (n === null) return fallback
  const r = LOOK_RANGES[key]
  const c = Math.min(r.max, Math.max(r.min, n))
  // Snap to the step so a stored value always matches a slider position, through toFixed at the
  // step's own decimals: 35 * 0.01 is 0.35000000000000003 in floating point, which would never
  // equal a preset's 0.35, so the pressed preset would not show and the default would not clear.
  return Number((Math.round(c / r.step) * r.step).toFixed(STEP_DECIMALS[key]))
}

/** Decimals of each range's step (0.01 → 2, 0.5 → 1, 2 → 0), for the snap above. */
const STEP_DECIMALS = Object.fromEntries(
  (Object.keys(LOOK_RANGES) as NumberKey[]).map((k) => [k, (String(LOOK_RANGES[k].step).split('.')[1] ?? '').length]),
) as Record<NumberKey, number>

function pick<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/**
 * Every field checked and clamped; anything missing or wrong falls back to `base` (the default
 * preset for a stored value, the current look for a patch). A stored `{ preset: name }` means that
 * preset (the verifier opens a build under the shipped look that way), with any other fields laid
 * over it.
 */
export function sanitizeLook(raw: unknown, base: Readonly<Look> = DEFAULT_LOOK): Look {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = typeof o.preset === 'string' && Object.prototype.hasOwnProperty.call(PRESETS, o.preset) ? PRESETS[o.preset as PresetName] : base
  return {
    backdrop: pick(BACKDROPS, o.backdrop, d.backdrop),
    tint: pick(TINTS, o.tint, d.tint),
    paneA: clampNumber('paneA', o.paneA, d.paneA),
    blur: clampNumber('blur', o.blur, d.blur),
    sat: clampNumber('sat', o.sat, d.sat),
    radius: clampNumber('radius', o.radius, d.radius),
    edge: pick(EDGES, o.edge, d.edge),
    edgeG: clampNumber('edgeG', o.edgeG, d.edgeG),
    lit: bool(o.lit, d.lit),
    sheen: bool(o.sheen, d.sheen),
    shadow: bool(o.shadow, d.shadow),
    glow: bool(o.glow, d.glow),
    grain: bool(o.grain, d.grain),
    lens: bool(o.lens, d.lens),
    objects: bool(o.objects, d.objects),
    cardA: clampNumber('cardA', o.cardA, d.cardA),
    cardEdge: bool(o.cardEdge, d.cardEdge),
    cardBlur: bool(o.cardBlur, d.cardBlur),
    cardR: clampNumber('cardR', o.cardR, d.cardR),
    textSize: pick(TEXT_SIZES, o.textSize, d.textSize),
    crispText: bool(o.crispText, d.crispText),
  }
}

const LOOK_KEYS = Object.keys(DEFAULT_LOOK) as (keyof Look)[]

function sameLook(a: Readonly<Look>, b: Readonly<Look>): boolean {
  return LOOK_KEYS.every((k) => a[k] === b[k])
}

/** The preset a look equals, if any (the pressed option in Settings). */
export function presetOf(look: Readonly<Look>): PresetName | null {
  for (const name of Object.keys(PRESETS) as PresetName[]) if (sameLook(PRESETS[name], look)) return name
  return null
}

/** `?look=reset` in the address: forget the stored look. The way back when a look cannot be read. */
function resetAsked(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('look') === 'reset'
  } catch {
    return false
  }
}

function read(): Look {
  try {
    if (resetAsked()) {
      window.localStorage.removeItem(KEY)
      return DEFAULT_LOOK
    }
    const raw = window.localStorage.getItem(KEY)
    return raw ? sanitizeLook(JSON.parse(raw)) : DEFAULT_LOOK
  } catch {
    return DEFAULT_LOOK
  }
}

function write(look: Readonly<Look>): void {
  try {
    if (presetOf(look) === DEFAULT_PRESET) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, JSON.stringify(look))
  } catch {
    /* storage blocked: the in-memory look still applies for this tab */
  }
}

let state: Readonly<Look> = typeof window !== 'undefined' ? read() : DEFAULT_LOOK
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function getLook(): Readonly<Look> {
  return state
}

export function subscribeLook(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function updateLook(patch: Partial<Look>): void {
  const next = sanitizeLook({ ...state, ...patch }, state)
  if (sameLook(next, state)) return
  state = next
  write(state)
  applyLook(state)
  emit()
}

export function setLookPreset(name: PresetName): void {
  updateLook(PRESETS[name])
}

/**
 * The refraction filter is an SVG displacement map used as a backdrop-filter, which only Chromium
 * renders (WebKit bug 245510; Firefox ignores it). Elsewhere the switch stays off, so the pane
 * never loses its blur to a filter the browser cannot run. Chromium is read from the user-agent
 * client hints (Chrome, Edge, Brave, Opera and headless all list the "Chromium" brand; Safari and
 * Firefox have no userAgentData), falling back to window.chrome on a non-iOS browser (Chrome on
 * iOS is WebKit).
 */
function chromium(): boolean {
  if (typeof window === 'undefined') return false
  const uad = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData
  if (uad?.brands) return uad.brands.some((b) => b.brand === 'Chromium')
  return 'chrome' in window && !/iPhone|iPad|iPod/.test(navigator.userAgent)
}

export const LENS_SUPPORTED: boolean = chromium()

/**
 * The room around the pane: 1 % of each axis of the window, at least 16 px. The same on every
 * preset and not a control (Tom, 2026-11-02: moving it live reflowed the whole page and read as a
 * glitch, and there was no need for it). The one part of the look that depends on the window's size.
 */
export const PANE_MARGIN_PCT = 1

export function slabInsets(w: number, h: number): { x: number; y: number } {
  return {
    x: Math.max(16, Math.round((w * PANE_MARGIN_PCT) / 100)),
    y: Math.max(16, Math.round((h * PANE_MARGIN_PCT) / 100)),
  }
}

/** The two inset variables onto <html>. */
function applyInsets(): void {
  const { x, y } = slabInsets(window.innerWidth, window.innerHeight)
  const s = document.documentElement.style
  s.setProperty('--slab-inset', `${x}px`)
  s.setProperty('--slab-inset-y', `${y}px`)
}

/**
 * Writes the look onto <html>: data-look-* attributes for the choices and switches, --look-* and
 * the inset variables for the numbers (styles/glass.css reads them, nothing else does; the
 * stylesheet's fallbacks for no backdrop-filter and reduced transparency are !important, so they
 * beat the inline fill values). data-look-lens is read by no stylesheet: it says, for anyone
 * inspecting the page, that the refraction filter is in the pane's inline backdrop-filter. That
 * filter is set inline on the pane when it is mounted: WebKit does not resolve var() inside
 * backdrop-filter (bug 297620), and that is also where the refraction filter is composed.
 */
export function applyLook(look: Readonly<Look> = state): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  const s = el.style
  const set = (k: string, v: string) => el.setAttribute(k, v)
  const flag = (k: string, on: boolean) => {
    if (on) el.setAttribute(k, '1')
    else el.removeAttribute(k)
  }
  set('data-look-backdrop', look.backdrop)
  set('data-look-tint', look.tint)
  set('data-look-edge', look.edge)
  set('data-look-text', look.textSize)
  flag('data-look-lit', look.lit)
  flag('data-look-sheen', look.sheen)
  flag('data-look-shadow', look.shadow)
  flag('data-look-glow', look.glow)
  flag('data-look-grain', look.grain)
  flag('data-look-lens', look.lens && LENS_SUPPORTED)
  flag('data-look-objects', look.objects)
  flag('data-look-card-edge', look.cardEdge)
  flag('data-look-card-blur', look.cardBlur)
  flag('data-look-crisp', look.crispText)
  s.setProperty('--look-pane-a', String(look.paneA))
  s.setProperty('--look-blur', `${look.blur}px`)
  s.setProperty('--look-sat', String(look.sat))
  s.setProperty('--look-radius', `${look.radius}px`)
  s.setProperty('--look-edge-g', `${look.edgeG}px`)
  s.setProperty('--look-card-a', String(look.cardA))
  s.setProperty('--look-card-r', `${look.cardR}px`)
  applyInsets()
  const pane = document.querySelector<HTMLElement>('.pane-glass')
  if (pane) {
    const plain = `blur(${look.blur}px) saturate(${look.sat})`
    pane.style.setProperty('-webkit-backdrop-filter', plain)
    pane.style.setProperty('backdrop-filter', look.lens && LENS_SUPPORTED ? `url(#rimlens) ${plain}` : plain)
  }
}

if (typeof window !== 'undefined') {
  applyLook(state)
  let raf = 0
  window.addEventListener('resize', () => {
    if (raf) return
    raf = window.requestAnimationFrame(() => {
      raf = 0
      applyInsets()
    })
  })
  // Another tab changed the look (or cleared the site's storage, key null): follow it.
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === KEY) {
      state = read()
      applyLook(state)
      emit()
    }
  })
}
