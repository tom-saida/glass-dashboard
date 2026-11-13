#!/usr/bin/env node
// verify.mjs: regenerates the brief's step-7 evidence pack from the current tree.
//
//   node scripts/verify.mjs                 build, then every step
//   node scripts/verify.mjs --skip-build    use the dist/ that is there
//   node scripts/verify.mjs --steps=shots,perf   only some steps
//        steps: katie, shots, demo, leads, perf, console, lighthouse, video, demobuild, auth   (the report is always rewritten
//        from docs/perf/results.json, so a partial run keeps the other steps' last numbers)
//
// Environment: VERIFY_PORT (default 5185), VERIFY_SCRATCH (default <os tmp>/katie-verify, where
// npx installs Lighthouse and the raw video is written), VERIFY_DIST (the build to serve and
// measure, default dist; a build step writes there), VERIFY_OUT (where the evidence goes, default
// docs; point it at a scratch folder to check without touching docs/).
//
// Katie is occasional (docs/research/MONDAY-LLAMA-2026-10-13.md, Part 3): off screen by default,
// she steps in for a few moments. The `katie` step checks each moment, the caps, that hover and
// focus summon nothing, and the dismissals, driving time with Playwright's clock and forcing
// moments through the mock-only window.__katieStage hook.
//
// What it writes (and nothing else), under VERIFY_OUT (default docs/):
//   screenshots/final/*.png, screenshots/final/katie-moments.webm
//   screenshots/occasional/*.png
//   lighthouse/<page>.json + .html
//   perf/katie-walk-trace.json.gz, perf/results.json, perf/console.json
//   VERIFICATION.md
//
// Servers: `vite preview` (mock pages, recording, Lighthouse, the trace) and then
// scripts/fake-api.mjs with dummy credentials (the real-mode console pass), one after the other on the same
// port, both on loopback and both stopped before the script exits. Nothing talks to SAIDA's box.
// Browser: Playwright's bundled Chromium only (Lighthouse gets the same binary via --chrome-path).
// Dependencies: the installed `playwright` package, Node built-ins, and ffmpeg on PATH to trim the
// recording (its first minute is the mock replay run in fake time; without ffmpeg the untrimmed
// recording is kept and the report marks it over 20 s).

import { spawn, spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.VERIFY_PORT || 5185)
const ORIGIN = `http://localhost:${PORT}`
const BASE = `${ORIGIN}/dash/`
const SCRATCH = process.env.VERIFY_SCRATCH || path.join(os.tmpdir(), 'katie-verify')
const DIST = path.resolve(ROOT, process.env.VERIFY_DIST || 'dist')
const OUT_ROOT = path.resolve(ROOT, process.env.VERIFY_OUT || 'docs')
const OUT = {
  shots: path.join(OUT_ROOT, 'screenshots/final'),
  lh: path.join(OUT_ROOT, 'lighthouse'),
  perf: path.join(OUT_ROOT, 'perf'),
  occasional: path.join(OUT_ROOT, 'screenshots/occasional'),
  auth: path.join(OUT_ROOT, 'screenshots/auth'),
  report: path.join(OUT_ROOT, 'VERIFICATION.md'),
}
const RESULTS = path.join(OUT.perf, 'results.json')
// Dummy pair for the local stand-in box only (scripts/fake-api.mjs). Not a credential.
const FAKE = { username: 'demo', password: 'not-a-secret' }
const SIZES = [
  [1440, 900],
  [1280, 800],
]
const REPLAY_EVENTS = 66 // stream-sample.txt (19) + the second call's 47 events
const CALL_ID = 'CA860072416005'
// Fixture leads (src/mock/fixtures/leads.json; the same ids in the week file and the demo day).
const LEAD = { noah: 'L355cddb93a', jude: 'L8587083698', ava: 'Lc1c180eb9d', dana: 'L09303ab67a', sam: 'La0b7145329', mia: 'L7e6acd10db', zoe: 'Le26feb44be' }

const args = process.argv.slice(2)
const SKIP_BUILD = args.includes('--skip-build')
const stepsArg = args.find((a) => a.startsWith('--steps='))
const STEPS = new Set(
  stepsArg ? stepsArg.slice(8).split(',') : ['katie', 'shots', 'demo', 'leads', 'perf', 'console', 'lighthouse', 'video', 'demobuild'],
)

for (const d of [OUT.shots, OUT.lh, OUT.perf, OUT.occasional, OUT.auth, SCRATCH]) fs.mkdirSync(d, { recursive: true })
const results = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : {}
const log = (...a) => console.log('[verify]', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rel = (p) => path.relative(ROOT, p)

// ------------------------------------------------------------------ servers (killed on exit)

const children = new Set()
function startServer(cmd, cmdArgs, env = {}) {
  const child = spawn(cmd, cmdArgs, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group, so the whole tree (npx -> node) is killed
  })
  let out = ''
  child.stdout.on('data', (b) => (out += b))
  child.stderr.on('data', (b) => (out += b))
  child.output = () => out
  children.add(child)
  return child
}
function stopServer(child) {
  if (!child || child.exitCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    /* already gone */
  }
  children.delete(child)
}
function stopAll() {
  for (const c of children) stopServer(c)
}
process.on('exit', stopAll)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (stopAll(), process.exit(130)))

async function waitHttp(url, headers = {}, ms = 20000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      const r = await fetch(url, { headers })
      if (r.status < 500) return
    } catch {
      /* not up yet */
    }
    await sleep(200)
  }
  throw new Error(`server at ${url} did not come up`)
}
function portFree() {
  const r = spawnSync('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
  return !r.stdout.trim()
}
async function withPreview(fn) {
  if (!portFree()) throw new Error(`port ${PORT} is in use`)
  const s = startServer('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'])
  try {
    await waitHttp(BASE)
    return await fn()
  } finally {
    stopServer(s)
    await sleep(500)
  }
}
async function withFakeBox(fn, env = {}) {
  if (!portFree()) throw new Error(`port ${PORT} is in use`)
  const s = startServer('node', ['scripts/fake-api.mjs'], {
    FAKE_DASH_USER: FAKE.username,
    FAKE_DASH_PASS: FAKE.password,
    FAKE_DIST: DIST,
    FAKE_PORT: String(PORT),
    FAKE_HOST: '127.0.0.1',
    ...env,
  })
  try {
    const auth = 'Basic ' + Buffer.from(`${FAKE.username}:${FAKE.password}`).toString('base64')
    await waitHttp(`http://127.0.0.1:${PORT}/dash/`, { Authorization: auth })
    return await fn(`http://127.0.0.1:${PORT}/dash/`)
  } finally {
    stopServer(s)
    await sleep(500)
  }
}

// ------------------------------------------------------------------ page helpers

const katie = (page) => page.evaluate(() => window.__katieStage?.state() ?? null)
const st = katie

async function until(page, pred, { timeout = 15000, every = 100, label = 'condition', arg } = {}) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    last = await page.evaluate(pred, arg).catch(() => undefined)
    if (last) return last
    await sleep(every)
  }
  throw new Error(`timed out waiting for ${label}`)
}

/** No skeletons, no in-flight query (aria-busy), fonts loaded. */
const settledDom = () =>
  document.fonts.status === 'loaded' && document.querySelectorAll('[aria-busy="true"]').length === 0

/** She is off screen with nothing on (runs in the page). */
const katieOff = () => {
  const s = window.__katieStage?.state()
  return !!s && s.moment === null && s.offscreen
}
/** She holds at her widget (runs in the page): arrived, still; with the bubble up if asked. */
const katieHolding = (bubble) => {
  const s = window.__katieStage?.state()
  if (!s || s.phase !== 'hold' || !s.arrived || s.travelling || s.celebrating) return false
  return bubble ? s.bubbleShown && s.presenting : true
}
async function waitOff(page, { timeout = 15000 } = {}) {
  await until(page, katieOff, { timeout, label: 'Katie off screen' })
}
async function waitHolding(page, { bubble = true, timeout = 15000 } = {}) {
  await until(page, katieHolding, { arg: bubble, timeout, label: bubble ? 'Katie presenting' : 'Katie holding' })
}

/** Playwright's clock installed: run fake time in `step` ms slices until `pred` holds. Returns the fake ms run. */
async function runUntil(page, pred, { step = 100, max = 30000, label = 'condition', arg } = {}) {
  let ran = 0
  for (;;) {
    if (await page.evaluate(pred, arg).catch(() => false)) return ran
    if (ran >= max) throw new Error(`timed out (${max} ms of fake time) waiting for ${label}`)
    await page.clock.runFor(step)
    ran += step
  }
}

/** Force a moment through the caps with the mock-only hook (its trigger condition skipped). */
async function force(page, kind, { reset = true } = {}) {
  return page.evaluate(
    ([k, r]) => {
      if (r) window.__katieStage.resetCaps()
      return window.__katieStage.trigger(k)
    },
    [kind, reset],
  )
}

/** Mock replay under Playwright's clock: run it to the end in fake time, then hand back real time. */
async function settleReplay(page) {
  for (let i = 0; i < 60; i++) {
    await page.clock.runFor(5000)
    const ev = await page.evaluate(() => window.__katieMock?.debug.events ?? 0)
    if (ev >= REPLAY_EVENTS) break
  }
  await page.clock.runFor(6000) // call.ended -> refetch -> walk home
  await page.clock.resume()
}

/** DESIGN-GLASS 8.5: the slab, its rim and the front glass object tilt in on page load (900 ms).
 *  Before any geometry read or screenshot, wait until no animation runs (cap 2 s, real time: the
 *  entrance runs on the document timeline, which Playwright's clock does not drive). */
async function animsDone(page, ms = 2000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const n = await page.evaluate(() => document.getAnimations().length).catch(() => 0)
    if (n === 0) return true
    await sleep(50)
  }
  return false
}

async function noHScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

function attachConsole(page, sink, where) {
  page.on('console', (m) => {
    const loc = m.location()
    sink.push({ where, type: m.type(), text: redact(m.text()), url: loc?.url ? redact(loc.url) : '' })
  })
  page.on('pageerror', (e) => sink.push({ where, type: 'pageerror', text: redact(String(e.message)) }))
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? ''
    // An EventSource closed by navigation is not an error the user sees.
    if (/ERR_ABORTED/.test(f)) return
    sink.push({ where, type: 'requestfailed', text: `${redact(r.url())} ${f}` })
  })
  page.on('response', (r) => {
    if (r.status() >= 400) sink.push({ where, type: 'http', text: `${r.status()} ${redact(r.url())}` })
  })
}
/** Phone-like digits never reach the evidence files. */
function redact(s) {
  return String(s).replace(/\(?\d{3}\)?[ -]?(\d{3}|\*{3})-\d{4}/g, '(xxx) xxx-xxxx')
}

async function rail(page, to) {
  await page.click(`nav[aria-label="Main"] a[href="/dash${to}"]`)
  await page.waitForURL((u) => u.pathname.replace(/\/$/, '') === `/dash${to}`.replace(/\/$/, ''))
  await until(page, settledDom, { label: `page ${to}` })
}

async function shot(page, name, w, h, list, widget) {
  const file = path.join(OUT.shots, `${name}-${w}x${h}.png`)
  await animsDone(page)
  await sleep(250)
  await page.screenshot({ path: file })
  const k = await katie(page)
  list.push({
    file: rel(file),
    hscrollFree: await noHScroll(page),
    katie: k ? { moment: k.moment, mode: k.mode, dest: widget ?? k.dest, listening: k.listening, presenting: k.presenting, bubble: k.bubbleShown } : null,
  })
  log('shot', rel(file))
}

const SEL = {
  line: '[data-line-tile]',
  summon: 'header button[aria-label="Point out what needs attention"]',
}

/** Park the pointer in the rail's empty lower half. */
async function park(page, steps = 1) {
  const vp = page.viewportSize()
  await page.mouse.move(120, vp.height - 120, { steps })
}

// ------------------------------------------------------------------ the fold (DESIGN-GLASS 8.7)

// The room's margin costs rows above the fold: ?mock=demo, the slab's box and the Latest calls
// rows wholly visible inside the content scroller at first paint. Measured under two looks
// (DESIGN-GLASS 9): Original (8.13's glass, stored as { preset: 'shipped' } before the page
// loads) and the default look, Daylight, as a fresh browser gets it (larger text, so fewer rows).
// The margin is the same under both since 9.11: 1 % of each axis, at least 16 px, so the slab's
// top is 16 at every size here (it was the 28-64 px ladder for the shipped look and 8 % for the
// default, which left the default look 0 rows at 1280 x 800).
const FOLD = [
  { look: 'shipped', w: 1280, h: 800, slab: [16, 784], rows: 5 },
  { look: 'shipped', w: 1440, h: 900, slab: [16, 884], rows: 7 },
  { look: 'shipped', w: 1280, h: 720, slab: [16, 704], rows: 3 },
  // Measured 2026-11-02 evening at the 1 % margin: 3 / 5 / 9 (0 / 3 / 6 under the 8 % margin).
  { look: 'default', w: 1280, h: 800, slab: [16, 784], rows: 3 },
  { look: 'default', w: 1440, h: 900, slab: [16, 884], rows: 5 },
  { look: 'default', w: 1920, h: 1080, slab: [16, 1064], rows: 9 },
]

/** The slab's box and the Latest calls rows wholly above the fold (runs in the page). */
const foldGeometry = () => {
  const slab = document.querySelector('[data-katie-floor]').getBoundingClientRect()
  const content = document.getElementById('content').getBoundingClientRect()
  const fold = Math.min(content.bottom, window.innerHeight)
  const h2 = [...document.querySelectorAll('main h2')].find((e) => e.textContent.trim() === 'Latest calls')
  const rows = h2 ? [...h2.closest('section').querySelectorAll('[data-call-row]')] : []
  return {
    slab: [slab.left, slab.top, slab.right, slab.bottom].map((v) => Math.round(v)),
    floor: Math.round(slab.bottom - (slab.height - document.querySelector('[data-katie-floor]').clientHeight) / 2),
    rows: rows.filter((r) => r.getBoundingClientRect().bottom <= fold + 0.5).length,
    hscroll: document.documentElement.scrollWidth > window.innerWidth,
  }
}

async function stepFold(browser) {
  const out = []
  for (const f of FOLD) {
    const ctx = await browser.newContext({ viewport: { width: f.w, height: f.h } })
    if (f.look === 'shipped') {
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('katie.look', JSON.stringify({ preset: 'shipped' }))
        } catch {
          /* storage blocked: the default look, and the slab box check fails loudly */
        }
      })
    }
    const page = await ctx.newPage()
    await page.goto(`${BASE}?mock=demo`)
    await page.waitForSelector(SEL.line)
    await until(page, settledDom, { label: 'demo overview' })
    const settled = await animsDone(page)
    const g = await page.evaluate(foldGeometry)
    const pass = settled && g.slab[1] === f.slab[0] && g.slab[3] === f.slab[1] && g.rows >= f.rows && !g.hscroll
    out.push({ size: `${f.w}x${f.h}`, look: f.look, want: f, got: g, settled, pass })
    log(pass ? 'ok  ' : 'FAIL', `fold ${f.w}x${f.h} ${f.look} look`, `slab ${g.slab[1]}-${g.slab[3]} (want ${f.slab[0]}-${f.slab[1]}), ${g.rows} rows (want >= ${f.rows})`)
    await ctx.close()
  }
  return out
}

// ------------------------------------------------------------------ step: screenshots

async function stepShots(browser) {
  const list = []
  for (const [w, h] of SIZES) {
    // A fresh tab during the live call: the day's first open (Katie presents Callbacks waiting),
    // then the live Line tile once she has left by herself.
    const live = await browser.newContext({ viewport: { width: w, height: h } })
    const lp = await live.newPage()
    await lp.clock.install()
    await lp.goto(`${BASE}?mock=1`)
    await lp.waitForSelector(SEL.line)
    await animsDone(lp)
    await park(lp)
    await runUntil(lp, katieHolding, { arg: true, max: 8000, label: 'first open presenting' })
    await lp.clock.runFor(400)
    await shot(lp, 'overview-first-open', w, h, list)
    await runUntil(lp, katieOff, { max: 15000, label: 'first open over' })
    await lp.clock.runFor(500)
    await shot(lp, 'overview-live', w, h, list)
    await live.close()

    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    const page = await ctx.newPage()
    await page.clock.install()
    await page.goto(`${BASE}?mock=1`)
    await page.waitForSelector(SEL.line)
    await animsDone(page)
    await settleReplay(page)
    await park(page)
    await until(page, settledDom)
    await waitOff(page)
    await shot(page, 'overview', w, h, list)

    // Three moments: a booking milestone (forced through the mock hook, caps reset), the top
    // bar's Katie button, and the line waking up (forced).
    await force(page, 'booking')
    await waitHolding(page)
    await shot(page, 'overview-booking', w, h, list)
    await page.keyboard.press('Escape')
    await waitOff(page)
    await page.click(SEL.summon)
    await waitHolding(page)
    await shot(page, 'overview-summon', w, h, list)
    await page.keyboard.press('Escape')
    await waitOff(page)
    await page.evaluate(() => (document.getElementById('content') ?? window).scrollTo(0, 0))
    await force(page, 'line-wake')
    await waitHolding(page, { bubble: false })
    await shot(page, 'overview-line-wake', w, h, list)
    await waitOff(page)
    await park(page)

    await rail(page, '/calls')
    await waitOff(page)
    await shot(page, 'calls', w, h, list)

    await page.click(`[data-call-row="${CALL_ID}"]`)
    await page.waitForURL(`**/dash/calls/${CALL_ID}`)
    await page.waitForSelector('aside[role="complementary"]')
    await until(page, settledDom)
    await sleep(900) // drawer slide
    await park(page)
    await waitOff(page)
    await shot(page, 'calls-drawer', w, h, list)
    await page.keyboard.press('Escape')
    await page.waitForURL((u) => u.pathname.replace(/\/$/, '') === '/dash/calls')

    for (const p of ['bookings', 'leads', 'callbacks', 'texts', 'settings']) {
      await rail(page, `/${p}`)
      await sleep(400)
      await waitOff(page)
      await shot(page, p, w, h, list)
    }

    // A lead's drawer (DESIGN 6.13), opened from its row.
    await rail(page, '/leads')
    await page.click(`[data-lead-row="${LEAD.ava}"]`)
    await page.waitForURL(`**/dash/leads/${LEAD.ava}`)
    await page.waitForSelector('aside[role="complementary"] [data-lead-tap]')
    await until(page, settledDom)
    await sleep(900) // drawer slide
    await park(page)
    await waitOff(page)
    await shot(page, 'leads-drawer', w, h, list)
    await page.keyboard.press('Escape')
    await page.waitForURL((u) => u.pathname.replace(/\/$/, '') === '/dash/leads')

    // Callbacks with Show numbers on, then off again (the setting is per browser context anyway).
    await rail(page, '/callbacks')
    await page.locator('header label', { hasText: 'Show numbers' }).click()
    await until(page, () => /555-01\d\d/.test(document.querySelector('main')?.textContent ?? ''), { label: 'revealed numbers' })
    await until(page, settledDom)
    await waitOff(page)
    await shot(page, 'callbacks-numbers', w, h, list)
    await page.locator('header label', { hasText: 'Show numbers' }).click()
    await ctx.close()

    // Empty day: no calls and no urgent callbacks, so no first-open moment (no filler).
    const empty = await browser.newContext({ viewport: { width: w, height: h } })
    const ep = await empty.newPage()
    await ep.goto(`${BASE}?mock=empty`)
    await ep.waitForSelector(SEL.line)
    await animsDone(ep)
    await park(ep)
    await until(ep, settledDom)
    await sleep(2500)
    await waitOff(ep)
    await shot(ep, 'overview-empty', w, h, list)
    await empty.close()
  }
  const fold = await stepFold(browser)
  results.shots = { at: new Date().toISOString(), list, fold }
}

// ------------------------------------------------------------------ step: the closers' demo day

// mock=demo (src/mock/demo, docs/demo/DEMO-DATA.md): today's date, NOW pinned to 9:10 PM, the
// showpiece call (s36) only on Play a sample call. Scene call ids are fixed by the dataset.
const DEMO_CALL = { s03: 'CA216253965107', s32: 'CA528485723255', s36: 'CA418009612779' }
// What the demo day must show on any date (scripts/check-lib.mjs proves the materializer on
// many dates; this is the same day on screen). Callbacks waiting = action notes only.
const DEMO_WANT = {
  kpis: { calls: 35, booked: 27, consults: 17, callbacks: 12 },
  afterSample: { calls: 36, booked: 28, consults: 18, callbacks: 12 },
  calls7d: 155,
  calls30d: 666,
}

/** The four KPI cells' numbers, plus the whole card's text (runs in the page). */
const demoKpis = () => {
  const cell = (label) => {
    const el = [...document.querySelectorAll('main [data-katie]')].find((e) => e.tagName === 'DIV' && e.innerText.startsWith(label))
    const m = el?.innerText.split('\n').map((s) => s.trim()).filter(Boolean)
    return m ? Number(m[1]) : null
  }
  const card = [...document.querySelectorAll('main section')].find((s) => s.innerText.startsWith('Calls answered'))
  return {
    calls: cell('Calls answered'),
    booked: cell('Appointments booked'),
    consults: cell('New-patient consults'),
    callbacks: cell('Callbacks waiting'),
    text: card?.innerText.replace(/\n+/g, ' | ') ?? '',
  }
}
const railBadge = () => {
  const a = document.querySelector('nav[aria-label="Main"] a[href="/dash/callbacks"]')
  const n = a?.innerText.match(/\d+/)
  return n ? Number(n[0]) : null
}
const cardTitle = () => document.querySelector('main section')?.innerText.split('\n')[0] ?? ''
const lineText = () => document.querySelector('[data-line-tile]')?.innerText.replace(/\n+/g, ' | ') ?? ''
const lineState = () => document.querySelector('[data-line-tile]')?.getAttribute('data-line-state') ?? ''

