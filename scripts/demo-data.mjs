#!/usr/bin/env node
// Builds the sales-demo dataset for the Katie dashboard (mock=demo) from the hand-written
// scene files in docs/demo/scenes. Dependency-free, deterministic (fixed seed).
//
//   node scripts/demo-data.mjs              validate every scene, build src/mock/demo/*, print totals
//   node scripts/demo-data.mjs --validate   validate only (exit 1 on the first failing file)
//   node scripts/demo-data.mjs --scenes=DIR validate/build from another scene folder
//
// Times are never baked as epochs. Every timestamp in the output is a LocalStamp string,
// "<day> HH:MM:SS.mmm" (practice-local wall clock in America/New_York, day 0 = the demo day,
// -1 = yesterday ...). The mock turns them into epoch seconds at load (see the README it writes).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argScenes = (process.argv.find((a) => a.startsWith('--scenes=')) || '').slice('--scenes='.length)
const SCENES_DIR = argScenes ? path.resolve(argScenes) : path.join(ROOT, 'docs/demo/scenes')
const OUT_DIR = path.join(ROOT, 'src/mock/demo')
const DOC_PATH = path.join(ROOT, 'docs/demo/DEMO-DATA.md')
const VALIDATE_ONLY = process.argv.includes('--validate')

const CONTRACT = 'katie-demo/1'
const SEED = 20261021
const TZ = 'America/New_York'
const NOW = { day: 0, sec: 21 * 3600 + 10 * 60 } // 21:10:00 on the demo day
const LIVE_SCENE = 's36'
const HISTORY_DAYS = 29
const DETAILED_HISTORY = 8
const DAY0_WEEKDAY = 2 // the demo day is a Tuesday
const DAY0_DOM = 21 // ...the 21st: the spoken dates in the transcripts assume it
const AREA_CODES = ['813', '727', '656', '352', '941', '904']
const PRACTICE = 'Harborline Orthodontics (DEMO practice - fictional)'
const MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_BYTES = 1.5 * 1024 * 1024

// Fixes made by hand to scene files, logged in DEMO-DATA.md. Each one answers a validation
// failure that the checks below raise on the files as the writers delivered them.
const SCENE_FIXES = [
  ['s10', 'patient "Owen Castellano" renamed "Lucas Castellano"', 'near-duplicate of s05 "Owen Castillo" (same first name, surnames share "Cast"), and the same patient as s20 (rule: a patient is booked by one call a day)'],
  ['s20', 'patient "Owen Castellano" renamed "Theo Albright"', 'same patient booked twice today (s10 and s20, two urgent same-day visits); also the fourth Owen of the day'],
  ['s21', 'patient "Priya Raman" renamed "Nadia Brooks" (greeted_as, greeting, note name, transcript)', 'near-duplicate of s11 "Priya Ramanathan"; third Priya of the day'],
  ['s15', 'patient "Jordan Whitfield" renamed "Morgan Ellis"', 'near-duplicate of s04 "Jordan Whitaker"; surname shared with s19 "Dana Whitfield" (unrelated caller, both on the bookings list)'],
  ['s17', 'surname "Navarro" changed to "Kemper" (Sophie Kemper)', 'surname shared with s36 "Ellie Navarro" (unrelated caller, both on the bookings list)'],
  ['s14', 'surname "Ortega" changed to "Ríos" (Daniela Ríos)', 'surname shared with s03 "Camila Ortega" (unrelated caller, both on the bookings list)'],
  ['s22', 'surname "Brennan" changed to "Lowry" (Sophie Lowry)', 'surname shared with s06 "Rachel Brennan" (unrelated caller, both on the notes list)'],
  ['s33', 'the confirmation text and its "yes" moved from mid-call (turns 9-10) to hangup (93.2 s / 93.5 s, turn 10); Katie\'s "Done — it\'s on its way." became "Great — I\'ll send that over when we hang up."', 'the text went out while the caller was still talking; Katie sends the one confirmation text at hangup, after the yes'],
  ['s34', 'same move (now 66.0 s / 66.3 s, turn 7); "Ya se lo envié." became "Se lo mando al colgar."', 'same rule'],
  ['s36', 'same move (now 129.4 s / 129.7 s, turn 12); "Done — it\'s on its way." became "Great — I\'ll send it as soon as we hang up.", "Just reply yes to it and you\'re all set." became "Just reply yes when it comes in.", and the caller\'s "Oh — got it. Okay, I said yes. Um, should we bring anything?" became "Oh — okay, got it. Um, should we bring anything?". s36-live.txt rebuilt from s36.json with the same framing (46 blocks)', 'same rule; the replay file must match the scene event for event'],
  ['s35', 'the urgent note\'s annotation "note is informational" became "please call the parent first thing in the morning"', 'Katie tells the parent "I\'ve flagged this as urgent, so the team sees it first thing in the morning", so the note asks the desk to act; without it the demo day had no urgent callback waiting (every urgent note was informational)'],
  ['s16', 'Katie\'s line "...at the consultation — and the consultation is complimentary." cut to "...at the consultation."; the caller\'s reply "Oh, it\'s free? Okay." became "Okay, that makes sense."', 'Katie quoted a price ("complimentary" = $0); she never quotes prices'],
]

// ------------------------------------------------------------------ small utilities

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(SEED)
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const randFloat = (a, b) => a + rnd() * (b - a)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const chance = (p) => rnd() < p
function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0)
  let r = rnd() * total
  for (const [v, w] of pairs) if ((r -= w) < 0) return v
  return pairs[pairs.length - 1][0]
}
const r1 = (x) => Math.round(x * 10) / 10
const pad = (n, w = 2) => String(n).padStart(w, '0')
const words = (s) => (s ? s.trim().split(/\s+/).length : 0)

function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
const callIdFor = (key) =>
  'CA' + pad(fnv1a('katie-demo:' + key) % 1000000, 6) + pad(fnv1a('harborline:' + key) % 1000000, 6)

// ------------------------------------------------------------------ clock, slots, stamps

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekdayOf = (day) => (((DAY0_WEEKDAY + day) % 7) + 7) % 7

function clockToSec(s) {
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(s)
  if (!m) return null
  const [h, mi, se] = [+m[1], +m[2], +m[3]]
  if (h > 23 || mi > 59 || se > 59) return null
  return h * 3600 + mi * 60 + se
}
function secToClock(sec, decimals = 3) {
  const ms = Math.round(sec * 1000)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = (ms % 60000) / 1000
  return `${pad(h)}:${pad(m)}:${s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0')}`
}
/** "<day> HH:MM:SS.mmm" — practice-local wall clock. */
function stamp(day, sec) {
  if (!(sec >= 0 && sec < 86400)) throw new Error(`stamp out of the day: day ${day} sec ${sec}`)
  return `${day} ${secToClock(sec)}`
}
const STAMP_RE = /^(-?\d+) (\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/
const cmpTime = (a, b) => a.day - b.day || a.sec - b.sec

const SLOT_RE = /^(Mon|Tue|Wed|Thu|Fri) (1[0-2]|[1-9]):([0-5]\d) (AM|PM)$/
function parseSlot(s) {
  const m = SLOT_RE.exec(s)
  if (!m) return null
  let h = +m[2] % 12
  if (m[4] === 'PM') h += 12
  return { wd: WD.indexOf(m[1]), min: h * 60 + +m[3] }
}
function fmtSlot(wd, min) {
  const h24 = Math.floor(min / 60)
  return `${WD[wd]} ${h24 % 12 || 12}:${pad(min % 60)} ${h24 >= 12 ? 'PM' : 'AM'}`
}
/** Visits start on the :00/:20/:40 grid (first 7:40 AM); the last one starts 20 minutes before closing. */
function slotInHours(wd, min) {
  if (min % 20) return false
  if (wd >= 1 && wd <= 4) return min >= 450 && min <= 16 * 60 + 40
  if (wd === 5) return min >= 450 && min <= 16 * 60 + 40
  return false
}
/**
 * The draw tables for the random history. The practice is open 7:30 AM - 5:00 PM Mon-Fri (s27 says so), but the
 * history was drawn with Friday afternoons in the after-hours table and is kept that way so the month's numbers
 * (666 calls, yesterday 30) stay stable: those calls are simply Friday-afternoon calls. Day 0 is a Tuesday and is
 * never affected. Do not change this without regenerating every number quoted in the docs.
 */
function officeOpen(day, sec) {
  const wd = weekdayOf(day)
  const min = sec / 60
  if (wd >= 1 && wd <= 4) return min >= 450 && min < 1020
  if (wd === 5) return min >= 450 && min < 780
  return false
}
/** Days after the call day a slot string lands on. Tue on a Tuesday call = same day only when allowed. */
function slotDelta(callDay, callSec, slot, sameDayAllowed) {
  const p = parseSlot(slot)
  const delta = (p.wd - weekdayOf(callDay) + 7) % 7
  if (delta === 0) return sameDayAllowed && p.min * 60 > callSec ? 0 : 7
  return delta
}

// spoken dates and times (validation only)
const EN_ORD = { twentieth: 20, 'twenty-first': 21, 'twenty-second': 22, 'twenty-third': 23, 'twenty-fourth': 24, 'twenty-fifth': 25, 'twenty-sixth': 26, 'twenty-seventh': 27, 'twenty-eighth': 28, 'twenty-ninth': 29, thirtieth: 30 }
const ES_ORD = { veinte: 20, veintiuno: 21, 'veintidós': 22, 'veintitrés': 23, veinticuatro: 24, veinticinco: 25, 'veintiséis': 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30 }
const ES_WD = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const domWeekday = (dom) => (((DAY0_WEEKDAY + dom - DAY0_DOM) % 7) + 7) % 7
const EN_HOUR = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const EN_MIN = { '': 0, "o'clock": 0, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50 }
const ES_HOUR = { una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 }
const ES_MIN = { '': 0, veinte: 20, cuarenta: 40, media: 30, cuarto: 15 }
function spokenTimes(text) {
  const out = []
  const en = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?: (o'clock|ten|fifteen|twenty|thirty|forty-five|forty|fifty))? in the (morning|afternoon)\b/gi
  for (const m of text.matchAll(en)) {
    let h = EN_HOUR[m[1].toLowerCase()] % 12
    if (m[3].toLowerCase() === 'afternoon') h += 12
    out.push(h * 60 + EN_MIN[(m[2] || '').toLowerCase()])
  }
  const es = /\blas? (una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?: y (veinte|cuarenta|media|cuarto))? de la (mañana|tarde)\b/gi
  for (const m of text.matchAll(es)) {
    let h = ES_HOUR[m[1].toLowerCase()] % 12
    if (m[3].toLowerCase() === 'tarde') h += 12
    out.push(h * 60 + ES_MIN[(m[2] || '').toLowerCase()])
  }
  return out
}
/** "ten forty" / "las diez y cuarenta" anywhere in the text, for a time said without "in the morning". */
function saysTime(text, min) {
  const h = Math.floor(min / 60) % 12 || 12
  const m = min % 60
  const enH = Object.keys(EN_HOUR).find((k) => EN_HOUR[k] === h)
  const esH = Object.keys(ES_HOUR).find((k) => ES_HOUR[k] === h)
  const enM = Object.keys(EN_MIN).find((k) => k && k !== "o'clock" && EN_MIN[k] === m)
  const esM = Object.keys(ES_MIN).find((k) => k && ES_MIN[k] === m)
  if (!m) return new RegExp(`\\b(at|a las?) (${enH}|${esH})\\b`, 'i').test(text)
  return new RegExp(`\\b${enH} ${enM}\\b`, 'i').test(text) || new RegExp(`\\b${esH} y ${esM}\\b`, 'i').test(text)
}
function spokenDates(text) {
  const out = []
  const en = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),? the (twentieth|twenty-[a-z]+|thirtieth)\b/g
  for (const m of text.matchAll(en)) out.push({ phrase: m[0], wd: WD_LONG.indexOf(m[1]), dom: EN_ORD[m[2]] })
  const es = /\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo) (veinte|veinti[a-zéáíóú]+|treinta)\b/gi
  for (const m of text.matchAll(es)) out.push({ phrase: m[0], wd: ES_WD.indexOf(m[1].toLowerCase()), dom: ES_ORD[m[2].toLowerCase()] })
  return out
}

// ------------------------------------------------------------------ wire shapes (src/api/types.ts)

const TYPES = {
  str: (v) => typeof v === 'string',
  num: (v) => typeof v === 'number' && Number.isFinite(v),
  int: (v) => Number.isInteger(v),
  bool: (v) => typeof v === 'boolean',
  stamp: (v) => typeof v === 'string' && STAMP_RE.test(v),
  numOrNull: (v) => v === null || (typeof v === 'number' && Number.isFinite(v)),
  obj: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  arr: Array.isArray,
}
function checkShape(obj, spec, where, errs) {
  if (!TYPES.obj(obj)) return errs.push(`${where}: not an object`)
  for (const k of Object.keys(obj)) if (!(k in spec)) errs.push(`${where}: unexpected key "${k}"`)
  for (const [k, t] of Object.entries(spec)) {
    const opt = t.endsWith('?')
    const tn = opt ? t.slice(0, -1) : t
    if (!(k in obj)) {
      if (!opt) errs.push(`${where}: missing "${k}"`)
      continue
    }
    if (!TYPES[tn](obj[k])) errs.push(`${where}: "${k}" should be ${tn}, got ${JSON.stringify(obj[k])}`)
  }
}
const TOOL_SPEC = {
  lookup: { name: 'str', ok: 'bool', ms: 'int', verified: 'bool' },
  context: { name: 'str', ok: 'bool', ms: 'int', open_slots: 'int' },
  book: { name: 'str', ok: 'bool', ms: 'int', slot: 'str', patient: 'str', already_booked: 'bool' },
  cancel: { name: 'str', ok: 'bool', ms: 'int', slot: 'str' },
  message: { name: 'str', ok: 'bool', ms: 'int' },
}
const DATA_SPEC = {
  'call.started': { caller: 'str' },
  greeting: { name: 'str' },
  'turn.caller': { text: 'str' },
  'turn.bot': { text: 'str' },
  booking: { name: 'str', slot: 'str', reason: 'str', insurance: 'str' },
  note: { name: 'str', reason: 'str', urgent: 'bool', fyi: 'bool' },
  cancel: { name: 'str', slot: 'str' },
  'sms.out': { caller: 'str', kind: 'str', chars: 'int' },
  'sms.in': { caller: 'str', kind: 'str', chars: 'int?' },
  'call.ended': { duration_s: 'num', disposition: 'str', bookings: 'int', notes: 'int' },
}
function checkEventData(kind, data, where, errs) {
  if (kind === 'tool') {
    const spec = TOOL_SPEC[data && data.name]
    if (!spec) return errs.push(`${where}: unknown tool "${data && data.name}"`)
    return checkShape(data, spec, where, errs)
  }
  const spec = DATA_SPEC[kind]
  if (!spec) return errs.push(`${where}: unknown event kind "${kind}"`)
  checkShape(data, spec, where, errs)
}
// Output shapes, with every epoch field as a LocalStamp.
const ROW_SPEC = { call_id: 'str', started_at: 'stamp', ended_at: 'stamp', duration_s: 'num', caller: 'str', disposition: 'str', summary: 'str', bookings: 'int', notes: 'int', language: 'str', greeted_as: 'str', turns: 'int', status: 'str', first_line: 'str' }
const DETAIL_CALL_SPEC = { ...ROW_SPEC }
delete DETAIL_CALL_SPEC.first_line
const EVENT_SPEC = { id: 'int', ts: 'stamp', kind: 'str', turn: 'int', data: 'obj' }
const BOOKING_SPEC = { id: 'int', ts: 'stamp', call_id: 'str', caller: 'str', name: 'str', slot: 'str', reason: 'str', insurance: 'str' }
const NOTE_SPEC = { id: 'int', ts: 'stamp', call_id: 'str', caller: 'str', name: 'str', reason: 'str', urgent: 'bool', fyi: 'bool' }
const SMS_SPEC = { id: 'int', ts: 'stamp', call_id: 'str', direction: 'str', phone: 'str', kind: 'str', chars: 'int' }
const STATS_SPEC = { range: 'obj', calls: 'int', booked_calls: 'int', bookings: 'int', callbacks: 'int', urgent: 'int', sms_out: 'int', sms_in: 'int', avg_duration_s: 'num', by_hour: 'arr', dispositions: 'obj', languages: 'obj' }
const RANGE_SPEC = { from: 'stamp', to: 'stamp', days: 'int', tz: 'str' }
const STATUS_SPEC = { ok: 'bool', events: 'bool', boot_at: 'stamp', now: 'stamp', live_calls: 'int', line: 'str', last_call_at: 'stamp', practice: 'str', model: 'str', agent: 'str' }

// ------------------------------------------------------------------ scene validation

