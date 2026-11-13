#!/usr/bin/env node
// contrast-probe.mjs: text contrast measured on the rendered glass (DESIGN-GLASS 8.3).
//
//   node scripts/contrast-probe.mjs              serve dist/ with vite preview, probe, stop it
//   PROBE_URL=http://127.0.0.1:5190/dash/ node scripts/contrast-probe.mjs   probe a running build
//
// Environment: PROBE_PORT (default 5191, the preview this script starts), PROBE_DIST (default
// dist), PROBE_OUT (default docs/perf/contrast.json).
//
// The glass is translucent and the room behind it is a photo, so a token's contrast on paper says
// little. For every text class it finds the elements on the page, takes the box of each element's
// own text (its text nodes' client rects), hides all text on the page (color transparent, icons
// hidden), takes one screenshot, and reads the darkest and lightest pixel inside each box: the
// background the glyphs actually sit on. WCAG contrast of the element's text color against both,
// the worse one counts. Sizes 1280 x 800 and 1440 x 900, ?mock=demo and ?mock=empty, Overview,
// Katie off screen, after the slab's entrance has settled.
//
// Classes and their floors: ink on cards 7:1 (14 px body text); every secondary text 4.5:1 (on
// cards and directly on the slab: the top bar date, "Made by SAIDA", "Demo data", the rail count);
// inactive nav text 4.5:1 and its icons 3:1 (WCAG 1.4.11, non-text); chip text on its fill 4.5:1;
// white on the active nav pill 4.5:1; other colored text on cards (comparison line, links) 4.5:1;
// ink directly on the slab (titles, the practice name, the glass pills) 7:1.
//
// Writes PROBE_OUT and prints a table. Exit code 1 when a class misses its floor.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PROBE_PORT || 5191)
const OUT = path.resolve(ROOT, process.env.PROBE_OUT || 'docs/perf/contrast.json')
const SIZES = [
  [1280, 800],
  [1440, 900],
]
const QUERIES = ['?mock=demo', '?mock=empty']
const FLOORS = {
  'ink-card': 7,
  'secondary-card': 4.5,
  'secondary-slab': 4.5,
  'nav-inactive': 4.5,
  'nav-icon': 3,
  chip: 4.5,
  'nav-active': 4.5,
  'other-card': 4.5,
  'ink-slab': 7,
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------ server

let server = null
async function base() {
  if (process.env.PROBE_URL) return process.env.PROBE_URL.replace(/\/?$/, '/')
  const dist = path.resolve(ROOT, process.env.PROBE_DIST || 'dist')
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error(`no build at ${dist}: run npm run build first`)
  server = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1', '--outDir', dist],
    { cwd: ROOT, stdio: 'ignore' },
  )
  const url = `http://127.0.0.1:${PORT}/dash/`
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return url
    } catch {
      // not up yet
    }
    await sleep(150)
  }
  throw new Error(`vite preview did not answer on ${url}`)
}
function stop() {
  if (server && server.exitCode === null) server.kill('SIGTERM')
}
process.on('exit', stop)

// ------------------------------------------------------------------ colour maths

const lin = (c) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const parseRgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number)

// ------------------------------------------------------------------ in the page