/** Rendered-page audit (DESIGN 8): type sizes, forbidden strings, emoji, static shadows. */
const pageAudit = () => {
  const layer = document.querySelector('[data-katie-stage]')
  const sizes = new Set()
  const shadows = new Set()
  for (const el of document.querySelectorAll('body *')) {
    if (layer && layer.contains(el)) continue
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (hasText && cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 1 && r.height > 1) sizes.add(cs.fontSize)
    // Focus rings are inset or 0-blur spreads; floating things are the drawer and the menu. The glass
    // skin's card and slab shadows carry an inset highlight; the outer-only shadows it allows are
    // the active rail pill's (DESIGN-GLASS 3.3), the pane's drop shadow (a look switch, 9.2) and the
    // backdrop's own shapes behind the glass (.env, 9.1), which are scenery, not UI.
    const navPill = el.matches('nav[aria-label="Main"] a[aria-current="page"]')
    const scenery = el.matches('.pane-glass') || !!el.closest('.env')
    if (cs.boxShadow !== 'none' && r.width > 0 && !navPill && !scenery && !el.closest('aside[role="complementary"], [role="menu"], [role="dialog"]') && !/inset/.test(cs.boxShadow) && el !== document.activeElement) {
      shadows.add(`${el.tagName}.${String(el.className?.baseVal ?? el.className).split(' ')[0]}`)
    }
  }
  const text = document.body.innerText
  const forbidden = ['Martorana', 'scenario=', 'unknown (', '[NOT', 'URGENT:', 'Yesterday 0', 'Welcome', 'Demo practice', 'undefined', 'NaN'].filter((f) => text.includes(f))
  const emoji = text.match(/\p{Extended_Pictographic}/gu) || []
  return { sizes: [...sizes].sort(), shadows: [...shadows], forbidden, emoji: emoji.length }
}

async function demoContext(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  const dash = []
  const sink = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/dash')) dash.push(u.pathname)
  })
  attachConsole(page, sink, `demo ${w}x${h}`)
  return { ctx, page, dash, sink }
}

async function stepDemo(browser) {
  const list = []
  const checks = []
  const facts = {}
  const check = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail })
    log(pass ? 'ok  ' : 'FAIL', name, detail)
  }
  // DESIGN-GLASS 2: 28 is the KPI number (was 32); 34 and 40 are its sizes under the look's text size (9.3).
  // Computed font sizes are the element's own px, so the zoom does not show here.
  const ALLOWED = new Set(['12px', '14px', '16px', '20px', '28px', '34px', '40px'])
  const audit = async (page, where) => {
    const a = await page.evaluate(pageAudit)
    const bad = a.sizes.filter((s) => !ALLOWED.has(s))
    check(`${where}: type sizes within 12/14/16/20/28 (34/40 the look's KPI), no forbidden strings or emoji, no static shadow`, !bad.length && !a.forbidden.length && !a.emoji && !a.shadows.length, `sizes ${a.sizes.join(' ')}${a.forbidden.length ? `; forbidden ${a.forbidden.join(', ')}` : ''}${a.shadows.length ? `; shadows ${a.shadows.join(', ')}` : ''}`)
  }
  const openDrawer = async (page, id, name, w, h) => {
    await page.goto(`${BASE}calls`)
    await until(page, settledDom, { label: 'calls' })
    await animsDone(page)
    await page.click(`[data-call-row="${id}"]`)
    await page.waitForURL(`**/dash/calls/${id}`)
    await page.waitForSelector('aside[role="complementary"]')
    await until(page, settledDom, { label: `drawer ${name}` })
    await sleep(900) // drawer slide
    await park(page)
    await shot(page, `demo-drawer-${name}`, w, h, list)
    const d = await page.evaluate(() => {
      const a = document.querySelector('aside[role="complementary"]')
      const ring = getComputedStyle(document.activeElement).boxShadow
      return { head: a?.innerText.split('\n').slice(0, 3).join(' | ') ?? '', heads16: [...(a?.querySelectorAll('img') ?? [])].filter((i) => Math.round(i.getBoundingClientRect().width) === 16).length, activeRing: ring !== 'none' && document.activeElement?.tagName === 'H2' }
    })
    facts[`drawer-${name}`] = d.head
    await audit(page, `${w}x${h} drawer ${name}`)
    check(`${w}x${h} drawer ${name}: no focus ring on the heading after a mouse open; Katie's rows carry her 16px head`, !d.activeRing && d.heads16 > 0, `${d.head}; ${d.heads16} heads at 16 px`)
    await page.keyboard.press('Escape')
    await page.waitForURL((u) => u.pathname.replace(/\/$/, '') === '/dash/calls')
  }

  for (const [w, h] of SIZES) {
    const sz = `${w}x${h}`
    const { ctx, page, dash, sink } = await demoContext(browser, w, h)
    await page.goto(`${BASE}?mock=demo`)
    await page.waitForSelector(SEL.line)
    await animsDone(page)
    await park(page)
    // The day's first open: she presents Callbacks waiting and leaves by herself (before the share).
    await until(page, katieHolding, { arg: true, timeout: 10000, label: 'demo first open presenting' })
    await sleep(300)
    await shot(page, 'demo-overview-first-open', w, h, list)
    await waitOff(page, { timeout: 20000 })
    await until(page, settledDom)
    await shot(page, 'demo-overview', w, h, list)
    await audit(page, `${sz} overview`)

    const k0 = await page.evaluate(demoKpis)
    const badge = await page.evaluate(railBadge)
    facts[`kpis-${sz}`] = k0.text
    const want = DEMO_WANT.kpis
    check(`${sz} demo Overview: ${want.calls} / ${want.booked} / ${want.consults} / ${want.callbacks}`, k0.calls === want.calls && k0.booked === want.booked && k0.consults === want.consults && k0.callbacks === want.callbacks, k0.text)
    check(`${sz} demo: no "Yesterday 0"; the rail's Callbacks count equals the KPI`, !/Yesterday 0\b/.test(k0.text) && badge === k0.callbacks, `rail ${badge}, KPI ${k0.callbacks}`)

    for (const p of ['calls', 'bookings', 'leads', 'callbacks', 'texts', 'settings']) {
      await rail(page, `/${p}`)
      await sleep(400)
      await waitOff(page)
      await shot(page, `demo-${p}`, w, h, list)
      if (p === 'leads') {
        // Leads: four count cards over the list; rows wrap to two lines, so at least 44.
        const lf = await page.evaluate(leadFacts)
        facts[`title-leads-${sz}`] = lf.title
        const rows = await page.evaluate(() => [...document.querySelectorAll('main tbody tr:has([data-lead-row])')].slice(0, 6).map((r) => Math.round(r.getBoundingClientRect().height / (r.currentCSSZoom || 1))))
        check(`${sz} leads: 11 open leads on the demo day, counts 3 / 1 / 4 / 1, rows at least 44 px`, lf.title === '11 open leads' && lf.counts.join('/') === '3/1/4/1' && rows.length > 0 && rows.every((x) => x >= 44), `${lf.title}; ${lf.counts.join(' / ')}; rows ${rows.join(', ')}`)
      } else if (p !== 'settings') {
        facts[`title-${p}-${sz}`] = await page.evaluate(cardTitle)
        // Callbacks groups a caller's reasons into one taller row (P18); its rows are at least 44.
        // In the row's own px: the look's text size zooms the page (DESIGN-GLASS 9.3), and the rect
        // is in viewport px (44 reads 47 at "larger").
        const rows = await page.evaluate(() => [...document.querySelectorAll('main tbody tr[data-call-row], main tbody tr:has([data-call-row])')].slice(0, 6).map((r) => Math.round(r.getBoundingClientRect().height / (r.currentCSSZoom || 1))))
        const ok = p === 'callbacks' ? rows.every((x) => x >= 44) : rows.every((x) => x === 44)
        check(`${sz} ${p}: data rows ${p === 'callbacks' ? 'at least ' : ''}44 px`, rows.length > 0 && ok, rows.join(', '))
      }
      await audit(page, `${sz} ${p}`)
    }
    const title = (p) => facts[`title-${p}-${sz}`]
    check(`${sz} list titles are count sentences`, /^35 calls today · 26 booked$/.test(title('calls')) && /^27 bookings today · 17 new patients$/.test(title('bookings')) && /^12 waiting · 1 urgent$/.test(title('callbacks')) && /^20 texts sent today · 19 replies$/.test(title('texts')), ['calls', 'bookings', 'callbacks', 'texts'].map(title).join(' / '))

    // Longer ranges page through the whole history.
    for (const [r, n] of [['7d', DEMO_WANT.calls7d], ['30d', DEMO_WANT.calls30d]]) {
      await page.goto(`${BASE}calls?range=${r}`)
      // The range waits for stats(range) before it pages /calls, so wait for the count title.
      await until(page, () => /^\d+ calls/.test(document.querySelector('main section')?.innerText ?? '') && !!document.querySelector('main tbody [data-call-row]'), { label: `calls ${r}` })
      await animsDone(page)
      await until(page, settledDom, { label: `calls ${r}` })
      if (r === '30d') await shot(page, 'demo-calls-30d', w, h, list)
      let rows = 0
      for (let i = 0; i < 40 && rows < n; i++) {
        await page.mouse.wheel(0, 6000)
        await sleep(200)
        rows = await page.evaluate(() => document.querySelectorAll('main tbody tr').length)
      }
      const t = await page.evaluate(cardTitle)
      check(`${sz} calls ${r}: ${n} rows after scrolling`, rows === n && t.startsWith(`${n} calls`), `${rows} rows; "${t}"`)
    }

    await openDrawer(page, DEMO_CALL.s03, 's03-spanish', w, h)
    await openDrawer(page, DEMO_CALL.s32, 's32-urgent', w, h)

    // The Demo menu (hover before click: Vibe menu items ignore a click without a pointer enter).
    await page.goto(`${BASE}`)
    await until(page, settledDom)
    await animsDone(page)
    await page.getByRole('button', { name: 'Demo controls' }).click()
    await page.waitForSelector('[role="menuitem"]')
    await sleep(300)
    await shot(page, 'demo-menu', w, h, list)
    facts[`menu-${sz}`] = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((m) => m.innerText.replace(/\n+/g, ' ')).join(' / '))

    // Play at 2x through the menu: the Line tile on the call, then the held outcome after hang-up.
    const item = page.getByRole('menuitem', { name: /Play at 2x/ })
    await item.hover()
    await item.click()
    const t0 = Date.now()
    await until(page, () => document.querySelector('[data-line-tile]')?.getAttribute('data-line-state') === 'live', { timeout: 5000, label: 'line on a call' })
    const onCallMs = Date.now() - t0
    // A caller line on the tile (the mid-call beat FINDINGS 5d.3 describes).
    await until(page, () => /^Caller:? /.test(document.querySelector('[data-line-said]')?.innerText ?? ''), { timeout: 30000, label: 'a caller turn on the Line tile' })
    await sleep(600)
    await park(page)
    facts[`line-mid-${sz}`] = await page.evaluate(lineText)
    await shot(page, 'demo-line-mid-call', w, h, list)
    await until(page, () => /^Booked /.test(document.querySelector('[data-line-said]')?.innerText ?? ''), { timeout: 60000, label: 'the booking on the Line tile' })
    facts[`line-booked-${sz}`] = await page.evaluate(lineText)
    await until(page, () => window.__katieDemo?.sampleCallState() === 'done', { timeout: 60000, every: 250, label: 'sample call ended' })
    const endedMs = Date.now() - t0
    await sleep(2500)
    await park(page)
    facts[`line-after-${sz}`] = await page.evaluate(lineText)
    await shot(page, 'demo-line-after-hangup', w, h, list)
    const k1 = await page.evaluate(demoKpis)
    const wa = DEMO_WANT.afterSample
    check(`${sz} Play at 2x: on a call within 5 s, last line said, then "Booked …" on the tile, ended in about 65 s`, onCallMs < 5000 && endedMs < 80000 && /\| Booked /.test(facts[`line-booked-${sz}`]), `on a call ${onCallMs} ms; ended ${(endedMs / 1000).toFixed(1)} s; mid "${facts[`line-mid-${sz}`]}"; booked "${facts[`line-booked-${sz}`]}"`)
    check(`${sz} after the sample call: ${wa.calls} / ${wa.booked} / ${wa.consults} / ${wa.callbacks}, outcome held on the tile`, k1.calls === wa.calls && k1.booked === wa.booked && k1.consults === wa.consults && k1.callbacks === wa.callbacks && /Booked /.test(facts[`line-after-${sz}`]), `${k1.text}; tile "${facts[`line-after-${sz}`]}"`)
    await until(page, () => !/Booked/.test(document.querySelector('[data-line-said]')?.innerText ?? ''), { timeout: 45000, every: 500, label: 'tile back to idle' })
    const idleMs = Date.now() - t0 - endedMs
    check(`${sz} the held outcome goes back to idle after about 30 s`, idleMs >= 25000 && idleMs <= 40000, `${(idleMs / 1000).toFixed(1)} s after the call ended`)

    // Reset (R) from an open drawer: the drawer closes and the day is as it was at open.
    await page.click(`nav[aria-label="Main"] a[href="/dash/calls"]`)
    await until(page, settledDom)
    await page.click(`[data-call-row="${DEMO_CALL.s36}"]`)
    await page.waitForURL(`**/dash/calls/${DEMO_CALL.s36}`)
    await until(page, settledDom)
    await sleep(900)
    await page.keyboard.press('r')
    await page.waitForURL((u) => u.pathname.replace(/\/$/, '') === '/dash/calls', { timeout: 5000 })
    await rail(page, '')
    await until(page, () => [...document.querySelectorAll('main section')].some((s) => /^Calls answered\n+\d/.test(s.innerText)), { label: 'KPIs after reset' })
    await waitOff(page)
    const k2 = await page.evaluate(demoKpis)
    const gone = await page.evaluate((id) => !document.querySelector(`[data-call-row="${id}"]`), DEMO_CALL.s36)
    check(`${sz} R from an open drawer: drawer closed, the day back to the start`, k2.text === k0.text && gone && (await page.evaluate(() => window.__katieDemo.sampleCallState())) === 'idle', `KPIs "${k2.text}"; sample call row gone ${gone}`)
    check(`${sz} demo: 0 requests to /api/dash; 0 console errors`, dash.length === 0 && !sink.some((m) => m.type === 'error' || m.type === 'pageerror' || m.type === 'requestfailed' || m.type === 'http'), `${dash.length} /api/dash requests; ${sink.length} console messages`)
    await ctx.close()
  }
  results.demo = { at: new Date().toISOString(), date: new Date().toDateString(), list, checks, facts }
}

// The closers' static build (npm run build:demo, VITE_DEMO_DEFAULT=1): the demo day is the floor.
async function stepDemoBuild(browser) {
  const out = path.join(SCRATCH, 'dist-demo')
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, VITE_DEMO_DEFAULT: '1' } })
  const checks = []
  if (!portFree()) throw new Error(`port ${PORT} is in use`)
  const s = startServer('npx', ['vite', 'preview', '--outDir', out, '--port', String(PORT), '--strictPort'])
  try {
    await waitHttp(BASE)
    for (const [q, wantDemo] of [['', true], ['?mock=0', true], ['?mock=1', false], ['callbacks', true]]) {
      const { ctx, page, dash, sink } = await demoContext(browser, 1280, 800)
      await page.goto(`${BASE}${q}`)
      await page.waitForSelector('main section')
      await until(page, settledDom)
      await animsDone(page)
      await sleep(1500)
      const isDemo = await page.evaluate(() => !!window.__katieDemo)
      const errs = sink.filter((m) => ['error', 'pageerror', 'requestfailed', 'http'].includes(m.type))
      checks.push({ name: `dist-demo /dash/${q}: ${wantDemo ? 'the demo day' : 'the fixtures'}, 0 /api/dash requests, console clean`, pass: isDemo === wantDemo && dash.length === 0 && errs.length === 0, detail: `${isDemo ? 'demo day' : 'not the demo day'}; ${dash.length} /api/dash; ${errs.length} errors` })
      log(checks.at(-1).pass ? 'ok  ' : 'FAIL', checks.at(-1).name, checks.at(-1).detail)
      await ctx.close()
    }
  } finally {
    stopServer(s)
    await sleep(500)
  }
  results.demoBuild = { at: new Date().toISOString(), checks }
}


// ------------------------------------------------------------------ step: leads (DESIGN 6.13)

// The Leads page on the fixtures (?mock=1, clock pinned to Mon Oct 12, 6:05 PM): the list, the four
// counts as filters, the drawer and every coordinator tap, the refused move, Show numbers, the
// reserved next-text / call-now slots (through the mock-only window.__katieMock.patchLead), the
// 60 s poll and the focus refetch under Playwright's clock, and the empty / error / slow / demo
// scenarios. Then the same page in real mode against scripts/fake-api.mjs: the fetches the mock
// never makes (GET with reveal, the POST and its JSON body, a 409 from the server).
const leadFacts = () => {
  const card = document.querySelector('main section:has(table)')
  return {
    title: card?.querySelector('h2')?.innerText.trim() ?? '',
    counts: [...document.querySelectorAll('[data-lead-count]')].map((b) => b.innerText.split('\n').map((x) => x.trim()).filter(Boolean)[1] ?? ''),
    pressed: [...document.querySelectorAll('[data-lead-count][aria-pressed="true"]')].map((b) => b.getAttribute('data-lead-count')),
    filter: document.querySelector('main select[aria-label="Show"]')?.value ?? '',
    ids: [...document.querySelectorAll('main tbody [data-lead-row]')].map((e) => e.getAttribute('data-lead-row')),
    chips: [...document.querySelectorAll('main tbody tr:has([data-lead-row])')].map((r) => r.cells[1]?.innerText.split('\n')[0].trim() ?? ''),
    phones: [...document.querySelectorAll('main tbody tr:has([data-lead-row])')].map((r) => r.cells[0]?.innerText.split('\n').pop().trim() ?? ''),
    callNow: document.querySelectorAll('main [data-call-now]').length,
    nextText: [...document.querySelectorAll('main [data-next-text]')].map((e) => e.innerText.replace(/\n+/g, ' / ')),
    search: location.search,
    path: location.pathname,
    tab: document.title,
  }
}
const drawerFacts = () => {
  const d = document.querySelector('aside[role="complementary"]')
  if (!d) return null
  const txt = (el) => (el?.innerText ?? '').replace(/\n+/g, ' | ').trim()
  return {
    header: txt(d.querySelector('header')),
    facts: Object.fromEntries([...d.querySelectorAll('dl > div')].map((x) => [x.querySelector('dt')?.innerText.trim(), x.querySelector('dd')?.innerText.trim()])),
    taps: [...d.querySelectorAll('[data-lead-tap]')].map((b) => b.innerText.trim()),
    problem: txt(d.querySelector('[data-lead-problem]')),
    asking: d.querySelector('[data-lead-ask]')?.getAttribute('data-lead-ask') ?? '',
    quoteHead: [...d.querySelectorAll('section[aria-label="Quote"] thead th')].map((x) => x.innerText.trim()),
    history: [...d.querySelectorAll('section[aria-label="History"] li')].map((li) => txt(li)),
    call: txt(d.querySelector('[data-call-now]')),
    note: d.querySelector('[data-lead-note]')?.value ?? null,
    text: d.innerText,
  }
}
const RAW_LEAD_WORDS = /consult_|missed_consult|never_booked|verbal_yes|form_consent|_on_file|practice_slug|token|you pay|undefined|NaN/i