const SCENE_KEYS = ['id', 'day', 'start', 'duration_s', 'caller', 'caller_full', 'language', 'greeted_as', 'disposition', 'turns', 'first_line', 'scenario', 'events']
const mask = (full) => full.replace(/^(\(\d{3}\) )555(-\d{4})$/, '$1***$2')
const PRICE_RE = /\$|\bdollars?\b|d[oó]lares|\bfree\b|complimentary|no charge|gratis|sin costo|\bcosts? (is|are|about|around)\b|\bper month\b|al mes\b/i
const ADDRESS_RE = /\b\d{2,5} [A-Z][a-z]+ (Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b/
const CONSENT_RE = /\btext\b|mensaje/i

/**
 * Validates one call in the scene format (scene files and the scripted history calls).
 * Returns { errors, warnings, call } where call is the internal model.
 */
function validateCallFile(s, where, opts) {
  const errs = []
  const warns = []
  const E = (m) => errs.push(`${where}: ${m}`)
  if (!TYPES.obj(s)) return { errors: [`${where}: not a JSON object`], warnings: [] }
  for (const k of Object.keys(s)) if (!SCENE_KEYS.includes(k)) E(`unexpected key "${k}"`)
  for (const k of SCENE_KEYS) if (!(k in s)) E(`missing key "${k}"`)
  if (errs.length) return { errors: errs, warnings: warns }

  if (opts.kind === 'scene') {
    if (!/^s(0[1-9]|[12]\d|3[0-6])$/.test(s.id)) E(`id "${s.id}" is not s01..s36`)
    if (opts.fileId && s.id !== opts.fileId) E(`id "${s.id}" does not match the file name`)
    if (s.day !== 0) E(`day must be 0 (all scenes are the demo day), got ${s.day}`)
  }
  const start = clockToSec(s.start)
  if (start === null) E(`start "${s.start}" is not HH:MM:SS`)
  if (!TYPES.num(s.duration_s) || s.duration_s < 35 || s.duration_s > 200) E(`duration_s ${s.duration_s} outside 35-200 s`)
  const fullRe = new RegExp(`^\\((${AREA_CODES.join('|')})\\) 555-01\\d\\d$`)
  if (!fullRe.test(s.caller_full)) E(`caller_full "${s.caller_full}" is not (area) 555-01XX with an allowed area code`)
  else if (s.caller !== mask(s.caller_full)) E(`caller "${s.caller}" is not the masked caller_full "${mask(s.caller_full)}"`)
  if (!['en', 'es'].includes(s.language)) E(`language "${s.language}" is not en/es`)
  if (!TYPES.str(s.greeted_as) || (s.greeted_as && !/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(s.greeted_as))) E(`greeted_as "${s.greeted_as}" must be "" or one first name`)
  if (!['phone-booked', 'phone-no-booking'].includes(s.disposition)) E(`disposition "${s.disposition}" is not phone-booked / phone-no-booking`)
  if (!TYPES.int(s.turns) || s.turns < 1) E(`turns ${s.turns} is not a positive integer`)
  if (!TYPES.str(s.scenario) || !/^[a-z0-9_]+$/.test(s.scenario)) E(`scenario "${s.scenario}" is not a lowercase tag`)
  if (!Array.isArray(s.events) || s.events.length < 4) E('events must be an array of at least 4 events')
  if (errs.length) return { errors: errs, warnings: warns }

  const ev = s.events
  let prevAt = -1
  let prevTurn = 0
  ev.forEach((e, i) => {
    const w = `event #${i} (${e && e.kind})`
    if (!TYPES.obj(e)) return E(`${w}: not an object`)
    for (const k of Object.keys(e)) if (!['at', 'kind', 'turn', 'data'].includes(k)) E(`${w}: unexpected key "${k}"`)
    if (!TYPES.num(e.at) || e.at < 0) E(`${w}: at ${e.at} is not a non-negative number`)
    if (e.at < prevAt) E(`${w}: at ${e.at} goes back in time (previous ${prevAt})`)
    if (e.at > s.duration_s + 1e-6) E(`${w}: at ${e.at} is after the call ends (${s.duration_s})`)
    prevAt = e.at
    if (!TYPES.int(e.turn) || e.turn < 0) E(`${w}: turn ${e.turn} is not a non-negative integer`)
    if (e.turn < prevTurn) E(`${w}: turn ${e.turn} goes back (previous ${prevTurn})`)
    prevTurn = e.turn
    const dErrs = []
    checkEventData(e.kind, e.data, `${where}: ${w}`, dErrs)
    errs.push(...dErrs)
    if ((e.kind === 'turn.caller' || e.kind === 'turn.bot') && TYPES.str(e.data?.text) && !e.data.text.trim()) E(`${w}: empty text`)
  })
  if (errs.length) return { errors: errs, warnings: warns }

  const of = (k) => ev.filter((e) => e.kind === k)
  const first = ev[0]
  const last = ev[ev.length - 1]
  if (first.kind !== 'call.started' || first.at !== 0 || first.turn !== 0) E('first event must be call.started at 0, turn 0')
  else if (first.data.caller !== s.caller) E(`call.started caller "${first.data.caller}" is not "${s.caller}"`)
  if (ev[1].kind !== 'greeting' || ev[1].turn !== 0) E('second event must be the greeting, turn 0')
  else if (ev[1].data.name !== s.greeted_as) E(`greeting name "${ev[1].data.name}" is not greeted_as "${s.greeted_as}"`)
  for (const k of ['call.started', 'greeting', 'call.ended']) if (of(k).length !== 1) E(`exactly one ${k} expected, found ${of(k).length}`)
  if (last.kind !== 'call.ended') E('last event must be call.ended')
  else {
    if (Math.abs(last.at - s.duration_s) > 0.051) E(`call.ended at ${last.at} is not duration_s ${s.duration_s}`)
    if (Math.abs(last.data.duration_s - s.duration_s) > 0.051) E(`call.ended duration_s ${last.data.duration_s} is not ${s.duration_s}`)
    if (last.data.disposition !== s.disposition) E(`call.ended disposition "${last.data.disposition}" is not "${s.disposition}"`)
    if (last.data.bookings !== of('booking').length) E(`call.ended bookings ${last.data.bookings} but ${of('booking').length} booking events`)
    if (last.data.notes !== of('note').length) E(`call.ended notes ${last.data.notes} but ${of('note').length} note events`)
  }
  const callerTurns = of('turn.caller')
  callerTurns.forEach((e, i) => {
    if (e.turn !== i + 1) E(`turn.caller #${i + 1} has turn ${e.turn} (caller turns must run 1..N)`)
  })
  if (callerTurns.length !== s.turns) E(`turns ${s.turns} but ${callerTurns.length} caller turns`)
  const maxTurn = Math.max(...ev.map((e) => e.turn))
  if (maxTurn !== s.turns) E(`highest event turn ${maxTurn} is not turns ${s.turns}`)
  if (callerTurns[0] && callerTurns[0].data.text !== s.first_line) E('first_line is not the first caller turn')
  for (const b of of('turn.bot')) if (b.turn < 1) E(`bot sentence on turn ${b.turn} (before the caller spoke)`)
  const bookings = of('booking')
  if ((bookings.length > 0) !== (s.disposition === 'phone-booked')) E(`disposition ${s.disposition} with ${bookings.length} bookings`)
  const perTurn = s.duration_s / s.turns
  if (perTurn < 4 || perTurn > 16) E(`duration ${s.duration_s} s for ${s.turns} turns (${r1(perTurn)} s a turn) is not 4-16 s a turn`)

  // tool -> event pairing
  ev.forEach((e, i) => {
    const prev = ev.slice(0, i).reverse().find((p) => p.kind === 'tool')
    const prevSameTurn = prev && prev.turn === e.turn ? prev : null
    if (e.kind === 'booking') {
      const tool = ev.slice(0, i).reverse().find((p) => p.kind === 'tool' && p.data.name === 'book' && p.turn === e.turn && p.data.slot === e.data.slot)
      if (!tool) E(`booking ${e.data.name} ${e.data.slot}: no book tool with that slot on turn ${e.turn}`)
      else if (tool.data.patient !== e.data.name) E(`booking name "${e.data.name}" is not the book tool's patient "${tool.data.patient}"`)
      else if (!tool.data.ok) E(`booking ${e.data.slot} follows a failed book tool`)
    }
    if (e.kind === 'note' && !(prevSameTurn && prevSameTurn.data.name === 'message' && prevSameTurn.data.ok)) E(`note on turn ${e.turn} is not right after a message tool on that turn`)
    if (e.kind === 'cancel' && !(prevSameTurn && prevSameTurn.data.name === 'cancel' && prevSameTurn.data.slot === e.data.slot)) E(`cancel ${e.data.slot} is not right after a cancel tool with that slot`)
  })
  const books = ev.filter((e) => e.kind === 'tool' && e.data.name === 'book' && e.data.ok)
  if (books.length !== bookings.length) E(`${books.length} ok book tools but ${bookings.length} booking events`)
  const msgs = ev.filter((e) => e.kind === 'tool' && e.data.name === 'message')
  if (msgs.length < of('note').length) E(`${of('note').length} notes but only ${msgs.length} message tools`)

  // transcript text
  const texts = ev.filter((e) => e.kind === 'turn.caller' || e.kind === 'turn.bot').map((e) => e.data.text)
  const all = texts.join(' \n ').toLowerCase()
  for (const b of bookings) if (!all.includes(b.data.name.toLowerCase())) E(`booked name "${b.data.name}" never appears in the transcript`)
  for (const e of of('turn.bot')) {
    if (PRICE_RE.test(e.data.text)) E(`Katie talks price on turn ${e.turn}: "${e.data.text}"`)
    if (/\S\.[A-Z¡¿]/.test(e.data.text)) warns.push(`${where}: run-together sentences on turn ${e.turn}: "${e.data.text}"`)
  }
  for (const t of texts) if (ADDRESS_RE.test(t)) E(`street address in the transcript: "${t}"`)

  // notes
  for (const n of of('note')) {
    const d = n.data
    if (d.urgent && !d.reason.startsWith('URGENT: ')) E(`urgent note without the "URGENT: " prefix: "${d.reason}"`)
    if (!d.urgent && /^URGENT/.test(d.reason)) E(`"URGENT" reason on a note not marked urgent`)
    if (d.urgent && d.fyi) E('note is both urgent and fyi')
    if (!d.name.trim()) E('note with an empty name')
  }
  for (const c of of('cancel')) if (!parseSlot(c.data.slot)) E(`cancel slot "${c.data.slot}" is not like "Thu 9:00 AM"`)

  // sms + texting consent
  const outs = of('sms.out')
  const ins = of('sms.in')
  if (outs.length > 1) E(`${outs.length} sms.out (at most one a call)`)
  if (ins.length > outs.length) E('sms.in without an sms.out')
  for (const o of outs) {
    const oi = ev.indexOf(o)
    if (o.data.kind !== 'confirmation') E(`sms.out kind "${o.data.kind}" (expected confirmation)`)
    if (o.data.caller !== s.caller) E(`sms.out caller "${o.data.caller}" is not the caller`)
    if (o.data.chars < 1) E('sms.out chars < 1')
    if (s.disposition !== 'phone-booked') E('confirmation text on a call with no booking')
    const lastCaller = callerTurns[callerTurns.length - 1]
    if (o.at < lastCaller.at) E('sms.out goes out before the caller has finished (texts go after the yes, at the end of the call)')
    const askIdx = ev.findIndex((e, j) => j < oi && e.kind === 'turn.bot' && CONSENT_RE.test(e.data.text))
    if (askIdx < 0) E('confirmation text sent but Katie never asked about texting')
    else if (!ev.some((e, j) => j > askIdx && j < oi && e.kind === 'turn.caller')) E('confirmation text sent without a caller reply after Katie asked about texting')
  }
  for (const n of ins) {
    if (ev.indexOf(n) < ev.indexOf(outs[0])) E('sms.in before sms.out')
    if (n.data.caller !== s.caller) E(`sms.in caller "${n.data.caller}" is not the caller`)
  }

  // slots: format, office hours, weekday rule, spoken time
  const callDay = opts.day
  const urgentInCall = of('note').some((n) => n.data.urgent)
  const slots = []
  for (const b of bookings) {
    const p = parseSlot(b.data.slot)
    if (!p) {
      E(`booking slot "${b.data.slot}" is not like "Thu 9:00 AM"`)
      continue
    }
    if (!slotInHours(p.wd, p.min)) E(`booking slot ${b.data.slot} is outside office hours or off the 20-minute grid`)
    const delta = slotDelta(callDay, start, b.data.slot, urgentInCall)
    if (delta === 0 && p.min * 60 < start + 30 * 60) E(`same-day slot ${b.data.slot} is less than 30 minutes after the call`)
    if (weekdayOf(callDay) === p.wd && delta === 7 && opts.kind === 'scene' && urgentInCall) warns.push(`${where}: ${b.data.slot} read as next week although the call has an urgent note`)
    slots.push({ slot: b.data.slot, abs: callDay + delta, min: p.min, name: b.data.name })
    // spoken time of the booking, from Katie's lines on that turn
    const turnText = ev.filter((e) => e.kind === 'turn.bot' && e.turn === b.turn).map((e) => e.data.text).join(' ')
    const said = spokenTimes(turnText)
    if (said.length && !said.includes(p.min) && !saysTime(turnText, p.min)) E(`Katie confirms ${said.map((m) => fmtSlot(p.wd, m).slice(4)).join('/')} but the booking is ${b.data.slot}`)
    if (!said.length) warns.push(`${where}: no spoken time next to booking ${b.data.slot}`)
  }
  // spoken dates are consistent with the demo calendar (day 0 = Tuesday the 21st)
  const callDom = DAY0_DOM + callDay
  for (const e of of('turn.bot')) {
    for (const d of spokenDates(e.data.text)) {
      if (d.dom === undefined) E(`unknown spoken date "${d.phrase}"`)
      else if (domWeekday(d.dom) !== d.wd) E(`"${d.phrase}" is not a real date when the demo day is Tuesday the ${DAY0_DOM}st`)
      else if (d.dom < callDom) E(`"${d.phrase}" is in the past for a call on the ${callDom}th`)
      if (/tomorrow/i.test(e.data.text) && d.dom !== callDom + 1 && /tomorrow,? (\w+day),? the/i.test(e.data.text)) E(`"tomorrow" is not the ${d.phrase}`)
    }
  }

  const call = sceneToCall(s, callDay, start)
  call.slots = slots
  return { errors: errs, warnings: warns, call }
}

/** Internal call model from a validated scene-format object. */
function sceneToCall(s, day, start) {
  const ev = s.events
  return {
    key: s.id,
    day,
    start,
    duration: s.duration_s,
    caller_full: s.caller_full,
    caller: s.caller,
    language: s.language,
    greeted_as: s.greeted_as,
    disposition: s.disposition,
    turns: s.turns,
    first_line: s.first_line,
    scenario: s.scenario,
    events: ev,
    bookings: ev.filter((e) => e.kind === 'booking').map((e) => ({ at: e.at, ...e.data })),
    notes: ev.filter((e) => e.kind === 'note').map((e) => ({ at: e.at, ...e.data })),
    cancels: ev.filter((e) => e.kind === 'cancel').map((e) => ({ at: e.at, ...e.data })),
    sms: ev.filter((e) => e.kind === 'sms.out' || e.kind === 'sms.in').map((e) => ({ at: e.at, direction: e.kind === 'sms.out' ? 'out' : 'in', kind: e.data.kind, chars: e.data.chars ?? 0 })),
  }
}

// ------------------------------------------------------------------ cross-scene checks

const isUnknown = (n) => !n || /^unknown\b/i.test(n)
const firstName = (n) => n.trim().split(/\s+/)[0]
const lastName = (n) => {
  const p = n.trim().split(/\s+/)
  return p.length > 1 ? p[p.length - 1] : ''
}
/** Patient names named in a call: bookings, notes and [about patient X] tags. */
function visibleNames(c) {
  const names = new Set()
  for (const b of c.bookings) names.add(b.name)
  for (const n of c.notes) {
    if (!isUnknown(n.name)) names.add(n.name)
    for (const m of n.reason.matchAll(/\[about patient ([^\]]+)\]/g)) names.add(m[1].trim())
  }
  return [...names]
}