/** Every probed element: its class, a label, the box of its own text (or icon), its color. */
const collect = () => {
  const out = []
  const layer = document.querySelector('[data-katie-stage]')
  const slab = document.querySelector('[data-katie-floor]')
  const content = document.getElementById('content')?.getBoundingClientRect()
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--primary-text-color').trim()
  const toRgb = (c) => {
    const d = document.createElement('span')
    d.style.color = c
    document.body.appendChild(d)
    const v = getComputedStyle(d).color
    d.remove()
    return v
  }
  const INK = toRgb(ink)
  const SECONDARY = toRgb(getComputedStyle(document.documentElement).getPropertyValue('--secondary-text-color').trim())
  const visibleIn = (r, el) => {
    if (r.width < 1 || r.height < 1) return false
    if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return false
    if (content && el.closest('main') && (r.top < content.top || r.bottom > content.bottom)) return false
    return true
  }
  const textBox = (el) => {
    const rects = []
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) rects.push(r)
    }
    if (!rects.length) return null
    const l = Math.min(...rects.map((r) => r.left))
    const t = Math.min(...rects.map((r) => r.top))
    const rr = Math.max(...rects.map((r) => r.right))
    const b = Math.max(...rects.map((r) => r.bottom))
    return { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t }
  }
  const label = (el) => {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    // no digits in the evidence (masked numbers stay masked); the demo's names are made up
    return own.replace(/\d/g, '#').slice(0, 28)
  }
  /** Visually hidden (the chart's screen-reader table: clip rect(0 0 0 0)): not seen, not probed. */
  const clipped = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const c = getComputedStyle(a)
      if ((c.clip !== 'auto' && c.clip !== '') || c.clipPath === 'inset(50%)') return true
    }
    return false
  }
  for (const el of document.querySelectorAll('body *')) {
    if (layer && layer.contains(el)) continue
    if (el.closest('.visually-hidden') || clipped(el)) continue
    if (!slab || !slab.contains(el)) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue
    const nav = el.closest('nav[aria-label="Main"] a')
    const active = nav?.getAttribute('aria-current') === 'page'
    if (el.tagName.toLowerCase() === 'svg') {
      if (!nav || active) continue
      const r = el.getBoundingClientRect()
      if (!visibleIn(r, el)) continue
      out.push({ cls: 'nav-icon', label: `icon: ${nav.innerText.split('\n')[0].trim()}`, box: { left: r.left, top: r.top, width: r.width, height: r.height }, color: cs.color, size: `${Math.round(r.width)}px` })
      continue
    }
    let box = textBox(el)
    if (!box) continue
    // a text cut by its own box (ellipsis, line clamp) only shows inside it: clip to it
    const own = el.getBoundingClientRect()
    const l = Math.max(box.left, own.left)
    const t = Math.max(box.top, own.top)
    const rr = Math.min(box.right, own.right)
    const bb = Math.min(box.bottom, own.bottom)
    box = { left: l, top: t, right: rr, bottom: bb, width: rr - l, height: bb - t }
    // visually hidden text (the chart's screen-reader table: a 1 px clipped box) is not seen
    if (box.width < 2 || box.height < 4 || !visibleIn(box, el)) continue
    const chip = el.closest('[class*="_chip_"]')
    const card = el.closest('main section')
    let cls
    if (chip) cls = 'chip'
    else if (nav) cls = active ? 'nav-active' : 'nav-inactive'
    else if (card) cls = cs.color === INK ? (cs.fontSize === '14px' ? 'ink-card' : 'ink-card-other') : cs.color === SECONDARY ? 'secondary-card' : 'other-card'
    else cls = cs.color === SECONDARY ? 'secondary-slab' : cs.color === INK ? 'ink-slab' : 'other-slab'
    if (cls === 'ink-card-other') cls = 'ink-card'
    out.push({ cls, label: label(el), box: { left: box.left, top: box.top, width: box.width, height: box.height }, color: cs.color, size: cs.fontSize })
  }
  return out
}

const HIDE_TEXT = `
  *, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }
  svg { visibility: hidden !important; }
  [data-katie-stage] { visibility: hidden !important; }
`

// ------------------------------------------------------------------ run