async function stepLeads(browser) {
  const checks = []
  const list = []
  const sink = []
  const check = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail: String(detail) })
    log(pass ? 'ok  ' : 'FAIL', name, detail)
  }
  const ALLOWED = new Set(['12px', '14px', '16px', '20px', '28px', '34px', '40px'])
  const audit = async (page, where) => {
    const a = await page.evaluate(pageAudit)
    const bad = a.sizes.filter((x) => !ALLOWED.has(x))
    check(`${where}: type sizes within the scale, no forbidden strings or emoji, no static shadow`, !bad.length && !a.forbidden.length && !a.emoji && !a.shadows.length, `sizes ${a.sizes.join(' ')}${a.forbidden.length ? `; forbidden ${a.forbidden.join(', ')}` : ''}${a.shadows.length ? `; shadows ${a.shadows.join(', ')}` : ''}`)
  }
  const shotLead = async (page, name, w, h) => {
    const file = path.join(OUT.shots, `${name}-${w}x${h}.png`)
    await animsDone(page)
    await sleep(250)
    await page.screenshot({ path: file })
    list.push({ file: rel(file), hscrollFree: await noHScroll(page) })
    log('shot', rel(file))
  }
  const open = async (w, h, url, { clock = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    const page = await ctx.newPage()
    attachConsole(page, sink, `leads ${w}x${h}`)
    if (clock) await page.clock.install()
    await page.goto(url)
    return { ctx, page }
  }
  const rowsUp = (page, n) => until(page, (want) => document.querySelectorAll('main tbody [data-lead-row]').length === want, { arg: n, label: `${n} lead rows` })
  const openLead = async (page, id) => {
    await page.click(`[data-lead-row="${id}"]`)
    await page.waitForURL(`**/dash/leads/${id}`)
    await page.waitForSelector('aside[role="complementary"] section[aria-label="History"] li')
    await sleep(350)
  }
  const closeLead = async (page) => {
    await page.keyboard.press('Escape')
    await page.waitForURL((u) => u.pathname.replace(/\/$/, '') === '/dash/leads')
    await sleep(300)
  }
  const drawerUntil = (page, pred, label, arg) => until(page, pred, { label, arg })
  const tapsAre = (page, want) => drawerUntil(page, (w) => [...document.querySelectorAll('aside[role="complementary"] [data-lead-tap]')].map((b) => b.innerText.trim()).join(',') === w, `taps ${want}`, want.join(','))
  const requests = (page) => page.evaluate(() => ({ ...window.__katieMock.debug.requests }))

  for (const [w, h] of SIZES) {
    const sz = `${w}x${h}`
    const { ctx, page } = await open(w, h, `${BASE}leads?mock=1`)
    await rowsUp(page, 11)
    await until(page, settledDom)
    await animsDone(page)
    await waitOff(page)
    await park(page)

    // ---- the page
    const nav = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Main"] a')].map((a) => a.innerText.split('\n')[0].trim()))
    check(`${sz} nav: Leads sits between Bookings and Callbacks`, nav.join(',') === 'Overview,Calls,Bookings,Leads,Callbacks,Texts,Settings', nav.join(', '))
    const f0 = await page.evaluate(leadFacts)
    const served = await page.evaluate(async () => (await window.__katieMock.get('/leads', 'stage=open')).body.leads.map((l) => l.lead_id))
    check(`${sz} default: the open leads, 11 rows in the served order (newest stage change first), counts 3 / 1 / 4 / 1`, f0.filter === 'open' && f0.search === '?mock=1' && f0.title === '11 open leads' && f0.counts.join('/') === '3/1/4/1' && f0.ids.join() === served.join() && f0.pressed.length === 0, `${f0.title}; ${f0.counts.join(' / ')}; filter ${f0.filter}`)
    check(`${sz} tab title is "Leads · Katie"; every phone is masked; nothing is due and nobody is flagged to call (the box sends neither yet)`, f0.tab === 'Leads · Katie' && f0.phones.every((x) => /^\(\d{3}\) \*\*\*-\d{4}$/.test(x)) && f0.callNow === 0 && f0.nextText.length === 0, `${f0.tab}; ${f0.phones.length} masked phones`)
    const sentence = await page.evaluate(() => document.querySelector('main section[data-katie]')?.getAttribute('data-katie') ?? null)
    check(`${sz} Katie's sentence on the list card, 140 characters at most`, sentence === '11 open leads. Three missed consults: start with those.', sentence)
    const geo = await page.evaluate(() => ({ rows: [...document.querySelectorAll('main tbody tr:has([data-lead-row])')].map((r) => Math.round(r.getBoundingClientRect().height / (r.currentCSSZoom || 1))), hscroll: document.documentElement.scrollWidth > window.innerWidth, raw: document.querySelector('main').innerText }))
    check(`${sz} rows at least 44 px, no horizontal scroll, no raw codes or "you pay" on the page`, geo.rows.every((x) => x >= 44) && !geo.hscroll && !RAW_LEAD_WORDS.test(geo.raw), `rows ${geo.rows.join(', ')}`)
    await audit(page, `${sz} leads`)
    await shotLead(page, 'leads-open', w, h)

    // ---- the counts filter, the select filters, the URL remembers
    await page.click('[data-lead-count="missed_consult"]')
    await rowsUp(page, 3)
    const f1 = await page.evaluate(leadFacts)
    check(`${sz} tap Missed consult: 3 rows, all Missed consult, ?show=missed_consult, the card is pressed`, f1.title === '3 missed consults' && f1.chips.every((c) => c === 'Missed consult') && /[?&]show=missed_consult\b/.test(f1.search) && f1.pressed.join() === 'missed_consult' && f1.filter === 'missed_consult', `${f1.title}; ${f1.search}`)
    await page.click('[data-lead-count="missed_consult"]')
    await rowsUp(page, 11)
    const f2 = await page.evaluate(leadFacts)
    check(`${sz} tap it again: back to the open leads, ?show gone`, f2.filter === 'open' && !/show=/.test(f2.search) && f2.pressed.length === 0, f2.search)
    await page.selectOption('main select[aria-label="Show"]', 'all')
    await rowsUp(page, 14)
    const f3 = await page.evaluate(leadFacts)
    check(`${sz} All leads: 14 rows, "14 leads", started / paused / lost included`, f3.title === '14 leads' && ['Started', 'Paused', 'Lost'].every((c) => f3.chips.includes(c)), f3.title)
    await page.selectOption('main select[aria-label="Show"]', 'never_booked')
    await rowsUp(page, 1)
    const f4 = await page.evaluate(leadFacts)
    check(`${sz} Never booked: one lead, quoted more than a week ago`, f4.title === '1 never booked' && f4.chips.join() === 'Quoted' && f4.pressed.join() === 'never_booked', f4.title)
    await page.selectOption('main select[aria-label="Show"]', 'open')
    await rowsUp(page, 11)

    // ---- the drawer
    await openLead(page, LEAD.noah)
    const d0 = await page.evaluate(drawerFacts)
    const t0 = await page.evaluate(leadFacts)
    check(`${sz} a row opens the lead over the list at /dash/leads/:id; tab title "Lead · Katie" (no name, no number)`, t0.path === `/dash/leads/${LEAD.noah}` && t0.tab === 'Lead · Katie' && t0.ids.length === 11 && /^Noah \| Consult booked \| \(656\) \*\*\*-0118/.test(d0.header), `${t0.tab}; ${d0.header}`)
    check(`${sz} drawer: Exam / Texts / Next text facts, the taps for a booked consult, the quote table, the history`, d0.facts.Exam === 'Wed 8:00 AM' && d0.facts.Texts === 'Allowed: said yes on the call' && 'Next text' in d0.facts && d0.taps.join() === 'Came in,No-show,Lost,Pause' && d0.quoteHead.join() === 'Option,Fee,Insurance,Patient pays,Monthly' && d0.history.length === 4 && !RAW_LEAD_WORDS.test(d0.text), `${JSON.stringify(d0.facts)}; taps ${d0.taps.join(', ')}; history ${d0.history.length}`)
    await audit(page, `${sz} lead drawer`)
    await shotLead(page, 'leads-drawer-booked', w, h)

    // ---- a tap moves the lead
    const before = await requests(page)
    await page.click('[data-lead-tap="happened"]')
    await tapsAre(page, ['Started', 'Lost', 'Pause'])
    await until(page, () => document.querySelector('[data-lead-count="consult_happened"]')?.innerText.includes('2'), { label: 'counts after the tap' })
    const d1 = await page.evaluate(drawerFacts)
    const t1 = await page.evaluate(leadFacts)
    const after = await requests(page)
    const posts = Object.entries(after).filter(([k]) => k.startsWith('POST ')).reduce((n, [k, v]) => n + v - (before[k] ?? 0), 0)
    check(`${sz} Came in: one POST, the chip and the taps change at once, the counts and the list follow (booked 3, came in 2, the lead on top)`, posts === 1 && /^Noah \| Came in/.test(d1.header) && t1.counts.join('/') === '3/1/3/2' && t1.ids[0] === LEAD.noah && d1.history.at(-1).includes('Front desk marked came in') && !d1.problem, `${posts} POST; ${d1.header}; ${t1.counts.join(' / ')}; "${d1.history.at(-1)}"`)
    const a1 = await page.evaluate(() => ({ saved: document.querySelector('[data-lead-saved]')?.textContent.trim(), focus: document.activeElement?.textContent?.trim(), inDrawer: !!document.activeElement?.closest('aside[role="complementary"]') }))
    check(`${sz} after the tap a hidden status line says "Marked came in." and focus lands on the Update heading (the tapped button is gone), never on the page`, a1.saved === 'Marked came in.' && a1.focus === 'Update' && a1.inDrawer, `status "${a1.saved}"; focus on "${a1.focus}"`)
    await closeLead(page)
    const focus = await page.evaluate(() => document.activeElement?.getAttribute('data-lead-row'))
    check(`${sz} Esc closes the drawer, the list keeps its place, focus is back on the row`, focus === LEAD.noah && (await page.evaluate(() => !document.querySelector('aside[role="complementary"]'))), `focus on ${focus}`)

    // ---- a move the record refuses (the lead changed behind this page): the box's sentence, then the fresh stage
    await openLead(page, LEAD.jude)
    await page.evaluate((id) => window.__katieMock.post(`/leads/${id}/action`, { action: 'lost' }), LEAD.jude)
    await page.click('[data-lead-tap="missed"]')
    await drawerUntil(page, () => !!document.querySelector('aside[role="complementary"] [data-lead-problem]'), 'the refusal')
    await tapsAre(page, ['Reopen'])
    const d2 = await page.evaluate(drawerFacts)
    check(`${sz} a refused move says the box's sentence without a stage code, and the drawer catches up to the real stage`, d2.problem === 'A lost lead has no exam to miss.' && /^Jude \| Lost/.test(d2.header), `"${d2.problem}"; ${d2.header}`)
    await openLead(page, LEAD.mia)
    const d2b = await page.evaluate(drawerFacts)
    check(`${sz} another row opened over the same drawer: the refusal and the taps do not follow it (Mia's own taps, no message)`, !d2b.problem && /^Mia \| Consult booked/.test(d2b.header) && d2b.taps.join() === 'Came in,No-show,Lost,Pause', `${d2b.header}; "${d2b.problem}"; taps ${d2b.taps.join(', ')}`)
    // Jude is lost now, so he is on the Lost list; reopen him from there, then back to the open leads
    await page.selectOption('main select[aria-label="Show"]', 'lost')
    await page.waitForSelector(`[data-lead-row="${LEAD.jude}"]`)
    await openLead(page, LEAD.jude)
    await tapsAre(page, ['Reopen'])
    await page.click('[data-lead-tap="reopen"]')
    await drawerUntil(page, () => !document.querySelector('aside[role="complementary"] [data-lead-problem]') && document.querySelectorAll('aside[role="complementary"] [data-lead-tap]').length > 1, 'reopened')
    const d3 = await page.evaluate(drawerFacts)
    check(`${sz} Reopen: the lead is open again and the message is gone`, !/\| Lost/.test(d3.header) && d3.taps.length > 1 && !d3.problem, `${d3.header}; taps ${d3.taps.join(', ')}`)
    await closeLead(page)
    await page.selectOption('main select[aria-label="Show"]', 'open')
    await page.waitForSelector(`[data-lead-row="${LEAD.ava}"]`)
    await sleep(300)

    // ---- Booked asks for the day and time; Esc in the form closes the form only
    await openLead(page, LEAD.ava)
    await page.click('[data-lead-tap="booked"]')
    await page.waitForSelector('[data-lead-ask="slot"]')
    const form = await page.evaluate(() => ({ save: document.querySelector('[data-lead-ask="slot"] button[type="submit"]').disabled, min: document.querySelector('[data-lead-ask="slot"] input[type="date"]').min, focus: document.activeElement?.type }))
    await page.keyboard.press('Escape')
    await sleep(200)
    const stillOpen = await page.evaluate(() => ({ drawer: !!document.querySelector('aside[role="complementary"]'), form: !!document.querySelector('[data-lead-ask]') }))
    check(`${sz} Booked opens a day + time form (today is the earliest day, Save waits for both); Esc closes the form, not the drawer`, form.save === true && form.min === '2026-10-12' && form.focus === 'date' && stillOpen.drawer && !stillOpen.form, `min ${form.min}; save disabled ${form.save}`)
    const escFocus = await page.evaluate(() => document.activeElement?.getAttribute('data-lead-tap'))
    await page.click('[data-lead-tap="booked"]')
    await page.fill('[data-lead-ask="slot"] input[type="date"]', '2026-10-12')
    await page.fill('[data-lead-ask="slot"] input[type="time"]', '09:00')
    const past = await page.evaluate(() => ({ said: document.querySelector('[data-lead-slot-past]')?.innerText.trim() ?? '', save: document.querySelector('[data-lead-ask="slot"] button[type="submit"]').disabled }))
    await page.fill('[data-lead-ask="slot"] input[type="time"]', '18:30')
    const ahead = await page.evaluate(() => ({ said: document.querySelector('[data-lead-slot-past]')?.innerText.trim() ?? '', save: document.querySelector('[data-lead-ask="slot"] button[type="submit"]').disabled }))
    await page.click('[data-lead-ask="slot"] button:not([type="submit"])')
    await sleep(150)
    const cancelFocus = await page.evaluate(() => ({ tap: document.activeElement?.getAttribute('data-lead-tap'), form: !!document.querySelector('[data-lead-ask]') }))
    check(`${sz} a time earlier today is refused ("That time has already passed.", Save off); 6:30 PM today is taken; Esc and Cancel put focus back on the Booked tap`, past.said === 'That time has already passed.' && past.save === true && ahead.said === '' && ahead.save === false && escFocus === 'booked' && cancelFocus.tap === 'booked' && !cancelFocus.form, `past: "${past.said}" save off ${past.save}; ahead: "${ahead.said}" save off ${ahead.save}; focus after Esc ${escFocus}, after Cancel ${cancelFocus.tap}`)
    await page.click('[data-lead-tap="booked"]')
    const blank = await page.evaluate(() => [document.querySelector('[data-lead-ask="slot"] input[type="date"]').value, document.querySelector('[data-lead-ask="slot"] input[type="time"]').value])
    check(`${sz} the form opens blank again (nothing typed earlier is kept)`, blank.join() === ',', `values ${JSON.stringify(blank)}`)
    await page.fill('[data-lead-ask="slot"] input[type="date"]', '2026-10-20')
    await page.fill('[data-lead-ask="slot"] input[type="time"]', '09:30')
    await page.click('[data-lead-ask="slot"] button[type="submit"]')
    await tapsAre(page, ['Came in', 'No-show', 'Lost', 'Pause'])
    await drawerUntil(page, () => /booked the exam/.test(document.querySelector('aside[role="complementary"] section[aria-label="History"]')?.innerText ?? ''), 'the booking in the history')
    const d4 = await page.evaluate(drawerFacts)
    check(`${sz} Save booking: Consult booked for Oct 20, 9:30 AM; the history says who booked it`, /^Ava \| Consult booked/.test(d4.header) && d4.facts.Exam === 'Oct 20, 9:30 AM' && d4.history.at(-1).includes('Front desk booked the exam: Tue 9:30 AM') && !d4.asking, `${d4.header}; Exam ${d4.facts.Exam}; "${d4.history.at(-1)}"`)
    const a4 = await page.evaluate(() => ({ saved: document.querySelector('[data-lead-saved]')?.textContent.trim(), focus: document.activeElement?.textContent?.trim() }))
    check(`${sz} after Save booking: "Booking saved." on the status line, focus on the Update heading`, a4.saved === 'Booking saved.' && a4.focus === 'Update', `status "${a4.saved}"; focus on "${a4.focus}"`)

    // ---- a note, then Lost (the one tap that asks first), with its reason
    await page.fill('[data-lead-note]', 'Mom will call back Friday')
    await page.click('aside[role="complementary"] form:has([data-lead-note]) button[type="submit"]')
    await drawerUntil(page, () => /Mom will call back Friday/.test(document.querySelector('aside[role="complementary"] section[aria-label="History"]')?.innerText ?? ''), 'the note in the history')
    const d5 = await page.evaluate(drawerFacts)
    check(`${sz} Save note: one line in the history, the stage unchanged`, /^Ava \| Consult booked/.test(d5.header) && d5.history.at(-1).includes('Front desk wrote a note') && d5.history.at(-1).includes('Mom will call back Friday'), `"${d5.history.at(-1)}"`)
    const a5 = await page.evaluate(() => ({ saved: document.querySelector('[data-lead-saved]')?.textContent.trim(), onNote: document.activeElement?.hasAttribute('data-lead-note') }))
    check(`${sz} after Save note: "Note saved." on the status line, focus stays in the note field`, a5.saved === 'Note saved.' && a5.onNote === true, `status "${a5.saved}"; on the note ${a5.onNote}`)
    await page.click('[data-lead-tap="lost"]')
    await page.waitForSelector('[data-lead-ask="lost"]')
    const ask = await page.evaluate(() => document.querySelector('[data-lead-ask="lost"]').innerText.replace(/\n+/g, ' | '))
    await page.fill('[data-lead-ask="lost"] input[type="text"]', 'Went elsewhere')
    await page.click('[data-lead-ask="lost"] button[type="submit"]')
    await tapsAre(page, ['Reopen'])
    await until(page, () => /^\d+ open leads?$/.test(document.querySelector('main section:has(table) h2')?.innerText.trim() ?? '') && !document.querySelector('main tbody [data-lead-row="Lc1c180eb9d"]'), { label: 'the lost lead leaves the open list' })
    const d6 = await page.evaluate(drawerFacts)
    const t6 = await page.evaluate(leadFacts)
    check(`${sz} Lost asks first ("Mark Ava as lost?"), saves the reason, and the lead leaves the open list`, /Mark Ava as lost\?/.test(ask) && /^Ava \| Lost/.test(d6.header) && d6.history.at(-1).includes('Front desk marked lost') && d6.history.at(-1).includes('Went elsewhere') && t6.title === '10 open leads' && t6.counts[0] === '2', `${d6.header}; ${t6.title}; "${d6.history.at(-1)}"`)
    await closeLead(page)

    // ---- Show numbers: the list and the drawer, and nothing about a person outside the page
    await page.locator('header label', { hasText: 'Show numbers' }).click()
    await until(page, () => /555-01\d\d/.test(document.querySelector('main')?.textContent ?? ''), { label: 'revealed numbers' })
    await until(page, settledDom)
    const f7 = await page.evaluate(leadFacts)
    await openLead(page, LEAD.sam)
    const d7 = await page.evaluate(drawerFacts)
    const outside = await page.evaluate(() => {
      const store = (st) => { try { return Object.entries(st).map(([k, v]) => `${k}=${v}`).join(' ') } catch { return '' } }
      return `${location.href} ${document.title} ${store(localStorage)} ${store(sessionStorage)}`
    })
    check(`${sz} Show numbers: every phone reads (xxx) 555-01xx in the list and in the drawer`, f7.phones.length > 0 && f7.phones.every((x) => /^\(\d{3}\) 555-01\d\d$/.test(x)) && /\(727\) 555-0160/.test(d7.header), `${f7.phones.length} phones; drawer ${redact(d7.header)}`)
    check(`${sz} a lead who texted STOP: "Texts stopped" in the list, the date and the reason in the drawer`, d7.facts.Texts === 'Stopped Wed, Oct 7: they texted STOP' && d7.facts['Next text'] === 'None: texts are stopped' && (await page.evaluate((id) => document.querySelector(`main tbody tr:has([data-lead-row="${id}"])`)?.cells[4]?.innerText.trim(), LEAD.sam)) === 'Texts stopped', `${JSON.stringify(d7.facts)}`)
    check(`${sz} no name and no number in the URL, the tab title or browser storage`, !/555-?01\d\d|\d{10}/.test(outside) && !/Sam|Ava|Noah|Jude|Dana/.test(outside), redact(outside).slice(0, 160))
    await closeLead(page)
    await page.locator('header label', { hasText: 'Show numbers' }).click()
    await until(page, () => /\*\*\*-\d{4}/.test(document.querySelector('main tbody')?.textContent ?? ''), { label: 'masked again' })

    // ---- reserved: the next text and the call-now prompt, as the next backend pieces will send them
    const patched = await page.evaluate(async (id) => {
      const lead = (await window.__katieMock.get(`/leads/${id}`)).body.lead
      return window.__katieMock.patchLead(id, { call_now: true, call_now_reason: 'No reply to two texts', next_text_at: lead.stage_at + 30 * 86_400, next_text_label: 'Day 2 text' })
    }, LEAD.dana)
    await page.click('[data-lead-count="missed_consult"]')
    await until(page, () => document.querySelectorAll('main [data-call-now]').length === 1, { label: 'the call prompt' })
    const f8 = await page.evaluate(leadFacts)
    const cell = await page.evaluate((id) => document.querySelector(`main tbody tr:has([data-lead-row="${id}"])`)?.cells[4]?.innerText.replace(/\n+/g, ' | '), LEAD.dana)
    await openLead(page, LEAD.dana)
    const d8 = await page.evaluate(drawerFacts)
    check(`${sz} reserved slots: with next_text_at / next_text_label / call_now / call_now_reason set, the row shows "Call now", why, and the next text; the drawer says who to call`, patched === true && f8.callNow === 1 && f8.nextText.length === 1 && /^Call now \| No reply to two texts \| .+ \| Day 2 text$/.test(cell ?? '') && /^Call Dana now \| \(813\) \*\*\*-0141 · No reply to two texts$/.test(d8.call) && /Day 2 text$/.test(d8.facts['Next text'] ?? ''), `row "${cell}"; drawer "${d8.call}"; Next text "${d8.facts['Next text']}"`)
    await shotLead(page, 'leads-call-now', w, h)
    await closeLead(page)
    await ctx.close()
  }

  // ---- straight to a lead's address; a lead that is not there
  {
    const { ctx, page } = await open(1280, 800, `${BASE}leads/${LEAD.jude}?mock=1`)
    await page.waitForSelector('aside[role="complementary"] section[aria-label="History"] li')
    await rowsUp(page, 11)
    const d = await page.evaluate(drawerFacts)
    const t = await page.evaluate(leadFacts)
    const current = await page.evaluate(() => [...document.querySelectorAll('main tbody tr')].filter((r) => /current/.test(r.className)).map((r) => r.querySelector('[data-lead-row]')?.getAttribute('data-lead-row')))
    check('a lead\'s own address opens it over the open leads, its row marked', /^Jude \| Consult booked/.test(d.header) && t.tab === 'Lead · Katie' && current.join() === LEAD.jude, `${d.header}; ${t.ids.length} rows behind`)
    await page.goto(`${BASE}leads/Lnope000000?mock=1`)
    await until(page, () => /not on the list any more/.test(document.querySelector('aside[role="complementary"]')?.innerText ?? ''), { label: 'unknown lead' })
    const gone = await page.evaluate(drawerFacts)
    check('an unknown lead says so and offers no taps', /This lead is not on the list any more\./.test(gone.text) && gone.taps.length === 0, gone.text.replace(/\n+/g, ' | ').slice(0, 120))
    await ctx.close()
  }

  // ---- asks again every 60 s and when the window comes back (no live events for leads yet)
  {
    const { ctx, page } = await open(1280, 800, `${BASE}leads?mock=1`, { clock: true })
    await rowsUp(page, 11)
    const a = (await requests(page))['/leads'] ?? 0
    await page.clock.runFor(55_000)
    const b = (await requests(page))['/leads'] ?? 0
    await page.clock.runFor(10_000)
    await sleep(300)
    const c = (await requests(page))['/leads'] ?? 0
    await page.clock.runFor(20_000)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })))
    await page.clock.runFor(1_000)
    await sleep(300)
    const d = (await requests(page))['/leads'] ?? 0
    check('the list asks again at 60 s (not before), and again when the window comes back', b === a && c === a + 1 && d === c + 1, `/leads requests: ${a} at load, ${b} at 55 s, ${c} at 65 s, ${d} after focus`)
    await openLead(page, LEAD.zoe)
    const one = (key) => requests(page).then((r) => Object.entries(r).filter(([k]) => k.startsWith('/leads/')).reduce((n, [, v]) => n + v, 0))
    const e = await one()
    await page.clock.runFor(61_000)
    await sleep(300)
    const g = await one()
    check('an open lead asks again every 60 s too', g === e + 1, `/leads/:id requests: ${e}, then ${g}`)
    await ctx.close()
  }

  // ---- empty, error, slow, and the closers' demo day
  {
    const { ctx, page } = await open(1280, 800, `${BASE}leads?mock=empty`)
    await until(page, () => /No leads yet\./.test(document.querySelector('main')?.innerText ?? ''), { label: 'empty leads' })
    const t = await page.evaluate(leadFacts)
    const katieLine = await page.evaluate(() => document.querySelector('main section[data-katie]')?.getAttribute('data-katie'))
    check('mock=empty: "No leads yet." in the dashed box, four zero counts, Katie has nothing to say', t.counts.join('/') === '0/0/0/0' && t.title === '0 open leads' && katieLine === '', `${t.title}; ${t.counts.join(' / ')}`)
    await shotLead(page, 'leads-empty', 1280, 800)
    await ctx.close()
  }
  {
    const { ctx, page } = await open(1280, 800, `${BASE}leads?mock=slow`)
    await page.waitForSelector('main table[aria-busy="true"]')
    const sk = await page.evaluate(() => ({ rows: document.querySelectorAll('main tbody tr[aria-hidden="true"]').length, real: document.querySelectorAll('main tbody [data-lead-row]').length }))
    await rowsUp(page, 11)
    check('mock=slow: six skeleton rows while it loads, then the list', sk.rows === 6 && sk.real === 0, `${sk.rows} skeleton rows`)
    await ctx.close()
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}leads?mock=error`)
    await until(page, () => /Couldn.t load this/.test(document.querySelector('main')?.innerText ?? ''), { timeout: 30000, label: 'error line' })
    const t = await page.evaluate(leadFacts)
    check('mock=error: the error line with Retry, dashes for the counts (never zeros)', t.counts.every((x) => x === '–') && (await page.locator('main button', { hasText: 'Retry' }).count()) === 1, t.counts.join(' / '))
    await ctx.close()
  }
  {
    const { ctx, page, dash, sink: dsink } = await demoContext(browser, 1280, 800)
    await page.goto(`${BASE}leads?mock=demo`)
    await rowsUp(page, 11)
    await until(page, settledDom)
    const t = await page.evaluate(leadFacts)
    const exams = await page.evaluate(() => [...document.querySelectorAll('main tbody tr:has([data-lead-row])')].map((r) => r.cells[1].innerText.split('\n').filter(Boolean).slice(1).join(' ')))
    await openLead(page, LEAD.jude)
    await page.click('[data-lead-tap="happened"]')
    await tapsAre(page, ['Started', 'Lost', 'Pause'])
    const d = await page.evaluate(drawerFacts)
    const errs = dsink.filter((m) => ['error', 'pageerror', 'requestfailed', 'http'].includes(m.type))
    check('mock=demo: the same 11 open leads on today\'s date (3 / 1 / 4 / 1), a tap works, 0 /api/dash requests, console clean', t.title === '11 open leads' && t.counts.join('/') === '3/1/4/1' && /^Jude \| Came in/.test(d.header) && dash.length === 0 && errs.length === 0, `${t.title}; ${t.counts.join(' / ')}; exams ${exams.slice(0, 4).join(', ')}; ${dash.length} /api/dash; ${errs.length} errors`)
    await ctx.close()
  }

  const errs = sink.filter((m) => ['error', 'pageerror', 'requestfailed', 'http'].includes(m.type))
  check('console clean through every lead flow (mock)', errs.length === 0, errs.length ? errs.slice(0, 4).map((m) => `${m.type}: ${m.text}`).join(' || ') : `${sink.length} messages, 0 errors`)
  results.leads = { ...(results.leads || {}), at: new Date().toISOString(), checks, list }
}

// The same page against the stand-in box (scripts/fake-api.mjs, basic auth, no mock): the real
// fetches. What the page sends is read off the wire; what the box did is read from its counters.
async function stepLeadsReal(browser, base) {
  const checks = []
  const check = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail: String(detail) })
    log(pass ? 'ok  ' : 'FAIL', name, detail)
  }
  const origin = new URL(base).origin
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, httpCredentials: FAKE })
  const page = await ctx.newPage()
  const sink = []
  const sent = [] // emptied before each action, to read what that action sent
  const everySent = []
  attachConsole(page, sink, 'leads real')
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (!u.pathname.startsWith('/api/dash/leads')) return
    const x = { method: r.method(), path: u.pathname, query: u.search, type: r.headers()['content-type'] ?? '', body: r.postData() ?? '' }
    sent.push(x)
    everySent.push(x)
  })
  const counters = async () => (await (await ctx.request.get(`${origin}/__fake/counters`)).json()).byPath
  await page.goto(`${base}leads`)
  await until(page, () => document.querySelectorAll('main tbody [data-lead-row]').length === 11, { label: 'real leads' })
  const t0 = await page.evaluate(leadFacts)
  const first = sent[0]
  check('real mode: GET /api/dash/leads?stage=open&limit=200 (no reveal), 11 open leads and the counts from the summary, phones masked', first && first.method === 'GET' && first.path === '/api/dash/leads' && /stage=open/.test(first.query) && /limit=200/.test(first.query) && !/reveal/.test(first.query) && t0.title === '11 open leads' && t0.counts.join('/') === '3/1/4/1' && t0.phones.every((x) => /\*\*\*/.test(x)), `${first?.method} ${first?.path}${first?.query}; ${t0.title}; ${t0.counts.join(' / ')}`)

  // a tap: one POST with a JSON body, nothing personal in its URL
  const booked = await page.evaluate(() => [...document.querySelectorAll('main tbody tr:has([data-lead-row])')].find((r) => r.cells[1].innerText.startsWith('Consult booked'))?.querySelector('[data-lead-row]').getAttribute('data-lead-row'))
  await page.click(`[data-lead-row="${booked}"]`)
  await page.waitForSelector('aside[role="complementary"] section[aria-label="History"] li')
  sent.length = 0
  await page.click('[data-lead-tap="happened"]')
  await until(page, () => [...document.querySelectorAll('aside[role="complementary"] [data-lead-tap]')].map((b) => b.innerText.trim()).join() === 'Started,Lost,Pause', { label: 'real tap' })
  await until(page, () => document.querySelector('[data-lead-count="consult_happened"]')?.innerText.includes('2'), { label: 'real counts' })
  const post = sent.filter((x) => x.method === 'POST')
  const c1 = await counters()
  check('real mode: Came in is one POST /api/dash/leads/:id/action with the JSON body {"action":"happened"}, then the list and the lead are fetched again', post.length === 1 && post[0].path === `/api/dash/leads/${booked}/action` && post[0].query === '' && /application\/json/.test(post[0].type) && post[0].body === '{"action":"happened"}' && c1['POST /leads/:id/action'] === 1 && sent.some((x) => x.method === 'GET' && x.path === '/api/dash/leads') && sent.some((x) => x.method === 'GET' && x.path === `/api/dash/leads/${booked}`), `${post.length} POST ${post[0]?.path} ${post[0]?.type} ${post[0]?.body}; box counted ${c1['POST /leads/:id/action']}`)

  // a booking carries the slot
  await page.keyboard.press('Escape')
  await page.waitForURL((u) => u.pathname.replace(/\/$/, '') === '/dash/leads')
  const missed = await page.evaluate(() => [...document.querySelectorAll('main tbody tr:has([data-lead-row])')].find((r) => r.cells[1].innerText.startsWith('Missed consult'))?.querySelector('[data-lead-row]').getAttribute('data-lead-row'))
  await page.click(`[data-lead-row="${missed}"]`)
  await page.waitForSelector('aside[role="complementary"] section[aria-label="History"] li')
  await page.click('[data-lead-tap="booked"]')
  const day = await page.evaluate(() => document.querySelector('[data-lead-ask="slot"] input[type="date"]').min)
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10)
  sent.length = 0
  await page.fill('[data-lead-ask="slot"] input[type="date"]', next)
  await page.fill('[data-lead-ask="slot"] input[type="time"]', '09:30')
  await page.click('[data-lead-ask="slot"] button[type="submit"]')
  await until(page, () => [...document.querySelectorAll('aside[role="complementary"] [data-lead-tap]')].map((b) => b.innerText.trim()).join() === 'Came in,No-show,Lost,Pause', { label: 'real booking' })
  const bookPost = sent.find((x) => x.method === 'POST')
  const exam = await page.evaluate(() => [...document.querySelectorAll('aside[role="complementary"] dl > div')].find((x) => x.querySelector('dt')?.innerText.trim() === 'Exam')?.querySelector('dd')?.innerText.trim())
  check('real mode: Save booking posts {"action":"booked","slot_label":"<day>T09:30"} and the exam reads 9:30 AM on that day', bookPost?.body === JSON.stringify({ action: 'booked', slot_label: `${next}T09:30` }) && /9:30 AM$/.test(exam ?? ''), `${bookPost?.body}; Exam ${exam}`)

  // a 409 from the server: the lead was closed from another computer
  await ctx.request.post(`${origin}/api/dash/leads/${missed}/action`, { data: { action: 'lost' } })
  await page.click('[data-lead-tap="missed"]')
  await until(page, () => !!document.querySelector('aside[role="complementary"] [data-lead-problem]'), { label: 'real refusal' })
  await until(page, () => [...document.querySelectorAll('aside[role="complementary"] [data-lead-tap]')].map((b) => b.innerText.trim()).join() === 'Reopen', { label: 'real refresh after refusal' })
  const problem = await page.evaluate(() => document.querySelector('aside[role="complementary"] [data-lead-problem]').innerText.trim())
  check('real mode: a 409 shows the server\'s sentence and the drawer refetches to the real stage', problem === 'A lost lead has no exam to miss.', problem)

  // Show numbers: reveal=1 on the GETs, ten digits formatted on the page
  await page.keyboard.press('Escape')
  await page.waitForURL((u) => u.pathname.replace(/\/$/, '') === '/dash/leads')
  sent.length = 0
  await page.locator('header label', { hasText: 'Show numbers' }).click()
  await until(page, () => /555-01\d\d/.test(document.querySelector('main tbody')?.textContent ?? ''), { label: 'real reveal' })
  const t1 = await page.evaluate(leadFacts)
  const rev = sent.find((x) => x.method === 'GET' && x.path === '/api/dash/leads')
  check('real mode: Show numbers asks with reveal=1 and the ten digits the box sends read (xxx) 555-01xx', !!rev && /reveal=1/.test(rev.query) && t1.phones.every((x) => /^\(\d{3}\) 555-01\d\d$/.test(x)), `${rev?.path}${rev?.query}; ${t1.phones.length} phones`)
  check('real mode: no lead request carries a name or a number in its URL', everySent.length > 8 && everySent.every((x) => !/\d{7,}|555|[A-Z][a-z]+%20|name=/.test(x.path.replace(/\/L[0-9a-f]{10}\b/, '/:id') + x.query)), `${everySent.length} requests`)

  const errs = sink.filter((m) => (['error', 'pageerror', 'requestfailed'].includes(m.type) && !/status of 409/.test(m.text)) || (m.type === 'http' && !/^409 /.test(m.text)))
  check('real mode: console clean (the one 409 is the refused move)', errs.length === 0, errs.length ? errs.slice(0, 4).map((m) => `${m.type}: ${m.text}`).join(' || ') : `${sink.length} messages`)
  await ctx.close()
  results.leads = { ...(results.leads || {}), real: { at: new Date().toISOString(), checks } }
}

// ------------------------------------------------------------------ step: sign-in (the mock provider)

// ?mock=1&auth=1: the cognito-mode screens on invented people (src/auth/mock.ts, mockBackend.ts).
// Every code is 000000; any password signs in except "wrong-password". Under real time, except the
// idle lock, which uses Playwright's clock. The mock never touches the network, so "no token in a
// URL" is checked on the URL each request was built with (the debug log the client keeps in mock
// mode) and on every real network request the page made.
const AUTH_URL = `${BASE}?mock=1&auth=1`
const MOCK_PW = 'a-long-made-up-password'
const WRONG_PW = 'wrong-password'
const CODE = '000000'

async function stepAuth(browser) {
  const checks = []
  const list = []
  let size = ''
  const check = (name, pass, detail = '') => {
    checks.push({ name: `${size}: ${name}`, pass: !!pass, detail: String(detail) })
    log(pass ? 'ok  ' : 'FAIL', `${size}: ${name}`, detail)
  }
  const bad = []
  const urls = []

  async function open(w, h, { clock = false, query = '' } = {}) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    const page = await ctx.newPage()
    attachConsole(page, bad, `auth ${size}`)
    page.on('request', (r) => urls.push(r.url()))
    if (clock) await page.clock.install()
    await page.goto(`${AUTH_URL}${query}`)
    return { ctx, page }
  }
  const screen = (page) => page.locator('[data-screen]').first().getAttribute('data-screen')
  async function waitScreen(page, name, timeout = 8000) {
    await page.waitForSelector(`[data-screen="${name}"]`, { timeout })
  }
  async function appUp(page) {
    await page.waitForSelector('[data-shell]', { state: 'attached', timeout: 8000 })
    await page.waitForSelector('[data-line-tile]', { timeout: 8000 })
  }
  async function shotAuth(page, name) {
    const file = path.join(OUT.auth, `${name}-${size}.png`)
    await animsDone(page)
    await sleep(200)
    await page.screenshot({ path: file })
    list.push({ file: rel(file), hscrollFree: await noHScroll(page) })
  }
  async function signIn(page, email, pw) {
    await page.fill('#auth-email', email)
    await page.fill('#auth-password', pw)
    await page.click('button[type="submit"]')
  }
  async function typeCode(page, code) {
    await page.click('[aria-label="Digit 1 of 6"]')
    await page.keyboard.type(code)
  }
  // The alert shows in the same render that empties the field: give the effect a beat.
  const alertText = async (page) => {
    const t = (await page.locator('[role="alert"]').first().textContent({ timeout: 4000 }).catch(() => '')) ?? ''
    await sleep(150)
    return t
  }
  const hasNoBang = (t) => !t.includes('!')

  for (const [w, h] of SIZES) {
    size = `${w}x${h}`

    // ---------------- A: the owner, start to finish
    {
      const { ctx, page } = await open(w, h)
      await waitScreen(page, 'sign-in')
      check('the sign-in screen shows before any data', (await page.locator('[data-shell], [data-line-tile], main section[aria-labelledby]:not([data-screen])').count()) === 0, 'no shell, no Line tile')
      check('the tab title carries no name or number', /^[A-Za-z· ]+$/.test(await page.title()), await page.title())
      check('sign-in: no horizontal scroll', await noHScroll(page))
      await shotAuth(page, 'signin-1-password')

      await page.click('text=Forgot your password?')
      await waitScreen(page, 'forgot')
      const forgot = await page.locator('[data-screen="forgot"]').innerText()
      check('forgot password: text only, names the owner and the support email, no reset form', /practice owner/i.test(forgot) && forgot.includes('support@example.com') && (await page.locator('[data-screen="forgot"] input').count()) === 0, forgot.replace(/\s+/g, ' ').slice(0, 120))
      await shotAuth(page, 'signin-6-forgot')
      await page.click('text=Back to sign in')
      await waitScreen(page, 'sign-in')

      await signIn(page, 'owner@harborline.example', WRONG_PW)
      const wrong = await alertText(page)
      check('wrong password: one plain line, no exclamation mark', /do not match/.test(wrong) && hasNoBang(wrong), wrong)
      check('wrong password: the field is cleared and the screen stays', (await page.inputValue('#auth-password')) === '' && (await screen(page)) === 'sign-in')
      await shotAuth(page, 'signin-1b-wrong-password')

      await signIn(page, 'owner@harborline.example', MOCK_PW)
      await waitScreen(page, 'code')
      const codeText = await page.locator('[data-screen="code"]').innerText()
      check('code screen: six boxes, remember box with the days from the config', (await page.locator('[data-screen="code"] input[aria-label^="Digit"]').count()) === 6 && /Remember this computer for 30 days/.test(codeText), codeText.replace(/\s+/g, ' ').slice(0, 140))
      check('code screen: no "email code instead" link for a person with only the app', !/instead/i.test(codeText))
      await typeCode(page, '111111')
      await page.click('button[type="submit"]')
      const wrongCode = await alertText(page)
      check('wrong code: plain line, boxes emptied, still on the code screen', /not right/.test(wrongCode) && hasNoBang(wrongCode) && (await page.inputValue('[aria-label="Digit 1 of 6"]')) === '' && (await screen(page)) === 'code', wrongCode)
      await typeCode(page, '482')
      await shotAuth(page, 'signin-2-code')
      await page.keyboard.type('719')
      check('code boxes: typing moves on, six digits fill six boxes', (await page.locator('[data-screen="code"] input[aria-label^="Digit"]').evaluateAll((els) => els.map((e) => e.value).join(''))) === '482719')
      for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace')
      await page.keyboard.type(CODE)
      await page.check('text=Remember this computer')
      await page.click('button[type="submit"]')
      await appUp(page)
      check('the right code opens the app', true)
      const remembered = await page.evaluate(() => localStorage.getItem('katie.auth.rememberedAt'))
      check('remember box: katie.auth.rememberedAt holds a date, and the mock device is remembered', !!remembered && !Number.isNaN(Date.parse(remembered)) && (await page.evaluate(() => window.__katieAuth.remembered())).includes('owner@harborline.example'), remembered ?? 'none')
      const who = await page.locator('[data-account]').innerText()
      check('top bar: "Signed in as" the name, and Sign out', /Dr\. Priya Raman/.test(who) && /Sign out/.test(who) && (w < 1440 || /Signed in as/.test(who)), who.replace(/\s+/g, ' '))
      check('top bar: no horizontal scroll with the account line', await noHScroll(page))
      await shotAuth(page, 'app-overview-signed-in')

      // Settings: People and Activity for an owner
      await rail(page, '/settings')
      await page.waitForSelector('[data-card="people"] table')
      await page.waitForSelector('[data-card="activity"] li')
      const heads = await page.locator('[data-card="people"] thead th').allInnerTexts()
      check('People card: person (with role), status, sign-in code, last signed in', ['Person', 'Status', 'Sign-in code', 'Last signed in'].every((c) => heads.some((x) => x.trim() === c)), heads.join(' | '))
      const rows = await page.locator('[data-card="people"] tbody tr').count()
      check('People card: four people and the SAIDA support row', rows === 5 && (await page.locator('[data-person="support"]').count()) === 1, `${rows} rows`)
      const jessica = await page.locator('[data-person="frontdesk@harborline.example"]').innerText()
      check('People card: name, email, role, state, second step, last sign-in on a row', /Jessica Lane/.test(jessica) && /Staff/.test(jessica) && /Active/.test(jessica) && /Email code/.test(jessica) && /Yesterday|\w{3} \d/.test(jessica), jessica.replace(/\s+/g, ' '))
      check('People card: your own row has no Remove', (await page.locator('[aria-label="Remove: Dr. Priya Raman"]').count()) === 0)
      check('People: no horizontal scroll', await noHScroll(page))
      await shotAuth(page, 'settings-3-people')
      const act = await page.locator('[data-card="activity"] li').allInnerTexts()
      check('Activity card: plain sentences, newest first, no number or call id', act.length >= 5 && /signed in/.test(act[0]) && act.some((t) => /opened a call/.test(t)) && act.every((t) => !/\(\d{3}\)|CA\d{6}|!/.test(t)), act.slice(0, 3).map((t) => t.replace(/\s+/g, ' ')).join(' / '))
      await page.selectOption('[data-card="activity"] select', { label: 'Marisol Vega' })
      const filtered = await page.locator('[data-card="activity"] li').allInnerTexts()
      check('Activity card: the filter shows one person', filtered.length > 0 && filtered.every((t) => /Staff|Marisol/.test(t)) && filtered.length < act.length, `${filtered.length} of ${act.length}`)
      await page.selectOption('[data-card="activity"] select', { label: 'Everyone' })

      // every People action with its dialog
      const dialog = page.locator('[role="dialog"]')
      await page.click('[aria-label="Reset password: Marisol Vega"]')
      await dialog.waitFor()
      check('Reset password: a dialog names the person and the email', /Reset Marisol's password\?/.test(await dialog.innerText()) && /staff@harborline\.example/.test(await dialog.innerText()))
      await page.keyboard.press('Escape')
      check('dialog: Escape closes it and nothing changed', (await dialog.count()) === 0 && /Active/.test(await page.locator('[data-person="staff@harborline.example"]').innerText()))
      await page.click('[aria-label="Reset password: Marisol Vega"]')
      await dialog.waitFor()
      await dialog.getByRole('button', { name: 'Reset password' }).click()
      await page.waitForSelector('[data-card="people"] [role="status"]')
      check('Reset password: confirmed, the row says so, a sentence joins Activity', /Password reset/.test(await page.locator('[data-person="staff@harborline.example"]').innerText()) && /reset the password for Marisol/.test(await page.locator('[data-card="activity"] ul').innerText()))

      await page.click('[aria-label="Reset code: Jessica Lane"]')
      await dialog.waitFor()
      check('Reset code: its dialog', /Reset Jessica's sign-in code\?/.test(await dialog.innerText()))
      await dialog.getByRole('button', { name: 'Reset code' }).click()
      await page.waitForFunction(() => /Not set up/.test(document.querySelector('[data-person="frontdesk@harborline.example"]')?.textContent ?? ''))
      check('Reset code: the second step reads "Not set up"', true)

      await page.click('[aria-label="Send invite again: Devon Okafor"]')
      await dialog.waitFor()
      check('Resend invite: its dialog', /Send Devon the invite again\?/.test(await dialog.innerText()))
      await dialog.getByRole('button', { name: 'Send invite' }).click()
      await page.waitForFunction(() => /Invite sent again/.test(document.querySelector('[data-card="people"] [role="status"]')?.textContent ?? ''))
      check('Resend invite: confirmed', true)

      await page.click('[aria-label="Remove: Jessica Lane"]')
      await dialog.waitFor()
      const rm = await dialog.innerText()
      check('Remove: the confirm names the person, says signed out everywhere, keeps their name on calls', /Remove Jessica Lane\?/.test(rm) && /signed out of Katie on every computer and phone right now/.test(rm) && /name stays on the calls/.test(rm), rm.replace(/\s+/g, ' ').slice(0, 160))
      await shotAuth(page, 'settings-4-remove')
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      check('Remove: Cancel keeps the person', (await dialog.count()) === 0 && /Active/.test(await page.locator('[data-person="frontdesk@harborline.example"]').innerText()))
      await page.click('[aria-label="Remove: Jessica Lane"]')
      await dialog.waitFor()
      await dialog.getByRole('button', { name: 'Remove Jessica' }).click()
      await page.waitForFunction(() => /Removed/.test(document.querySelector('[data-person="frontdesk@harborline.example"]')?.textContent ?? ''))
      check('Remove: the row reads "Removed" and loses its buttons', (await page.locator('[data-person="frontdesk@harborline.example"] button').count()) === 0)

      await page.click('text=Add a person')
      await dialog.waitFor()
      await dialog.getByRole('button', { name: 'Send invite' }).click()
      check('Add a person: an empty form says what is missing', /Enter their work email/.test(await dialog.innerText()))
      await dialog.getByLabel('Work email').fill('sam.ortiz@harborline.example')
      await dialog.getByLabel('Name').fill('Sam Ortiz')
      await dialog.getByLabel('Role').selectOption('staff')
      await shotAuth(page, 'settings-5-add')
      await dialog.getByRole('button', { name: 'Send invite' }).click()
      await page.waitForSelector('[data-person="sam.ortiz@harborline.example"]')
      check('Add a person: the invited person is on the list', /Invited/.test(await page.locator('[data-person="sam.ortiz@harborline.example"]').innerText()))
      await page.click('text=Add a person')
      await dialog.waitFor()
      await dialog.getByLabel('Work email').fill('sam.ortiz@harborline.example')
      await dialog.getByLabel('Name').fill('Sam Again')
      await dialog.getByRole('button', { name: 'Send invite' }).click()
      await page.waitForFunction(() => /already on the list/.test(document.querySelector('[role="dialog"]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => undefined)
      check('Add a person: the server\'s own words are shown as they come', /already on the list/.test(await dialog.innerText()))
      await page.keyboard.press('Escape')

      const sw = page.locator('[data-person="support"] [role="switch"]')
      check('SAIDA support: the switch is on and an owner can flip it', (await sw.isChecked()) && (await sw.isEnabled()))
      await page.locator('[data-person="support"] [data-vibe="Toggle"]').click()
      await page.waitForFunction(() => /Access off/.test(document.querySelector('[data-person="support"]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => undefined)
      check('SAIDA support: switching it off reads "Access off"', /Access off/.test(await page.locator('[data-person="support"]').innerText()), (await page.locator('[data-person="support"]').innerText()).replace(/\s+/g, ' '))

      // a demotion while the page is open: the server answers 403 and the card says so
      await page.evaluate(() => window.__katieAuth.setServerRole('staff'))
      await sleep(5500) // the People list is fresh for 5 s; past that, opening Settings asks again
      await page.click('nav[aria-label="Main"] a[href="/dash/calls"]')
      await page.click('nav[aria-label="Main"] a[href="/dash/settings"]')
      await page.waitForFunction(() => /Not allowed/.test(document.querySelector('[data-card="people"]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined)
      check('a 403 from the server shows "Not allowed." on the People card', /Not allowed/.test((await page.locator('[data-card="people"]').innerText().catch(() => '')) ?? ''))
      await page.evaluate(() => window.__katieAuth.setServerRole(null))

      // the 401 path: the session runs out, the next request goes back to sign-in
      await page.evaluate(() => window.__katieAuth.expire())
      await page.click('nav[aria-label="Main"] a[href="/dash/bookings"]')
      await waitScreen(page, 'sign-in')
      const ran = await page.locator('[role="status"]').first().innerText()
      check('a 401 returns to sign-in with the reason in plain words, and the data is gone', /session ran out/.test(ran) && hasNoBang(ran) && (await page.locator('[data-shell]').count()) === 0, ran)
      check('the route is kept for the way back', new URL(page.url()).pathname === '/dash/bookings')
      await signIn(page, 'owner@harborline.example', MOCK_PW)
      await appUp(page).catch(() => undefined)
      await page.waitForSelector('[data-shell]', { state: 'attached' })
      check('a remembered computer signs back in with the password alone, on the same page', new URL(page.url()).pathname === '/dash/bookings' && (await page.locator('[data-screen]').count()) === 0)

      // sign out
      await page.click('text=Sign out')
      await waitScreen(page, 'sign-in')
      const debug = await page.evaluate(() => window.__katieAuthDebug?.requests ?? [])
      check('sign-out: the session event was posted, and the app is gone', debug.some((r) => r.method === 'POST' && r.url.endsWith('/session')) && (await page.locator('[data-shell]').count()) === 0)

      // the remembered-computer date math in the live app: 31 days later the device is forgotten
      await signIn(page, 'owner@harborline.example', MOCK_PW)
      await page.waitForSelector('[data-shell]', { state: 'attached' })
      await page.evaluate(() => window.__katieAuth.setRememberedDaysAgo(31))
      await page.reload()
      await page.waitForSelector('[data-shell]', { state: 'attached' })
      const after = await page.evaluate(() => ({ at: localStorage.getItem('katie.auth.rememberedAt'), dev: window.__katieAuth.remembered() }))
      check('past 30 days: the date is cleared and the device forgotten at boot', after.at === null && !after.dev.includes('owner@harborline.example'), JSON.stringify(after))
      await page.click('text=Sign out')
      await waitScreen(page, 'sign-in')
      await signIn(page, 'owner@harborline.example', MOCK_PW)
      await waitScreen(page, 'code')
      check('past 30 days: the next sign-in asks for a code again', true)

      // no token, password or code in a URL, ever
      const all = await page.evaluate(() => window.__katieAuthDebug?.requests ?? [])
      const leaks = [...all.map((r) => r.url), ...urls].filter((u) => /token|password|passwd|code=|mock-access|bearer|otp/i.test(u))
      check('no request carried a token, password or code in its URL', leaks.length === 0 && all.length > 5, `${all.length} API requests built, ${urls.length} network requests, ${leaks.length} leaks`)
      check('every API request after sign-in carried a Bearer token in a header', all.length > 0 && all.every((r) => /^Bearer mock-access-\d+$/.test(r.authorization ?? '')), `${all.filter((r) => !r.authorization).length} without`)
      await ctx.close()
    }

    // ---------------- B: staff: the choice screen, the email switch, no People or Activity
    {
      const { ctx, page } = await open(w, h)
      await waitScreen(page, 'sign-in')
      await signIn(page, 'staff@harborline.example', MOCK_PW)
      await waitScreen(page, 'choose-code')
      const ch = await page.locator('[data-screen="choose-code"]').innerText()
      check('choose a code: authenticator app or email, both offered', /Authenticator app/.test(ch) && /Email me a code/.test(ch))
      await shotAuth(page, 'signin-3-choose')
      await page.click('text=Authenticator app')
      await waitScreen(page, 'code')
      check('both set up: the app code screen offers the email code instead', await page.getByText('Use my email code instead').isVisible())
      await page.click('text=Use my email code instead')
      await page.waitForFunction(() => /emailed/.test(document.querySelector('[data-screen="code"]')?.textContent ?? ''))
      check('"use my email code instead" switches to the email code screen', true)
      await typeCode(page, CODE)
      await page.click('button[type="submit"]')
      await appUp(page)
      await rail(page, '/settings')
      await page.waitForSelector('[data-card], section')
      await sleep(600)
      check('staff: Settings has neither the People nor the Activity card', (await page.locator('[data-card="people"], [data-card="activity"]').count()) === 0)
      const reqs = await page.evaluate(() => window.__katieAuthDebug?.requests ?? [])
      check('staff: the browser never asks for People or Activity', !reqs.some((r) => /\/(people|activity)/.test(r.url)), `${reqs.length} requests`)
      check('staff: the account line names them', /Marisol Vega/.test(await page.locator('[data-account]').innerText()))
      await ctx.close()
    }

    // ---------------- C: first sign-in with the temporary password
    {
      const { ctx, page } = await open(w, h)
      await waitScreen(page, 'sign-in')
      await signIn(page, 'newperson@harborline.example', 'temporary-1')
      await waitScreen(page, 'new-password')
      await shotAuth(page, 'signin-4-new-password')
      await page.fill('#auth-new', 'short')
      await page.fill('#auth-new2', 'short')
      await page.click('button[type="submit"]')
      check('new password: too short is said in plain words', /at least 12/.test(await alertText(page)))
      await page.fill('#auth-new', 'a-long-new-password')
      await page.fill('#auth-new2', 'a-different-one-here')
      await page.click('button[type="submit"]')
      check('new password: two different ones are refused', /not the same/.test(await alertText(page)))
      await page.fill('#auth-new2', 'a-long-new-password')
      await page.click('button[type="submit"]')
      await waitScreen(page, 'choose-code')
      check('new password: accepted, then the first-time code choice', /Set up your code/.test(await page.locator('[data-screen="choose-code"]').innerText()))
      await page.click('text=Authenticator app')
      await waitScreen(page, 'setup-app')
      await page.waitForSelector('[data-screen="setup-app"] img[src^="data:image/png"]')
      const secret = (await page.locator('[data-secret]').innerText()).trim()
      check('set up the app: a QR image and the secret as copyable text', /^[A-Z2-7]{16}$/.test(secret), `secret ${secret.length} chars`)
      await shotAuth(page, 'signin-5-setup-app')
      await typeCode(page, '123456')
      await page.click('button[type="submit"]')
      check('set up the app: a wrong first code is refused', /not right/.test(await alertText(page)))
      await typeCode(page, CODE)
      await page.click('button[type="submit"]')
      await appUp(page)
      check('set up the app: the first right code signs in', true)
      await ctx.close()
    }

    // ---------------- D: the idle lock (Playwright's clock)
    {
      const { ctx, page } = await open(w, h, { clock: true })
      await waitScreen(page, 'sign-in')
      await signIn(page, 'owner@harborline.example', MOCK_PW)
      await waitScreen(page, 'code')
      await typeCode(page, CODE)
      await page.check('text=Remember this computer')
      await page.click('button[type="submit"]')
      await appUp(page)
      await page.clock.fastForward(14 * 60_000)
      check('idle: 14 minutes of nothing does not lock', (await page.locator('[data-shell]').count()) === 1)
      await page.mouse.move(300, 300)
      await page.mouse.move(340, 320)
      await page.clock.fastForward(14 * 60_000)
      check('idle: a pointer move restarts the 15 minutes', (await page.locator('[data-shell]').count()) === 1)
      await page.clock.fastForward(2 * 60_000)
      await waitScreen(page, 'locked')
      check('idle: after 15 minutes the app is unmounted and the lock screen shows', (await page.locator('[data-shell], [data-line-tile], main section[aria-labelledby]:not([data-screen])').count()) === 0)
      const lockedText = await page.locator('[data-screen="locked"]').innerText()
      check('lock screen: password only, says who is signed in, no patient data', (await page.locator('[data-screen="locked"] input').count()) === 1 && /owner@harborline\.example/.test(lockedText) && !/\(\d{3}\)|CA\d{6}/.test(lockedText), lockedText.replace(/\s+/g, ' ').slice(0, 140))
      const qcEmpty = await page.evaluate(() => !document.body.innerText.match(/Harborline Orthodontics.*Calls answered/s))
      check('lock screen: the page text holds no calls', qcEmpty)
      await shotAuth(page, 'signin-7-locked')
      await page.fill('#auth-unlock', WRONG_PW)
      await page.click('button[type="submit"]')
      check('lock screen: a wrong password is said plainly and stays locked', /do not match/.test(await alertText(page)) && (await screen(page)) === 'locked')
      await page.fill('#auth-unlock', MOCK_PW)
      await page.click('button[type="submit"]')
      await page.waitForSelector('[data-shell]', { state: 'attached' })
      check('unlock: the password alone, a remembered computer is not asked for a code', (await page.locator('[data-screen]').count()) === 0)
      const evs = await page.evaluate(() => window.__katieAuthDebug.requests.filter((r) => r.method === 'POST').map((r) => r.url))
      check('idle lock and unlock were posted to /session', evs.filter((u) => u.endsWith('/session')).length >= 3, `${evs.length} POSTs`)
      await ctx.close()
    }

    // ---------------- E: a computer that is not remembered is asked for a code after unlock
    {
      const { ctx, page } = await open(w, h, { clock: true })
      await waitScreen(page, 'sign-in')
      await signIn(page, 'owner@harborline.example', MOCK_PW)
      await waitScreen(page, 'code')
      await typeCode(page, CODE)
      await page.click('button[type="submit"]')
      await appUp(page)
      await page.clock.fastForward(16 * 60_000)
      await waitScreen(page, 'locked')
      await page.fill('#auth-unlock', MOCK_PW)
      await page.click('button[type="submit"]')
      await waitScreen(page, 'code')
      check('unlock without "remember": the code is asked again', true)
      await ctx.close()
    }
  }

  // ---------------- basic mode is untouched: ?mock=1 with no ?auth shows no sign-in, no account line, no People
  {
    size = 'basic'
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    attachConsole(page, bad, 'auth basic')
    await page.goto(`${BASE}?mock=1`)
    await page.waitForSelector('[data-line-tile]')
    await rail(page, '/settings')
    check('basic mode (no ?auth): no sign-in screen, no account line, no People or Activity card', (await page.locator('[data-screen], [data-account], [data-card="people"], [data-card="activity"]').count()) === 0)
    await ctx.close()
  }

  size = 'all'
  const errs = bad.filter((m) => ['error', 'pageerror', 'requestfailed', 'http'].includes(m.type))
  check('console clean through every screen and flow', errs.length === 0, errs.length ? errs.slice(0, 4).map((m) => `${m.type}: ${m.text}`).join(' || ') : `${bad.length} messages, 0 errors`)
  results.auth = { at: new Date().toISOString(), checks, list }
}

// ------------------------------------------------------------------ step: occasional Katie

const timing = await import(new URL('../src/katie/motion/timing.ts', import.meta.url).href)
const BUBBLE = '[data-katie-stage] > div:first-child > div'
// Her wrapper: the last child of the stage's viewport-sized space (glass skin: the layer clips to the
// slab and holds one `space` div; the flat skin had the wrapper straight under the layer).
const WRAPPER = '[data-katie-stage] > div:last-child > div:last-child'
/** The floor she stands on (runs in the page): the slab's inner bottom edge ([data-katie-floor]), else the viewport bottom. */
const floorY = () => {
  const f = document.querySelector('[data-katie-floor]')
  return f ? Math.round(f.getBoundingClientRect().top + f.clientTop + f.clientHeight) : window.innerHeight
}

async function stepKatie(browser) {
  const checks = []
  const shots = []
  const sink = []
  const check = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail })
    log(pass ? 'ok  ' : 'FAIL', name, detail)
  }
  const snap = async (page, name) => {
    const file = path.join(OUT.occasional, `${name}.png`)
    await sleep(250) // CSS transitions (the rail's selected row) run in real time
    await page.screenshot({ path: file })
    shots.push(rel(file))
    log('shot', rel(file))
  }
  const contexts = []
  const open = async ({ query = '?mock=1', clock = true, ...opts } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts })
    contexts.push(ctx)
    const page = await ctx.newPage()
    attachConsole(page, sink, `katie ${query}`)
    if (clock) await page.clock.install()
    await page.goto(`${BASE}${query}`)
    await page.waitForSelector('main')
    await animsDone(page)
    return { ctx, page }
  }
  const lastLog = (page) => page.evaluate(() => window.__katieStage.state().log.at(-1) ?? null)
  const logLen = (page) => page.evaluate(() => window.__katieStage.state().log.length)
  const now = (page) => page.evaluate(() => Date.now())
  const bubbleAndTarget = (page, sel) =>
    page.evaluate(
      ([b, t]) => ({
        bubble: document.querySelector(b)?.textContent ?? '',
        target: document.querySelector(t)?.getAttribute('data-katie') ?? null,
      }),
      [BUBBLE, sel],
    )

  try {
    // (a) A fresh tab: the first open of the practice day.
    {
      const { ctx, page } = await open()
      await page.waitForSelector(SEL.line)
      await park(page)
      const t0 = await now(page)
      await runUntil(page, () => window.__katieStage?.state()?.moment === 'first-open', { max: 5000, label: 'first open' })
      const first = await lastLog(page)
      check('first-open fires within 3 s of a fresh tab', first.at - t0 <= 3000, `${first.at - t0} ms after the page loaded`)
      await runUntil(page, katieHolding, { arg: true, max: 6000, label: 'first open presenting' })
      const shownAt = await now(page)
      const s1 = await st(page)
      const bt = await bubbleAndTarget(page, '[data-katie-moment~="urgent"]')
      check('first-open: she walks in to Callbacks waiting', s1.dest === 'Callbacks waiting' && s1.mode === 'walk', `dest ${s1.dest}, mode ${s1.mode}, on card ${s1.onCard}`)
      check("first-open: the bubble is that card's data-katie", bt.bubble.length > 0 && bt.bubble === bt.target, `${bt.bubble.length} characters, identical`)
      await page.clock.runFor(300)
      await snap(page, 'first-open-presenting')
      await runUntil(page, () => window.__katieStage.state().phase === 'exit', { max: 12000, label: 'her exit' })
      const held = (await now(page)) - shownAt
      const want = timing.holdSeconds(bt.bubble.length) * 1000
      check('first-open: she leaves by herself after the hold', Math.abs(held - want) <= 500, `held ${held} ms; clamp(3 + ${bt.bubble.length} / 25, 4, 9) s = ${Math.round(want)} ms`)
      const exitRan = await runUntil(page, katieOff, { step: 50, max: 3000, label: 'gone' })
      await page.clock.runFor(600)
      const s2 = await st(page)
      const wrapTop = await page.evaluate((w) => document.querySelector(w).getBoundingClientRect().top, WRAPPER)
      const fy = await page.evaluate(floorY)
      check(
        'first-open: then nothing is on screen',
        s2.offscreen && !s2.bubbleShown && !s2.onScreenListeners && !s2.idle && s2.activeTweens === 0 && wrapTop >= fy,
        `exit took ${exitRan} ms; her top at y ${Math.round(wrapTop)} (floor, the slab's inner bottom, ${fy}; the layer clips there); idle ${s2.idle}; active tweens ${s2.activeTweens}; on-screen listeners ${s2.onScreenListeners}`,
      )
      await snap(page, 'empty-after-exit')

      // (b) Hover and tab through every widget (and hover the Katie button) for 30 s: nothing.
      // The replay's urgent note lands at about 14 s and waits for the 60 s gap meanwhile.
      const before = await logLen(page)
      const targets = await page.locator('[data-katie]').all()
      let ranB = 0
      let seen = []
      const sample = async () => {
        const s = await st(page)
        if (s.moment) seen.push(s.moment)
      }
      while (ranB < 30000) {
        for (const t of [...targets, page.locator(SEL.summon)]) {
          const box = await t.boundingBox()
          if (!box) continue
          await page.mouse.move(box.x + box.width / 2, box.y + Math.min(30, box.height / 2), { steps: 4 })
          await page.clock.runFor(600)
          ranB += 600
          await sample()
        }
        for (let i = 0; i < 12; i++) {
          await page.keyboard.press('Tab')
          await page.clock.runFor(300)
          ranB += 300
          await sample()
        }
      }
      const waiting = (await st(page)).waiting.map((x) => x.kind)
      check(
        'hovering and tabbing through every widget for 30 s summons nothing',
        seen.length === 0 && (await logLen(page)) === before,
        `${(ranB / 1000).toFixed(1)} s; ${targets.length} widgets and the Katie button hovered, Tab pressed ${Math.round(ranB / 7200) * 12} times; waiting meanwhile: ${waiting.join(', ') || 'none'}`,
      )

      // (c) The replay's urgent note (about 14 s) is already in the sentence she showed at the
      // first open: that first open went to Callbacks waiting and started the 10-minute urgent
      // spacing, so the note does not bring her back to say the same thing (3.3).
      await park(page)
      await page.evaluate(() => {
        document.activeElement?.blur?.();
        (document.getElementById('content') ?? window).scrollTo(0, 0)
      })
      const nC = await logLen(page)
      let ranC = 0
      while (ranC < 70000) {
        await page.clock.runFor(1000)
        ranC += 1000
      }
      const sc = await st(page)
      // The spacing runs from the first open's own instant: the director stamps the caps and the log
      // entry with one read of the clock (time flows under page.clock.install(), so two reads could
      // differ by a ms). The detail names every part so a failure says which one broke.
      check(
        'the urgent note already in the first-open sentence does not bring her back',
        sc.log.length === nC && sc.moment === null && sc.caps.lastUrgent === first.at && !sc.waiting.some((x) => x.kind === 'urgent'),
        `${sc.log.length - nC} appearances in the next ${ranC / 1000} s; moment ${sc.moment ?? 'none'}; urgent spacing from ${sc.caps.lastUrgent} (the first open at ${first.at}); waiting ${sc.waiting.map((x) => x.kind).join(', ') || 'none'}`,
      )
      // A new urgent note once the 10 minutes have passed: straight face, Callbacks waiting.
      await page.clock.runFor(Math.max(0, first.at + 10 * 60_000 - (await now(page))) + 5000)
      const uf = await force(page, 'urgent', { reset: false })
      const u = await lastLog(page)
      let celebrated = false
      for (let i = 0; i < 80; i++) {
        const s = await st(page)
        if (s.celebrating) celebrated = true
        if (s.phase === 'hold' && s.bubbleShown) break
        await page.clock.runFor(50)
      }
      await page.clock.runFor(300)
      const su = await st(page)
      const bu = await bubbleAndTarget(page, '[data-katie-moment~="urgent"]')
      check('a new urgent note after the 10-minute spacing: she walks in to Callbacks waiting', uf.verdict === 'fire' && u.kind === 'urgent' && su.dest === 'Callbacks waiting', `${uf.verdict} (${uf.reason}), to ${su.dest}`)
      check('urgent note: presents with a straight face (no celebrate), bubble = the card sentence', !celebrated && su.presenting && bu.bubble === bu.target)
      await snap(page, 'urgent-presenting')
      await runUntil(page, katieOff, { max: 15000, label: 'urgent over' })

      // (g) Reload in the same tab: the first open does not repeat (sessionStorage in mock mode).
      await page.reload()
      await page.waitForSelector(SEL.line)
      await page.clock.runFor(6000)
      const g = await st(page)
      const store = await page.evaluate(() => ({
        session: sessionStorage.getItem('katie.firstOpenDay'),
        local: localStorage.getItem('katie.firstOpenDay'),
        keys: Object.keys(sessionStorage).filter((k) => k.startsWith('katie.')),
        values: Object.keys(sessionStorage)
          .filter((k) => k.startsWith('katie.') && k !== 'katie.mock')
          .map((k) => sessionStorage.getItem(k)),
      }))
      check('reload in the same tab: first-open does not repeat', !g.log.some((l) => l.kind === 'first-open') && store.session === g.day, `first-open day ${store.session} kept in sessionStorage`)
      check(
        'mock mode keeps the caps in sessionStorage, timestamps / counts / days only',
        store.local === null && store.values.every((v) => /^(\d+|\d{4}-\d{2}-\d{2}(:\d+)?)$/.test(v)),
        `keys ${store.keys.join(', ')}; localStorage untouched`,
      )
      await ctx.close()
    }
    {
      const { ctx, page } = await open()
      await page.waitForSelector(SEL.line)
      await runUntil(page, () => window.__katieStage?.state()?.moment === 'first-open', { max: 5000, label: 'first open (new tab)' })
      check('a new tab (new context) shows the first open again', true)
      await ctx.close()
    }

    // (d0) A moment that lands while she is on her way out counts her as gone already: an ordinary
    // one meets the cooldown, an urgent one waits 60 s after her exit (she never turns straight back).
    {
      const { ctx, page } = await open()
      await page.waitForSelector(SEL.line)
      await park(page)
      await runUntil(page, () => window.__katieStage?.state()?.moment === 'first-open', { max: 5000, label: 'first open' })
      await runUntil(page, () => window.__katieStage.state().phase === 'exit', { max: 20000, label: 'her exit (hold over)' })
      await page.clock.runFor(100)
      const mid = await st(page)
      const bk = await force(page, 'booking', { reset: false })
      await page.clock.runFor(200)
      const afterBk = await st(page)
      check(
        'a booking that lands during her exit is skipped (cooldown), she keeps leaving',
        mid.phase === 'exit' && mid.caps.lastExit === null && bk.verdict === 'skip' && bk.reason === 'cooldown' && afterBk.moment === 'first-open' && afterBk.phase === 'exit',
        `100 ms into the exit (lastExit ${mid.caps.lastExit}): ${bk.verdict} (${bk.reason}); 200 ms later ${afterBk.moment}/${afterBk.phase}`,
      )
      // urgent during the exit: caps cleared first so the urgent spacing from the first open is out of the way
      const ug = await force(page, 'urgent')
      await runUntil(page, katieOff, { max: 3000, label: 'first open gone' })
      const off = await st(page)
      await runUntil(page, () => window.__katieStage.state().moment === 'urgent', { max: 125000, step: 500, label: 'the waiting urgent' })
      const ua = await lastLog(page)
      const gap = ua.at - off.caps.lastExit
      check(
        'an urgent note that lands during her exit waits 60 s after it, then shows',
        ug.verdict === 'wait' && ug.reason === '60 s after her exit' && gap >= 60000 && gap <= 61500,
        `${ug.verdict} (${ug.reason}); shown ${gap} ms after her exit; log ${(await st(page)).log.map((l) => l.kind).join(', ')}`,
      )
      await ctx.close()
    }

    // (d) Dismissals mid-hold: a click, a wheel, a page scroll, Escape, a route change, the drawer.
    {
      const { ctx, page } = await open()
      await page.waitForSelector(SEL.line)
      await park(page)
      const dismissals = [
        ['a click', null, () => page.mouse.click(760, 28)],
        ['a wheel scroll', 'urgent', () => page.mouse.wheel(0, 120)],
        ['a page scroll', 'urgent', () => page.evaluate(() => (document.getElementById('content') ?? window).scrollBy(0, 160))],
        ['Escape', 'urgent', () => page.keyboard.press('Escape')],
      ]
      for (const [how, kind, act] of dismissals) {
        await page.evaluate(() => (document.getElementById('content') ?? window).scrollTo(0, 0))
        if (kind) await force(page, kind)
        await runUntil(page, katieHolding, { arg: true, max: 10000, label: `holding before ${how}` })
        await page.clock.runFor(800)
        const t1 = Date.now()
        await act()
        // Chromium hands wheel and scroll events to the page with its next rendered frame (real
        // time, not the fake clock): wait for the handler without running fake time
        let s = await st(page)
        while (s.phase !== 'exit' && Date.now() - t1 < 500) {
          await sleep(10)
          s = await st(page)
        }
        const real = Date.now() - t1
        // 3.9: transforms only with full motion; the wrapper never fades on the way out
        let gone = 0
        let minOpacity = 1
        while (!(await page.evaluate(katieOff))) {
          if (gone >= 2500) throw new Error(`timed out (2500 ms of fake time) waiting for gone after ${how}`)
          minOpacity = Math.min(minOpacity, await page.evaluate((w) => Number(getComputedStyle(document.querySelector(w)).opacity), WRAPPER))
          await page.clock.runFor(20)
          gone += 20
        }
        check(`${how} mid-hold dismisses her at once`, s.phase === 'exit' && !s.bubbleShown && gone <= 400, `phase "${s.phase}" ${real} ms (real) after the event was sent, no fake time run; off screen ${gone} ms (fake) later, no hop down; ended by ${(await lastLog(page)).end}`)
        check(`${how}: she drops out of view without fading (wrapper opacity stays 1)`, minOpacity === 1, `lowest wrapper opacity during the exit ${minOpacity}`)
      }
      // route change (keyboard, so no pointerdown is involved)
      await page.evaluate(() => (document.getElementById('content') ?? window).scrollTo(0, 0))
      await force(page, 'urgent')
      await runUntil(page, katieHolding, { arg: true, max: 10000, label: 'holding before the route change' })
      await page.focus('nav[aria-label="Main"] a[href="/dash/calls"]')
      await page.keyboard.press('Enter')
      await page.waitForURL('**/dash/calls')
      const rRan = await runUntil(page, () => !!window.__katieStage.state().log.at(-1)?.end, { step: 16, max: 2000, label: 'the route change exit' })
      const r = await lastLog(page)
      await runUntil(page, katieOff, { step: 50, max: 2500, label: 'gone after the route change' })
      check('a route change dismisses her', r.end === 'route', `ended by ${r.end}, ${rRan} ms after the URL changed (the lazy page renders first)`)

      // the urgent fallback on a page without a callbacks widget: a silent peek toward the rail
      await page.clock.runFor(1600)
      await force(page, 'urgent')
      await runUntil(page, () => window.__katieStage.state().phase === 'hold', { max: 5000, label: 'urgent peek' })
      const pk = await st(page)
      const pkStart = await now(page)
      let pkBubble = false
      while ((await st(page)).phase === 'hold') {
        if ((await st(page)).bubbleShown) pkBubble = true
        await page.clock.runFor(100)
      }
      const pkHeld = (await now(page)) - pkStart
      check('urgent on Calls (no callbacks widget): silent corner peek toward the rail', pk.mode === 'peek-face' && pk.facing === 'left' && !pkBubble && Math.abs(pkHeld - 3000) <= 300, `mode ${pk.mode}, facing ${pk.facing}, held ${pkHeld} ms, bubble ${pkBubble}`)
      await runUntil(page, katieOff, { max: 3000, label: 'peek over' })

      // the drawer opening (keyboard)
      await page.clock.runFor(1600)
      await force(page, 'summon')
      await runUntil(page, katieHolding, { arg: true, max: 10000, label: 'holding before the drawer' })
      await page.focus(`[data-call-row="${CALL_ID}"]`)
      await page.keyboard.press('Enter')
      await page.waitForURL(`**/dash/calls/${CALL_ID}`)
      await page.clock.runFor(50)
      const d = await lastLog(page)
      await runUntil(page, katieOff, { step: 50, max: 2500, label: 'gone after the drawer' })
      check('opening the call drawer dismisses her', d.end === 'drawer' || d.end === 'route', `ended by ${d.end} (the drawer opens with a route change; either input ends the hold)`)
      await page.clock.runFor(1600)
      const dr = await force(page, 'booking', { reset: false })
      check('no ordinary moment while the drawer is open', dr.verdict === 'skip' && dr.reason === 'drawer open', `${dr.verdict}: ${dr.reason}`)
      await page.keyboard.press('Escape')
      await page.waitForURL((x) => x.pathname.replace(/\/$/, '') === '/dash/calls')

      // (e) The Katie button: top-priority widget, scrolled into view and focused, on each page.
      // List cards are titled by their count sentence since P5 ("4 waiting", "8 calls today · 6
      // booked"), so on a list page her destination is that card, whatever the count says.
      const pages = [
        ['', 'Callbacks waiting'],
        ['/callbacks', /^\d+ waiting/],
        ['/bookings', /^\d+ bookings? today/],
        ['/texts', /^\d+ texts? sent today/],
        ['/calls', /^\d+ calls? today/],
      ]
      for (const [to, want] of pages) {
        await page.click(`nav[aria-label="Main"] a[href="/dash${to}"]`)
        await page.waitForURL((x) => x.pathname.replace(/\/$/, '') === `/dash${to}`.replace(/\/$/, ''))
        await page.clock.runFor(1200)
        await runUntil(page, katieOff, { max: 3000, label: 'off before the button' })
        await page.evaluate(() => (document.getElementById('content') ?? window).scrollTo(0, (document.getElementById('content') ?? document.documentElement).scrollHeight))
        await page.clock.runFor(100)
        await page.click(SEL.summon)
        await runUntil(page, katieHolding, { arg: false, max: 6000, label: `summon on /dash${to}` })
        await page.clock.runFor(300)
        const s = await st(page)
        const f = await page.evaluate(() => {
          const a = document.activeElement
          const t = a?.closest('[data-katie]')
          const r = t?.getBoundingClientRect()
          return {
            focused: !!t && t === a,
            title: t?.querySelector('h2')?.textContent ?? null,
            top: r ? Math.round(r.top) : null,
          }
        })
        const isWant = (x) => (typeof want === 'string' ? x === want : want.test(x ?? ''))
        check(
          `Katie button on /dash${to || '/'}: ${typeof want === 'string' ? want : 'the list card'}, scrolled into view and focused`,
          s.moment === 'summon' && isWant(f.title) && !!s.dest && (f.title ?? '').startsWith(s.dest) && f.focused && f.top >= 56 && f.top <= 900 - 96,
          `${s.moment} to ${s.dest}; focus on "${f.title}"; its top at y ${f.top}; log ${s.log.slice(-3).map((l) => l.kind + '/' + (l.end ?? '')).join(' ')}`,
        )
        if (to === '/callbacks') await snap(page, 'summon-callbacks')
        await page.keyboard.press('Escape')
        await runUntil(page, katieOff, { max: 3000, label: 'summon over' })
      }

      // (f) A booking milestone: rises, celebrates, presents Booked; a second within 15 min is skipped.
      await page.click('nav[aria-label="Main"] a[href="/dash"]')
      await page.waitForURL((x) => x.pathname.replace(/\/$/, '') === '/dash')
      await page.evaluate(() => (document.getElementById('content') ?? window).scrollTo(0, 0))
      await page.clock.runFor(2000)
      await runUntil(page, katieOff, { max: 3000, label: 'off before the booking' })
      await force(page, 'booking')
      const ys = []
      let cel = false
      for (let i = 0; i < 200; i++) {
        const s = await st(page)
        ys.push(Math.round(s.y))
        if (s.celebrating) cel = true
        if (s.phase === 'hold' && s.bubbleShown) break
        await page.clock.runFor(30)
      }
      await page.clock.runFor(300)
      const sb = await st(page)
      const bb = await bubbleAndTarget(page, '[data-katie-moment~="booking"]')
      const fyB = await page.evaluate(floorY)
      const rose = ys.some((y) => y > fyB) && ys.some((y) => Math.abs(y - fyB) <= 1)
      check(
        'booking milestone: rises from below, hops up, celebrates, presents Booked',
        sb.moment === 'booking' && sb.mode === 'rise' && rose && cel && sb.dest === 'kpi:booked' && sb.onCard && bb.bubble === bb.target,
        `${sb.moment} (${sb.mode}): feet y ${Math.max(...ys)} -> ${fyB} (floor) -> ${Math.round(sb.y)} (card top ${sb.onCard}); celebrated ${cel}; dest ${sb.dest}; bubble = sentence ${bb.bubble === bb.target}`,
      )
      await snap(page, 'booking-presenting')
      await runUntil(page, katieOff, { max: 15000, label: 'booking over' })
      await page.clock.runFor(5 * 60_000)
      const n0 = await logLen(page)
      const second = await force(page, 'booking', { reset: false })
      await page.clock.runFor(3000)
      check('a second booking milestone inside 15 min does not fire', second.verdict === 'skip' && second.reason === 'cooldown' && (await logLen(page)) === n0, `${second.verdict}: ${second.reason} (5 min after her exit)`)

      // a line wake-up: a 3 s peek with the hand to the ear, no bubble
      await force(page, 'line-wake')
      await runUntil(page, () => window.__katieStage.state().phase === 'hold', { max: 3000, label: 'line wake peek' })
      const lw = await st(page)
      const lwStart = await now(page)
      let lwBubble = false
      let lwListen = true
      let shotTaken = false
      while ((await st(page)).phase === 'hold') {
        const s = await st(page)
        if (s.bubbleShown) lwBubble = true
        if (!s.listening) lwListen = false
        if (!shotTaken && (await now(page)) - lwStart > 600) {
          await snap(page, 'line-wake-peek')
          shotTaken = true
        }
        await page.clock.runFor(100)
      }
      const lwHeld = (await now(page)) - lwStart
      check('line wakes up: peek at her corner, listen 3 s, no bubble', lw.mode === 'peek-listen' && lwListen && !lwBubble && Math.abs(lwHeld - 3000) <= 300, `held ${lwHeld} ms, listening throughout ${lwListen}, bubble ${lwBubble}`)
      await runUntil(page, katieOff, { max: 3000, label: 'peek over' })

      // (j) Off screen she costs nothing: no active tweens (the rAF check is below, in real time).
      await page.clock.runFor(3000)
      const sj = await st(page)
      check('off screen: no GSAP tween active, idle timelines stopped, no on-screen listeners', sj.activeTweens === 0 && !sj.idle && !sj.onScreenListeners, `active tweens ${sj.activeTweens}, idle ${sj.idle}`)

      // Settings: Katie: Occasional / Off, Katie's corner; Off hides the button and the stage.
      await page.click('nav[aria-label="Main"] a[href="/dash/settings"]')
      await page.waitForURL('**/dash/settings')
      await runUntil(page, () => !!document.querySelector('[role="group"][aria-label="Katie"]'), { max: 5000, label: 'Settings' })
      await page.clock.runFor(300)
      await snap(page, 'settings')
      const occ = await page.evaluate(() => ({
        rows: [...document.querySelectorAll('main label, main span')].map((e) => e.textContent).filter((t) => /^Katie/.test(t ?? '')),
        pressed: [...document.querySelectorAll('[role="group"][aria-label="Katie"] button')].map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}`),
      }))
      await page.locator('[role="group"][aria-label="Katie"] button', { hasText: 'Off' }).click()
      await page.clock.runFor(300)
      const off = await page.evaluate(() => ({
        stored: localStorage.getItem('katie.enabled'),
        stage: !!document.querySelector('[data-katie-stage]'),
      }))
      await rail(page, '/callbacks')
      const btnOff = await page.locator(SEL.summon).count()
      await rail(page, '/settings')
      await page.locator('[role="group"][aria-label="Katie"] button', { hasText: 'Occasional' }).click()
      check(
        "Settings: Katie Occasional / Off (katie.enabled '0' = Off) and Katie's corner",
        occ.rows.includes("Katie's corner") && occ.pressed.join() === 'Occasional:true,Off:false' && off.stored === '0' && !off.stage && btnOff === 0,
        `${occ.pressed.join(', ')}; Off stores "${off.stored}", no stage, Katie button count ${btnOff}`,
      )
      await ctx.close()
    }

    // (h) Reduced motion: only ranks 1, 2 and 5, appearing and leaving as 120 ms fades.
    {
      const { ctx, page } = await open({ reducedMotion: 'reduce' })
      await page.waitForSelector(SEL.line)
      await park(page)
      await runUntil(page, () => window.__katieStage?.state()?.moment === 'first-open', { step: 20, max: 5000, label: 'first open (reduced)' })
      const frames = []
      for (let i = 0; i < 20; i++) {
        const s = await st(page)
        const o = await page.evaluate((w) => Number(getComputedStyle(document.querySelector(w)).opacity), WRAPPER)
        frames.push({ x: Math.round(s.x), y: Math.round(s.y), o, cel: s.celebrating })
        await page.clock.runFor(20)
      }
      const visible = frames.filter((f) => f.o > 0)
      const still = visible.every((f) => f.x === visible[0].x && f.y === visible[0].y)
      const fadeIn = frames.some((f) => f.o > 0 && f.o < 1) && frames.at(-1).o === 1
      await runUntil(page, katieHolding, { arg: true, max: 3000, label: 'reduced presenting' })
      await page.keyboard.press('Escape')
      const out = []
      for (let i = 0; i < 12; i++) {
        const s = await st(page)
        const o = await page.evaluate((w) => Number(getComputedStyle(document.querySelector(w)).opacity), WRAPPER)
        out.push({ y: Math.round(s.y), o, off: s.offscreen })
        await page.clock.runFor(20)
      }
      // until she is off screen (then parked below the viewport at full opacity, unseen)
      const leaving = out.filter((f) => !f.off)
      const fadeOut = leaving.some((f) => f.o > 0 && f.o < 1) && leaving.every((f) => f.y === out[0].y) && out.some((f) => f.off)
      await runUntil(page, katieOff, { max: 2000, label: 'reduced gone' })
      check(
        'reduced motion: first-open fades in at the spot and fades out, no walk, hop or celebrate',
        still && fadeIn && fadeOut && !frames.some((f) => f.cel),
        `in: ${frames.slice(0, 8).map((f) => f.o.toFixed(2)).join(' ')} at a fixed (${visible[0]?.x}, ${visible[0]?.y}); out: ${leaving.map((f) => f.o.toFixed(2)).join(' ')} at y ${out[0].y}, then off screen`,
      )
      const verdicts = {}
      for (const k of ['booking', 'line-wake', 'urgent']) {
        await page.clock.runFor(1600)
        verdicts[k] = (await force(page, k)).verdict
        if (verdicts[k] !== 'skip') {
          await runUntil(page, katieHolding, { arg: true, max: 3000, label: `reduced ${k}` })
          await page.keyboard.press('Escape')
          await runUntil(page, katieOff, { max: 2000, label: `reduced ${k} gone` })
        }
      }
      await page.clock.runFor(500)
      await page.click(SEL.summon)
      await page.clock.runFor(200)
      verdicts.summon = (await st(page)).moment === 'summon' ? 'fire' : 'skip'
      check('reduced motion: only urgent, first-open and the Katie button fire', verdicts.booking === 'skip' && verdicts['line-wake'] === 'skip' && verdicts.urgent !== 'skip' && verdicts.summon === 'fire', JSON.stringify(verdicts))
      await ctx.close()
    }

    // (i) Below 1024 px: no Katie, no button.
    {
      const { ctx, page } = await open({ viewport: { width: 1000, height: 800 } })
      await page.clock.runFor(4000)
      const i = await page.evaluate(() => ({
        stage: !!document.querySelector('[data-katie-stage]'),
        hook: typeof window.__katieStage,
        button: (() => {
          const b = document.querySelector('header button[aria-label="Point out what needs attention"]')
          return b ? getComputedStyle(b).display : 'none'
        })(),
      }))
      check('1000 px wide: no Katie, no Katie button', !i.stage && i.hook === 'undefined' && i.button === 'none', JSON.stringify(i))
      await ctx.close()
    }

    // (j) Off screen, in real time: no requestAnimationFrame from Katie's chunks.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      contexts.push(ctx)
      await ctx.addInitScript(() => {
        const raf = window.requestAnimationFrame.bind(window)
        window.__rafFrom = []
        window.requestAnimationFrame = (cb) => {
          const stack = new Error().stack ?? ''
          const m = stack.split('\n').slice(2).find((l) => /\/assets\//.test(l))
          window.__rafFrom.push(m ? (m.match(/assets\/([A-Za-z]+)-/)?.[1] ?? '?') : 'other')
          return raf(cb)
        }
      })
      const page = await ctx.newPage()
      attachConsole(page, sink, 'katie rAF count')
      await page.goto(`${BASE}?mock=1`)
      await page.waitForSelector(SEL.line)
      await animsDone(page)
      await park(page)
      await until(page, katieHolding, { arg: true, timeout: 8000, label: 'first open (real time)' })
      await page.evaluate(() => (window.__rafFrom.length = 0))
      await sleep(1000)
      const onScreen = await page.evaluate(() => window.__rafFrom.slice())
      await until(page, katieOff, { timeout: 15000 })
      await sleep(3500) // GSAP's ticker sleeps after 120 idle frames
      await page.evaluate(() => (window.__rafFrom.length = 0))
      await sleep(3000)
      const offScreen = await page.evaluate(() => window.__rafFrom.slice())
      const s = await st(page)
      const katieChunks = (arr) => arr.filter((n) => n === 'KatieStage' || n === 'fitBubble').length
      check(
        'off screen (real time, 3 s): no rAF from Katie, no active tween',
        katieChunks(offScreen) === 0 && s.activeTweens === 0 && katieChunks(onScreen) > 0,
        `rAF calls from Katie's chunks: ${katieChunks(onScreen)} in 1 s on screen, ${katieChunks(offScreen)} in 3 s off screen (${offScreen.length} rAF calls in all off screen)`,
      )
      await ctx.close()
    }
  } finally {
    for (const c of contexts) await c.close().catch(() => undefined)
  }
  // (k) No console errors, page errors or failed requests in any of the above.
  const bad = sink.filter((m) => m.type === 'error' || m.type === 'pageerror' || m.type === 'requestfailed' || m.type === 'http')
  check('zero console errors, page errors and failed requests', bad.length === 0, bad.slice(0, 3).map((m) => `${m.type} ${m.text}`).join('; '))
  results.katie = { at: new Date().toISOString(), viewport: '1440x900', checks, shots, console: sink }
}