function crossChecks(calls) {
  const errs = []
  const byCaller = new Map()
  for (const c of calls) {
    if (byCaller.has(c.caller_full)) errs.push(`${c.key}: caller_full ${c.caller_full} is also used by ${byCaller.get(c.caller_full)}`)
    byCaller.set(c.caller_full, c.key)
  }
  const sorted = [...calls].sort((a, b) => a.start - b.start)
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]
    const b = sorted[i]
    if (b.start < a.start + a.duration) errs.push(`${b.key}: starts at ${secToClock(b.start, 0)} while ${a.key} is still on the line (ends ${secToClock(a.start + a.duration, 0)})`)
  }
  // double-booked slots
  const taken = new Map()
  for (const c of calls) for (const s of c.slots) {
    const k = `${s.abs}|${s.min}`
    if (taken.has(k)) errs.push(`${c.key}: ${s.slot} (day +${s.abs}) is already booked by ${taken.get(k)}`)
    taken.set(k, c.key)
  }
  // names: one booking call per patient, no near-duplicates, no shared surname across callers,
  // no first name on more than two patients
  const bookedBy = new Map()
  for (const c of calls) for (const b of c.bookings) {
    const k = b.name.toLowerCase()
    if (bookedBy.has(k) && bookedBy.get(k) !== c.key) errs.push(`${c.key}: "${b.name}" is also booked by ${bookedBy.get(k)} today`)
    bookedBy.set(k, c.key)
  }
  const people = [] // { name, key }
  for (const c of calls) for (const n of visibleNames(c)) people.push({ name: n, key: c.key })
  const uniq = new Map()
  for (const p of people) if (!uniq.has(p.name.toLowerCase())) uniq.set(p.name.toLowerCase(), p)
  const list = [...uniq.values()]
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      if (a.key === b.key) continue
      const fa = firstName(a.name).toLowerCase()
      const fb = firstName(b.name).toLowerCase()
      const la = lastName(a.name).toLowerCase()
      const lb = lastName(b.name).toLowerCase()
      if (fa === fb && la && lb && la !== lb && la.slice(0, 4) === lb.slice(0, 4)) errs.push(`${b.key}: "${b.name}" is a near-duplicate of ${a.key} "${a.name}"`)
      if (la && la === lb) errs.push(`${b.key}: surname of "${b.name}" is shared with ${a.key} "${a.name}" (unrelated callers)`)
    }
  const firsts = new Map()
  for (const p of list) {
    const f = firstName(p.name)
    if (!firsts.has(f)) firsts.set(f, [])
    firsts.get(f).push(`${p.key} ${p.name}`)
  }
  for (const [f, who] of firsts) if (who.length > 2) errs.push(`first name "${f}" is used by ${who.length} patients today: ${who.join(', ')}`)
  const lines = new Map()
  for (const c of calls) {
    const k = c.first_line.slice(0, 40).toLowerCase()
    if (lines.has(k)) errs.push(`${c.key}: first_line starts like ${lines.get(k)}'s`)
    lines.set(k, c.key)
  }
  return errs
}

// ------------------------------------------------------------------ load + validate scenes

function loadScenes() {
  const files = fs.readdirSync(SCENES_DIR).filter((f) => /^s\d\d\.json$/.test(f)).sort()
  const errors = []
  const warnings = []
  const calls = []
  for (const f of files) {
    const where = path.join(path.relative(ROOT, SCENES_DIR) || SCENES_DIR, f)
    let s
    try {
      s = JSON.parse(fs.readFileSync(path.join(SCENES_DIR, f), 'utf8'))
    } catch (e) {
      errors.push(`${where}: invalid JSON (${e.message})`)
      continue
    }
    const r = validateCallFile(s, where, { kind: 'scene', fileId: f.replace(/\.json$/, ''), day: 0 })
    errors.push(...r.errors)
    warnings.push(...r.warnings)
    if (r.call) calls.push(r.call)
  }
  const ids = new Set(calls.map((c) => c.key))
  for (let i = 1; i <= 36; i++) if (!ids.has(`s${pad(i)}`)) errors.push(`missing scene s${pad(i)}.json`)
  if (!errors.length) errors.push(...crossChecks(calls))
  const live = calls.find((c) => c.key === LIVE_SCENE)
  if (live && live.start !== NOW.sec) errors.push(`${LIVE_SCENE}: the live showpiece must start at NOW (${secToClock(NOW.sec, 0)}), starts ${secToClock(live.start, 0)}`)
  for (const c of calls) if (c !== live && c.start + c.duration > NOW.sec) errors.push(`${c.key}: ends after NOW ${secToClock(NOW.sec, 0)}`)
  return { calls, errors, warnings }
}