async function probe(browser, url, w, h, q) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(`${url}${q}`)
  await page.waitForSelector('[data-line-tile]')
  await page.mouse.move(Math.round(w / 2), 8) // over the room's top margin: no hover anywhere
  // Katie off screen: wave off whatever she is doing and wait until she is gone
  for (let i = 0; i < 80; i++) {
    const off = await page.evaluate(() => {
      const s = window.__katieStage?.state()
      return !s || (s.moment === null && s.offscreen)
    })
    if (off && i > 28) break
    if (!off) await page.keyboard.press('Escape')
    await sleep(100)
  }
  await page.waitForFunction(
    () => document.getAnimations().length === 0 && document.fonts.status === 'loaded' && !document.querySelector('[aria-busy="true"]'),
    null,
    { timeout: 8000 },
  )
  await sleep(300)
  const items = await page.evaluate(collect)
  await page.addStyleTag({ content: HIDE_TEXT })
  await sleep(250)
  const png = await page.screenshot()
  await ctx.close()
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const rows = []
  for (const it of items) {
    const x0 = Math.max(0, Math.floor(it.box.left))
    const y0 = Math.max(0, Math.floor(it.box.top))
    const x1 = Math.min(info.width, Math.ceil(it.box.left + it.box.width))
    const y1 = Math.min(info.height, Math.ceil(it.box.top + it.box.height))
    let lo = Infinity
    let hi = -Infinity
    let loPx = null
    let hiPx = null
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * info.width + x) * info.channels
        const L = lum(data[i], data[i + 1], data[i + 2])
        if (L < lo) {
          lo = L
          loPx = [data[i], data[i + 1], data[i + 2]]
        }
        if (L > hi) {
          hi = L
          hiPx = [data[i], data[i + 1], data[i + 2]]
        }
      }
    }
    if (loPx === null) continue
    const [r, g, b] = parseRgb(it.color)
    const Lt = lum(r, g, b)
    const worst = Math.min(ratio(Lt, lo), ratio(Lt, hi))
    rows.push({
      cls: it.cls,
      label: it.label,
      size: it.size,
      text: it.color,
      darkest: `rgb(${loPx.join(', ')})`,
      lightest: `rgb(${hiPx.join(', ')})`,
      vsDarkest: +ratio(Lt, lo).toFixed(2),
      vsLightest: +ratio(Lt, hi).toFixed(2),
      worst: +worst.toFixed(2),
    })
  }
  return rows
}

async function main() {
  const url = await base()
  const browser = await chromium.launch()
  const runs = []
  try {
    for (const [w, h] of SIZES) {
      for (const q of QUERIES) {
        const rows = await probe(browser, url, w, h, q)
        runs.push({ size: `${w}x${h}`, query: q, rows })
      }
    }
  } finally {
    await browser.close()
    stop()
  }
  const classes = {}
  for (const run of runs) {
    for (const r of run.rows) {
      const c = (classes[r.cls] ??= { floor: FLOORS[r.cls] ?? 4.5, count: 0, worst: null })
      c.count++
      if (!c.worst || r.worst < c.worst.worst) c.worst = { ...r, size: run.size, query: run.query, fontSize: r.size }
    }
  }
  let ok = true
  for (const c of Object.values(classes)) {
    c.pass = c.worst.worst >= c.floor
    if (!c.pass) ok = false
  }
  const result = {
    at: new Date().toISOString(),
    method:
      'Rendered page, device scale 1, headless Chromium (software): every text hidden (color transparent, icons hidden), one screenshot, the darkest and lightest pixel inside each element\'s own text box; WCAG ratio of the text color against both, the worse counts.',
    sizes: SIZES.map(([w, h]) => `${w}x${h}`),
    queries: QUERIES,
    floors: FLOORS,
    pass: ok,
    classes,
    runs,
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n')

  const pad = (s, n) => String(s).padEnd(n)
  console.log(pad('class', 16) + pad('n', 5) + pad('floor', 7) + pad('worst', 8) + pad('where', 22) + pad('text', 22) + pad('on (darkest)', 22) + 'element')
  for (const [k, c] of Object.entries(classes).sort()) {
    const w = c.worst
    console.log(
      pad(k, 16) + pad(c.count, 5) + pad(c.floor, 7) + pad(w.worst.toFixed(2) + (c.pass ? '' : ' !'), 8) + pad(`${w.size} ${w.query}`, 22) + pad(w.text, 22) + pad(w.vsDarkest <= w.vsLightest ? w.darkest : w.lightest, 22) + `"${w.label}" ${w.fontSize}`,
    )
  }
  console.log(ok ? 'contrast: every class at or above its floor' : 'contrast: FAIL (see above)')
  console.log('wrote', path.relative(ROOT, OUT))
  process.exitCode = ok ? 0 : 1
}

main().catch((e) => {
  console.error(e)
  stop()
  process.exit(1)
})