// ------------------------------------------------------------------ step: performance trace

const TRACE_CATS = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing',
  'toplevel',
  'v8.execute',
]

async function stepPerf(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}?mock=1`)
  await page.waitForSelector(SEL.line)
  await animsDone(page)
  await park(page)
  log('perf: waiting for the mock replay to finish in real time (about 140 s)')
  await until(page, (n) => (window.__katieMock?.debug.events ?? 0) >= n, {
    arg: REPLAY_EVENTS,
    timeout: 200000,
    every: 1000,
    label: 'replay end',
  })
  await until(page, settledDom)
  await sleep(6000)
  await waitOff(page)

  // In-page sampler: one rAF timestamp per frame plus Katie's travelling flag; a user-timing mark
  // at each tween start and end, so the trace can be cut to the tween windows.
  await page.evaluate(() => {
    const frames = []
    let was = false
    let n = 0
    const tick = (t) => {
      const s = window.__katieStage.state()
      const tr = !!s.travelling
      if (tr !== was) {
        performance.mark(tr ? `katie-tween-start-${n}` : `katie-tween-end-${n++}`)
        was = tr
      }
      frames.push([t, tr ? 1 : 0])
      if (window.__sampling) requestAnimationFrame(tick)
    }
    window.__frames = frames
    window.__sampling = true
    requestAnimationFrame(tick)
  })

  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    traceConfig: { includedCategories: TRACE_CATS, recordMode: 'recordContinuously' },
  })
  // Every way she moves, in turn: walk in from the right edge (the Katie button, to Callbacks
  // waiting), rise and hop onto a card and celebrate (a booking milestone, to Booked), walk in
  // again (first open), and the corner peek (line wake-up). Each is waved off with Escape: one
  // hop down and the sink.
  const moves = [
    () => page.click(SEL.summon),
    () => force(page, 'booking'),
    () => force(page, 'first-open'),
    () => force(page, 'line-wake'),
  ]
  for (const move of moves) {
    await move()
    await waitHolding(page, { bubble: false })
    await sleep(600)
    await page.keyboard.press('Escape')
    await waitOff(page)
    await sleep(300)
  }
  await sleep(500)

  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r))
  await cdp.send('Tracing.end')
  const { stream } = await done
  const chunks = []
  for (;;) {
    const { data, eof, base64Encoded } = await cdp.send('IO.read', { handle: stream, size: 1 << 20 })
    chunks.push(base64Encoded ? Buffer.from(data, 'base64') : Buffer.from(data))
    if (eof) break
  }
  await cdp.send('IO.close', { handle: stream })
  const raw = Buffer.concat(chunks)
  const tracePath = path.join(OUT.perf, 'katie-walk-trace.json.gz')
  fs.writeFileSync(tracePath, zlib.gzipSync(raw))

  const frames = await page.evaluate(() => {
    window.__sampling = false
    return window.__frames
  })
  await ctx.close()

  // --- in-page frames during the tweens
  const deltas = []
  let tweenMs = 0
  let tweenFrames = 0
  for (let i = 1; i < frames.length; i++) {
    if (frames[i][1] && frames[i - 1][1]) {
      const d = frames[i][0] - frames[i - 1][0]
      deltas.push(d)
      tweenMs += d
      tweenFrames++
    }
  }
  deltas.sort((a, b) => a - b)
  const pct = (p) => (deltas.length ? deltas[Math.min(deltas.length - 1, Math.floor(p * deltas.length))] : null)

  // --- the trace: long tasks on the renderer main thread, inside the tween windows
  const parsed = JSON.parse(raw.toString('utf8'))
  const events = Array.isArray(parsed) ? parsed : parsed.traceEvents
  const marks = events.filter((e) => /^katie-tween-(start|end)-\d+$/.test(e.name) && e.cat?.includes('blink.user_timing'))
  const pid = marks[0]?.pid
  const mainTid = events.find((e) => e.ph === 'M' && e.name === 'thread_name' && e.pid === pid && e.args?.name === 'CrRendererMain')?.tid
  const windows = []
  const starts = new Map()
  for (const m of marks.sort((a, b) => a.ts - b.ts)) {
    const [, kind, n] = m.name.match(/^katie-tween-(start|end)-(\d+)$/)
    if (kind === 'start') starts.set(n, m.ts)
    else if (starts.has(n)) windows.push([starts.get(n), m.ts])
  }
  const inWin = (e) => windows.some(([a, b]) => e.ts < b && e.ts + (e.dur || 0) > a)
  const mainTasks = events.filter((e) => e.pid === pid && e.tid === mainTid && e.ph === 'X' && e.name === 'RunTask')
  const tweenTasks = mainTasks.filter(inWin)
  const longest = (arr) => arr.reduce((m, e) => Math.max(m, e.dur || 0), 0) / 1000
  const draws = events.filter((e) => e.name === 'DrawFrame' && windows.some(([a, b]) => e.ts >= a && e.ts <= b))
  const winMs = windows.reduce((s, [a, b]) => s + (b - a) / 1000, 0)

  results.perf = {
    at: new Date().toISOString(),
    viewport: '1440x900',
    url: '/dash/?mock=1 after the replay',
    sequence: ['Katie button: walk in to Callbacks waiting', 'booking: rise, hop onto Booked, celebrate', 'first open: walk in to Callbacks waiting', 'line wake-up: corner peek', 'each waved off with Escape: hop down, sink'],
    tweens: windows.length,
    tweenMs: Math.round(winMs),
    rafFps: tweenMs ? +((tweenFrames / tweenMs) * 1000).toFixed(1) : null,
    frameP50: pct(0.5) && +pct(0.5).toFixed(1),
    frameP95: pct(0.95) && +pct(0.95).toFixed(1),
    frameMax: deltas.length ? +deltas[deltas.length - 1].toFixed(1) : null,
    framesOver20ms: deltas.filter((d) => d > 20).length,
    framesTotal: deltas.length,
    traceDrawFps: winMs ? +((draws.length / winMs) * 1000).toFixed(1) : null,
    longTasksInTween: tweenTasks.filter((e) => e.dur > 50000).length,
    longestTaskInTweenMs: +longest(tweenTasks).toFixed(1),
    longTasksWholeTrace: mainTasks.filter((e) => e.dur > 50000).length,
    longestTaskWholeTraceMs: +longest(mainTasks).toFixed(1),
    trace: rel(tracePath),
  }
  log('perf', JSON.stringify(results.perf))
}

// ------------------------------------------------------------------ step: bundle budget

function stepBudget() {
  const dir = path.join(DIST, 'assets')
  const files = fs.readdirSync(dir)
  const stage = files.find((f) => /^KatieStage-.*\.js$/.test(f))
  const entry = files.find((f) => /^index-.*\.js$/.test(f))
  const imports = (f) => [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/from"\.\/([^"]+\.js)"/g)].map((m) => m[1])
  const entryImports = new Set([entry, ...imports(entry)])
  // Katie's code = the lazy KatieStage chunk + the chunks only it (and the playground) import.
  const katieJs = [stage, ...imports(stage).filter((f) => !entryImports.has(f))]
  const katieCss = files.filter((f) => /^KatieStage-.*\.css$/.test(f))
  const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(dir, f)), { level: 9 }).length
  const assets = files.filter((f) => /^katie-.*\.(webp|png|svg)$/.test(f))
  const size = (f) => fs.statSync(path.join(dir, f)).size
  results.budget = {
    katieChunks: [...katieJs, ...katieCss].map((f) => ({ file: f, bytes: size(f), gzip: gz(f) })),
    katieGzip: [...katieJs, ...katieCss].reduce((s, f) => s + gz(f), 0),
    katieAssets: assets.map((f) => ({ file: f, bytes: size(f) })),
    katieAssetBytes: assets.reduce((s, f) => s + size(f), 0),
  }
  log('budget', results.budget.katieGzip, results.budget.katieAssetBytes)
}

// ------------------------------------------------------------------ step: console

const ROUTES = ['', 'calls', `calls/${CALL_ID}`, 'bookings', 'leads', `leads/${LEAD.noah}`, 'callbacks', 'texts', 'settings', '_katie']
// The demo day's own ids (the fixtures' CA860072416005 does not exist there).
const DEMO_ROUTES = ROUTES.map((r) => (r === `calls/${CALL_ID}` ? 'calls/CA216253965107' : r))

async function consolePass(browser, base, query, mode, ctxOpts = {}, routes = ROUTES) {
  const sink = []
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...ctxOpts })
  for (const r of routes) {
    const page = await ctx.newPage()
    const where = `${mode} /dash/${r}${query}`
    attachConsole(page, sink, where)
    await page.goto(`${base}${r}${query}`)
    await page.waitForLoadState('load')
    await sleep(4500)
    await page.close()
  }
  await ctx.close()
  return sink
}

async function stepConsoleMock(browser) {
  const a = await consolePass(browser, BASE, '?mock=1', 'mock=1')
  const b = await consolePass(browser, BASE, '?mock=empty', 'mock=empty')
  const c = await consolePass(browser, BASE, '?mock=demo', 'mock=demo', {}, DEMO_ROUTES)
  results.console = {
    ...(results.console || {}),
    mock: { routes: ROUTES.length * 2, messages: [...a, ...b] },
    demo: { routes: DEMO_ROUTES.length, messages: c },
  }
}
async function stepConsoleReal(browser, base) {
  const msgs = await consolePass(browser, base, '', 'real (fake box)', { httpCredentials: FAKE })
  results.console = { ...(results.console || {}), real: { routes: ROUTES.length, messages: msgs } }
}

// ------------------------------------------------------------------ step: Lighthouse

const CHROME = (() => {
  try {
    return chromium.executablePath()
  } catch {
    return null
  }
})()

function stepLighthouse() {
  const pages = [
    ['overview-demo', '', 'demo'],
    ['calls-demo', 'calls', 'demo'],
    ['callbacks-demo', 'callbacks', 'demo'],
    ['overview', '', '1'],
    ['calls', 'calls', '1'],
    ['callbacks', 'callbacks', '1'],
  ]
  const out = []
  for (const [name, p, mock] of pages) {
    const url = `${BASE}${p}?mock=${mock}`
    const outBase = path.join(OUT.lh, name)
    log('lighthouse', url)
    execFileSync(
      'npx',
      [
        '--yes',
        'lighthouse@13.5.0',
        url,
        '--preset=desktop',
        `--chrome-path=${CHROME}`,
        '--chrome-flags=--headless=new --no-first-run --no-default-browser-check',
        '--output=json',
        '--output=html',
        `--output-path=${outBase}`,
        '--quiet',
      ],
      { cwd: SCRATCH, stdio: 'inherit', timeout: 240000 },
    )
    fs.renameSync(`${outBase}.report.json`, `${outBase}.json`)
    fs.renameSync(`${outBase}.report.html`, `${outBase}.html`)
    const r = JSON.parse(fs.readFileSync(`${outBase}.json`, 'utf8'))
    const score = (k) => (r.categories[k] ? Math.round(r.categories[k].score * 100) : null)
    const failing = (cat) =>
      r.categories[cat].auditRefs
        .filter((a) => a.weight > 0 && r.audits[a.id].score !== null && r.audits[a.id].score < 1)
        .map((a) => a.id)
    out.push({
      page: name,
      url: `/dash/${p}?mock=${mock}`,
      performance: score('performance'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices'),
      seo: score('seo'),
      failingA11y: failing('accessibility'),
      failingBestPractices: failing('best-practices'),
      lcpMs: Math.round(r.audits['largest-contentful-paint'].numericValue),
      cls: +r.audits['cumulative-layout-shift'].numericValue.toFixed(3),
      tbtMs: Math.round(r.audits['total-blocking-time'].numericValue),
      json: rel(`${outBase}.json`),
      html: rel(`${outBase}.html`),
    })
  }
  results.lighthouse = { at: new Date().toISOString(), version: '13.5.0', preset: 'desktop', pages: out }
}

// ------------------------------------------------------------------ step: recording

async function stepVideo(browser) {
  const vdir = path.join(SCRATCH, 'video')
  fs.rmSync(vdir, { recursive: true, force: true })
  const t0 = Date.now()
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: vdir, size: { width: 1440, height: 900 } },
  })
  const page = await ctx.newPage()
  // A fresh demo tab in real time: the day's first open (she walks in to Callbacks waiting, holds
  // the sentence and leaves by herself), then a booking milestone (forced through the mock hook:
  // she rises, hops onto Booked, celebrates, presents) waved off with Escape.
  await page.goto(`${BASE}?mock=1`)
  await page.waitForSelector(SEL.line)
  await animsDone(page)
  await park(page)
  const loadedAt = (Date.now() - t0) / 1000
  await until(page, () => window.__katieStage?.state()?.moment === 'first-open', { timeout: 6000, label: 'first open' })
  await waitHolding(page)
  await until(page, katieOff, { timeout: 15000, label: 'first open over' })
  await sleep(300)
  // The replay's urgent note lands about 14 s in and would retarget her (rank 1 over rank 3) from
  // Booked to Callbacks waiting mid-recording; mark an urgent appearance as just shown so the
  // urgent spacing keeps the recording on the booking.
  await page.evaluate(() => {
    window.__katieStage.resetCaps()
    sessionStorage.setItem('katie.lastUrgent', String(Date.now()))
    return window.__katieStage.trigger('booking')
  })
  await waitHolding(page)
  await sleep(1800)
  await page.keyboard.press('Escape')
  await waitOff(page)
  await sleep(300)
  const endAt = (Date.now() - t0) / 1000
  const video = page.video()
  await ctx.close()
  const raw = await video.path()
  const dest = path.join(OUT.shots, 'katie-moments.webm')
  const start = Math.max(0, loadedAt - 0.3)
  const dur = endAt - start
  const ff = spawnSync('ffmpeg', ['-version'])
  if (ff.status === 0) {
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-ss', start.toFixed(2), '-i', raw, '-t', dur.toFixed(2),
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-an', dest,
    ])
  } else {
    fs.copyFileSync(raw, dest)
  }
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest], { encoding: 'utf8' })
  results.video = {
    at: new Date().toISOString(),
    file: rel(dest),
    seconds: probe.status === 0 ? +Number(probe.stdout.trim()).toFixed(1) : +dur.toFixed(1),
    bytes: fs.statSync(dest).size,
    trimmed: ff.status === 0,
    widgets: ['first open: Callbacks waiting, leaves by herself', 'booking milestone: Booked, waved off with Escape'],
    mode: 'mock=1 (vite preview), a fresh tab in real time',
  }
  log('video', JSON.stringify(results.video))
}

// ------------------------------------------------------------------ report

function writeReport() {
  const r = results
  const pf = (ok) => (ok ? 'pass' : '**fail**')
  const lines = []
  lines.push('# Verification (brief step 7)')
  lines.push('')
  lines.push(
    'Generated by `node scripts/verify.mjs` from the production build (`npm run build`, served with ' +
      '`vite preview` at /dash/ and, for real mode, by `scripts/fake-api.mjs` with dummy credentials). ' +
      "Browser: Playwright's bundled Chromium, headless. Raw numbers: `docs/perf/results.json`; console " +
      'log: `docs/perf/console.json`.',
  )
  lines.push('')
  lines.push('## Glass skin (DESIGN-GLASS.md, Tom 2026-10-26)')
  lines.push('')
  for (const n of GLASS_NOTES) lines.push(`- ${n}`)
  lines.push('')

  if (r.katie) {
    const k = r.katie
    const passed = k.checks.filter((c) => c.pass).length
    lines.push('## Occasional Katie (MONDAY-LLAMA 3.1-3.10)')
    lines.push('')
    lines.push(
      `Checked ${k.at} at ${k.viewport} with \`?mock=1\` (the replay: a live call whose urgent note lands about 14 s in, then a second call with a booking), ` +
        "time driven by Playwright's clock, moments forced through the mock-only `window.__katieStage.trigger()` where the fixtures cannot produce them. " +
        `${passed} of ${k.checks.length} checks pass.`,
    )
    lines.push('')
    lines.push('| check | result | measured |')
    lines.push('|---|---|---|')
    for (const c of k.checks) lines.push(`| ${c.name.replace(/\|/g, '\\|')} | ${pf(c.pass)} | ${String(c.detail).replace(/\|/g, '\\|')} |`)
    lines.push('')
    lines.push(`Screenshots: ${k.shots.map((f) => '`' + f + '`').join(', ')}.`)
    lines.push('')
  }

  if (r.shots) {
    lines.push('## Screenshots (1440 × 900 and 1280 × 800, mock=1 after the replay)')
    lines.push('')
    lines.push(`Taken ${r.shots.at}. Every file was opened and checked by eye; see the visual notes below.`)
    lines.push('')
    lines.push('| file | no horizontal scroll | Katie |')
    lines.push('|---|---|---|')
    for (const s of r.shots.list) {
      const k = s.katie
      const kd = !k
        ? 'n/a'
        : k.moment
          ? `${k.moment}: ${k.listening ? 'listening' : k.presenting ? 'presenting' : 'standing'} at ${k.dest}${k.bubble ? ', bubble' : ''}`
          : 'off screen'
      lines.push(`| \`${s.file}\` | ${pf(s.hscrollFree)} | ${kd} |`)
    }
    lines.push('')
    if (r.shots.fold) {
      lines.push('### The fold (DESIGN-GLASS 8.7 and 9.6, `?mock=demo`, after the entrance settles; the shipped look is stored as `{ preset: "shipped" }` before the page loads, the default look is what a fresh browser gets)')
      lines.push('')
      lines.push('| size | look | slab top-bottom | want | Latest calls rows above the fold | want | result |')
      lines.push('|---|---|---|---|---|---|---|')
      for (const f of r.shots.fold) lines.push(`| ${f.size} | ${f.look || 'shipped'} | ${f.got.slab[1]}-${f.got.slab[3]} | ${f.want.slab[0]}-${f.want.slab[1]} | ${f.got.rows} | at least ${f.want.rows} | ${pf(f.pass)} |`)
      lines.push('')
    }
    lines.push('### Visual notes')
    lines.push('')
    for (const n of VISUAL_NOTES) lines.push(`- ${n}`)
    lines.push('')
  }

  if (r.demo) {
    const d = r.demo
    const passed = d.checks.filter((c) => c.pass).length
    lines.push("## The closers' demo day (`?mock=demo`)")
    lines.push('')
    lines.push(
      `Checked ${d.at} (the demo day materialized on ${d.date}, NOW pinned to 9:10 PM) at 1440 × 900 and 1280 × 800, in real time: ` +
        'every page, the 7- and 30-day Calls ranges paged to the end, the drawers for s03 (the Spanish new-patient consult) and s32 (the urgent bracket), ' +
        'the Demo menu, **Play at 2x** from the menu (the Line tile on the call and after hang-up, the KPIs after it), then **R** from an open drawer. ' +
        `${passed} of ${d.checks.length} checks pass.`,
    )
    lines.push('')
    lines.push('| check | result | measured |')
    lines.push('|---|---|---|')
    for (const c of d.checks) lines.push(`| ${c.name.replace(/\|/g, '\\|')} | ${pf(c.pass)} | ${String(c.detail).replace(/\|/g, '\\|').slice(0, 400)} |`)
    lines.push('')
    lines.push('| screenshot | no horizontal scroll | Katie |')
    lines.push('|---|---|---|')
    for (const x of d.list) {
      const k = x.katie
      const kd = !k ? 'n/a' : k.moment ? `${k.moment}: ${k.presenting ? 'presenting' : 'standing'} at ${k.dest}` : 'off screen'
      lines.push(`| \`${x.file}\` | ${pf(x.hscrollFree)} | ${kd} |`)
    }
    lines.push('')
    lines.push('### Visual notes (demo)')
    lines.push('')
    for (const n of DEMO_NOTES) lines.push(`- ${n}`)
    lines.push('')
  }

  if (r.leads?.checks) {
    const l = r.leads
    const all = [...l.checks, ...(l.real?.checks ?? [])]
    const passed = all.filter((c) => c.pass).length
    lines.push('## Leads (DESIGN 6.13, `?mock=1` and the stand-in box)')
    lines.push('')
    lines.push(
      `Checked ${l.at} at 1440 × 900 and 1280 × 800 on the fixtures (clock pinned to Mon Oct 12, 6:05 PM): the list and its order, the four counts as filters, the drawer, every coordinator tap (Came in, No-show, Booked with its day and time, Lost with its question, Reopen, a note) with the hidden status line and where focus lands after each, a move the record refuses and that it does not follow the drawer to another lead, the Booked form's rules (today the earliest day, a time already behind the practice's clock refused, Esc and Cancel back to the tap, blank again on reopening), Show numbers, the reserved next-text and call-now slots (set through the mock-only \`window.__katieMock.patchLead\`), the 60 s poll and the focus refetch under Playwright's clock, and the empty, slow, error and demo scenarios. ` +
        (l.real ? `Then in real mode against \`scripts/fake-api.mjs\` (${l.real.at}): the GETs, the POST and its JSON body, a 409 from the server, reveal. ` : 'The real-mode pass has not run. ') +
        `${passed} of ${all.length} checks pass. scripts/check-lib.mjs separately replays the backend's own recorded answers through the mock's lead record.`,
    )
    lines.push('')
    lines.push('| check | result | measured |')
    lines.push('|---|---|---|')
    for (const c of all) lines.push(`| ${c.name.replace(/\|/g, '\\|')} | ${pf(c.pass)} | ${String(c.detail).replace(/\|/g, '\\|').slice(0, 300)} |`)
    lines.push('')
    lines.push('| screenshot | no horizontal scroll |')
    lines.push('|---|---|')
    for (const x of l.list) lines.push(`| \`${x.file}\` | ${pf(x.hscrollFree)} |`)
    lines.push('')
  }

  if (r.auth) {
    const a = r.auth
    const passed = a.checks.filter((c) => c.pass).length
    lines.push('## Sign-in (`?mock=1&auth=1`, the mock provider)')
    lines.push('')
    lines.push(
      `Checked ${a.at} at 1280 × 800 and 1440 × 900: every screen (sign-in, forgot password, code, choose a code, new password, set up the app, locked), a wrong password, a wrong then a right code, the remember box and its 30-day rule, the temporary-password flow, the idle lock under Playwright's clock, a 401 back to sign-in, sign-out, every People action with its dialog, the support switch, a 403, a staff login with no People or Activity, and the URL of every request. ${passed} of ${a.checks.length} checks pass.`,
    )
    lines.push('')
    lines.push('| check | result | measured |')
    lines.push('|---|---|---|')
    for (const c of a.checks) lines.push(`| ${c.name.replace(/\|/g, '\\|')} | ${pf(c.pass)} | ${String(c.detail).replace(/\|/g, '\\|').slice(0, 300)} |`)
    lines.push('')
    lines.push('| screenshot | no horizontal scroll |')
    lines.push('|---|---|')
    for (const x of a.list) lines.push(`| \`${x.file}\` | ${pf(x.hscrollFree)} |`)
    lines.push('')
  }

  if (r.demoBuild) {
    const b = r.demoBuild
    lines.push('## The closers\' static build (`npm run build:demo`, `VITE_DEMO_DEFAULT=1`)')
    lines.push('')
    lines.push(`Built into the scratch folder and served with \`vite preview\` at /dash/, ${b.at}. The demo day is the floor of that build: no backend, never real mode.`)
    lines.push('')
    lines.push('| check | result | measured |')
    lines.push('|---|---|---|')
    for (const c of b.checks) lines.push(`| ${c.name} | ${pf(c.pass)} | ${c.detail} |`)
    lines.push('')
  }

  if (r.video) {
    lines.push("## Recording: Katie's occasional moments")
    lines.push('')
    lines.push('| requirement | measured | result | artifact |')
    lines.push('|---|---|---|---|')
    lines.push(`| short recording, under 20 s | ${r.video.seconds} s, ${(r.video.bytes / 1024).toFixed(0)} KB; ${r.video.widgets.join(' → ')} | ${pf(r.video.seconds < 20)} | \`${r.video.file}\` |`)
    lines.push('')
    lines.push(`Recorded in ${r.video.mode}, 1440 × 900${r.video.trimmed ? '; trimmed to start at page load with ffmpeg' : ' (untrimmed: ffmpeg was not on PATH)'}.`)
    lines.push('')
  }

  if (r.lighthouse) {
    lines.push(`## Lighthouse ${r.lighthouse.version} (${r.lighthouse.preset} preset)`)
    lines.push('')
    lines.push('| page | performance (≥ 90) | accessibility (≥ 95) | best practices | SEO | LCP | CLS | TBT | failing a11y audits | artifacts |')
    lines.push('|---|---|---|---|---|---|---|---|---|---|')
    for (const p of r.lighthouse.pages) {
      lines.push(
        `| \`${p.url}\` | ${p.performance} ${pf(p.performance >= 90)} | ${p.accessibility} ${pf(p.accessibility >= 95)} | ${p.bestPractices} | ${p.seo} | ${p.lcpMs} ms | ${p.cls} | ${p.tbtMs} ms | ${p.failingA11y.join(', ') || 'none'} | \`${p.json}\`, \`${p.html}\` |`,
      )
    }
    lines.push('')
    lines.push(LH_NOTE)
    lines.push('')
  }

  if (r.console) {
    lines.push('## Console (every route, mock and real mode)')
    lines.push('')
    lines.push('| mode | routes loaded | errors | warnings | other messages | failed requests / HTTP ≥ 400 | result |')
    lines.push('|---|---|---|---|---|---|---|')
    const row = (label, c) => {
      if (!c) return
      const m = c.messages
      const errs = m.filter((x) => x.type === 'error' || x.type === 'pageerror').length
      const warns = m.filter((x) => x.type === 'warning').length
      const net = m.filter((x) => x.type === 'requestfailed' || x.type === 'http').length
      const other = m.length - errs - warns - net
      lines.push(`| ${label} | ${c.routes} | ${errs} | ${warns} | ${other} | ${net} | ${pf(errs === 0 && net === 0)} |`)
    }
    row('mock=1 and mock=empty (vite preview)', r.console.mock)
    row('mock=demo (vite preview)', r.console.demo)
    row('real (fake box, basic auth, live replay on)', r.console.real)
    lines.push('')
    lines.push(`Routes: ${ROUTES.map((x) => '`/dash/' + x + '`').join(', ')} (the demo pass opens its own call, \`/dash/calls/CA216253965107\`, in place of the fixtures' call). Each loaded fresh and watched for 4.5 s. Every message is in \`docs/perf/console.json\`.`)
    const all = [...(r.console.mock?.messages ?? []), ...(r.console.demo?.messages ?? []), ...(r.console.real?.messages ?? [])]
    if (all.length) {
      lines.push('')
      lines.push('| where | type | text |')
      lines.push('|---|---|---|')
      for (const m of all.slice(0, 30)) lines.push(`| ${m.where} | ${m.type} | ${m.text.replace(/\|/g, '\\|').slice(0, 160)} |`)
    }
    lines.push('')
  }

  if (r.perf) {
    const p = r.perf
    lines.push('## Performance: Katie moving across the Overview')
    lines.push('')
    lines.push(`CDP trace at ${p.viewport}, \`${p.url}\`, bringing her in for each kind of moment in turn: ${p.sequence.join(' → ')}. ${p.tweens} tweens, ${p.tweenMs} ms of travel in total. Frame times come from an in-page requestAnimationFrame sampler; the tween windows are user-timing marks in the trace, which is cut to them for the long-task count.`)
    lines.push('')
    lines.push('| requirement | measured | result | artifact |')
    lines.push('|---|---|---|---|')
    // DESIGN-GLASS 8.8: this harness is headless Chromium with software rendering, where the slab's
    // backdrop blur cannot reach 60 fps; 8.8's line here is 30 fps (under it, the card and object
    // blurs are cut). The 60 fps / 17.5 ms frame targets are the ship gate, measured by hand in a GPU
    // browser, so this report states them and does not grade them from software numbers.
    lines.push(`| software rendering: at least 30 fps while Katie walks (DESIGN-GLASS 8.8's line) | ${p.rafFps} fps (rAF), ${p.traceDrawFps} fps (DrawFrame in trace) | ${pf(p.rafFps >= 30)} | \`${p.trace}\` |`)
    lines.push(`| 60 fps while Katie walks, frame p95 at most 17.5 ms (the 8.8 ship gate: a GPU browser, by hand) | not measurable in this harness; software frames: p95 ${p.frameP95} ms / max ${p.frameMax} ms (p50 ${p.frameP50} ms; ${p.framesOver20ms} of ${p.framesTotal} frames over 20 ms) | open: Tom's GPU walk | \`${p.trace}\` |`)
    lines.push(`| no long task > 50 ms during the tween | ${p.longTasksInTween} long tasks; longest main-thread task in a tween ${p.longestTaskInTweenMs} ms | ${pf(p.longTasksInTween === 0)} | \`${p.trace}\` |`)
    lines.push(`| (whole trace, incl. the page between tweens) | ${p.longTasksWholeTrace} long tasks; longest ${p.longestTaskWholeTraceMs} ms | ${pf(p.longTasksWholeTrace === 0)} | \`${p.trace}\` |`)
    lines.push('')
  }

  if (r.budget) {
    const b = r.budget
    lines.push('## Katie budget (from dist/)')
    lines.push('')
    lines.push('| requirement | measured | result |')
    lines.push('|---|---|---|')
    lines.push(`| Katie JS + inline SVG ≤ 60 KB gzipped | ${(b.katieGzip / 1024).toFixed(1)} KB (${b.katieChunks.map((c) => `${c.file} ${(c.gzip / 1024).toFixed(1)} KB`).join(' + ')}) | ${pf(b.katieGzip <= 60 * 1024)} |`)
    lines.push(`| Katie assets < 400 KB | ${(b.katieAssetBytes / 1024).toFixed(1)} KB (${b.katieAssets.map((a) => `${a.file} ${(a.bytes / 1024).toFixed(1)} KB`).join(', ')}) | ${pf(b.katieAssetBytes < 400 * 1024)} |`)
    lines.push('')
    lines.push('The Katie chunks are the lazy `KatieStage` chunk plus every chunk it imports that the entry does not (GSAP, the rig and its traced SVG parts, the motion code). Sizes are gzip level 9 in KiB (1024 bytes); the Vite build log prints the same chunks in kB at its default level.')
    lines.push('')
  }

  lines.push('## How to re-run')
  lines.push('')
  lines.push('```sh')
  lines.push('node scripts/verify.mjs                          # build + every step, about 17 minutes')
  lines.push('node scripts/verify.mjs --skip-build --steps=perf  # one step against the current dist/')
  lines.push('node scripts/verify.mjs --skip-build --steps=demo,demobuild  # the closers\' demo day and the demo build only')
  lines.push('node scripts/verify.mjs --skip-build --steps=leads  # the Leads page: mock, then real mode against the stand-in box')
  lines.push('```')
  lines.push('')
  lines.push(`Port ${PORT} must be free (VERIFY_PORT overrides). Lighthouse is fetched by npx into VERIFY_SCRATCH (default the OS temp folder), never into the project. Both servers are stopped before the script exits.`)
  lines.push('')
  fs.writeFileSync(OUT.report, lines.join('\n'))
  log('wrote', rel(OUT.report))
}