function loadLiveStream(liveCall) {
  const file = path.join(SCENES_DIR, `${LIVE_SCENE}-live.txt`)
  const raw = fs.readFileSync(file, 'utf8')
  const errs = []
  const blocks = raw.split(/\r?\n\r?\n/).filter((b) => b.trim())
  const parsed = blocks.map((b, i) => {
    let kind = ''
    let data = ''
    for (const line of b.split(/\r?\n/)) {
      if (line.startsWith('event:')) kind = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    let obj = null
    try {
      obj = JSON.parse(data)
    } catch (e) {
      errs.push(`${LIVE_SCENE}-live.txt block ${i}: bad JSON`)
    }
    return { kind, obj }
  })
  if (parsed.length !== liveCall.events.length) errs.push(`${LIVE_SCENE}-live.txt has ${parsed.length} blocks, ${LIVE_SCENE}.json has ${liveCall.events.length} events`)
  parsed.forEach((p, i) => {
    const e = liveCall.events[i]
    if (!p.obj || !e) return
    const keys = Object.keys(p.obj).join(',')
    if (keys !== 'ts,call_id,kind,turn,data') errs.push(`${LIVE_SCENE}-live.txt block ${i}: keys ${keys} (expected ts,call_id,kind,turn,data)`)
    if (p.kind !== p.obj.kind || p.kind !== e.kind) errs.push(`${LIVE_SCENE}-live.txt block ${i}: kind ${p.kind} is not ${e.kind}`)
    if (p.obj.turn !== e.turn || Math.abs(p.obj.ts - e.at) > 1e-6) errs.push(`${LIVE_SCENE}-live.txt block ${i}: turn/ts differ from ${LIVE_SCENE}.json`)
    if (JSON.stringify(p.obj.data) !== JSON.stringify(e.data)) errs.push(`${LIVE_SCENE}-live.txt block ${i}: data differs from ${LIVE_SCENE}.json`)
  })
  return { parsed, errs }
}

// ------------------------------------------------------------------ history: scripted calls (yesterday, with transcripts)

const lookup = (verified) => ({ kind: 'tool', data: { name: 'lookup', ok: true, ms: randInt(420, 1100), verified } })
const context = (open) => ({ kind: 'tool', data: { name: 'context', ok: true, ms: randInt(380, 900), open_slots: open } })
const bookT = (slot, patient) => ({ kind: 'tool', data: { name: 'book', ok: true, ms: randInt(330, 620), slot, patient, already_booked: false } })
const bookingE = (name, slot, reason, insurance) => ({ kind: 'booking', data: { name, slot, reason, insurance } })
const messageT = () => ({ kind: 'tool', data: { name: 'message', ok: true, ms: randInt(480, 820) } })
const noteE = (name, reason, urgent = false, fyi = false) => ({ kind: 'note', data: { name, reason, urgent, fyi } })
const cancelT = (slot) => ({ kind: 'tool', data: { name: 'cancel', ok: true, ms: randInt(360, 520), slot } })
const cancelE = (name, slot) => ({ kind: 'cancel', data: { name, slot } })
const book = (name, slot, reason, insurance) => [bookT(slot, name), bookingE(name, slot, reason, insurance)]
const note = (...a) => [messageT(), noteE(...a)]

// Yesterday (day -1) is Monday the 20th: "tomorrow" is Tuesday the 21st (the demo day).
const SCRIPTS = [
  {
    id: 'h1', start: '16:08:00', caller_full: '(941) 555-0137', language: 'en', greeted_as: '', scenario: 'new_patient_consult_child_after_school', sms: 'yes',
    turns: [
      { c: "Hi, yes — um, I'm calling to set up a consultation for my son? The dentist said his bite's a little off.", k: ["A consult for your son — let's get him in!", "What's his name?"] },
      { c: 'Henry Vasquez.', k: ["So that's Henry Vasquez — and what's his date of birth?"] },
      { c: 'February tenth, 2015.', x: [lookup(false)], k: ["I don't see Henry in our system yet — is this his first visit with us?"] },
      { c: 'Yep, first time.', k: ['Nice, welcome to Harborline!', "And do you have dental insurance for Henry — who's the provider?"] },
      { c: "Aetna, through my husband's work.", k: ["Is the number you're calling from, ending in zero, one, three, seven, the best one to reach you?"] },
      { c: "Yes, that's my cell.", k: ['What days work best for Henry — mornings or afternoons — or should I just grab the soonest opening?'] },
      { c: 'Afternoons, after school if you can. Like three or later.', x: [context(2)], k: ['Let me check the schedule to see what times are available.', 'I have Thursday the twenty-third at three in the afternoon — want me to grab it?'] },
      { c: 'Thursday at three. Perfect.', x: book('Henry Vasquez', 'Thu 3:00 PM', 'consultation - dentist says his bite is off', 'Aetna'), k: ['Let me get that set up for you.', 'Perfect — Henry is booked for Thursday the twenty-third at three in the afternoon.', 'Want me to text you a confirmation at that number?'] },
      { c: 'Yes, please.', k: ['Is there anything else I can help you with?'] },
      { c: "No, that's it, thank you!", k: ['Perfect!', 'The front desk will confirm with you.', 'Take care!'] },
    ],
  },
  {
    id: 'h2', start: '16:26:00', caller_full: '(727) 555-0138', language: 'en', greeted_as: '', scenario: 'loose_bracket_picture_day_next_morning', sms: 'yes',
    turns: [
      { c: "Hi, um, so my daughter's front bracket came loose — like, it spins on the wire — and she has school pictures on Thursday, so she's kind of panicking.", k: ["Oh no, that's no fun — let me get that taken care of right now.", "Let me get you the closest appointment we have — unless this is an emergency right now, or you'd rather speak with the clinical team first?"] },
      { c: "No, no emergency. She's fine, just upset about the pictures.", x: note('unknown (booking to follow on this call)', "URGENT: Daughter's front bracket is loose and spinning on the wire, school pictures Thursday. [NOT an emergency - caller is booking the soonest visit on this call; note is informational]", true), k: ["What's your daughter's name?"] },
      { c: 'Lily Sorensen.', k: ["So that's Lily Sorensen — and what's her date of birth?"] },
      { c: 'August nineteenth, 2012.', x: [lookup(true)], k: ['Thanks — I found Lily.', "Is the number you're calling from, ending in zero, one, three, eight, the best one to reach you?"] },
      { c: "Yes, that's me.", x: [context(2)], k: ['Let me check the schedule to see what times are available.', 'The soonest I have is tomorrow, Tuesday the twenty-first, at seven forty in the morning — want me to grab it?'] },
      { c: "Seven forty — yes, before school, that's perfect.", x: book('Lily Sorensen', 'Tue 7:40 AM', 'front bracket loose, spinning on the wire', ''), k: ['Let me get that set up for you.', 'Perfect — Lily is booked for tomorrow, Tuesday the twenty-first, at seven forty in the morning.', 'Want me to text you a confirmation at that number?'] },
      { c: 'Yes, please.', k: ['Is there anything else I can help you with?'] },
      { c: "No, that's it. Thank you so much.", k: ['Perfect!', 'The front desk will confirm with you.', 'Take care!'] },
    ],
  },
  {
    id: 'h3', start: '16:47:00', caller_full: '(656) 555-0140', language: 'es', greeted_as: '', scenario: 'es_new_patient_consult_child', sms: 'yes',
    turns: [
      { c: 'Hola, buenas tardes. Eh, quería saber si pueden ver a mi hijo — el dentista dice que necesita frenos, creo.', k: ['¡Claro, con gusto le ayudo!', '¿Cómo se llama su hijo?'] },
      { c: 'Santiago Herrera.', k: ['Entonces es Santiago Herrera — ¿y cuál es su fecha de nacimiento?'] },
      { c: 'El quince de marzo del dos mil dieciséis.', x: [lookup(false)], k: ['No veo a Santiago en nuestro sistema todavía — ¿es su primera visita con nosotros?'] },
      { c: 'Sí, es la primera vez.', k: ['¡Bienvenidos a Harborline!', '¿Tiene seguro dental para Santiago? ¿Cuál es?'] },
      { c: 'Sí, Delta Dental.', k: ['¿El número del que llama, que termina en cero, uno, cuatro, cero, es el mejor para comunicarnos con usted?'] },
      { c: 'Sí, ese es mi celular.', k: ['¿Qué días le quedan mejor — mañanas o tardes — o le busco la primera cita disponible?'] },
      { c: 'Por la tarde, después de la escuela.', x: [context(2)], k: ['Déjeme revisar el horario para ver qué hay disponible.', 'Tengo el jueves veintitrés a las cuatro y veinte de la tarde — ¿se la reservo?'] },
      { c: 'Sí, perfecto.', x: book('Santiago Herrera', 'Thu 4:20 PM', 'consultation - dentist recommended braces', 'Delta Dental'), k: ['Perfecto — Santiago queda reservado para el jueves veintitrés a las cuatro y veinte de la tarde.', '¿Le mando un mensaje de texto de confirmación a ese número?'] },
      { c: 'Sí, por favor.', k: ['¿Hay algo más en que le pueda ayudar?'] },
      { c: 'No, es todo. Muchas gracias.', k: ['¡Perfecto!', 'La recepción le confirmará.', '¡Que le vaya bien!'] },
    ],
  },
  {
    id: 'h4', start: '17:15:00', caller_full: '(352) 555-0141', language: 'en', greeted_as: '', scenario: 'after_hours_insurance_preauth_note', sms: null,
    turns: [
      { c: "Hi — I know you're probably closed. Um, I got a letter from our insurance saying they need some kind of pre-authorization form from you guys before they'll cover the braces?", k: ["I can get that to the right person.", "What's the patient's name?"] },
      { c: "Avery Holt. She's my stepdaughter.", k: ["So that's Avery Holt — and what's her date of birth?"] },
      { c: 'December first, 2011.', x: [lookup(true)], k: ['Thanks — I found Avery.', 'And who am I speaking with?'] },
      { c: "This is Mark Dennison, her stepdad. I'm on the account too.", k: ["Is the number you're calling from, ending in zero, one, four, one, the best one to reach you?"] },
      { c: 'Yeah. Any time before noon is best.', x: note('Mark Dennison', 'Insurance sent a letter asking the office for a pre-authorization form before they cover treatment - please send it or call to explain. Best reached before noon on caller ID. [about patient Avery Holt]'), k: ["I've passed this to the team — they'll call you back, and I noted that mornings are best.", 'Is there anything else I can help you with?'] },
      { c: "Nope, that's it. Thanks.", k: ['Perfect!', 'Take care!'] },
    ],
  },
  {
    id: 'h5', start: '17:52:00', caller_full: '(904) 555-0142', language: 'en', greeted_as: '', scenario: 'after_hours_adult_aligner_consult', sms: 'yes',
    turns: [
      { c: "Hey, hi — I know it's after hours, I figured I'd get a voicemail. I wanted to look into clear aligners for myself.", k: ["I'm glad you called!", "Let's get you in for a consult.", "What's your name?"] },
      { c: "It's Nicole Barros.", k: ["So that's Nicole Barros — and what's your date of birth?"] },
      { c: 'January twenty-ninth, 1987.', x: [lookup(false)], k: ["I don't see Nicole in our system yet — is this your first visit with us?"] },
      { c: "Yeah, first time. Can I ask — roughly what does that run? Just so I'm not shocked.", k: ["That's a great question for the doctor — they'll go over the options and pricing with you at the consult.", "Do you have dental insurance — who's the provider?"] },
      { c: "I don't, actually. Not right now.", k: ['No problem!', "Is the number you're calling from, ending in zero, one, four, two, the best one to reach you?"] },
      { c: 'Yep.', k: ['What days work best for you — mornings or afternoons — or should I just grab the soonest opening?'] },
      { c: "Early, before work, if that's a thing.", x: [context(3)], k: ['Let me check the schedule to see what times are available.', 'I have Friday the twenty-fourth at eight in the morning — want me to grab it?'] },
      { c: 'Friday at eight works.', x: book('Nicole Barros', 'Fri 8:00 AM', 'clear aligner consultation', 'not provided'), k: ['Let me get that set up for you.', "Perfect — you're booked for Friday the twenty-fourth at eight in the morning.", 'Want me to text you a confirmation at that number?'] },
      { c: 'Sure.', k: ['Is there anything else I can help you with?'] },
      { c: "No, that's great. Thanks!", k: ['Perfect!', 'The front desk will confirm with you.', 'Take care!'] },
    ],
  },
  {
    id: 'h6', start: '18:30:00', caller_full: '(813) 555-0143', language: 'en', greeted_as: '', scenario: 'after_hours_reschedule_existing', sms: 'yes',
    turns: [
      { c: "Hi, yeah — I need to move my son's appointment on Wednesday. He's got a, uh, a district soccer thing that afternoon.", k: ['No problem — I can help with that.', "What's your son's name?"] },
      { c: 'Jayden Moss.', k: ["So that's Jayden Moss — and what's his date of birth?"] },
      { c: 'July seventh, 2010.', x: [lookup(true)], k: ['Thanks — I found Jayden.', 'I see his appointment on Wednesday the twenty-second at four in the afternoon — is that the one you want to move?'] },
      { c: "That's the one. Anything Thursday morning? Early?", x: [context(2)], k: ['Let me check the schedule to see what times are available.', 'I have Thursday the twenty-third at eight twenty in the morning — want me to grab it?'] },
      { c: "Yeah, eight twenty. I'll drop him at school after.", x: [cancelT('Wed 4:00 PM'), cancelE('Jayden Moss', 'Wed 4:00 PM'), ...book('Jayden Moss', 'Thu 8:20 AM', 'reschedule from Wed 4:00 PM', '')], k: ['Let me get that set up for you.', "Okay — Wednesday's cancelled, and Jayden is booked for Thursday the twenty-third at eight twenty in the morning.", 'Want me to text you a confirmation at that number?'] },
      { c: 'Yes, please.', k: ['Is there anything else I can help you with?'] },
      { c: "No, that's it. Thanks.", k: ['Perfect!', 'The front desk will confirm with you.', 'Take care!'] },
    ],
  },
  {
    id: 'h7', start: '19:44:00', caller_full: '(727) 555-0144', language: 'en', greeted_as: 'Grace', scenario: 'after_hours_confirm_existing_time', sms: null,
    turns: [
      { c: "Hi, sorry, I know it's late — I'm trying to remember if my adjustment is this week or next week?", k: ['Happy to check for you!', 'Can I get your date of birth just to confirm it\'s you?'] },
      { c: 'Yeah, October second, 2008.', x: [lookup(true)], k: ['Thanks, Grace.', "You're booked for Wednesday the twenty-second at four forty in the afternoon."] },
      { c: 'Oh, this week. Okay, good thing I called.', k: ['Is there anything else I can help you with?'] },
      { c: "Nope, that's it. Thank you!", k: ['Perfect!', 'See you Wednesday — take care!'] },
    ],
  },
  {
    id: 'h8', start: '20:38:00', caller_full: '(656) 555-0145', language: 'en', greeted_as: '', scenario: 'after_hours_chewed_retainer_book_and_callback', sms: 'yes',
    turns: [
      { c: 'Hi, um, this is kind of embarrassing — my daughter left her retainer out at a sleepover and the dog got it. Like, it\'s chewed.', k: ["Oh no — let's get her in so the team can take a look!", "What's your daughter's name?"] },
      { c: 'Maya Fairbanks.', k: ["So that's Maya Fairbanks — and what's her date of birth?"] },
      { c: 'April thirtieth, 2009.', x: [lookup(true)], k: ['Thanks — I found Maya.', "Is the number you're calling from, ending in zero, one, four, five, the best one to reach you?"] },
      { c: 'Yes. Should she — I mean, should she wear the chewed one until then, or no?', x: note('Maya Fairbanks', "Dog chewed daughter's retainer - parent asks whether she should keep wearing it until the visit. Please call back with guidance. [about patient Maya Fairbanks]"), k: ["That's a good one for the team — I've passed it along so someone can call you back about it.", 'What days work best for Maya — mornings or afternoons — or should I just grab the soonest opening?'] },
      { c: 'After school, if you have it.', x: [context(2)], k: ['Let me check the schedule to see what times are available.', 'I have Wednesday the twenty-second at three forty in the afternoon — want me to grab it?'] },
      { c: 'Yes, that works.', x: book('Maya Fairbanks', 'Wed 3:40 PM', 'retainer chewed by the dog - needs a replacement check', ''), k: ['Let me get that set up for you.', 'Perfect — Maya is booked for Wednesday the twenty-second at three forty in the afternoon.', 'Want me to text you a confirmation at that number?'] },
      { c: 'Sure, thanks.', k: ['Is there anything else I can help you with?'] },
      { c: "No, that's it. Thank you!", k: ['Perfect!', 'The front desk will confirm with you.', 'Take care!'] },
    ],
  },
]
// Existing appointments the scripted calls refer to (kept off the free-slot list).
const SCRIPT_EXISTING = [{ day: -1, slot: 'Wed 4:40 PM', who: 'h7 Grace' }]
// Existing appointments the scenes mention without a cancel or a tagged note.
const SCENE_EXISTING = [{ key: 's13', slot: 'Wed 10:40 AM' }]

/** Builds a scene-format object from a script (fixture timing: one `at` per turn). */
function scriptToScene(sc) {
  const events = [{ at: 0, kind: 'call.started', turn: 0, data: { caller: mask(sc.caller_full) } }, { at: 1.2, kind: 'greeting', turn: 0, data: { name: sc.greeted_as } }]
  let t = r1(randFloat(4, 6.5))
  let bookings = 0
  let notes = 0
  sc.turns.forEach((tu, i) => {
    const turn = i + 1
    events.push({ at: t, kind: 'turn.caller', turn, data: { text: tu.c } })
    for (const x of tu.x || []) {
      events.push({ at: t, kind: x.kind, turn, data: x.data })
      if (x.kind === 'booking') bookings++
      if (x.kind === 'note') notes++
    }
    for (const k of tu.k) events.push({ at: t, kind: 'turn.bot', turn, data: { text: k } })
    const next = sc.turns[i + 1]
    if (next) t = r1(t + Math.min(16, Math.max(7, 3.5 + words(tu.k.join(' ')) * 0.3 + words(next.c) * 0.3)))
  })
  const lastTurn = sc.turns.length
  const duration = r1(t + 3 + words(sc.turns[lastTurn - 1].k.join(' ')) * 0.3)
  const caller = mask(sc.caller_full)
  if (sc.sms) {
    events.push({ at: r1(duration - 0.6), kind: 'sms.out', turn: lastTurn, data: { caller, kind: 'confirmation', chars: sc.language === 'es' ? 38 : 36 } })
    if (sc.sms === 'yes') events.push({ at: r1(duration - 0.3), kind: 'sms.in', turn: lastTurn, data: { caller, kind: 'yes', chars: sc.language === 'es' ? 2 : 3 } })
  }
  const disposition = bookings ? 'phone-booked' : 'phone-no-booking'
  events.push({ at: duration, kind: 'call.ended', turn: lastTurn, data: { duration_s: duration, disposition, bookings, notes } })
  return { id: sc.id, day: -1, start: sc.start, duration_s: duration, caller: caller, caller_full: sc.caller_full, language: sc.language, greeted_as: sc.greeted_as, disposition, turns: lastTurn, first_line: sc.turns[0].c, scenario: sc.scenario, events }
}

// ------------------------------------------------------------------ history: pools

const BOYS = ['Ethan', 'Noah', 'Mason', 'Eli', 'Caleb', 'Henry', 'Wyatt', 'Leo', 'Miles', 'Jack', 'Carter', 'Grayson', 'Lucas', 'Theo', 'Owen', 'Isaac', 'Rowan', 'Felix']
const GIRLS = ['Ava', 'Amara', 'Isabella', 'Zoe', 'Brianna', 'Luna', 'Lily', 'Maya', 'Avery', 'Nora', 'Chloe', 'Sophie', 'Ellie', 'Ruby', 'Addison', 'Hazel', 'Stella', 'Piper']
const ADULTS = ['Jordan', 'Tessa', 'Kevin', 'Robert', 'Dana', 'Renee', 'Priya', 'Sam', 'Marcus', 'Nicole', 'Lauren', 'Derek', 'Monica', 'Alan', 'Kendra', 'Trevor', 'Jasmine', 'Paul', 'Erin', 'Courtney', 'Brandon', 'Heather']
const PARENTS = ['Rachel', 'Greg', 'Melissa', 'Chris', 'Angela', 'Jason', 'Stephanie', 'Mike', 'Kim', 'Dave', 'Tanya', 'Brian', 'Lisa', 'Eric']
const LAST = ['Caldwell', 'Nair', 'Whitaker', 'Castillo', 'Whitlock', 'Novak', 'Mendez', 'Moreau', 'Dunmore', 'Oduya', 'Okafor', 'Pike', 'Halvorsen', 'Calloway', 'Moreno', 'Pruitt', 'Hartwell', 'Brandt', 'Albright', 'Ellis', 'Kemper', 'Lowry', 'Brooks', 'Sorensen', 'Vasquez', 'Barros', 'Moss', 'Fairbanks', 'Holt', 'Garland', 'Petrakis', 'Huang', 'Abernathy', 'Sutton', 'Rhodes', 'Kowalski', 'Bianchi', 'Mercer', 'Tran', 'Osei', 'Whitman', 'Dalton', 'Keane', 'Ferris']
const ES_BOYS = ['Diego', 'Santiago', 'Mateo', 'Emiliano', 'Joaquín', 'Sebastián', 'Andrés']
const ES_GIRLS = ['Camila', 'Valentina', 'Sofía', 'Ximena', 'Lucía', 'Isabela', 'Renata']
const ES_ADULTS = ['Daniela', 'Mariela', 'Alejandro', 'Rosa', 'Luis', 'Gabriela', 'Jorge', 'Carmen']
const ES_LAST = ['Ortega', 'Fuentes', 'Quintero', 'Ríos', 'Herrera', 'Salazar', 'Delgado', 'Cabrera', 'Morales', 'Paredes', 'Guzmán', 'Ibarra']
const PLANS = ['Delta Dental', 'Cigna', 'MetLife', 'Aetna', 'UnitedHealthcare', 'Humana']

// who: son | daughter | kid | self | grandkid. All first lines are plain caller speech.
const LINES = {
  new_consult: {
    en: [
      ['daughter', "Hi, um, I'd like to set up a consultation for my daughter? Her dentist said she might need braces."],
      ['son', "Yeah, hi — I'm calling to make an appointment for my son. He's eleven and his teeth are kind of, uh, coming in sideways."],
      ['self', "Hi there. So I've been thinking about getting my teeth straightened, and I wanted to see about a consult."],
      ['self', 'Hello, yes, my dentist gave me your number — said I should get my bite looked at?'],
      ['kid', "Hey, so my kid's dentist sent a referral over, I think? I'm supposed to call and set up the first visit."],
      ['daughter', "Hi, uh, do you guys have anything for a new patient? My daughter's eight and her teeth are really crowded."],
      ['son', "Good morning — I'm calling to schedule an orthodontic evaluation for my son. The school dentist flagged it."],
      ['self', "Hi, um, I'm an adult — is that, like, a thing? I wanted to come in about my front teeth."],
      ['grandkid', "Hi, yes, I'd like to get my grandson in for a consultation. His mom asked me to call."],
      ['daughter', 'Yeah, hi. We just moved here and my daughter was in the middle of treatment back home, so we need a new orthodontist.'],
      ['son', "Hi, so, um, my son's two front teeth stick out a lot and kids are starting to say stuff. Can we come in?"],
      ['self', 'Hey there — I wanted to make an appointment. For me. My teeth shifted after I stopped wearing my retainer, like, years ago.'],
      ['daughter', "Hi! Okay, so, my daughter has a gap in her front teeth that's kind of getting bigger? Her dentist said to call you."],
      ['son', "Hello — um, my son's jaw clicks when he chews and the dentist wanted an orthodontist to take a look."],
    ],
    es: [
      ['daughter', 'Hola, buenas. Quería hacer una cita para mi hija, el dentista dice que necesita frenos.'],
      ['son', 'Hola, sí, eh... ¿están aceptando pacientes nuevos? Es para mi hijo, tiene diez años.'],
      ['self', 'Buenos días. Llamo para una consulta, para mí — quiero arreglarme los dientes de enfrente.'],
      ['son', 'Hola, eh, mi dentista me dio este número. Es para una evaluación de mi niño.'],
      ['daughter', 'Buenas tardes, sí... mi hija tiene los dientes de enfrente muy chuecos, ¿la pueden ver?'],
      ['son', 'Hola, perdón, ¿hablan español? Quiero una cita para mi hijo, por los frenos.'],
      ['grandkid', 'Hola, buenas. Llamo por mi nieta, su mamá trabaja y me pidió que hiciera la cita.'],
    ],
    reasons: ['consultation', 'consultation', 'crowding, teeth crowded in the front', 'overbite - dentist referral', 'spacing between front teeth', 'consultation - dentist referral', 'crossbite - dentist referral', 'front teeth stick out'],
    selfReasons: ['consultation', 'clear aligner consultation', 'teeth shifted after retainer stopped - consultation', 'bite - dentist referral'],
  },
  insurance_then_book: {
    en: [
      ['self', 'Hi, quick question — do you guys take {plan}?'],
      ['kid', 'Hey, um, before I book anything, are you in network with {plan}?'],
      ['self', "Hi there, I'm trying to find an orthodontist that takes {plan}. Is that you guys?"],
      ['son', "Yeah, hi, do you accept {plan}? It's through my husband's job. It's for my son."],
      ['son', "Hi! So my insurance just changed to {plan} and I wanted to make sure you take it before I set up my son's consult."],
      ['daughter', "Hi, um, I have {plan} through work — is that something you take? My daughter needs a consult."],
    ],
    es: [
      ['self', 'Hola, una pregunta — ¿aceptan {plan}?'],
      ['kid', 'Buenas tardes, ¿ustedes trabajan con el seguro {plan}? Es para mi niño.'],
      ['daughter', 'Hola, eh, mi hija necesita frenos y tenemos {plan}. ¿Lo aceptan?'],
    ],
  },
  reschedule: {
    en: [
      ['son', "Hi, I need to move my son's appointment — he has a field trip that day."],
      ['self', "Hey, um, I've got an adjustment this week and something came up at work. Can I switch it?"],
      ['daughter', "Hi, yes, I have to reschedule my daughter's visit. We're going to be out of town."],
      ['self', "Hi, so I have an appointment this week but my car's in the shop. Is there anything a little later?"],
      ['self', 'Yeah, hi — I need to push my appointment back a few days, I came down with something.'],
      ['son', "Hi there, I'm calling to change my son's appointment time. Mornings don't work anymore with his new school schedule."],
      ['daughter', "Hi, um, my daughter's appointment is the same day as her band concert, can we move it?"],
    ],
    es: [
      ['self', 'Hola, tengo una cita esta semana y necesito cambiarla, por favor.'],
      ['daughter', 'Buenas, eh, necesito mover la cita de mi hija, por favor.'],
    ],
  },
  urgent: {
    en: [
      ['son', "Hi, um, my son's bracket came off at lunch and it's just kind of spinning on the wire.", 'bracket came off, spinning on the wire', "Son's bracket came off at lunch, spinning on the wire."],
      ['daughter', "Hey — so my daughter's wire is poking her cheek in the back and she's pretty uncomfortable.", 'wire poking cheek - comfort visit', "Daughter's wire is poking her cheek in the back, uncomfortable."],
      ['self', "Hi, yeah, one of my brackets broke? It's a front one, so it's really obvious.", 'broken bracket on a front tooth', 'Bracket broke on a front tooth.'],
      ['son', "Hi there, my son's band on his back tooth feels loose — it moves when he chews.", 'loose band on a molar', "Son's band on a back molar is loose, moves when he chews."],
      ['daughter', "Hi, sorry, um — my daughter bit into an apple and now one of her brackets is loose.", 'loose bracket after biting an apple', "Daughter's bracket came loose after biting an apple."],
      ['self', "Hey, so the wire slipped out of the back bracket and it's kind of sticking out.", 'wire slipped out of back bracket', 'Wire slipped out of the back bracket and is sticking out.'],
    ],
    es: [
      ['son', 'Hola, eh, a mi hijo se le despegó un bracket y le está molestando.', 'bracket came off', "Son's bracket came off and is bothering him."],
      ['daughter', 'Buenas, a mi hija se le salió el alambre de atrás y le pica la mejilla.', 'wire poking cheek - comfort visit', "Daughter's back wire came out and is poking her cheek."],
    ],
  },
  retainer: {
    en: [
      ['daughter', 'Hi, um, my daughter lost her retainer. Again. At camp, this time.', 'lost retainer - replacement'],
      ['self', "Hey, so my retainer cracked and I don't know if I should keep wearing it.", 'cracked retainer - check or replace'],
      ['son', "Hi, my son's retainer doesn't fit anymore — it's really tight when he puts it in.", "retainer doesn't fit - check"],
      ['self', 'Yeah, hi — my little brother stepped on my retainer. It snapped.', 'broken retainer - replacement'],
      ['self', 'Hi, I finished braces with you guys a couple years ago and my retainer just broke in half.', 'broken retainer - replacement'],
    ],
    es: [],
  },
  sibling: {
    en: [
      ['kids', 'Hi! So I have two kids who both need to be seen — can I bring them in together?'],
      ['kids', "Hey, um, I'd like to set up consults for both my kids, back to back if you can."],
    ],
    es: [],
  },
  confirm: {
    en: [
      ['son', "Hi, I just wanted to double-check what time my son's appointment is this week?"],
      ['self', "Hey, um, quick one — is my appointment Thursday or Friday? I wrote it down wrong somewhere."],
      ['daughter', "Hi, yes, I'm calling to confirm my daughter's appointment for tomorrow."],
      ['self', 'Hi, I got a reminder but I deleted it by accident — when am I coming in?'],
      ['self', "Hi! Just making sure I'm still on the schedule for this week."],
    ],
    es: [
      ['son', 'Hola, quería confirmar la hora de la cita de mi hijo.'],
      ['self', 'Buenas, ¿me puede decir a qué hora es mi cita?'],
    ],
  },
  running_late: {
    en: [
      ['self', "Hi, I'm so sorry, I'm running about ten minutes behind — traffic on the bridge."],
      ['son', "Hey, it's — um, we have an appointment soon and we're gonna be a few minutes late, school pickup ran long."],
      ['self', "Hi, just letting you know I'm on my way but I'm running late. Like fifteen minutes."],
      ['daughter', "Hi, yeah, my daughter's appointment is coming up and we're stuck behind an accident."],
    ],
    es: [['self', 'Hola, tengo cita ahorita y voy a llegar unos minutos tarde, perdón.']],
  },
  cancel_callback: {
    en: [
      ['son', "Hi, I need to cancel my son's appointment this week. I'll have to call back to reschedule."],
      ['self', "Hey, um, I need to cancel my appointment — family thing. I'll call back once I know our schedule."],
      ['daughter', "Hi, yes, I'm calling to cancel my daughter's appointment, something came up."],
    ],
    es: [['self', 'Hola, necesito cancelar mi cita de esta semana. Luego llamo para hacer otra.']],
  },
  billing: {
    en: [
      ['kid', "Hi, I had a question about my bill — I don't think the insurance got applied?", 'Question about the latest statement - thinks insurance was not applied. Please call back. [ASKED FOR A PERSON]'],
      ['kid', "Hey, um, can I talk to someone about payment plans? We're supposed to start treatment soon.", 'Asking about payment plan options before starting treatment - please have the financial coordinator call back.'],
      ['self', 'Hi, I need an itemized receipt for my FSA. Who do I talk to about that?', 'Needs an itemized receipt for FSA reimbursement - please call back.'],
      ['kid', "Hi, is the doctor available? I had a couple questions about my daughter's treatment plan.", 'Wants to talk with the doctor about the treatment plan before starting. [ASKED FOR A PERSON]'],
      ['kid', 'Hi, yeah, our insurance changed this month and I need to give you the new info.', 'Insurance changed this month - has new member info to update on file, please call back to collect it.'],
      ['kid', "Hi, I'm calling about a letter from our insurance — they need something from your office.", 'Insurance letter asks the office for paperwork before they pay - please call back.'],
    ],
    es: [['kid', 'Hola, tengo una pregunta sobre mi factura, ¿con quién puedo hablar?', 'Spanish-speaking parent has a question about a bill - please call back. [ASKED FOR A PERSON]']],
  },
  question_no_booking: {
    en: [
      ['self', "Hi, um, do you guys take {plan}? I'm just kind of shopping around right now."],
      ['kid', 'Hey, are you in network with {plan}? I need to check with my husband before I book anything.'],
      ['self', 'Hi, what are your hours on Fridays? I can never get off work.'],
      ['kid', 'Hi, quick question — do you see kids as young as seven? My dentist mentioned it.'],
    ],
    es: [['self', 'Hola, ¿aceptan {plan}? Nada más estoy preguntando por ahora.']],
  },
  not_our_service: {
    en: [
      ['x', 'Hi, do you guys do wisdom teeth? My son needs his out.'],
      ['x', 'Hi, um, is this the dentist? I need a cleaning.'],
      ['x', 'Hey, do you guys do teeth whitening?'],
      ['x', "Hi, I'm looking for a pediatric dentist — is that you?"],
    ],
    es: [],
  },
  no_openings: {
    en: [
      ['self', "Hi, I need to move my appointment to sometime this week — my schedule's a mess."],
      ['son', "Hey, um, can I move my son's adjustment to earlier this week? He has a tournament."],
    ],
    es: [],
  },
  preference: {
    en: [
      ['son', "Hi, my son's a patient there, and I wanted to ask if his visits could be later in the day from now on?", 'Prefers late-afternoon appointments going forward - please update scheduling notes.'],
      ['self', 'Hi, I just wanted to update my phone number on file. This is the new one.', 'Update the contact number on file to the caller ID.'],
      ['daughter', "Hi, um, my daughter's going to start driving herself to appointments — can you add her cell to the account?", 'Add the patient\'s own cell to the account - parent approves. Please call back to collect the number.'],
    ],
    es: [],
  },
  hangup: {
    en: [['x', 'Oh — sorry, wrong number.'], ['x', 'Hi, is this the pharmacy? Oh. Sorry, never mind.'], ['x', "Hello? Oh, sorry — I meant to call my dentist. Bye."]],
    es: [['x', 'Ay, perdón, número equivocado.']],
  },
}

// weight, booked?, turns range, allowed outside office hours?
const ARCH = {
  new_consult: { w: 28, turns: [9, 13], after: true, es: 0.13 },
  insurance_then_book: { w: 10, turns: [9, 12], after: true, es: 0.1 },
  reschedule: { w: 10, turns: [6, 9], after: true, es: 0.1 },
  urgent: { w: 6, turns: [7, 10], after: true, es: 0.1 },
  retainer: { w: 4, turns: [7, 9], after: true, es: 0 },
  sibling: { w: 1.5, turns: [11, 14], after: true, es: 0 },
  confirm: { w: 8, turns: [3, 5], after: true, es: 0.12 },
  question_no_booking: { w: 4, turns: [3, 6], after: true, es: 0.12 },
  running_late: { w: 4.5, turns: [2, 4], after: false, es: 0.1 },
  cancel_callback: { w: 4.5, turns: [5, 7], after: true, es: 0.1 },
  billing: { w: 7, turns: [4, 7], after: true, es: 0.1 },
  not_our_service: { w: 2.5, turns: [2, 4], after: true, es: 0 },
  no_openings: { w: 2, turns: [5, 7], after: true, es: 0 },
  preference: { w: 2.5, turns: [4, 6], after: true, es: 0 },
  hangup: { w: 3, turns: [1, 1], after: true, es: 0.1 },
}

// ------------------------------------------------------------------ history: slots

// Two doctors: a 20-minute start time holds at most two visits. Today's scenes never share one.
const CHAIRS = 2
const occupied = new Map() // `${absDay}|${min}` -> [who]
const isFull = (abs, min) => (occupied.get(`${abs}|${min}`) || []).length >= CHAIRS
function occupy(abs, min, who) {
  const k = `${abs}|${min}`
  if (isFull(abs, min)) throw new Error(`double booking ${k}: ${who} vs ${occupied.get(k).join(', ')}`)
  occupied.set(k, [...(occupied.get(k) || []), who])
}

/** A free slot after the call. prefer: any | morning | afternoon | school. */
function pickSlot(callDay, callSec, { sameDay = false, prefer = 'any', soonest = false } = {}) {
  const days = []
  for (let d = sameDay ? 0 : 1; d <= 7; d++) {
    const wd = weekdayOf(callDay + d)
    if (wd >= 1 && wd <= 5) days.push(d)
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    const d = soonest ? days[Math.min(days.length - 1, Math.floor(attempt / 12))] : weighted(days.map((x) => [x, 1 / (x + 0.6)]))
    const wd = weekdayOf(callDay + d)
    let grid = []
    for (let m = 460; m <= 16 * 60 + 40; m += 20) if (slotInHours(wd, m)) grid.push(m)
    if (d === 0) grid = grid.filter((m) => m * 60 >= callSec + 45 * 60)
    const open = grid.filter((m) => !isFull(callDay + d, m))
    const liked = open.filter((m) => (prefer === 'morning' ? m < 720 : prefer === 'afternoon' ? m >= 720 : prefer === 'school' ? m >= 900 : true))
    const free = liked.length && attempt < 40 ? liked : open
    if (!free.length) continue
    const m = soonest ? free[0] : pick(free)
    return { slot: fmtSlot(wd, m), abs: callDay + d, min: m, delta: d }
  }
  throw new Error(`no free slot after day ${callDay} ${secToClock(callSec, 0)}`)
}

// ------------------------------------------------------------------ history: one call

const usedNames = new Set() // lowercase full names already on day 0 (kept off history)
function kidName(lang, who) {
  const boy = who === 'son' ? true : who === 'daughter' ? false : chance(0.5)
  for (let i = 0; i < 40; i++) {
    const n = lang === 'es' ? `${pick(boy ? ES_BOYS : ES_GIRLS)} ${pick(ES_LAST)}` : `${pick(boy ? BOYS : GIRLS)} ${pick(LAST)}`
    if (!usedNames.has(n.toLowerCase())) return n
  }
  return `${pick(boy ? BOYS : GIRLS)} ${pick(LAST)}`
}
function adultName(lang) {
  for (let i = 0; i < 40; i++) {
    const n = lang === 'es' ? `${pick(ES_ADULTS)} ${pick(ES_LAST)}` : `${pick(ADULTS)} ${pick(LAST)}`
    if (!usedNames.has(n.toLowerCase())) return n
  }
  return `${pick(ADULTS)} ${pick(LAST)}`
}
const patientFor = (lang, who) => (who === 'self' ? adultName(lang) : kidName(lang, who))
const parentOf = (lang, patient) => `${pick(lang === 'es' ? ES_ADULTS : PARENTS)} ${lastName(patient)}`

/** One history call without a transcript: the row-level facts only. */
function synthCall(day, sec, arch, callerFull, key) {
  const a = ARCH[arch]
  const open = officeOpen(day, sec)
  let lang = a.es && chance(a.es) && LINES[arch].es.length ? 'es' : 'en'
  const [who, line0, ...extra] = pick(LINES[arch][lang])
  const turns = randInt(a.turns[0], a.turns[1])
  const duration = arch === 'hangup' ? r1(randFloat(7, 19)) : r1(Math.max(28, turns * randFloat(8.4, 10.6) + randFloat(4, 9)))
  const c = { key, day, start: sec, duration, caller_full: callerFull, caller: mask(callerFull), language: lang, greeted_as: '', turns, first_line: line0, scenario: arch, events: null, bookings: [], notes: [], cancels: [], sms: [] }
  const at = (f) => r1(Math.min(duration - 1, Math.max(2, duration * f)))
  const insurance = () => (lang === 'es' ? weighted([['Medicaid', 3], ['not provided', 3], ['Delta Dental', 2], ['Cigna', 1]]) : weighted([...PLANS.map((p) => [p, 1.5]), ['not provided', 3]]))
  const greet = (patient) => {
    if (who === 'self' && chance(0.3)) c.greeted_as = firstName(patient)
  }
  switch (arch) {
    case 'new_consult': {
      const patient = patientFor(lang, who)
      const prefer = who === 'self' ? weighted([['any', 2], ['morning', 1], ['afternoon', 1]]) : weighted([['school', 3], ['any', 2], ['morning', 1]])
      const s = pickSlot(day, sec, { prefer })
      occupy(s.abs, s.min, key)
      const reason = who === 'self' ? pick(LINES.new_consult.selfReasons) : pick(LINES.new_consult.reasons)
      c.bookings.push({ at: at(0.78), name: patient, slot: s.slot, reason, insurance: insurance() })
      if (chance(0.06) && lang === 'en') c.notes.push({ at: at(0.9), name: patient, reason: `NAME CORRECTION on a booking made this call (${s.slot}): spelling of the last name corrected on the read-back. Please update the chart.`, urgent: false, fyi: false })
      break
    }
    case 'insurance_then_book': {
      const plan = weighted([...PLANS.map((p) => [p, 2]), ['Medicaid', lang === 'es' ? 3 : 0.5]])
      c.first_line = line0.replace('{plan}', plan)
      const patient = patientFor(lang, who === 'kid' ? (chance(0.5) ? 'son' : 'daughter') : who)
      const s = pickSlot(day, sec, { prefer: who === 'self' ? 'any' : 'school' })
      occupy(s.abs, s.min, key)
      c.bookings.push({ at: at(0.8), name: patient, slot: s.slot, reason: 'consultation', insurance: plan })
      if (plan === 'Medicaid' || plan === 'Humana') c.notes.push({ at: at(0.88), name: patient, reason: `Verify ${plan} coverage before the visit (${s.slot}) - caller asked whether it's in network. [about patient ${patient}]`, urgent: false, fyi: false })
      break
    }
    case 'reschedule': {
      const patient = patientFor(lang, who)
      const old = pickSlot(day, sec, { prefer: 'any' })
      // the old visit was booked earlier; it is freed by this call
      const s = pickSlot(day, sec, { prefer: 'any' })
      occupy(s.abs, s.min, key)
      c.cancels.push({ at: at(0.7), name: patient, slot: old.slot })
      c.bookings.push({ at: at(0.7), name: patient, slot: s.slot, reason: `reschedule from ${old.slot}`, insurance: '' })
      greet(patient)
      break
    }
    case 'urgent': {
      const patient = patientFor(lang, who)
      const s = open ? pickSlot(day, sec, { sameDay: true, soonest: true }) : pickSlot(day, sec, { soonest: true, prefer: 'morning' })
      occupy(s.abs, s.min, key)
      const pre = chance(0.6)
      const subject = who === 'self' ? '' : ''
      c.notes.push({ at: at(0.22), name: pre ? 'unknown (booking to follow on this call)' : patient, reason: `URGENT: ${subject}${extra[1]} [NOT an emergency - caller is booking the soonest visit on this call; note is informational]`, urgent: true, fyi: false })
      c.bookings.push({ at: at(0.72), name: patient, slot: s.slot, reason: extra[0], insurance: '' })
      greet(patient)
      break
    }
    case 'retainer': {
      const patient = patientFor(lang, who)
      const s = pickSlot(day, sec, { prefer: who === 'self' ? 'any' : 'school' })
      occupy(s.abs, s.min, key)
      c.bookings.push({ at: at(0.75), name: patient, slot: s.slot, reason: extra[0], insurance: '' })
      greet(patient)
      break
    }
    case 'sibling': {
      const last = pick(LAST)
      const k1 = `${pick(BOYS)} ${last}`
      let k2 = `${pick(GIRLS)} ${last}`
      const s1 = pickSlot(day, sec, { prefer: 'school' })
      occupy(s1.abs, s1.min, key)
      const m2 = s1.min + 20
      const wd = weekdayOf(s1.abs)
      let s2
      if (slotInHours(wd, m2) && !isFull(s1.abs, m2)) s2 = { slot: fmtSlot(wd, m2), abs: s1.abs, min: m2 }
      else s2 = pickSlot(day, sec, { prefer: 'school' })
      occupy(s2.abs, s2.min, key)
      const ins = insurance()
      c.bookings.push({ at: at(0.62), name: k1, slot: s1.slot, reason: 'consultation', insurance: ins })
      c.bookings.push({ at: at(0.8), name: k2, slot: s2.slot, reason: 'consultation', insurance: ins })
      break
    }
    case 'question_no_booking': {
      c.first_line = line0.replace('{plan}', pick(PLANS))
      break
    }
    case 'confirm': {
      if (who === 'self' && chance(0.5)) c.greeted_as = firstName(adultName(lang))
      break
    }
    case 'running_late': {
      const patient = patientFor(lang, who)
      if (who === 'self' && chance(0.5)) c.greeted_as = firstName(patient)
      const wd = weekdayOf(day)
      const appt = Math.min(Math.ceil((sec / 60 + randInt(5, 25)) / 20) * 20, wd === 5 ? 12 * 60 + 40 : 16 * 60 + 40)
      const late = randInt(2, 4) * 5
      c.notes.push({ at: at(0.4), name: patient, reason: `Running about ${late} minutes late for the ${fmtSlot(wd, appt).slice(4)} appointment today. [has existing appt ${fmtSlot(wd, appt)}] [about patient ${patient}]`, urgent: false, fyi: true })
      break
    }
    case 'cancel_callback': {
      const patient = patientFor(lang, who)
      const old = pickSlot(day, sec, { prefer: 'any' })
      c.cancels.push({ at: at(0.55), name: patient, slot: old.slot })
      c.notes.push({ at: at(0.75), name: patient, reason: `Cancelled ${old.slot} appointment - will call back to rebook. [about patient ${patient}]`, urgent: false, fyi: false })
      greet(patient)
      break
    }
    case 'billing': {
      const patient = kidName(lang, chance(0.5) ? 'son' : 'daughter')
      const caller = who === 'self' ? adultName(lang) : parentOf(lang, patient)
      c.notes.push({ at: at(0.7), name: caller, reason: `${extra[0]} [about patient ${who === 'self' ? caller : patient}]`, urgent: false, fyi: false })
      break
    }
    case 'no_openings': {
      const patient = patientFor(lang, who)
      const old = pickSlot(day, sec, { prefer: 'any' })
      c.notes.push({ at: at(0.7), name: 'unknown (name to follow if given)', reason: `Existing patient ${patient}, DOB on file: reschedule of existing appointment — no open slots in the next 7 days, call back with times [has existing appt ${old.slot}] [about patient ${patient}]`, urgent: false, fyi: false })
      break
    }
    case 'preference': {
      const patient = patientFor(lang, who)
      const caller = who === 'self' ? patient : parentOf(lang, patient)
      c.notes.push({ at: at(0.7), name: caller, reason: `${extra[0]} [about patient ${patient}]`, urgent: false, fyi: false })
      break
    }
    default:
      break
  }
  c.disposition = c.bookings.length ? 'phone-booked' : 'phone-no-booking'
  if (c.bookings.length && chance(0.74)) {
    c.sms.push({ at: r1(duration - 0.6), direction: 'out', kind: 'confirmation', chars: lang === 'es' ? 38 : 36 })
    if (chance(0.85)) c.sms.push({ at: r1(duration - 0.3), direction: 'in', kind: 'yes', chars: lang === 'es' ? 2 : 3 })
  }
  return c
}

// ------------------------------------------------------------------ history: the month

const HOURS_IN = { 7: 0.45, 8: 1.3, 9: 1.55, 10: 1.45, 11: 1.0, 12: 0.5, 13: 0.7, 14: 1.25, 15: 1.35, 16: 1.0 }
const HOURS_AFTER_WEEKDAY = { 6: 0.25, 7: 0.15, 17: 0.4, 18: 0.25, 19: 0.15, 20: 0.08, 21: 0.03 }
const HOURS_FRI_AFTER = { 6: 0.1, 13: 0.3, 14: 0.22, 15: 0.16, 16: 0.12, 17: 0.08, 18: 0.06, 19: 0.04, 20: 0.02 }
const HOURS_SAT = { 8: 0.05, 9: 0.12, 10: 0.16, 11: 0.16, 12: 0.13, 13: 0.11, 14: 0.09, 15: 0.07, 16: 0.05, 17: 0.03, 18: 0.02, 19: 0.01 }
const HOURS_SUN = { 10: 0.08, 11: 0.12, 12: 0.12, 13: 0.12, 14: 0.12, 15: 0.11, 16: 0.1, 17: 0.09, 18: 0.07, 19: 0.05, 20: 0.02 }

function drawTime(day, table, open) {
  for (let i = 0; i < 200; i++) {
    const h = +weighted(Object.entries(table))
    const sec = h * 3600 + randInt(0, 3599)
    if (open === undefined || officeOpen(day, sec) === open) return sec
  }
  throw new Error('drawTime failed')
}

function dayPlan(day) {
  const wd = weekdayOf(day)
  if (wd >= 1 && wd <= 4) return { count: randInt(26, 34), after: weighted([[1, 2], [2, 2], [3, 1]]), inTable: HOURS_IN, afterTable: HOURS_AFTER_WEEKDAY }
  if (wd === 5) return { count: randInt(14, 18), after: randInt(4, 6), inTable: HOURS_IN, afterTable: HOURS_FRI_AFTER }
  if (wd === 6) return { count: randInt(6, 9), after: Infinity, afterTable: HOURS_SAT }
  return { count: randInt(3, 5), after: Infinity, afterTable: HOURS_SUN }
}

const sceneNumbers = new Set()
function historyNumber() {
  for (let i = 0; i < 500; i++) {
    const n = `(${pick(AREA_CODES)}) 555-01${pad(randInt(0, 99))}`
    if (!sceneNumbers.has(n)) return n
  }
  throw new Error('out of caller numbers')
}

function buildHistory(scriptCalls) {
  const calls = []
  for (let day = -HISTORY_DAYS; day <= -1; day++) {
    const plan = dayPlan(day)
    const fixed = day === -1 ? scriptCalls : []
    const times = []
    const nAfter = Math.min(plan.count, plan.after === Infinity ? plan.count : plan.after) - fixed.filter((c) => !officeOpen(day, c.start)).length
    const nIn = plan.count - fixed.length - Math.max(0, nAfter)
    for (let i = 0; i < Math.max(0, nAfter); i++) times.push(drawTime(day, plan.afterTable, plan.after === Infinity ? undefined : false))
    for (let i = 0; i < nIn; i++) times.push(drawTime(day, plan.inTable, true))
    // yesterday's scripted calls are the day's last 8: keep the random ones earlier
    const cutoff = fixed.length ? Math.min(...fixed.map((c) => c.start)) - 120 : 86400
    const list = times.map((t) => Math.min(t, cutoff - randInt(60, 3000))).sort((a, b) => a - b)
    let n = 0
    let prevEnd = 0
    for (let t of list) {
      const arch0 = weighted(Object.entries(ARCH).map(([k, v]) => [k, v.w]))
      const arch = !officeOpen(day, t) && !ARCH[arch0].after ? 'new_consult' : arch0
      t = Math.max(t, prevEnd + randInt(15, 240))
      const c = synthCall(day, t, arch, historyNumber(), `h${day}-${++n}`)
      if (c.start + c.duration >= cutoff && fixed.length) continue // the random part of yesterday must end before its scripted calls
      prevEnd = c.start + c.duration
      calls.push(c)
    }
    calls.push(...fixed)
  }
  return calls
}

// ------------------------------------------------------------------ rows

function makeRows(c, nextId, withDetail) {
  const call_id = callIdFor(c.key)
  const nb = c.bookings.length
  const row = {
    call_id,
    started_at: stamp(c.day, c.start),
    ended_at: stamp(c.day, c.start + c.duration),
    duration_s: c.duration,
    caller: c.caller,
    disposition: c.disposition,
    summary: `booked=${nb} scenario=${c.scenario}`,
    bookings: nb,
    notes: c.notes.length,
    language: c.language,
    greeted_as: c.greeted_as,
    turns: c.turns,
    status: 'ended',
    first_line: c.first_line,
  }
  const out = { row, detail: null, bookings: [], notes: [], sms: [] }
  const ts = (at) => stamp(c.day, c.start + at)
  const push = (kind, id, at, d) => {
    if (kind === 'booking') out.bookings.push({ id, ts: ts(at), call_id, caller: c.caller, name: d.name, slot: d.slot, reason: d.reason, insurance: d.insurance })
    if (kind === 'note') out.notes.push({ id, ts: ts(at), call_id, caller: c.caller, name: d.name, reason: d.reason, urgent: d.urgent, fyi: d.fyi })
    if (kind === 'sms.out' || kind === 'sms.in') out.sms.push({ id, ts: ts(at), call_id, direction: kind === 'sms.out' ? 'out' : 'in', phone: c.caller, kind: d.kind, chars: d.chars ?? 0 })
  }
  if (c.events) {
    const events = c.events.map((e, i) => ({ id: nextId + i, ts: ts(e.at), kind: e.kind, turn: e.turn, data: e.data }))
    for (const e of c.events.map((e, i) => ({ ...e, id: nextId + i }))) push(e.kind, e.id, e.at, e.data)
    if (withDetail) {
      const { first_line, ...callNoFirst } = row
      out.detail = { call: callNoFirst, events }
    }
    return { ...out, nextId: nextId + c.events.length }
  }
  // No transcript: allocate the id block the real call would have used, place the row events in it.
  const items = [
    ...c.notes.map((d) => ({ kind: 'note', at: d.at, d })),
    ...c.cancels.map((d) => ({ kind: 'cancel', at: d.at, d })),
    ...c.bookings.map((d) => ({ kind: 'booking', at: d.at, d })),
    ...c.sms.map((d) => ({ kind: d.direction === 'out' ? 'sms.out' : 'sms.in', at: d.at, d })),
  ].sort((a, b) => a.at - b.at)
  const size = 3 + c.turns * 2 + items.length * 2
  let last = nextId + 1
  for (const it of items) {
    const id = Math.max(last + 1, nextId + 2 + Math.floor((it.at / c.duration) * (size - 3)))
    last = id
    push(it.kind, id, it.at, it.d)
  }
  return { ...out, nextId: Math.max(nextId + size, last + 2) }
}

// ------------------------------------------------------------------ stats

function inRange(day, sec, from, to) {
  const t = { day, sec }
  return cmpTime(t, from) >= 0 && cmpTime(t, to) <= 0
}
function statsFor(calls, days, toTime) {
  const from = { day: -(days - 1), sec: 0 }
  const sel = calls.filter((c) => inRange(c.day, c.start, from, toTime))
  const by_hour = Array.from({ length: 24 }, (_, hour) => ({ hour, calls: 0, booked: 0 }))
  const dispositions = {}
  const languages = {}
  let bookings = 0
  let callbacks = 0
  let urgent = 0
  let sms_out = 0
  let sms_in = 0
  let dur = 0
  for (const c of sel) {
    const h = Math.floor(c.start / 3600)
    by_hour[h].calls++
    if (c.disposition === 'phone-booked') by_hour[h].booked++
    dispositions[c.disposition] = (dispositions[c.disposition] || 0) + 1
    languages[c.language] = (languages[c.language] || 0) + 1
    bookings += c.bookings.length
    callbacks += c.notes.filter((n) => !n.fyi).length
    urgent += c.notes.filter((n) => n.urgent).length
    for (const s of c.sms) if (inRange(c.day, c.start + s.at, from, toTime)) s.direction === 'out' ? sms_out++ : sms_in++
    dur += c.duration
  }
  return {
    range: { from: stamp(from.day, from.sec), to: stamp(toTime.day, toTime.sec), days, tz: TZ },
    calls: sel.length,
    booked_calls: sel.filter((c) => c.disposition === 'phone-booked').length,
    bookings,
    callbacks,
    urgent,
    sms_out,
    sms_in,
    avg_duration_s: sel.length ? r1(dur / sel.length) : 0,
    by_hour,
    dispositions,
    languages,
  }
}
function dailyAggregate(calls, day) {
  const sel = calls.filter((c) => c.day === day)
  const by_hour = Array(24).fill(0)
  const by_hour_booked = Array(24).fill(0)
  const dispositions = {}
  const languages = {}
  for (const c of sel) {
    const h = Math.floor(c.start / 3600)
    by_hour[h]++
    if (c.disposition === 'phone-booked') by_hour_booked[h]++
    dispositions[c.disposition] = (dispositions[c.disposition] || 0) + 1
    languages[c.language] = (languages[c.language] || 0) + 1
  }
  return {
    day,
    weekday: WD[weekdayOf(day)],
    calls: sel.length,
    booked_calls: sel.filter((c) => c.disposition === 'phone-booked').length,
    bookings: sel.reduce((s, c) => s + c.bookings.length, 0),
    callbacks: sel.reduce((s, c) => s + c.notes.filter((n) => !n.fyi).length, 0),
    urgent: sel.reduce((s, c) => s + c.notes.filter((n) => n.urgent).length, 0),
    fyi: sel.reduce((s, c) => s + c.notes.filter((n) => n.fyi).length, 0),
    sms_out: sel.reduce((s, c) => s + c.sms.filter((x) => x.direction === 'out').length, 0),
    sms_in: sel.reduce((s, c) => s + c.sms.filter((x) => x.direction === 'in').length, 0),
    duration_sum_s: r1(sel.reduce((s, c) => s + c.duration, 0)),
    after_hours: sel.filter((c) => !officeOpen(c.day, c.start)).length,
    spanish: sel.filter((c) => c.language === 'es').length,
    by_hour,
    by_hour_booked,
    dispositions,
    languages,
  }
}

// ------------------------------------------------------------------ materialize (reference implementation, used for the self-check)

function tzOffsetMs(epochMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(epochMs))
  const g = (t) => +parts.find((p) => p.type === t).value
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(epochMs / 1000) * 1000
}
/** LocalStamp -> epoch seconds, with day 0 = the calendar date {y,m,d} in tz. */
function materializeStamp(s, day0, tz) {
  const m = STAMP_RE.exec(s)
  if (!m) throw new Error(`bad LocalStamp ${s}`)
  const date = new Date(Date.UTC(day0.y, day0.m - 1, day0.d + +m[1]))
  const wallMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + (+m[2] * 3600 + +m[3] * 60 + +m[4]) * 1000
  let off = tzOffsetMs(wallMs, tz)
  let t = wallMs - off
  const off2 = tzOffsetMs(t, tz)
  if (off2 !== off) t = wallMs - off2
  return t / 1000
}
const STAMP_KEYS = new Set(['started_at', 'ended_at', 'ts', 'from', 'to', 'boot_at', 'now', 'last_call_at'])
function materializeDeep(v, day0, tz) {
  if (Array.isArray(v)) return v.map((x) => materializeDeep(x, day0, tz))
  if (v && typeof v === 'object') {
    const o = {}
    for (const [k, x] of Object.entries(v)) o[k] = STAMP_KEYS.has(k) && typeof x === 'string' ? materializeStamp(x, day0, tz) : materializeDeep(x, day0, tz)
    return o
  }
  return v
}