// Judgement from opening every screenshot (not something the script can re-derive). Keep it in
// step with the images when the UI changes.
// The glass skin (docs/DESIGN-GLASS.md): what changed in this pack, and the measurements taken
// outside the steps above (rendered geometry and contrast probes in the reviewer's scratch folder).
const GLASS_NOTES = [
  'Every page, drawer, menu and Katie moment in this pack is the glass skin, second pass ("the room", DESIGN-GLASS 8): the app in one blurred glass slab standing in a blurred office graded to a bright day room whose windows, plant and floor read as soft shapes (src/assets/scene.webp, DESIGN-GLASS 8.13) with a bloom and a light vignette, a bevelled gradient rim (8.13: a 4 px ring plus an inner band, a faint blue line and an inner light), two glass objects behind the slab\'s top-right (A) and bottom-right (B) corners with their glyphs sharp in the corner gaps, and one in front of its bottom-left corner (C, whole inside the viewport), glass cards, the solid blue active nav pill, pastel pill chips, four KPI cards with icon tiles, the drawer floating inside the slab, Katie standing on the slab\'s inner bottom edge. The slab, the rim and C tilt in once per page load (900 ms, from opacity .5). Spec: `docs/DESIGN-GLASS.md` 8 (8.13: the polish after review round 2, the room re-grade, the bevel, the objects\' thickness and the scroll reset on a route change; 8.11: the changes after the second pass\'s review round 1, `docs/review/glass-v2-review-round1.md`; the consolidated review of both rounds: `docs/review/glass-v2-review.md`; final screenshots: `docs/screenshots/glass-v2/`); the first pass\'s review and its fixes: `docs/review/glass-review.md` and DESIGN-GLASS 7.',
  'Third pass (2026-11-02, DESIGN-GLASS 9): the glass is a per-browser look (Settings > The glass, `katie.look`). Every step here runs under the default look, Daylight (the researched recipe with Tom\'s tweak: a colour field behind a 26 % pane blurred 14 px, a gradient rim with an 18 px edge gradient, cards at 60 % without their own blur, text at 107 %), except the fold table, which runs under both Daylight and Original (8.13\'s glass, stored as `{ preset: "shipped" }` before the page loads). The room around the pane is 1 % of the window, at least 16 px, on every look and not a control (9.11, Tom\'s change the same evening: it was an 8 % look field, which cost the default look every Latest calls row at 1280 x 800).',
  'Verifier changes for the second pass (2026-10-26): every geometry read and screenshot waits until `document.getAnimations()` is empty (cap 2 s), after the slab\'s entrance; the shots step ends with the fold check (DESIGN-GLASS 8.7, the fold table under Screenshots). The entrance fills `backwards`, not `both`, so a finished entrance leaves getAnimations(). Katie\'s stage waits for the slab\'s animations (their finished promises, cap 1500 ms) before her first measurement.',
  'Verifier changes for the skin (2026-10-26): the content scrolls in `#content`, so its window.scroll calls scroll `#content`; Katie\'s wrapper is `[data-katie-stage] > div:last-child > div:last-child` (the layer now holds a viewport-sized space div); "off screen" and the booking rise are measured against the slab\'s inner bottom (`[data-katie-floor]`), not 900; the type set is {12, 14, 16, 20, 28} (28 = the KPI number); the active nav pill\'s outer shadow is allowed; the Line tile\'s speaker reads "Caller:".',
  'Geometry (`?mock=demo`, measured on this build, DESIGN-GLASS 8.7 and 9.11): the slab is 16-784 at 1280 x 800, 16-884 at 1440 x 900, 16-704 at 1280 x 720 and 16-1064 at 1920 x 1080 under every look (inset 16 x 16, 19 x 16 at 1920 wide; border 1.5); column gap 16 when the page is 1025 or narrower, 24 above (a container query on the page since DESIGN-GLASS 9.6); Latest calls rows wholly above the fold, Original: 5 at 1280 x 800, 7 at 1440 x 900, 3 at 1280 x 720; Daylight: 3 / 5 / 9 at 1280 x 800 / 1440 x 900 / 1920 x 1080 (the fold table); the drawer floats 12 px inside the slab (28 from the viewport), radius 20; no window scroll and no horizontal scroll at any size. The KPI card and glass-object measurements of the 8.13 build at its 40 / 48 / 64 px inset are in DESIGN-GLASS 8.7 and 8.13.',
  'Comparison lines (demo): Calls answered "↑ +5 vs yesterday" (35 vs 30), Appointments booked "↑ +3 vs yesterday" (27 vs 24); none on New-patient consults (yesterday unknown) or Callbacks waiting (never); none in mock=1 or empty.',
  'Contrast on the rendered glass (`node scripts/contrast-probe.mjs`, `docs/perf/contrast.json`: every text hidden, the darkest and lightest pixel inside each text box, 1280 x 800 and 1440 x 900, demo and empty): ink on cards at least 15.9:1, ink on the slab at least 13.35:1, secondary on cards at least 9.45:1, secondary on the slab at least 6.35:1 (worst "Made by SAIDA" at 1440 x 900 on the 8.13 room; 7.36 on the paler 8.11 room), inactive nav labels at least 10.7:1, the rail count 7.99:1, nav icons 5.51:1 (non-text floor 3:1), chips at least 4.57:1 on their fills (Booked; Urgent 4.83), the green comparison line 4.88:1, white on the nav pill 5.17:1. The tokens of 8.3 held through the 8.11 and 8.13 re-grades.',
  'Performance: the slab\'s backdrop blur is back by Tom\'s decision (DESIGN-GLASS 8.8). The perf step below runs in default headless Chromium (software rendering), the same harness that measured 33.7 fps when the first pass blurred the viewport; what gates shipping is the walk in a GPU browser (at least 58 fps, no task over 50 ms), measured by hand, so the perf table grades the software run against 8.8\'s 30 fps line and leaves the 60 fps row open for that walk (verifier change, 2026-10-26: it used to grade software rendering against 58 fps and print a fail that 8.8 expects). Software runs after the review changes (DESIGN-GLASS 8.11): 30.2 and 31.0 (builder), 33.8 (reviewer, round 2) and 32.6 fps (this pack\'s run, frames at 33.3 ms, longest task 2 ms in the tweens and 4.4 ms in the whole trace, no long task), all above the 30 fps line, so the card blur stays 16 and the objects keep their blur. The headless Metal-GPU walk on the 8.13 tree measured 59.0 fps at device scale 1 (302 tween frames, 1 over 20 ms) and 60.0 at scale 2 (0 over 20 ms), 0 long tasks (DESIGN-GLASS 8.13; 60.0 on the 8.10 tree); the by-hand walk in the app\'s pane is still open.',
]