// ------------------------------------------------------------------ main

function fail(errors, header) {
  console.error(`\n${header}: ${errors.length} problem(s)\n`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

function compactJson(obj) {
  // one array element per line for the big lists; readable diffs, small files
  return JSON.stringify(obj, (k, v) => v, 1).replace(/\n {3,}/g, ' ').replace(/\n {2}\}/g, ' }').replace(/\n {2}\]/g, ' ]')
}
function writeJson(file, obj) {
  const lines = ['{']
  const entries = Object.entries(obj)
  entries.forEach(([k, v], i) => {
    const comma = i < entries.length - 1 ? ',' : ''
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      lines.push(`  ${JSON.stringify(k)}: [`)
      v.forEach((x, j) => lines.push(`    ${JSON.stringify(x)}${j < v.length - 1 ? ',' : ''}`))
      lines.push(`  ]${comma}`)
    } else if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 3) {
      lines.push(`  ${JSON.stringify(k)}: {`)
      const es = Object.entries(v)
      es.forEach(([kk, vv], j) => lines.push(`    ${JSON.stringify(kk)}: ${JSON.stringify(vv)}${j < es.length - 1 ? ',' : ''}`))
      lines.push(`  }${comma}`)
    } else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`)
  })
  lines.push('}')
  fs.writeFileSync(file, lines.join('\n') + '\n')
}

function main() {
  // 1. scenes
  const { calls: sceneCalls, errors, warnings } = loadScenes()
  if (errors.length) fail(errors, `Scene validation failed (${path.relative(ROOT, SCENES_DIR) || SCENES_DIR})`)
  const live = sceneCalls.find((c) => c.key === LIVE_SCENE)
  const stream = loadLiveStream(live)
  if (stream.errs.length) fail(stream.errs, 'Live replay check failed')
  if (VALIDATE_ONLY) {
    for (const w of warnings) console.log('warning: ' + w)
    console.log(`OK: ${sceneCalls.length} scenes valid, ${LIVE_SCENE}-live.txt matches ${LIVE_SCENE}.json`)
    return
  }

  // 2. occupancy from today's scenes (bookings + the existing appointments they mention)
  for (const c of sceneCalls) {
    sceneNumbers.add(c.caller_full)
    for (const s of c.slots) occupy(s.abs, s.min, c.key)
    for (const n of visibleNames(c)) usedNames.add(n.toLowerCase())
    const existing = [...c.cancels.map((x) => x.slot), ...c.notes.flatMap((n) => [...n.reason.matchAll(/\[has existing appt ([^\]]+)\]/g)].map((m) => m[1]))]
    for (const s of SCENE_EXISTING.filter((x) => x.key === c.key)) existing.push(s.slot)
    for (const s of existing) {
      const p = parseSlot(s)
      const abs = slotDelta(0, c.start, s, true)
      if (!isFull(abs, p.min)) occupy(abs, p.min, `${c.key} existing`)
    }
  }

  // 3. yesterday's scripted calls (validated like scenes)
  const scriptErrors = []
  const scriptCalls = []
  for (const sc of SCRIPTS) {
    const scene = scriptToScene(sc)
    sceneNumbers.add(sc.caller_full)
    const r = validateCallFile(scene, `script ${sc.id}`, { kind: 'script', day: -1 })
    scriptErrors.push(...r.errors)
    if (r.call) {
      r.call.key = `y-${sc.id}`
      scriptCalls.push(r.call)
      for (const s of r.call.slots) occupy(s.abs, s.min, r.call.key)
    }
  }
  for (const x of SCRIPT_EXISTING) {
    const p = parseSlot(x.slot)
    occupy(x.day + slotDelta(x.day, 0, x.slot, false), p.min, x.who)
  }
  if (scriptErrors.length) fail(scriptErrors, 'Scripted history call validation failed')

  // 4. the month
  const history = buildHistory(scriptCalls)
  const all = [...history, ...sceneCalls].sort((a, b) => cmpTime({ day: a.day, sec: a.start }, { day: b.day, sec: b.start }))

  // 5. rows, in time order so ids grow with time like the backend's
  const detailKeys = new Set(history.filter((c) => c.day === -1).sort((a, b) => b.start - a.start).slice(0, DETAILED_HISTORY).map((c) => c.key))
  for (const k of detailKeys) if (!k.startsWith('y-')) throw new Error(`the ${DETAILED_HISTORY} most recent history calls must be the scripted ones (got ${k})`)
  let nextId = 1001
  const today = { calls: [], bookings: [], notes: [], sms: [], details: {}, caller_full: {} }
  const hist = { calls: [], bookings: [], notes: [], sms: [], details: {}, caller_full: {} }
  let liveOut = null
  const callIds = new Set()
  for (const c of all) {
    const isScene = c.day === 0
    const r = makeRows(c, nextId, isScene || detailKeys.has(c.key))
    nextId = r.nextId
    if (callIds.has(r.row.call_id)) throw new Error(`call_id collision ${r.row.call_id}`)
    callIds.add(r.row.call_id)
    c.call_id = r.row.call_id
    if (c.key === LIVE_SCENE) {
      liveOut = { call_id: r.row.call_id, scene: LIVE_SCENE, starts_at: r.row.started_at, caller_full: c.caller_full, row: r.row, detail: r.detail, bookings: r.bookings, notes: r.notes, sms: r.sms }
      continue
    }
    const tgt = isScene ? today : hist
    tgt.calls.push(r.row)
    tgt.bookings.push(...r.bookings)
    tgt.notes.push(...r.notes)
    tgt.sms.push(...r.sms)
    tgt.caller_full[r.row.call_id] = c.caller_full
    if (r.detail) tgt.details[r.row.call_id] = r.detail
  }
  for (const t of [today, hist]) {
    t.calls.sort((a, b) => cmpStamp(b.started_at, a.started_at))
    for (const k of ['bookings', 'notes', 'sms']) t[k].sort((a, b) => cmpStamp(b.ts, a.ts) || b.id - a.id)
  }

  // 6. stats, status, manifest
  const ended = all.filter((c) => c.key !== LIVE_SCENE)
  const nowT = { day: NOW.day, sec: NOW.sec }
  const liveEnd = { day: 0, sec: live.start + live.duration }
  const STAT_DAYS = [1, 2, 7, 30]
  const statsNow = Object.fromEntries(STAT_DAYS.map((d) => [d, statsFor(ended, d, nowT)]))
  const statsAfter = Object.fromEntries(STAT_DAYS.map((d) => [d, statsFor(all, d, liveEnd)]))
  const lastEnded = ended.filter((c) => c.day === 0).sort((a, b) => b.start - a.start)[0]
  const status = { ok: true, events: true, boot_at: stamp(-6, NOW.sec), now: stamp(NOW.day, NOW.sec), live_calls: 0, line: 'idle', last_call_at: stamp(0, lastEnded.start), practice: PRACTICE, model: MODEL, agent: 'Katie' }
  const daily = []
  for (let d = 0; d >= -HISTORY_DAYS; d--) daily.push(dailyAggregate(d === 0 ? ended : all, d))

  // spoken dates in the transcripts (for an optional rewrite when day 0 is not a Tuesday the 21st)
  const datePhrases = []
  for (const [cid, det] of [...Object.entries(today.details), ...Object.entries(hist.details), [liveOut.call_id, liveOut.detail]])
    for (const e of det.events) if (e.kind === 'turn.bot' || e.kind === 'turn.caller') for (const d of spokenDates(e.data.text)) datePhrases.push({ call_id: cid, event_id: e.id, phrase: d.phrase, days_from_day0: d.dom - DAY0_DOM })

  // 7. shape checks on everything (LocalStamps), then a materialized self-check
  const shapeErrs = []
  const checkSet = (t, where) => {
    t.calls.forEach((r, i) => checkShape(r, ROW_SPEC, `${where}.calls[${i}]`, shapeErrs))
    t.bookings.forEach((r, i) => checkShape(r, BOOKING_SPEC, `${where}.bookings[${i}]`, shapeErrs))
    t.notes.forEach((r, i) => checkShape(r, NOTE_SPEC, `${where}.notes[${i}]`, shapeErrs))
    t.sms.forEach((r, i) => checkShape(r, SMS_SPEC, `${where}.sms[${i}]`, shapeErrs))
    for (const [id, d] of Object.entries(t.details)) {
      checkShape(d.call, DETAIL_CALL_SPEC, `${where}.details.${id}.call`, shapeErrs)
      d.events.forEach((e, i) => {
        checkShape(e, EVENT_SPEC, `${where}.details.${id}.events[${i}]`, shapeErrs)
        checkEventData(e.kind, e.data, `${where}.details.${id}.events[${i}].data`, shapeErrs)
      })
    }
  }
  checkSet(today, 'scenes')
  checkSet(hist, 'history')
  checkSet({ calls: [liveOut.row], bookings: liveOut.bookings, notes: liveOut.notes, sms: liveOut.sms, details: { [liveOut.call_id]: liveOut.detail } }, 'live')
  for (const set of [statsNow, statsAfter])
    for (const [d, s] of Object.entries(set)) {
      checkShape(s, STATS_SPEC, `stats[${d}]`, shapeErrs)
      checkShape(s.range, RANGE_SPEC, `stats[${d}].range`, shapeErrs)
      if (s.by_hour.length !== 24) shapeErrs.push(`stats[${d}].by_hour has ${s.by_hour.length} entries`)
    }
  checkShape(status, STATUS_SPEC, 'status', shapeErrs)
  const eventIds = new Set()
  for (const t of [today, hist]) for (const k of ['bookings', 'notes', 'sms']) for (const r of t[k]) {
    if (eventIds.has(r.id)) shapeErrs.push(`duplicate event id ${r.id}`)
    eventIds.add(r.id)
  }
  if (shapeErrs.length) fail(shapeErrs.slice(0, 50), 'Output does not match the wire types')

  // materialize with two anchors (one across the November DST change) and check epochs grow with time
  for (const day0 of [{ y: 2026, m: 10, d: 20 }, { y: 2026, m: 11, d: 3 }]) {
    const rows = materializeDeep(hist.calls, day0, TZ)
    for (let i = 1; i < rows.length; i++) if (rows[i].started_at > rows[i - 1].started_at) throw new Error('materialized rows out of order')
    const s30 = materializeDeep(statsNow[30], day0, TZ)
    const mid = materializeStamp('0 00:00:00', day0, TZ)
    const hourCheck = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(mid * 1000))
    if (hourCheck !== '00') throw new Error(`materialize: local midnight came out as hour ${hourCheck}`)
    if (!(s30.range.from < s30.range.to)) throw new Error('materialized range is inverted')
  }

  // 8. write
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const streamOut = fs.readFileSync(path.join(SCENES_DIR, `${LIVE_SCENE}-live.txt`), 'utf8').replace(new RegExp(`"call_id": "${LIVE_SCENE}"`, 'g'), `"call_id": "${liveOut.call_id}"`)
  fs.writeFileSync(path.join(OUT_DIR, 'live-s36.txt'), streamOut)
  const header = (what) => ({ contract: CONTRACT, what, tz: TZ, now: stamp(NOW.day, NOW.sec) })
  writeJson(path.join(OUT_DIR, 'scenes.json'), { ...header('day 0: the 35 calls that ended before NOW, with full transcripts, plus the live showpiece (live) that the mock replays from NOW'), live: liveOut, caller_full: today.caller_full, calls: today.calls, bookings: today.bookings, notes: today.notes, sms: today.sms, details: today.details })
  writeJson(path.join(OUT_DIR, 'history.json'), { ...header(`days -1..-${HISTORY_DAYS}: rows for every call; transcripts only for the ${DETAILED_HISTORY} most recent (yesterday evening)`), detail_call_ids: Object.keys(hist.details), caller_full: hist.caller_full, calls: hist.calls, bookings: hist.bookings, notes: hist.notes, sms: hist.sms, details: hist.details })

  const counts = daily.map((d) => ({ day: d.day, weekday: d.weekday, calls: d.calls, booked_calls: d.booked_calls, bookings: d.bookings, callbacks: d.callbacks, urgent: d.urgent, sms_out: d.sms_out, sms_in: d.sms_in, after_hours: d.after_hours, spanish: d.spanish }))
  const manifest = {
    contract: CONTRACT,
    generated_by: 'scripts/demo-data.mjs',
    seed: SEED,
    tz: TZ,
    now: stamp(NOW.day, NOW.sec),
    day0_assumed: { weekday: 'Tue', day_of_month: DAY0_DOM, note: 'Transcripts speak dates as if day 0 is Tuesday the 21st; see README "Dates in the transcripts".' },
    live: { scene: LIVE_SCENE, call_id: liveOut.call_id, starts_at: liveOut.starts_at, duration_s: live.duration, events: live.events.length, stream_file: 'live-s36.txt' },
    files: { scenes: 'scenes.json', history: 'history.json', live_stream: 'live-s36.txt' },
    status,
    stats_at_now: statsNow,
    stats_after_live: statsAfter,
    counts_per_day: counts,
    daily,
    date_phrases: datePhrases,
    pools: {
      archetypes: Object.fromEntries(Object.entries(ARCH).map(([k, v]) => [k, { weight: v.w, turns: v.turns, spanish_share: v.es, first_lines_en: LINES[k].en.length, first_lines_es: LINES[k].es.length }])),
      names: { boys: BOYS, girls: GIRLS, adults: ADULTS, parents: PARENTS, surnames: LAST, es_boys: ES_BOYS, es_girls: ES_GIRLS, es_adults: ES_ADULTS, es_surnames: ES_LAST },
      insurance: [...PLANS, 'Medicaid', 'not provided', ''],
      hours: { in_office: HOURS_IN, weekday_after: HOURS_AFTER_WEEKDAY, friday_after: HOURS_FRI_AFTER, saturday: HOURS_SAT, sunday: HOURS_SUN },
      scripted_yesterday: SCRIPTS.map((s) => ({ id: s.id, start: s.start, scenario: s.scenario })),
    },
  }
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n')
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), readme(liveOut, live, statsNow, statsAfter, hist))

  // 9. report
  const d0 = daily[0]
  const y = daily[1]
  const month = statsNow[30]
  const sizes = fs.readdirSync(OUT_DIR).map((f) => [f, fs.statSync(path.join(OUT_DIR, f)).size])
  const total = sizes.reduce((s, [, n]) => s + n, 0)
  const d0Calls = sceneCalls
  const fmtHours = (arr) => arr.map((n, h) => `${h}:${n}`).filter((x) => !x.endsWith(':0')).join(' ')
  const report = []
  report.push(`NOW = day 0 ${secToClock(NOW.sec, 0)} (${TZ}); live showpiece ${LIVE_SCENE} = ${liveOut.call_id} starts at NOW, ${live.duration} s`)
  const tot = (cs) => ({
    calls: cs.length,
    booked: cs.filter((c) => c.disposition === 'phone-booked').length,
    bookings: cs.reduce((s, c) => s + c.bookings.length, 0),
    callbacks: cs.reduce((s, c) => s + c.notes.filter((n) => !n.fyi).length, 0),
    fyi: cs.reduce((s, c) => s + c.notes.filter((n) => n.fyi).length, 0),
    urgent: cs.reduce((s, c) => s + c.notes.filter((n) => n.urgent).length, 0),
    sms_out: cs.reduce((s, c) => s + c.sms.filter((x) => x.direction === 'out').length, 0),
    sms_in: cs.reduce((s, c) => s + c.sms.filter((x) => x.direction === 'in').length, 0),
    spanish: cs.filter((c) => c.language === 'es').length,
    after_hours: cs.filter((c) => !officeOpen(c.day, c.start)).length,
    avg_s: r1(cs.reduce((s, c) => s + c.duration, 0) / cs.length),
  })
  const line = (label, t) => `${label}: calls ${t.calls}, booked calls ${t.booked} (${Math.round((100 * t.booked) / t.calls)}%), bookings ${t.bookings}, callbacks ${t.callbacks} (+${t.fyi} fyi), urgent ${t.urgent}, sms out/in ${t.sms_out}/${t.sms_in}, Spanish ${t.spanish}, after-hours ${t.after_hours}, avg ${t.avg_s} s`
  const t0 = tot(d0Calls)
  const t0now = tot(d0Calls.filter((c) => c.key !== LIVE_SCENE))
  const ty = tot(history.filter((c) => c.day === -1))
  const tm = tot(all.filter((c) => c.key !== LIVE_SCENE))
  report.push(line('Day 0, all 36 (after the live call)', t0))
  report.push(line('Day 0 at NOW (35, live not started)', t0now))
  report.push(line('Yesterday (day -1)', ty))
  report.push(line('Month at NOW (30 days)', tm))
  report.push(`Day 0 by hour (start): ${fmtHours(dailyAggregate(all, 0).by_hour)}`)
  report.push(`Month by hour (start): ${fmtHours(month.by_hour.map((b) => b.calls))}`)
  report.push(`Per day: ${counts.map((c) => `${c.day}${c.weekday}:${c.calls}`).join(' ')}`)
  report.push(`Month dispositions: ${JSON.stringify(month.dispositions)} languages: ${JSON.stringify(month.languages)}`)
  report.push(`Files (${(total / 1024).toFixed(1)} KB total, limit ${MAX_OUTPUT_BYTES / 1024} KB): ${sizes.map(([f, n]) => `${f} ${(n / 1024).toFixed(1)} KB`).join(', ')}`)
  if (total > MAX_OUTPUT_BYTES) fail([`output is ${total} bytes, over ${MAX_OUTPUT_BYTES}`], 'Output too large')
  for (const w of warnings) report.push('warning: ' + w)
  console.log(report.join('\n'))

  fs.writeFileSync(DOC_PATH, demoDoc({ sceneCalls, liveOut, t0, t0now, ty, tm, daily, statsNow, statsAfter, month, counts, sizes, total, history }))
}

function cmpStamp(a, b) {
  const ma = STAMP_RE.exec(a)
  const mb = STAMP_RE.exec(b)
  const ta = +ma[1] * 86400 + +ma[2] * 3600 + +ma[3] * 60 + +ma[4]
  const tb = +mb[1] * 86400 + +mb[2] * 3600 + +mb[3] * 60 + +mb[4]
  return ta - tb
}

// ------------------------------------------------------------------ README (the contract)

function readme(liveOut, live, statsNow, statsAfter, hist) {
  return `# Demo dataset (mock=demo)

Generated by \`node scripts/demo-data.mjs\` from \`docs/demo/scenes/*.json\`. Do not edit by hand:
fix a scene and run the script again. Contract version \`${CONTRACT}\`.

| File | What it holds |
|---|---|
| \`scenes.json\` | Day 0 (the demo day): 35 calls that ended before NOW, with rows, bookings, notes, sms and the full transcript of every one. \`live\` holds the 36th call, the showpiece, which starts at NOW. |
| \`history.json\` | Days -1 to -${HISTORY_DAYS}: a row for every call plus its bookings, notes and sms. Transcripts (\`details\`) only for the ${DETAILED_HISTORY} most recent calls (yesterday evening): \`detail_call_ids\`. |
| \`live-s36.txt\` | The SSE replay of the showpiece, same framing as \`fixtures/stream-sample.txt\` (\`event:\` + \`data:\` blocks). \`call_id\` is \`${liveOut.call_id}\`; \`ts\` is seconds after the call started. |
| \`manifest.json\` | NOW, tz, \`status\`, precomputed \`stats_at_now\` and \`stats_after_live\` for days 1, 2, 7, 30, \`daily\` aggregates for each of the 30 days, \`counts_per_day\`, \`date_phrases\`, and the pools the history was drawn from. |

## Time: LocalStamps, never epochs

Every field that is an epoch on the wire (\`started_at\`, \`ended_at\`, \`ts\`, \`range.from\`, \`range.to\`,
\`now\`, \`boot_at\`, \`last_call_at\`) is a **LocalStamp** string in these files:

    "<day> HH:MM:SS.mmm"      e.g. "0 09:05:00.000", "-1 16:08:00.000"

\`day\` is the offset in calendar days from day 0; the clock is the practice's wall clock in \`${TZ}\`.
At load the mock picks **day 0 = today's date in ${TZ}** and converts every LocalStamp to UNIX seconds:
the date is day 0's calendar date plus \`day\` days (calendar arithmetic, not 86400 s steps), and the wall
time is resolved in ${TZ} (DST-safe). Reference implementation (the script self-checks it across the
November DST change):

\`\`\`ts
function tzOffsetMs(epochMs: number, tz: string): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(epochMs))
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value)
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(epochMs / 1000) * 1000
}
/** day0 = today's calendar date in tz, e.g. { y: 2026, m: 10, d: 21 } */
export function stampToEpoch(s: string, day0: { y: number; m: number; d: number }, tz = '${TZ}'): number {
  const m = /^(-?\\d+) (\\d{2}):(\\d{2}):(\\d{2}(?:\\.\\d+)?)$/.exec(s)!
  const date = new Date(Date.UTC(day0.y, day0.m - 1, day0.d + Number(m[1])))
  const wall = date.getTime() + (Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4])) * 1000
  const off = tzOffsetMs(wall, tz)
  let t = wall - off
  const off2 = tzOffsetMs(t, tz)
  if (off2 !== off) t = wall - off2
  return t / 1000
}
\`\`\`

Convert recursively: any key in {started_at, ended_at, ts, from, to, now, boot_at, last_call_at} whose
value is a string. Nothing else in the files is a time.

**The mock clock.** NOW is \`${stamp(NOW.day, NOW.sec)}\` (day 0, 21:10). Pin the clock to NOW's epoch at load
(\`setClockTo\`), exactly as \`installMock()\` pins it to the fixtures' \`now\` today, and let it run.
The demo therefore always shows today's date at 9:10 PM, with the whole day done and the line idle.

## The live showpiece

\`live\` in scenes.json is the showpiece (${LIVE_SCENE}, ${live.duration} s, ${live.events.length} events, a new
patient on Delta Dental booked for Thu 10:00 AM, confirmation text and a "yes" reply). Its row, booking
and sms are **not** in \`calls\` / \`bookings\` / \`sms\`: they do not exist before NOW.

- On the first stream connection, replay \`live-s36.txt\` with the existing replay machinery: every
  emitted event gets the mock time it went out as its \`ts\`. For the delays use the gaps between
  consecutive \`ts\` values (the real pacing of the call, about 2 minutes), or the same gaps scaled
  (x0.5 reads well on a sales call). Do not use the fixed 2 s gap: the turns would run too fast to read.
- While it runs, the existing rules apply: /status \`line: "on-call"\`, \`live_calls: 1\`,
  \`last_call_at\` = its start; its /calls row \`status: "live"\`, \`disposition: "live"\`,
  \`ended_at: null\`, \`duration_s: null\`, counts so far; /calls/${liveOut.call_id} returns the events
  emitted so far. Booking, note and sms rows appear on /bookings, /notes, /sms as their events are emitted
  (take them from \`live.bookings\` / \`live.sms\` by id, with the replay's \`ts\`).
- After \`call.ended\`: the row is \`live.row\` with the replay's times; stats switch to
  \`stats_after_live\` (or recompute: add the live call to day 0).
- Optional: loop the showpiece (reset on a "replay" action) for back-to-back sales calls.

## Endpoints for mock=demo

Merge \`scenes\` and \`history\` lists once at load (after materializing):

- **GET /status** → \`manifest.status\` with \`now\` = the mock clock; during the replay the live rules above.
  \`last_call_at\` is the start of the most recent call (s35, 20:55) until the showpiece starts.
- **GET /stats?days=N** → \`manifest.stats_at_now[N]\` for N in 1, 2, 7, 30 (\`range.to\` = the mock clock).
  After the live call ends use \`stats_after_live[N]\`. Any other N (clamped 1..30): sum the first N
  entries of \`manifest.daily\` (day 0 first; \`avg_duration_s\` = sum(duration_sum_s) / sum(calls),
  1 decimal; \`by_hour\` from \`by_hour\` / \`by_hour_booked\`; \`range.from\` = local midnight N-1 days
  back). \`callbacks\` = notes that are not fyi; \`booked_calls\` = calls with disposition phone-booked.
- **GET /calls?limit=L&before=T** → all rows (day 0 + history), newest \`started_at\` first,
  \`started_at < before\` when given, first L (default 50). Paging with \`before\` = the last row's
  \`started_at\` walks the whole month (${hist.calls.length + 35} rows at NOW).
- **GET /calls/:id** → \`scenes.details[id]\` or \`history.details[id]\` (the ${DETAILED_HISTORY} in
  \`detail_call_ids\`), or the live call's events emitted so far. **404** \`{"detail": "call not found"}\`
  for every other history call (the real API has no transcript for them in this demo), for unknown ids,
  and for the live call before its replay starts.
- **GET /bookings?limit=L**, **/notes?limit=L**, **/sms?limit=L** → merged, newest \`ts\` first, first L.
- **reveal=1** → swap \`caller\` / \`phone\` for the full number: \`caller_full[call_id]\` in each file
  (\`live.caller_full\` for the showpiece). Every number is 555-01XX, the reserved fictional range, so the
  existing "*** → 555" unmask gives the same answer.

## Dates in the transcripts

Katie speaks dates ("Thursday the twenty-third", "jueves veintitrés") as if day 0 is **Tuesday the 21st**;
slot strings ("Thu 9:00 AM") are weekday names only. On any other date the spoken day-of-month is off.
\`manifest.date_phrases\` lists every spoken date with its event id and \`days_from_day0\`, so the mock can
rewrite the number words for the real calendar if wanted. History weekday shapes (busy Mon-Thu, short
Friday, quiet weekend) are laid out for a Tuesday day 0 too.

## Shapes

Rows, events, bookings, notes, sms, stats and status match \`src/api/types.ts\` field for field (the script
checks them). \`details[id].call\` has every row field except \`first_line\`, like the fixtures. Booking,
note and sms \`id\`s are the ids of their events; ids grow with time across the month.
`
}

// ------------------------------------------------------------------ DEMO-DATA.md

const SCENE_GIST = {
  s01: 'Mom books a first consult for her son, dentist referral',
  s02: 'Known patient, wire poking her cheek: urgent note, seen today',
  s03: 'Spanish: mom books a consult for her 14-year-old daughter',
  s04: '"Do you take Delta Dental?" then an adult aligner consult',
  s05: 'Dad moves his son from Wed 3:20 PM (band practice)',
  s06: 'Mom asks for Dr. Reyes about a possible expander: message taken',
  s07: 'Patient cracked her retainer: check booked, no care advice given',
  s08: 'Dad asks about payment plans: no amounts, billing callback note',
  s09: 'Mom books two kids back to back, Cigna',
  s10: "Son's bracket off at breakfast: urgent note, seen today",
  s11: 'Dentist referral, new adult on Cigna',
  s12: 'Asks about cleanings and whitening: ortho only, no note',
  s13: 'Known patient lost his sticky note: Katie reads back tomorrow 10:40 AM',
  s14: 'Spanish: existing patient moves Thu 8:40 AM to Friday',
  s15: '"Are you in network with MetLife?" then a first consult',
  s16: 'Asks what aligners cost: no price, doctor covers it at the consult',
  s17: 'Daughter stepped on her retainer: after-school visit',
  s18: 'Lunch hour: possible double charge, billing callback',
  s19: 'New adult consult, gives the birth date in two goes',
  s20: "Son's molar band loose: urgent note, seen today",
  s21: 'Known patient 15 minutes late for her 1:40: FYI note',
  s22: "Mom cancels Thursday 2:20 PM, will call back to rebook",
  s23: 'Spanish: dad asks about Medicaid, son booked, coverage-check note',
  s24: 'Aetna question, adult consult, no price quoted',
  s25: 'Grandmother books her granddaughter, unsure of the birth date',
  s26: 'Wants to move Monday 10:00 AM: no openings, callback note',
  s27: '"Open Saturdays?" Katie gives the hours, adult consult booked',
  s28: '16-year-old books her own consult, mom\'s number on the note',
  s29: 'Adult Invisalign consult, name corrected at the read-back',
  s30: 'Parent wants early mornings from now on: scheduler note',
  s31: '"Do you take Humana?" son booked, coverage-check note',
  s32: 'Bracket off at lunch: urgent note, first thing tomorrow, plus a care-question callback',
  s33: 'After hours: mom books a consult for her daughter',
  s34: 'After hours, Spanish: existing patient moves Mon 3:20 PM',
  s35: 'After hours: wire poking his cheek, urgent note, first thing tomorrow',
  s36: 'LIVE SHOWPIECE: Delta Dental question, 13-year-old new patient, text confirmed',
}