const VISUAL_NOTES = [
  'Reviewed 2026-10-26 on the glass skin, opened singly next to docs/research/glassy-reference/02-dashboard-crop.jpg and 03-cards-detail.jpg: overview, overview-booking and overview-empty at both sizes, plus the demo set below. The rail header is Katie\'s 24px head + "Katie" 16/700, then the practice name at 14/500; the active nav item is the solid blue pill with white text, icon and count; cards are white glass with a soft blue shadow on a pale-blue slab; chips are pastel pills and only Urgent is solid. Second pass (DESIGN-GLASS 8.9), opened next to 02-dashboard-crop.jpg at 1440 x 900: the room is a bright blue day room (8.11, re-graded in 8.13 so its windows, plant and floor read) and shows on all four sides, darker than the slab; the slab reads as a lighter pane of it (cooler on the left over the plant, brighter on the right over the windows); the cards are a little whiter than the slab; the rim is a bright edge all round, brightest top-left; objects A and B stand behind the slab\'s right-hand corners, their glyphs whole and sharp in the corner gaps and their tiles blurred where the slab covers them; C is whole in the bottom-left corner over the slab\'s rounded corner, clear of "Made by SAIDA".',
  'Overview (mock=1): KPIs Calls answered 8 (2 after hours) / Appointments booked 7 (4 confirmed by text) / New-patient consults 5 / Callbacks waiting 4, no "Yesterday 0"; the chart is cropped to 7 AM-6 PM with 7 AM and 5 PM in bold; Latest calls shows names over masked numbers and a Reason column ("New-patient consult" / "Aetna"); after the replay the Line tile holds "Booked new-patient consult · Mon 3:20 PM" and the just-ended row is tinted.',
  'At 1280 the KPI labels wrap to two lines beside a 24 px tile ("Appointments / booked", "New-patient / consults"), the cards 126 tall; at 1440 the 36 px tile stays with the label beside it on one or two lines, the cards 138 tall. Latest-calls rows above the fold: 4 at 1280 x 800, 5 at 1440 x 900, 2 at 1280 x 720.',
  'overview-booking: Katie stands in the top bar over the Appointments booked card, her head at the slab\'s top edge, with the cell\'s own sentence in a bubble, clear of the date and of Show numbers. First open, the Katie button and line wake-up as before (occasional/ screenshots).',
  'mock=empty: four zero cards with their tiles and no sub-lines or comparison lines, the chart axis 7 AM-6 PM with only the Now rule, and EmptyState boxes ("No calls yet today." / "No callbacks waiting.", dashed border, three rows tall); no Katie.',
  'Callbacks with Show numbers on: full numbers, e.g. (656) 555-0150, no ellipsis.',
  'Observation (low): on the Overview Callbacks card the masked number after a name is cut ("(727) *…") when the row also carries the Urgent chip, at both sizes.',
  'Observation (low): "Booked on this call" (Overview card) and "· booked on this call" (Callbacks page) are worded differently for the same fact.',
]
// Judgement from opening the demo screenshots (FINDINGS 5a's storyline at 1280 × 800).
const DEMO_NOTES = [
  'Reviewed 2026-10-21 against FINDINGS 5a (the 90-second storyline at 1280 × 800) and 5d (the live sequence), every demo PNG opened singly at 1280 × 800 and the overview, bookings, mid-call and menu ones at 1440 × 900. Re-checked 2026-10-26 on the second glass pass (the room): the demo-* PNGs in this pack are from that build (overview, first open, menu, both drawers, mid-call, callbacks, texts opened); the content and the notes below hold, with the booking weekdays shifted to the day the demo materialized (Mon Oct 26: s32 reads "Booked Tue 7:40 AM").',
  'demo-overview: 35 / 27 / 17 / 12 with "4 in Spanish" + "↑ +5 vs yesterday", "19 confirmed by text" + "↑ +3 vs yesterday" and "1 urgent"; the chart runs 6 AM-9 PM with an empty 5 PM slot and the Now rule at 9:10 PM; Latest calls opens on Owen Brandt "Wire poking the inside of his cheek"; Callbacks waiting has Owen Brandt on top with the only solid Urgent chip on screen and "Booked on this call". Reads as a busy, real practice day; nothing invented-looking.',
  'demo-overview-first-open: Katie stands on the Callbacks waiting card top and presents "Start with Owen Brandt from 8:55 PM. …"; her bubble covers part of the chart\'s right half for the hold, then she leaves by herself (demo-overview, taken after).',
  'demo-drawer-s03-spanish (Camila Ortega, Spanish): header, the Outcome block (Checked the chart: new patient · Booked new-patient consult · Thu 2:40 PM · Confirmation text sent · replied Yes 8:03 AM), then the document transcript with "Katie" and her 16px head on her rows and a 2px grey rule; no focus ring on the name. The outcome block has no insurance line for this call.',
  'demo-drawer-s32-urgent (Zoe Lindqvist): the urgent desk note, the chart check, "Booked Thu 7:40 AM · Bracket came off, hanging on the wire" and the care-question note, all on top of the transcript.',
  'demo-line-mid-call: the Line tile reads "On a call · (813) ***-0136" with a ticking timer and the caller\'s last line; Latest calls has a Live row "Now · In progress" on top (FINDINGS 5d steps 1-3). demo-line-after-hangup: "Open · last call 9:10 PM" with "Booked new-patient consult · Thu 10:00 AM" held, the KPIs at 36 / 28 / 18 / 12 and a 9 PM bar.',
  'demo-menu: Reset the day (R), Play a sample call (P), Play at 2x, Bring Katie in (K), Show numbers, in a glass menu under the "Demo" glass pill; no blue fill on the open trigger.',
  'demo-drawer-*: the drawer floats 28 px inside the viewport (12 inside the slab\'s 16 px inset), radius 20, strong glass over the page; the Calls range above it is a glass segmented pill.',
  'Observation (low): the Calls page\'s "All outcomes" filter is still Vibe\'s stock dropdown (white field, small radius, grey border) next to the glass pills.',
  'demo-calls, -bookings, -callbacks, -texts: single count titles, 44px rows, names first; Texts reads as conversations ("Replied Yes 7:41 PM", Spanish bodies for Spanish callers); Callbacks lists Owen Brandt (Urgent) first, then Callback rows.',
  'DEFECT (data, medium): on Wednesday Oct 21 two of today\'s bookings share a slot: Thu 9:40 AM (Renee Shimanski and Morgan Ellis) and Thu 2:40 PM (Robert Halvorsen and Camila Ortega, the storyline\'s Spanish consult); on a Thursday day 0 Fri 8:20 AM is shared (Owen Brandt and Jordan Whitaker). Mon, Tue and Fri day 0 have none. FINDINGS 2b.3 / 5b: no two bookings in one slot. Comes from the weekday shift (conflict 58).',
  'Observation (low): after Play at 2x the new row shows a 1:05 duration (the replay\'s mock time at double speed); at normal speed it would read about 2:10.',
  'Observation (low): Bookings shows the booking record\'s "Renee Shimanski" (records shown as given, conflict 20) while Overview, Calls and Callbacks show the corrected "Renee Szymanski".',
]
const LH_NOTE = 'Lighthouse loads each page cold in a fresh headless Chromium with ?mock=1 (or ?mock=demo, whose dataset chunk loads first, about 135 KB gzipped), so the mock replay is running and the first-open moment (Katie walks in to Callbacks waiting, presents, and leaves) can fall inside the measurement. SEO is low (about 50) by design and has no target: index.html carries `<meta name="robots" content="noindex, nofollow">` (a private practice dashboard) and no meta description; those are the only two failing SEO audits.'