function demoDoc({ sceneCalls, liveOut, t0, t0now, ty, tm, daily, statsNow, month, counts, sizes, total, history }) {
  const hc = history.length
  const hb = history.filter((c) => c.disposition === 'phone-booked').length
  const hh = history.filter((c) => c.scenario === 'hangup').length
  const histDays = daily.filter((d) => d.day < 0)
  const perDay = (k) => r1(histDays.reduce((s, d) => s + d[k], 0) / histDays.length)
  const esc = (s) => String(s).replace(/\|/g, '\\|')
  const outcome = (c) => {
    const parts = []
    if (c.bookings.length) parts.push(`Booked ${c.bookings.map((b) => `${b.name} ${b.slot}`).join(' + ')}`)
    else parts.push('No booking')
    if (c.cancels.length) parts.push(`cancelled ${c.cancels.map((x) => x.slot).join(', ')}`)
    const u = c.notes.filter((n) => n.urgent).length
    const f = c.notes.filter((n) => n.fyi).length
    const cb = c.notes.length - u - f
    if (u) parts.push(`${u} urgent note`)
    if (cb) parts.push(`${cb} callback note${cb > 1 ? 's' : ''}`)
    if (f) parts.push('FYI note')
    const out = c.sms.find((s) => s.direction === 'out')
    const inn = c.sms.find((s) => s.direction === 'in')
    if (out) parts.push(inn ? 'text sent, replied yes' : 'text sent, no reply')
    return parts.join('; ')
  }
  const rows = sceneCalls.map((c) => `| ${c.key} | ${secToClock(c.start, 0).slice(0, 5)}${officeOpen(0, c.start) ? '' : ' (after hours)'} | ${c.caller} | ${c.language === 'es' ? 'Spanish' : 'English'}${c.greeted_as ? `, greeted as ${c.greeted_as}` : ''} | ${c.disposition === 'phone-booked' ? 'Booked' : 'No booking'} | ${esc(SCENE_GIST[c.key] || c.scenario)}. ${esc(outcome(c))}. |`)
  const tline = (t) => `| ${t.calls} | ${t.booked} (${Math.round((100 * t.booked) / t.calls)}%) | ${t.bookings} | ${t.callbacks} | ${t.urgent} | ${t.fyi} | ${t.sms_out} / ${t.sms_in} | ${t.spanish} | ${t.after_hours} | ${t.avg_s} s |`
  const hourRow = (arr) => arr.map((n, h) => (h >= 6 && h <= 22 ? n : null)).filter((x) => x !== null).join(' | ')
  const d0hours = dailyAggregate(sceneCalls, 0).by_hour
  const weekdayAvg = (w) => {
    const ds = daily.filter((d) => d.day < 0 && d.weekday === w)
    return ds.length ? `${Math.min(...ds.map((d) => d.calls))}-${Math.max(...ds.map((d) => d.calls))} (avg ${r1(ds.reduce((s, d) => s + d.calls, 0) / ds.length)})` : '-'
  }
  return `# Demo dataset: Harborline Orthodontics (fictional)

What the Katie dashboard shows in \`mock=demo\`: one full demo day (36 calls, the last one replayed live),
29 days of history behind it, and the stats a two-doctor orthodontic office would see. Built by
\`node scripts/demo-data.mjs\` into \`src/mock/demo/\`; the wiring contract for the mock is
\`src/mock/demo/README.md\`. Every person, number and practice is invented; all phone numbers are in the
reserved 555-0100..0199 range.

## The demo day at a glance

Day 0 is the day on screen. The mock pins its clock to **9:10 PM** that day: 35 calls are done, and the
36th (${LIVE_SCENE}, the showpiece) starts live on screen when the dashboard opens.
Spoken dates assume day 0 is Tuesday the 21st.

| # | Time | Caller | Language | Outcome | What happened |
|---|---|---|---|---|---|
${rows.join('\n')}

## The numbers

| | Calls | Booked calls | Bookings | Callbacks | Urgent | FYI | Texts out / in | Spanish | After hours | Avg length |
|---|---|---|---|---|---|---|---|---|---|---|
| Day 0 at 9:10 PM (before the live call) ${tline(t0now)}
| Day 0 after the live call ${tline(t0)}
| Yesterday ${tline(ty)}
| Last 30 days (at 9:10 PM) ${tline(tm)}

"Callbacks" are desk notes the team has to act on (every note that is not FYI); urgent notes are included
in them. "After hours" means outside 7:30 AM-5:00 PM Mon-Fri, and all weekend.

Calls by starting hour, 6 AM to 10 PM:

| Hour | ${Array.from({ length: 17 }, (_, i) => i + 6).join(' | ')} |
|---|${Array(17).fill('---').join('|')}|
| Day 0 | ${hourRow(d0hours)} |
| 30 days | ${hourRow(month.by_hour.map((b) => b.calls))} |

Month dispositions: ${Object.entries(month.dispositions).map(([k, v]) => `${k} ${v}`).join(', ')}. Languages: ${Object.entries(month.languages).map(([k, v]) => `${k} ${v}`).join(', ')}.

**Does it read like a real office?** Day 0 is a busy Tuesday: ${t0.calls} calls against a usual ${weekdayAvg('Tue')} on
Tuesdays, which suits the day a demo shows. ${Math.round((100 * t0.booked) / t0.calls)}% of today's calls booked, against
${Math.round((100 * tm.booked) / tm.calls)}% for the month: the scene writers leaned toward bookings (only ${t0.calls - t0.booked}
of 36 calls end without one), so the demo day is a strong day rather than an average one, and the month
underneath is the realistic baseline. The rest reads true to a two-doctor practice: new-patient consults
are the biggest share, then reschedules, insurance questions, broken brackets and wires, retainer trouble,
billing questions and people running late; a handful of after-hours calls every weekday evening, a short
Friday, a quiet weekend, and roughly one call in ten in Spanish. Day 0 is also heavy on desk work:
${t0.callbacks} callbacks and ${t0.urgent} urgent notes, against a history average of ${perDay('callbacks')} callbacks and
${perDay('urgent')} urgent notes a day. That is deliberate (the scenes show every kind of note Katie files) and
fine for a demo, but it is the day's one number a practice manager might call high.

**Dates.** The transcripts speak dates as if day 0 is Tuesday the 21st ("Thursday the twenty-third"), and
the history's weekday shape assumes a Tuesday too. The mock anchors day 0 to the real date, so on any
other day the spoken day-of-month is off (on Wednesday, October 21, 2026, "Thursday the twenty-third" is
really a Friday). \`manifest.date_phrases\` lists every spoken date so the mock can rewrite them;
see the README.

## History (days -1 to -${HISTORY_DAYS})

- Weekday profile: Mon ${weekdayAvg('Mon')}, Tue ${weekdayAvg('Tue')}, Wed ${weekdayAvg('Wed')}, Thu ${weekdayAvg('Thu')}, Fri ${weekdayAvg('Fri')}, Sat ${weekdayAvg('Sat')}, Sun ${weekdayAvg('Sun')} calls.
- Time of day: morning peak 8-11, lunch dip at 12, afternoon peak 2-4, a tail of after-hours calls until about 9 PM.
- Mix, by weight: ${Object.entries(ARCH).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v.w}`).join(', ')}. ${Math.round((100 * hb) / hc)}% of history calls book.
  Confirmation texts go out at hangup on about three in four booked calls; most get a "yes" back.
- No \`unknown-crash\` calls. A real month on this line could have one, but the dashboard's crash chip is
  already covered by the fixtures, and a "crashed" call in a sales demo costs more than it teaches.
  Instead about ${Math.round((100 * hh) / hc)}% of history calls are hang-ups and wrong numbers (one caller turn, under 20 s), as a real line has.
- Rows only: history calls have rows, bookings, notes and texts but no transcripts (the drawer gets a 404),
  except the **${DETAILED_HISTORY} most recent**, yesterday from 4 PM on, which were written as full calls:
  a consult after school, a loose front bracket before picture day (urgent, booked for 7:40 the next
  morning), a Spanish consult, an after-hours insurance pre-authorization question (callback note), an
  after-hours adult aligner consult (no price quoted), an after-hours reschedule, a known patient checking
  her time, and a dog-chewed retainer (booked, plus a callback for the care question).
- First lines are written per call type (none copied from today's scenes); names, slots, reasons and
  insurance plans are drawn from the scenes and recombined. Booked slots never collide with each other or
  with any appointment the scenes mention.

Per day: ${counts.map((c) => `${c.day} ${c.weekday} ${c.calls}`).join(', ')}.

## The live showpiece

${LIVE_SCENE} (\`${liveOut.call_id}\`) starts at 9:10 PM, the moment the demo opens: a mom calls late about braces for
her 13-year-old, asks first whether the office takes Delta Dental ("Yep, we do take Delta Dental!"),
and Katie books Ellie Navarro, a new patient referred by her dentist, for Thursday the 23rd at 10:00 AM,
reads the spelling back and asks before texting; at hangup the confirmation text goes out and the "yes"
comes back. 130 seconds,
${liveOut.detail.events.length} events. The replay file is \`src/mock/demo/live-s36.txt\`.

## Output

${sizes.map(([f, n]) => `- \`src/mock/demo/${f}\`: ${(n / 1024).toFixed(1)} KB`).join('\n')}
- Total ${(total / 1024).toFixed(1)} KB (limit 1,536 KB).

## Fixes made to scene files

The script validates every scene before it builds anything (shape, timing, counts, office hours, the
20-minute slot grid, spoken dates and times against the slots, texting consent, no prices, one booking
call per patient, no near-duplicate or shared names across unrelated callers). These scene files failed
as delivered and were fixed by hand, changing as little as possible:

${SCENE_FIXES.map(([id, what, why]) => `- **${id}**: ${what}. Why: ${why}.`).join('\n')}

Writer choices kept as they are (they pass): texts go out a fraction of a second before \`call.ended\`
instead of after it; \`sms.out\` chars are 36 in most scenes and about 90 in s33, s34 and s36; several
writers made Katie read back the caller's real last four digits rather than the fixtures' fixed
"zero, one, eight, eight".
`
}

main()