// ------------------------------------------------------------------ main

async function main() {
  if (!SKIP_BUILD) {
    log('build ->', rel(DIST))
    execFileSync('npx', ['tsc', '-b'], { cwd: ROOT, stdio: 'inherit' })
    execFileSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], { cwd: ROOT, stdio: 'inherit' })
  }
  stepBudget()
  const browser = await chromium.launch()
  try {
    if (['katie', 'shots', 'demo', 'leads', 'perf', 'console', 'video', 'lighthouse', 'auth'].some((x) => STEPS.has(x))) {
      await withPreview(async () => {
        if (STEPS.has('katie')) await stepKatie(browser)
        if (STEPS.has('shots')) await stepShots(browser)
        if (STEPS.has('demo')) await stepDemo(browser)
        if (STEPS.has('leads')) await stepLeads(browser)
        if (STEPS.has('perf')) await stepPerf(browser)
        if (STEPS.has('console')) await stepConsoleMock(browser)
        if (STEPS.has('video')) await stepVideo(browser)
        if (STEPS.has('lighthouse')) stepLighthouse()
        if (STEPS.has('auth')) await stepAuth(browser)
      })
    }
    if (STEPS.has('console')) await withFakeBox((base) => stepConsoleReal(browser, base))
    // Its own stand-in box (no replay): the taps change the lead record, so nothing else shares it.
    if (STEPS.has('leads')) await withFakeBox((base) => stepLeadsReal(browser, base), { FAKE_REPLAY: '0' })
    if (STEPS.has('demobuild')) await stepDemoBuild(browser)
  } finally {
    await browser.close()
    stopAll()
  }
  if (results.console) {
    fs.writeFileSync(path.join(OUT.perf, 'console.json'), JSON.stringify(results.console, null, 2))
  }
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2))
  writeReport()
}

main().catch((e) => {
  console.error(e)
  stopAll()
  process.exit(1)
})
