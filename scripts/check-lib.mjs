// Self-check for src/lib (formatters, text cleaning, chips, Katie helpers, transcript) and every
// Katie sentence template on the fixtures (DESIGN 7.6): src/pages/overview/say.ts,
// src/pages/lists/sentences.ts, src/pages/calls/sentence.ts.
// Run:  TZ=UTC node scripts/check-lib.mjs     (Node >= 22.15; type stripping loads the .ts files)
// The TZ=UTC run proves times render in the practice tz, not the machine's.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

// The page modules import the way Vite resolves ('../../lib', '../../lib/chips'): add the .ts or
// /index.ts Node needs, for relative imports inside src/ only.
const SRC = new URL('../src/', import.meta.url).href
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (err) {
      if (!specifier.startsWith('.') || !context.parentURL?.startsWith(SRC)) throw err
      for (const suffix of ['.ts', '.tsx', '/index.ts']) {
        try {
          return next(specifier + suffix, context)
        } catch {
          // try the next form
        }
      }
      throw err
    }
  },
})

const root = new URL('../', import.meta.url)
const lib = (f) => import(new URL(`src/lib/${f}`, root).href)
const fx = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(`src/mock/fixtures/${f}`, root)), 'utf8'))

const time = await lib('time.ts')
const text = await lib('text.ts')
const chips = await lib('chips.ts')
const katie = await lib('katie.ts')
const transcript = await lib('transcript.ts')

let n = 0
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg)
  n++
}
// a check that names an open defect: printed and fails the run at the end, without stopping it
const softFails = []
const soft = (ok, msg) => {
  if (ok) n++
  else softFails.push(msg)
}
const NY = 'America/New_York'
const stats = fx('stats.json')
const status = fx('status.json')
const notes = fx('notes.json').notes
const calls = fx('calls.json').calls
const now = status.now

// ---- durations (conflict 14)
eq(time.formatDuration(54.5), '0:55', '54.5 -> 0:55')
eq(time.formatDuration(123), '2:03')
eq(time.formatDuration(142.4), '2:22')
eq(time.formatDuration(3600), '1:00:00')
eq(time.formatDuration(3725.6), '1:02:06')
eq(time.formatDuration(null), '')
eq(time.formatDuration(0), '0:00')

// ---- clock in the practice tz, whatever the machine tz (slop 31)
eq(time.formatClock(calls[0].started_at, NY), '5:35 PM', 'first call 5:35 PM in New York')
eq(time.formatClock(status.last_call_at, NY), '5:35 PM')
eq(time.formatClock(calls[0].started_at, 'UTC'), '9:35 PM')
eq(time.formatWhen(calls[0].started_at, NY, now), '5:35 PM')
eq(time.formatWhen(calls[0].started_at - 86400, NY, now), 'Yesterday 5:35 PM')
eq(time.formatWhen(calls[0].started_at - 2 * 86400, NY, now), 'Sat 5:35 PM')
eq(time.formatWhen(calls[0].started_at - 11 * 86400, NY, now), 'Oct 1, 5:35 PM')
eq(time.formatDayHeader(calls[0].started_at - 2 * 86400, NY, now), 'Sat, Oct 10')
eq(time.formatDayHeader(calls[0].started_at, NY, now), 'Today')
eq(time.formatDateShort(calls[0].started_at, NY), 'Mon, Oct 12')
eq(time.formatTodayLong(now, NY), 'Today, Monday, October 12')
eq(time.formatHourLabel(0), '12 AM')
eq(time.formatHourLabel(12), '12 PM')
eq(time.formatHourLabel(15), '3 PM')
eq(time.zonedMidnight(now, NY, 0), stats.range.from, 'days=1 from = local midnight')
eq(time.zonedMidnight(now, NY, 6), fx('stats-7d.json').range.from, 'days=7 from = 6 midnights back')
eq(time.zonedMidnight(Date.UTC(2026, 10, 2, 12) / 1000, NY, 1), Date.UTC(2026, 10, 1, 4) / 1000, 'DST: midnight before fall-back is EDT')
eq(time.languageName('en'), 'English')
eq(time.languageName('es'), 'Spanish')
eq(time.expandSlot('Mon 3:20 PM'), 'Monday at 3:20 PM')
eq(time.expandSlot('Thu 9:00 AM'), 'Thursday at 9:00 AM')
eq(time.expandSlot('tomorrow'), 'tomorrow')

// ---- bot sentence spacing (conflict 16)
eq(text.fixBotSpacing("right now.Let me get you"), 'right now. Let me get you')
eq(text.fixBotSpacing('with you.Take care!'), 'with you. Take care!')
eq(text.fixBotSpacing('Dr. Reyes will call'), 'Dr. Reyes will call', 'Dr. Reyes untouched')
eq(text.fixBotSpacing('the U.S. office'), 'the U.S. office', 'U.S. untouched')
eq(text.fixBotSpacing('Sure?Okay'), 'Sure? Okay')
eq(text.joinBotTexts(['Got it.', 'What is the name?Thanks']), 'Got it. What is the name? Thanks')

// ---- note reasons (conflict 17)
const reason = (id) => text.cleanReason(notes.find((x) => x.id === id).reason)
eq(reason(283), "Daughter's bracket came off this morning, needs to be seen as soon as possible.", 'URGENT + bracket stripped')
eq(reason(47), "Daughter's bracket came off.")
eq(
  reason(291),
  'Existing patient Marcus Webb, DOB on file: reschedule of existing appointment — no open slots in the next 7 days, call back with times.',
)
eq(reason(265).startsWith('Name correction on a booking made this call (Mon 3:20 PM)'), true, 'ALL-CAPS run sentence-cased')
eq(reason(29), 'Caller wants to speak directly with Dr. Reyes.', 'Dr. Reyes kept, [ASKED FOR A PERSON] dropped')
for (const note of notes) {
  const r = text.cleanReason(note.reason)
  assert.ok(!/[[\]]/.test(r) && !/^URGENT/i.test(r), `clean: ${note.id}`)
  n++
}

// ---- names, insurance, practice (conflicts 18, 25, 33)
eq(text.isUnknownName('unknown (booking to follow on this call)'), true)
eq(text.isUnknownName(''), true)
eq(text.isUnknownName('Max Delgado'), false)
eq(text.displayIdentity('unknown (name to follow if given)', '(656) ***-0150'), '(656) ***-0150')
eq(text.displayIdentity('Eli Morgan', '(813) ***-0144'), 'Eli Morgan')
eq(text.displayName('unknown (x)'), null)
eq(text.insuranceLabel('not provided'), null)
eq(text.insuranceLabel(''), null)
eq(text.insuranceLabel('Aetna'), 'Aetna')
eq(text.practiceName(status.practice), { name: 'Harborline Orthodontics', demo: true })
eq(text.smsKindLabel('in', 'yes'), 'Reply: yes')
eq(text.smsKindLabel('out', 'confirmation'), 'Confirmation')
eq(text.smsKindLabel('out', 'reminder_24h'), 'Reminder 24h')
eq(text.truncateAtWord('one two three four', 12), 'one two…')

// ---- chips (DESIGN 2.2)
eq(chips.dispositionChip('phone-booked'), { label: 'Booked', tone: 'booked' })
eq(chips.dispositionChip('phone-no-booking'), { label: 'No booking', tone: 'neutral' })
eq(chips.dispositionChip('live'), { label: 'Live', tone: 'live' })
eq(chips.dispositionChip('unknown-crash'), { label: 'Dropped', tone: 'dropped' })
eq(chips.dispositionChip('phone-transferred'), { label: 'Transferred', tone: 'neutral' })
eq(chips.callChip({ status: 'live', disposition: 'phone-booked' }).label, 'Live')
eq(chips.noteChip({ urgent: true, fyi: false }).label, 'Urgent')
eq(chips.noteChip({ urgent: false, fyi: false }).label, 'Callback')
eq(chips.noteChip({ urgent: false, fyi: true }).label, 'FYI')
const waiting = chips.waitingNotes(notes, stats.range.from)
eq(waiting.map((x) => x.id), [283, 90, 47, 291, 265, 78, 29], 'urgent first, then newest (DESIGN 6.5 order)')
eq(waiting.length, stats.callbacks, 'waiting count = stats.callbacks')
eq(chips.bookedOnThisCall(notes.find((x) => x.id === 90), calls), true, 'note 90 call booked 2')
eq(chips.bookedOnThisCall(notes.find((x) => x.id === 283), calls), false)

// ---- Katie helpers
eq(katie.countWord(0), 'no')
eq(katie.countWord(1), 'one')
eq(katie.countWord(10), 'ten')
eq(katie.countWord(11), '11')
eq(katie.count(8, 'call'), 'eight calls')
eq(katie.count(1, 'callback'), 'one callback')
eq(katie.count(0, 'note'), 'no notes')
eq(katie.katieLine('great job!'), 'Great job.')
eq(katie.katieLine(''), '')
eq(katie.katieLine('x '.repeat(120)).length <= 160, true)
eq(katie.katieTargetProps(null), { 'data-katie': '', tabIndex: 0 })

// ---- transcript (6.8): turn grouping, notes, row duration
const detail = fx('call-CA294650154870.json')
const items = transcript.buildTranscript(detail.events, calls[0], NY)
eq(items[0], { type: 'note', key: items[0].key, text: 'Call started 5:35 PM', turn: 0 })
const katieBlocks = items.filter((i) => i.type === 'katie')
eq(katieBlocks.length, 5, 'one Katie block per bot turn')
eq(
  katieBlocks[0].text,
  "Oh no, that's no fun — let me get that taken care of right now. Let me get you the closest appointment we have — unless this is an emergency right now, or you'd rather speak with the clinical team first?",
)
eq(items.some((i) => i.text.startsWith('Greeted as')), false, 'empty greeting hidden')
eq(items.filter((i) => i.text === 'Looked up the chart — no match').length, 1)
eq(items.some((i) => i.text === 'Checked the schedule'), true)
eq(items[items.length - 1].text, 'Call ended · 0:55 · No booking', 'row duration, not the event')
eq(items.some((i) => /\[|URGENT:|unknown \(/.test(i.text)), false, 'no annotations in transcript')
const booked = transcript.buildTranscript(fx('call-CA860072416005.json').events, calls[1], NY)
eq(booked.some((i) => i.text === 'Booked Max De Lagado for Mon 3:20 PM'), true)
eq(booked.some((i) => i.text === 'Confirmation text sent'), true)
eq(booked.some((i) => i.text === 'Caller replied yes by text'), true)

// ---- Katie's sentences on the fixtures (DESIGN 7.6; templates in src/pages/overview/say.ts,
// src/pages/lists/sentences.ts, src/pages/calls/sentence.ts). Times in the practice tz from
// stats.range.tz, so the TZ=UTC run gives the same strings.
time.setPracticeTz(stats.range.tz)
const say = await import(new URL('src/pages/overview/say.ts', root).href)
const lists = await import(new URL('src/pages/lists/sentences.ts', root).href)
const callsPage = await import(new URL('src/pages/calls/sentence.ts', root).href)
const rsn = await import(new URL('src/lib/reason.ts', root).href)
const titles = await import(new URL('src/pages/lists/titles.ts', root).href)
const sms = fx('sms.json').sms
const bookings = fx('bookings.json').bookings
const from = stats.range.from
const NBSP = '\u00a0'
// the DESIGN strings use plain spaces; katieLine ties phone numbers and AM / PM with U+00A0
const plain = (s) => s.replaceAll(NBSP, ' ')
const sentences = []
const said = (got, want, msg) => {
  sentences.push([msg, got])
  eq(plain(got), want, msg)
}
const todaySms = sms.filter((m) => m.ts >= from)
const todayCalls = calls.filter((c) => c.started_at >= from)
said(
  say.sayLine({ status, statusError: false, liveRow: undefined, todayFrom: from }),
  'The line is quiet. The last call came in at 5:35 PM.',
  'Line tile',
)
eq(say.sayLine({ status, statusError: true, liveRow: undefined, todayFrom: from }), '', 'Line tile, status error')
said(
  say.sayLine({ status: { ...status, line: 'on-call' }, statusError: false, liveRow: calls[0], todayFrom: from }),
  'I\'m on a call with (656) ***-0150. It started at 5:35 PM.',
  'Line tile, on a call',
)
said(
  say.sayLine({ status: { ...status, last_call_at: from - 60 }, statusError: false, liveRow: undefined, todayFrom: from }),
  'The line is open. No one has called yet today.',
  'Line tile, no call today',
)
said(say.sayCallsCell(stats, null), 'Eight calls answered so far today, six of them booked. The average call ran 2:03.', 'Calls cell')
said(
  say.sayCallsCell(stats, 5),
  'Eight calls answered so far today, six of them booked. The average call ran 2:03. Yesterday there were five.',
  'Calls cell, with yesterday',
)
said(
  say.sayCallsCell(stats, 5, { afterHours: 2 }),
  'Eight calls answered so far today, six of them booked. The average call ran 2:03. Two came in after hours. Yesterday there were five.',
  'Calls cell, after hours (fixtures sub-line)',
)
said(
  say.sayCallsCell(stats, null, { spanish: 4, afterHours: 2 }),
  'Eight calls answered so far today, six of them booked. The average call ran 2:03. Four were in Spanish.',
  'Calls cell, Spanish wins over after hours',
)
said(
  say.sayCallsCell({ ...stats, calls: 35, booked_calls: 26, avg_duration_s: 90.1 }, 30, { spanish: 4 }),
  '35 calls answered so far today, 26 of them booked. The average call ran 1:30. Four were in Spanish. Yesterday there were 30.',
  'Calls cell, demo day 0',
)
said(say.sayCallsCell({ ...stats, calls: 1, booked_calls: 1, avg_duration_s: 61 }, null), 'One call answered so far today, and it was booked. It ran 1:01.', 'Calls cell, one call')
eq(say.sayCallsCell({ ...stats, calls: 0 }, null), '', 'Calls cell, 0 calls')
said(say.sayBookedCell(stats), 'Six of today\'s eight calls ended in a booking, seven appointments in all.', 'Booked cell')
said(say.sayBookedCell({ ...stats, booked_calls: 0, bookings: 0 }), 'Nothing has been booked yet today.', 'Booked cell, none')
said(
  say.sayBookedCell(stats, 4),
  'Six of today\'s eight calls ended in a booking, seven appointments in all. Four patients confirmed by text.',
  'Booked cell, confirmed by text',
)
said(say.sayNewPatientCell(5), 'Five new-patient consults booked today.', 'New-patient cell')
said(say.sayNewPatientCell(1), 'One new-patient consult booked today.', 'New-patient cell, one')
said(say.sayNewPatientCell(0), 'No new-patient consults booked yet today.', 'New-patient cell, none')
said(say.sayNewPatientCell(17, 12), '17 new-patient consults booked today. Yesterday there were 12.', 'New-patient cell, yesterday')
eq(say.sayNewPatientCell(3, 0), 'Three new-patient consults booked today.', 'New-patient cell: never "Yesterday there were no"')
said(say.sayCallbacksCell(stats), 'Seven callbacks are waiting, three of them urgent.', 'Callbacks cell')
{
  // the Overview feeds the action-note count (lib/reason isActionNote), not stats.callbacks
  const action = notes.filter((x) => x.ts >= from && rsn.isActionNote(x))
  said(
    say.sayCallbacksCell({ callbacks: action.length, urgent: action.filter((x) => x.urgent).length }),
    'Four callbacks are waiting, none of them urgent.',
    'Callbacks cell, action notes (fixtures)',
  )
  said(say.sayCallbacksCell({ callbacks: 1, urgent: 1 }), 'One callback is waiting, and it is urgent.', 'Callbacks cell, one urgent')
}
said(say.sayCallbacksCell({ ...stats, urgent: 0 }), 'Seven callbacks are waiting, none of them urgent.', 'Callbacks cell, none urgent')
said(say.sayCallbacksCell({ ...stats, callbacks: 0, urgent: 0 }), 'No one is waiting on a callback.', 'Callbacks cell, 0')
said(say.sayTextsCell(stats, todaySms), 'Six confirmation texts went out today, and four people replied yes.', 'Texts cell')
said(say.sayTextsCell({ ...stats, sms_in: 0 }, todaySms), 'Six confirmation texts went out today. No replies yet.', 'Texts cell, no replies')
eq(say.sayTextsCell({ ...stats, sms_out: 0 }, todaySms), '', 'Texts cell, none out')
said(
  say.sayCallsByHour(stats.by_hour, Math.min(...todayCalls.map((c) => c.started_at))),
  'The busiest hour was 3 PM, with three calls. The first call came in at 2:40 PM.',
  'Calls by hour',
)
eq(say.sayCallsByHour([], undefined), '', 'Calls by hour, 0 calls')
said(
  say.sayLatestCalls(calls),
  'The last call came in at 5:35 PM from (656) ***-0150. Nothing was booked, and it left two notes for the desk.',
  'Latest calls',
)
said(
  say.sayLatestCalls([{ ...calls[0], status: 'live' }]),
  'A call from (656) ***-0150 is on the line now. It started at 5:35 PM.',
  'Latest calls, live',
)
eq(say.sayLatestCalls([]), '', 'Latest calls, none')
said(
  say.sayCallbacksWaiting(chips.waitingNotes(notes, from)),
  'Start with (656) ***-0150 from 5:35 PM. Daughter\'s bracket came off this morning, needs to be seen as soon as possible.',
  'Callbacks waiting',
)
const longReason = 'Needs to move the appointment because the family is travelling for two weeks and the kids have camp, and asks whether a Saturday works instead of the usual weekday slot'
const cut = say.sayCallbacksWaiting([{ ...chips.waitingNotes(notes, from)[0], reason: longReason }])
eq(cut.length <= katie.KATIE_MAX_CHARS && cut.endsWith('…'), true, 'Callbacks waiting, a long reason is cut with …')
sentences.push(['Callbacks waiting, long reason', cut])
said(
  callsPage.callsSentence({
    range: 'today',
    outcome: 'all',
    totals: { calls: stats.calls, booked: stats.booked_calls, languages: stats.languages },
    filteredCount: todayCalls.length,
  }),
  'Eight calls today, six of them booked.',
  'Calls page, Today',
)
said(
  callsPage.callsSentence({ range: '7d', outcome: 'all', totals: { calls: 23, booked: 15, languages: { en: 20, es: 3 } }, filteredCount: 23 }),
  '23 calls in the last 7 days, 15 of them booked. Three were in Spanish.',
  'Calls page, 7 days with Spanish',
)
said(
  callsPage.callsSentence({ range: 'today', outcome: 'booked', totals: null, filteredCount: 6 }),
  'Six calls ended in a booking today.',
  'Calls page, Booked filter',
)
eq(callsPage.callsSentence({ range: 'today', outcome: 'live', totals: null, filteredCount: 0 }), '', 'Calls page, Live, none')
said(
  lists.bookingsSentence(bookings, sms, from, stats),
  'Seven appointments were booked today. The latest is Max De Lagado for Monday at 3:20 PM, and the confirmation text went out.',
  'Bookings page',
)
said(
  lists.bookingsSentence(bookings, [], from, stats),
  'Seven appointments were booked today. The latest is Max De Lagado for Monday at 3:20 PM.',
  'Bookings page, no matching confirmation',
)
eq(lists.bookingsSentence([], sms, from, stats), '', 'Bookings page, empty')
said(
  lists.callbacksSentence(notes, from, stats),
  'Four callbacks are waiting, none of them urgent. Start with (656) ***-0150 from 5:36 PM.',
  'Callbacks page (action notes only)',
)
said(lists.callbacksSentence([], from, { callbacks: 0, urgent: 0 }), 'No one is waiting on a callback.', 'Callbacks page, 0')
said(
  lists.textsSentence(sms, from, stats),
  'Six confirmation texts went out today, and four people replied yes.',
  'Texts page',
)
// every sentence: at most KATIE_MAX_CHARS, no "!", no em-dash filler, capitalised, phone numbers
// and clock times unbreakable (RV-6)
for (const [msg, s] of sentences) {
  eq(s.length > 0 && s.length <= katie.KATIE_MAX_CHARS, true, `${msg}: 1..${katie.KATIE_MAX_CHARS} chars`)
  eq(/[!—]/.test(s), false, `${msg}: no ! or em dash`)
  eq(s[0] === s[0].toUpperCase(), true, `${msg}: capitalised`)
  eq(/\(\d{3}\) |\d (AM|PM)\b/.test(s), false, `${msg}: no breakable space in a phone number or a time`)
}
eq(katie.katieLine('From (656) ***-0150 at 5:35 PM.'), `From (656)${NBSP}***-0150 at 5:35${NBSP}PM.`, 'katieLine ties phone and time')
eq(katie.katieLine(`a${NBSP}${NBSP}b`), 'A b', 'katieLine collapses U+00A0 too')

// ---- why they called, names first (src/lib/reason.ts; plan P7, P10, P18)
{
  const R = rsn
  eq(R.REASON_MAX, 48)
  const byId = (id) => calls.find((c) => c.call_id === id)
  // booking reason first, with the insurance; a "consultation" is a new-patient consult
  eq(R.deriveReason(byId('CA282092447514'), bookings, notes), 'New-patient consult · Delta Dental', 'booking reason + insurance')
  eq(R.deriveReason(byId('CA616760583988'), bookings, notes), 'New-patient consult', '"not provided" insurance is dropped')
  eq(R.deriveReason(byId('CA631599125074'), bookings, notes), 'New-patient consult +1', 'two bookings on one call')
  eq(R.deriveReason(byId('CA553763107872'), bookings, notes), 'Crowding, teeth all crowded together in the…', 'a long booking reason is cut at a word')
  // then the note reason, cleaned (no "URGENT:", no [annotation], no "Existing patient X, DOB on file:")
  eq(R.deriveReason(byId('CA294650154870'), bookings, notes), 'Reschedule of existing appointment', 'note reason, prefix dropped')
  eq(R.deriveReason(byId('CA987474854629'), [], notes), 'Caller wants to speak directly with Dr. Reyes', '"Dr." is not a clause break')
  eq(R.deriveReason(byId('CA860072416005'), [], notes), 'Name correction on the booking', 'name-correction note')
  // then the caller's first line without the filler in front; never the raw first utterance
  eq(R.deriveReason(byId('CA860072416005'), [], []), 'Do you take Edna?', '"Um yeah," dropped, the question kept')
  eq(R.deriveReason(byId('CA416354869074'), [], []), "My daughter's bracket came off", 'first sentence only')
  eq(R.deriveReason({ call_id: 'x', first_line: '', status: 'live' }, [], []), 'In progress', 'a live call with nothing yet')
  eq(R.cleanFirstLine('Hi, um, yeah. Quick question, do you take Delta Dental? Thanks'), 'Do you take Delta Dental?')
  for (const c of calls) {
    for (const got of [R.deriveReason(c, bookings, notes), R.deriveReason(c, [], notes), R.deriveReason(c, [], [])]) {
      eq(got.length > 0 && got.length <= R.REASON_MAX, true, `${c.call_id}: reason 1..48 chars`)
      eq(/\[|URGENT:|unknown \(|scenario=/.test(got), false, `${c.call_id}: no annotation in the reason`)
      eq(/^(hi|um|uh|yeah|so)\b/i.test(got), false, `${c.call_id}: no filler in front`)
    }
  }
  // names: a name correction made on the call (D6: one spelling per patient on a screen), then the
  // booking's, then a note's real name, then the greeting; never "unknown (...)"
  eq(R.callName(byId('CA860072416005'), bookings, notes), 'Max Delgado', 'the corrected name wins')
  eq(R.callName(byId('CA860072416005'), bookings, []), 'Max De Lagado', 'booking name')
  eq(R.correctedName("NAME CORRECTION on a booking made this call (Thu 9:40 AM): booked as 'Renee Shimanski', now 'Renee Szymanski'. Please update the chart."), 'Renee Szymanski', 'correctedName')
  eq(R.correctedName('Parent asks to call back now.'), undefined, 'correctedName: not a correction')
  // the Bookings list spells a corrected patient like every other page (review 2026-10-21)
  {
    const fix = { call_id: 'C1', reason: "NAME CORRECTION on a booking made this call (Thu 9:40 AM): booked as 'Renee Shimanski', now 'Renee Szymanski'. Please update the chart.", urgent: false, fyi: false }
    const bs = [{ id: 1, call_id: 'C1', name: 'Renee Shimanski' }, { id: 2, call_id: 'C2', name: 'Renee Shimanski' }]
    eq(R.withCorrectedNames(bs, [fix]).map((b) => b.name), ['Renee Szymanski', 'Renee Shimanski'], 'withCorrectedNames: only the call the note belongs to')
    const sib = [{ id: 3, call_id: 'C1', name: 'Ava Mendez' }, { id: 4, call_id: 'C1', name: 'Renee Shimanski' }]
    eq(R.withCorrectedNames(sib, [fix]).map((b) => b.name), ['Ava Mendez', 'Renee Szymanski'], 'withCorrectedNames: the booking it names, not its sibling')
    const vague = { ...fix, reason: "NAME CORRECTION on a booking made this call: now 'Max Delgado'." }
    eq(R.withCorrectedNames([{ id: 5, call_id: 'C1', name: 'Max De Lagado' }], [vague])[0].name, 'Max Delgado', 'withCorrectedNames: no "booked as", one booking')
    eq(R.withCorrectedNames(sib, [vague]).map((b) => b.name), ['Ava Mendez', 'Renee Shimanski'], 'withCorrectedNames: no "booked as", two bookings: unchanged')
    eq(R.withCorrectedNames(bs, undefined), bs, 'withCorrectedNames: no notes')
  }
  eq(R.cleanNoteText('Existing patient Elijah Moreno, DOB on file: parent asks that future appointments be after 3 [x]'), 'Parent asks that future appointments be after 3.', 'cleanNoteText drops the lead-in (D5)')
  eq(R.cleanNoteText('URGENT: Wire poking. [NOT an emergency]'), 'Wire poking.', 'cleanNoteText = cleanReason otherwise')
  eq(R.cleanNoteText('New patient booked Thu 11:00 AM - parent asked about Medicaid.'), 'New patient booked Thu 11:00 AM - parent asked about Medicaid.', 'cleanNoteText: a clock colon is not the lead-in')
  eq(R.callName(byId('CA987474854629'), [], notes), 'Eli Morgan', 'note name')
  eq(R.callName(byId('CA294650154870'), bookings, notes), undefined, 'unknown names are no name')
  eq(R.displayName({ name: 'Ana Ruiz', caller: '(656) ***-0150' }), { primary: 'Ana Ruiz', secondary: '(656) ***-0150' }, 'name first, number second')
  eq(R.displayName({ name: 'unknown (name to follow if given)', caller: '(656) ***-0150' }), { primary: '(656) ***-0150' }, 'no name: the number is primary')
  eq(R.displayName({ caller: '(656) ***-0150' }), { primary: '(656) ***-0150' }, 'missing name: the number')
  eq(R.displayName({ name: '  ', caller: '(656) ***-0150' }).primary, '(656) ***-0150', 'blank name: the number')
  // new patients: the API flag wins, else /consult/i
  eq(bookings.map(R.isNewPatientBooking), [true, false, true, true, true, false, true], 'fixtures: five new-patient bookings')
  eq(R.isNewPatientBooking({ reason: 'first consult', new_patient: false }), false, 'new_patient=false beats the reason')
  eq(R.isNewPatientBooking({ reason: 'broken bracket', new_patient: true }), true, 'new_patient=true beats the reason')
  // action notes: not FYI, not "note is informational"
  eq(notes.map(R.isActionNote), [true, false, true, false, true, false, true], 'fixtures: four action notes')
  eq(R.isActionNote({ fyi: true, reason: 'Running late' }), false, 'FYI is not an action')
  eq(R.isActionNote({ fyi: false, reason: 'URGENT: bracket off [NOT an emergency - note is informational]' }), false, 'informational')
  eq(R.isActionNote({ fyi: false, reason: 'Wants a call back about billing' }), true)
  eq(R.isInformationalNote({ fyi: true, reason: '' }), true)
}

// ---- list card count titles (src/pages/lists/titles.ts; plan P5)
eq(titles.callsTitle('today', 'all', { calls: stats.calls, booked: stats.booked_calls }, todayCalls.length), '8 calls today · 6 booked', 'Calls title')
eq(titles.callsTitle('today', 'booked', { calls: 8, booked: 6 }, 6), '6 of 8 calls today', 'Calls title, filtered')
eq(titles.callsTitle('today', 'live', { calls: 35, booked: 26 }, 0), '0 of 35 calls today', 'Calls title, filtered to zero')
eq(titles.callsTitle('7d', 'all', { calls: 155, booked: 109 }, 155), '155 calls in the last 7 days · 109 booked', 'Calls title, 7 days')
eq(titles.callsTitle('30d', 'all', { calls: 0, booked: 0 }, 0), '0 calls in the last 30 days', 'Calls title, none')
eq(titles.callsTitle('today', 'all', null, 0), '', 'Calls title, totals unknown')
eq(titles.callsTitle('today', 'all', { calls: 1, booked: 1 }, 1), '1 call today · 1 booked', 'Calls title, one')
eq(titles.bookingsTitle(bookings, from, stats.bookings), '7 bookings today · 5 new patients', 'Bookings title')
eq(titles.bookingsTitle([], from, 0), '0 bookings today', 'Bookings title, none')
eq(titles.bookingsTitle(undefined, from), '', 'Bookings title, loading')
eq(titles.callbacksTitle(notes, from), '4 waiting', 'Callbacks title: action notes only')
eq(titles.callbacksTitle([{ ...notes[0], urgent: true }], from), '1 waiting · 1 urgent', 'Callbacks title, urgent')
eq(titles.callbacksTitle([], from), '0 waiting', 'Callbacks title, none')
eq(titles.textsTitle(sms, from, stats), '6 texts sent today · 4 replies', 'Texts title')
eq(titles.textsTitle(sms, from, { ...stats, sms_in: 0 }).startsWith('6 texts sent today'), true)
eq(titles.textsTitle([], from, { sms_out: 0, sms_in: 0 }), '0 texts sent today', 'Texts title, none')

// ---- the demo day (src/mock/demo/materialize.ts): day 0 = the real date in New York, NOW pinned to
// 21:10 there, stats computed from the rows equal the manifest, spoken dates follow the real
// calendar. Run under TZ=UTC and again under TZ=Asia/Tokyo (the respawn at the bottom).
{
  const demoDir = new URL('src/mock/demo/', root)
  const dj = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(f, demoDir)), 'utf8'))
  const mat = await import(new URL('materialize.ts', demoDir).href)
  const scenes = dj('scenes.json')
  const history = dj('history.json')
  const manifest = dj('manifest.json')
  const liveTxt = readFileSync(fileURLToPath(new URL('live-s36.txt', demoDir)), 'utf8')
  const build = (iso) => mat.materializeDemo(scenes, history, manifest, liveTxt, Date.parse(iso))
  const strip = (st) => ({ ...st, range: undefined })
  const day0Stats = (day, days) =>
    mat.computeStats(day, { from: day.midnight(days - 1), to: day.nowSec, days, tz: day.tz })
  const want = (days) => {
    const m = manifest.stats_at_now[String(days)]
    return { ...m, range: undefined }
  }
  const textOf = (day, id) => day.live.steps.find((x) => x.id === id).event.data.text
  const detailText = (day, callId, id) => day.details.get(callId).events.find((e) => e.id === id).data.text

  // Wednesday Oct 21 2026, 12:00 New York
  const wed = build('2026-10-21T16:00:00Z')
  eq(wed.day0, { y: 2026, m: 10, d: 21 }, 'demo: day 0 is the real date in New York')
  eq(wed.nowSec, Date.parse('2026-10-22T01:10:00Z') / 1000, 'demo: NOW = 21:10 EDT')
  eq(wed.midnight(0), Date.parse('2026-10-21T04:00:00Z') / 1000, "demo: day 0's midnight")
  eq(wed.status.now, wed.nowSec)
  for (const days of [1, 2, 7, 30]) eq(strip(day0Stats(wed, days)), want(days), `demo: stats(${days}) from rows = manifest`)
  eq(wed.calls.filter((c) => c.started_at >= wed.midnight(0)).length, 35, 'demo: 35 calls today (showpiece kept out)')
  eq(wed.calls.length, 666, 'demo: 666 calls in 30 days')
  eq(wed.calls.some((c) => c.call_id === wed.live.callId), false, 'demo: the showpiece is not in the list until replayed')
  eq(wed.bookings.filter((b) => b.ts >= wed.midnight(0) && b.new_patient).length, 17, 'demo: 17 new-patient bookings today')
  eq(wed.bookings.every((b) => typeof b.new_patient === 'boolean'), true, 'demo: every booking carries new_patient')
  eq(wed.sms.filter((x) => x.direction === 'out' && x.kind === 'confirmation').every((x) => /^Harborline Orthodontics: .+(Reply YES|Responda SÍ) to confirm\.$|^Harborline Orthodontics: .+Responda SÍ para confirmar\.$/.test(x.text)), true, 'demo: confirmation bodies')
  eq(wed.sms.filter((x) => x.direction === 'out').every((x) => x.chars === (x.text ?? '').length || x.text === undefined), true, 'demo: chars = body length')
  eq(JSON.stringify([...wed.notes, ...wed.bookings]).includes('Martorana'), false, 'demo: scrubbed')
  eq(rsn.withCorrectedNames(wed.bookings, wed.notes).find((b) => b.call_id === 'CA159009022351').name, 'Renee Szymanski', 'demo: the Bookings list shows the corrected Renee Szymanski')
  // The weekday shift (decided 2026-10-21): the dataset was written for a Tuesday day 0, and
  // EVERY weekday token of every call moves by ONE business-day offset from Tuesday to the real
  // day 0 (Wed +1, Thu +2, Fri +3, Mon -1; Sat and Sun use Friday's), so the day keeps its own
  // structure on any date. Spoken dates get the moved weekday and the real day-of-month.
  eq([0, 1, 2, 3, 4, 5, 6].map(mat.weekdayOffset), [3, -1, 0, 1, 2, 3, 3], 'demo: one offset per real weekday (Sun..Sat)')
  eq([mat.shiftWeekday(5, 1), mat.shiftWeekday(1, -1), mat.shiftWeekday(4, 3), mat.shiftWeekday(6, 2)], [1, 5, 2, 6], 'demo: Fri +1 = Mon, Mon -1 = Fri, Thu +3 = Tue, Saturday stays')
  const slotOf = (day, name) => day.bookings.find((b) => b.name === name && b.ts >= day.midnight(0)).slot
  const callText = (day, callId) => {
    const d = callId === day.live.callId ? day.live.detail : day.details.get(callId)
    return d.events.filter((e) => typeof e.data?.text === 'string').map((e) => e.data.text).join('\n')
  }
  // Wednesday Oct 21 2026: Tue -> Wed, Wed -> Thu, Thu -> Fri, Fri -> Mon, Mon -> Tue
  eq(textOf(wed, 16523), 'I have Friday the twenty-third at ten in the morning, or Monday the twenty-sixth at eight forty — which works better?', 'demo (Wed): live offer moves a day, Friday wraps to Monday')
  eq(textOf(wed, 16528), 'Perfect — Ellie is booked for Friday the twenty-third at ten in the morning.', 'demo (Wed): live booking line')
  eq(textOf(wed, 16520), "What do you have this week? She doesn't have school Friday — it's a teacher workday — if that helps.", 'demo (Wed): the caller\'s bare weekday moves too')
  eq(textOf(wed, 16541), "Ellie's all set for Friday at ten.", 'demo (Wed): the recap')
  eq(wed.live.bookings.values().next().value.slot, 'Fri 10:00 AM', 'demo (Wed): the showpiece books Fri 10:00 AM')
  eq(wed.live.detail.events.find((e) => e.id === 16528).data.text, textOf(wed, 16528), 'demo: the drawer and the stream agree')
  eq(wed.live.steps.length, 46, 'demo: 46 live events')
  eq(wed.live.steps[wed.live.steps.length - 1].offset <= 131, true, 'demo: the replay lasts about 130 s')
  // Camila (s03, the Spanish consult): Wed 2:40 PM as written, Thursday the 22nd on Wednesday the 21st
  eq(detailText(wed, 'CA216253965107', 15453), 'Tengo el jueves veintidós a las dos y cuarenta de la tarde — ¿se la aparto?', 'demo (Wed): Spanish date moves with the call')
  eq(detailText(wed, 'CA216253965107', 15454), 'Sí, el jueves está bien.', 'demo (Wed): the bare Spanish weekday moves too')
  eq(slotOf(wed, 'Camila Ortega'), 'Thu 2:40 PM', 'demo (Wed): Camila Thu 2:40 PM')
  eq(slotOf(wed, 'Robert Halvorsen'), 'Fri 2:40 PM', 'demo (Wed): Robert Halvorsen no longer shares her slot')
  eq([slotOf(wed, 'Renee Shimanski'), slotOf(wed, 'Morgan Ellis')], ['Fri 9:40 AM', 'Thu 9:40 AM'], 'demo (Wed): Renee and Morgan no longer share Thu 9:40 AM')
  eq(slotOf(wed, 'Owen Brandt'), 'Thu 8:20 AM', 'demo (Wed): "tomorrow" urgent visit is Thursday')
  eq(slotOf(wed, 'Priya Nair'), 'Wed 11:20 AM', 'demo (Wed): same-day visit stays today')
  eq(slotOf(wed, 'Owen Castillo'), 'Fri 3:20 PM', 'demo (Wed): Thu -> Fri')
  eq(wed.bookings.find((b) => b.name === 'Owen Castillo').reason, 'adjustment - rescheduled from Thu 3:20 PM', 'demo (Wed): reason follows')
  eq(slotOf(wed, 'Isabella Hartwell'), 'Fri 8:00 AM', 'demo (Wed): a call with no near visit moves too (uniform)')
  eq(slotOf(wed, 'Jordan Whitaker'), 'Mon 8:20 AM', 'demo (Wed): Fri +1 wraps to Mon, slot form kept')
  eq(slotOf(wed, 'Mariela Quintero'), 'Wed 9:00 AM', 'demo (Wed): next-week Tuesday -> Wednesday')
  eq(wed.bookings.find((b) => b.name === 'Mariela Quintero').reason, 'reschedule of existing appointment (moved from Tue 3:20 PM)', 'demo (Wed): reason weekday moves')
  eq(detailText(wed, 'CA085152390398', 16484), 'The earliest opening I have is tomorrow, Thursday the twenty-second, at eight twenty in the morning — want me to grab it?', 'demo (Wed): "tomorrow, <date>" stays tomorrow')
  eq(detailText(wed, 'CA697634998868', 15946).startsWith('I have Thursday the twenty-second at one twenty'), true, 'demo (Wed): Dana "tomorrow" consult')
  eq(wed.notes.find((n) => n.call_id === 'CA938057243303').reason.includes('[has existing appt Wed 1:40 PM]'), true, 'demo (Wed): note slot follows')
  eq(wed.notes.find((n) => n.call_id === 'CA715676910446').reason.includes('prefers later this week or Wed/Thu next week [has existing appt Tue 10:00 AM]'), true, 'demo (Wed): note weekdays follow')
  eq(detailText(wed, 'CA030491000297', 15856), 'Mondays are easiest for me, I work from home on Mondays.', 'demo (Wed): plural weekdays move ("Fridays are easiest")')
  eq(detailText(wed, 'CA195628500874', 16357), "If anything comes up with your coverage, they'll call you before Monday.", 'demo (Wed): "before Friday" follows the slot')
  eq(detailText(wed, 'CA493295688065', 16192), "Yeah. Hey, are you open Saturdays? That'd be way easier for me.", 'demo: weekend days never move')
  eq(detailText(wed, 'CA493295688065', 16193), "We're open Monday through Friday from seven thirty in the morning to five in the evening — we're closed on weekends.", 'demo: office hours never move')
  eq(
    wed.sms
      .filter((x) => x.direction === 'out' && x.kind === 'confirmation' && x.ts >= wed.midnight(0))
      .every((x) => wed.bookings.filter((b) => b.call_id === x.call_id).every((b) => (x.text ?? '').includes(b.slot.replace(/^(\w{3}) /, '')))),
    true,
    'demo (Wed): confirmation texts name the moved slots',
  )
  eq(wed.sms.some((x) => x.call_id === 'CA105777075583' && /Thu 10:00 AM/.test(x.text ?? '')), true, 'demo (Wed): Sam Whitlock text says Thu')
  // history moves with the same offset: yesterday's (Monday as written) urgent visit is today
  eq(wed.bookings.find((b) => b.name === 'Lily Ashford' || b.call_id === 'CA703383717573').slot, 'Wed 7:40 AM', 'demo (Wed): yesterday\'s next-morning visit is today')
  eq(detailText(wed, 'CA703383717573', 15164), 'The soonest I have is tomorrow, Wednesday the twenty-first, at seven forty in the morning — want me to grab it?', 'demo (Wed): yesterday\'s "tomorrow" is today')

  // a Tuesday the 21st is the day the transcripts were written for: nothing moves
  const tue = build('2027-09-21T16:00:00Z')
  eq([tue.day0.d, new Date(Date.UTC(2027, 8, 21)).getUTCDay()], [21, 2])
  eq(textOf(tue, 16528), 'Perfect — Ellie is booked for Thursday the twenty-third at ten in the morning.', 'demo: on Tue 21st the phrase is unchanged')
  {
    const rawSlots = new Map([...scenes.bookings, ...scenes.live.bookings].map((b) => [b.id, b.slot]))
    const today = [...tue.bookings.filter((b) => b.ts >= tue.midnight(0)), ...tue.live.bookings.values()]
    eq(today.every((b) => rawSlots.get(b.id) === b.slot), true, 'demo (Tue): every slot as written')
    const rawText = (id) => [...Object.values(scenes.details), scenes.live.detail].flatMap((d) => d.events).find((e) => e.id === id).data.text
    eq(['CA661015520345', 'CA030491000297', 'CA550539630821'].every((id) => tue.details.get(id).events.every((e) => typeof e.data?.text !== 'string' || e.data.text === rawText(e.id))), true, 'demo (Tue 21st): transcripts as written')
  }

  // Thursday Oct 22 2026: +2 (Thu -> Mon, Fri -> Tue); the showpiece's days land next week
  const thu = build('2026-10-22T16:00:00Z')
  eq(textOf(thu, 16520), "What do you have next week? She doesn't have school Monday — it's a teacher workday — if that helps.", 'demo (Thu): "this week" follows a Monday booking')
  eq(textOf(thu, 16528), 'Perfect — Ellie is booked for Monday the twenty-sixth at ten in the morning.', 'demo (Thu): live booking line')
  eq(slotOf(thu, 'Owen Brandt'), 'Fri 8:20 AM', 'demo (Thu): "tomorrow" urgent visit is Friday')
  eq(slotOf(thu, 'Jordan Whitaker'), 'Tue 8:20 AM', 'demo (Thu): the written Fri 8:20 AM no longer meets Owen Brandt')
  eq(detailText(thu, 'CA550539630821', 15518), 'What works better for Owen — another afternoon next week?', 'demo (Thu): Owen Castillo\'s Monday is next week')
  eq(slotOf(thu, 'Owen Castillo'), 'Mon 3:20 PM', 'demo (Thu): Thu +2 = Mon')

  // month rollover: Friday Oct 30 2026 -> Thursday as written is Tuesday Nov 3
  const fri = build('2026-10-30T15:00:00Z')
  eq(textOf(fri, 16528), 'Perfect — Ellie is booked for Tuesday the third at ten in the morning.', 'demo (Fri): rolls into the next month')
  for (const days of [1, 7]) eq(strip(day0Stats(fri, days)), want(days), `demo (Fri): stats(${days}) = manifest`)
  // Friday: the next business day is Monday, so "tomorrow" becomes "Monday"
  eq(slotOf(fri, 'Owen Brandt'), 'Mon 8:20 AM', 'demo (Fri): next-day visit is Monday')
  eq(slotOf(fri, 'Priya Nair'), 'Fri 11:20 AM', 'demo (Fri): same-day visit stays today')
  eq(detailText(fri, 'CA270914355208', 16101), 'Four-twenty Monday. Yeah, I can make that.', 'demo (Fri): "tomorrow" said by the caller')
  eq(detailText(fri, 'CA808110667440', 15819), "Monday? Wow, okay. Yeah, let's do it.", 'demo (Fri): "Tomorrow?" too')
  eq(detailText(fri, 'CA363348333154', 15758), "You're booked for Monday the second at ten forty in the morning.", 'demo (Fri): "tomorrow, <date>," dropped cleanly')
  eq(detailText(fri, 'CA363348333154', 15763), 'See you then — take care!', 'demo (Fri): goodbye follows')
  eq(/tomorrow/i.test(JSON.stringify([...fri.details.values()].filter((d) => d.call.started_at >= fri.midnight(0)))), false, 'demo (Fri): no "tomorrow" left in today\'s transcripts')
  eq(/tomorrow/i.test(fri.live.steps.map((st) => st.event.data?.text ?? '').join(' ')), false, 'demo (Fri): nor in the showpiece')

  // Monday Oct 26 2026: -1 (Tue -> Mon, Mon -> Fri); next week's Tuesday is next Monday
  const mon = build('2026-10-26T15:00:00Z')
  eq([slotOf(mon, 'Priya Nair'), slotOf(mon, 'Owen Brandt')], ['Mon 11:20 AM', 'Tue 8:20 AM'], 'demo (Mon): today stays today, tomorrow Tuesday')
  eq(slotOf(mon, 'Mariela Quintero'), 'Mon 9:00 AM', 'demo (Mon): Tue -1 = Mon')
  eq(detailText(mon, 'CA862771168017', 16450), 'Tengo el lunes dos a las nueve de la mañana — ¿se la reservo?', 'demo (Mon): Spanish date next week, month rolled')
  eq(textOf(mon, 16528), 'Perfect — Ellie is booked for Wednesday the twenty-eighth at ten in the morning.', 'demo (Mon): live booking line')

  // Tuesday the 27th: weekdays stay, the numbers move; the Spanish "veintidós" parses (D1)
  const tue27 = build('2026-10-27T15:00:00Z')
  eq(detailText(tue27, 'CA216253965107', 15453).includes('miércoles veintiocho'), true, 'demo (Tue 27): Spanish date with "ó" rewritten')
  eq(slotOf(tue27, 'Owen Brandt'), 'Wed 8:20 AM', 'demo (Tue 27): weekdays as written')

  // Saturday and Sunday use Friday's offset; Saturday's "tomorrow" (Monday) is two days out
  const sat = build('2026-10-24T15:00:00Z')
  const sun = build('2026-10-25T15:00:00Z')
  eq([slotOf(sat, 'Owen Brandt'), slotOf(sun, 'Owen Brandt')], ['Mon 8:20 AM', 'Mon 8:20 AM'], 'demo (weekend): as Friday')
  eq(detailText(sat, 'CA085152390398', 16484).startsWith('The earliest opening I have is Monday the twenty-sixth, at eight twenty') || detailText(sat, 'CA085152390398', 16484).startsWith('The earliest opening I have is Monday the twenty-sixth at eight twenty'), true, 'demo (Sat): "tomorrow, <date>" dropped')
  eq(detailText(sun, 'CA085152390398', 16484), 'The earliest opening I have is tomorrow, Monday the twenty-sixth, at eight twenty in the morning — want me to grab it?', 'demo (Sun): Monday is tomorrow')

  // Every real weekday (Mon Oct 19 .. Sun Oct 25 2026, and a spring Tuesday): the day reads true.
  {
    const EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty-first', 'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth', 'twenty-sixth', 'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth', 'thirty-first']
    const NUM = ['primero', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'treinta y uno']
    const DATED = new RegExp(`\\b(${EN.join('|')}) the (${ORD.join('|')})\\b|(?<![\\p{L}])(${ES.join('|')}) (${[...NUM].reverse().join('|')})(?![\\p{L}])`, 'gu')
    const WEEKDAY_WORD = new RegExp(`\\b(${EN.join('|')})s?\\b|(?<![\\p{L}])(${ES.join('|')})s?(?![\\p{L}])`, 'gu')
    // office-hours sentences may name any weekday ("open Monday through Thursday", "open Saturdays?")
    const sentences = (t) => t.split(/(?<=[.?!])\s+/).filter((s) => !/\b(open|closed|hours)\b/i.test(s))
    const rawSlot = new Map([...scenes.bookings, ...scenes.live.bookings].map((b) => [b.id, b.slot]))
    const shiftSlot = (slot, k) => slot.replace(/^(\w{3})/, (d) => SHORT[mat.shiftWeekday(SHORT.indexOf(d), k)])
    for (const iso of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2027-03-16']) {
      const day = build(`${iso}T16:00:00Z`)
      const dow0 = new Date(`${iso}T12:00:00Z`).getUTCDay()
      const k = mat.weekdayOffset(dow0)
      const tag = `demo (${EN[dow0].slice(0, 3)} ${iso})`
      const day0Ms = Date.UTC(day.day0.y, day.day0.m - 1, day.day0.d)
      const dateOf = (offset) => new Date(day0Ms + offset * 86400000)
      const today = [...day.bookings.filter((b) => b.ts >= day.midnight(0)), ...day.live.bookings.values()]
      eq(today.length, 28, `${tag}: 28 bookings with the showpiece`)
      eq(new Set(today.map((b) => b.slot)).size, today.length, `${tag}: no two of today's bookings share a slot (day + time)`)
      eq(today.every((b) => b.slot === shiftSlot(rawSlot.get(b.id), k)), true, `${tag}: every slot moved by the one offset (${k})`)
      eq(today.every((b) => /^(Mon|Tue|Wed|Thu|Fri) \d{1,2}:\d{2} [AP]M$/.test(b.slot)), true, `${tag}: slots stay "Mon 8:20 AM", weekdays only`)
      for (const days of [1, 2, 7, 30]) eq(strip(day0Stats(day, days)), want(days), `${tag}: stats(${days}) unchanged`)
      // day-0 calls with a transcript, the showpiece included
      const calls = [...day.details.values()].filter((d) => d.call.started_at >= day.midnight(0)).map((d) => d.call.call_id)
      calls.push(day.live.callId)
      for (const id of calls) {
        const text = callText(day, id)
        const mine = today.filter((b) => b.call_id === id)
        const d = id === day.live.callId ? day.live.detail : day.details.get(id)
        const toolSlots = d.events.filter((e) => (e.kind === 'tool' || e.kind === 'cancel' || e.kind === 'booking') && e.data.slot).map((e) => e.data.slot)
        // every spoken date is a real calendar date (weekday and day-of-month agree), not in the past
        for (const m of text.matchAll(DATED)) {
          const wd = m[1] ? EN.indexOf(m[1]) : ES.indexOf(m[3])
          const dom = m[2] ? ORD.indexOf(m[2]) + 1 : NUM.indexOf(m[4]) + 1
          const hit = Array.from({ length: 15 }, (_, i) => dateOf(i)).find((x) => x.getUTCDate() === dom)
          eq(!!hit && hit.getUTCDay() === wd, true, `${tag} ${id}: "${m[0]}" is a real date in the next two weeks`)
        }
        // a "tomorrow, <date>" is tomorrow; any "tomorrow" means the next calendar day is a weekday
        for (const m of text.matchAll(/tomorrow, (\w+) the ([a-z-]+)/g)) {
          eq([m[1], ORD.indexOf(m[2]) + 1], [EN[dateOf(1).getUTCDay()], dateOf(1).getUTCDate()], `${tag} ${id}: "${m[0]}" is tomorrow`)
        }
        if (/\btomorrow\b/i.test(text)) eq([1, 2, 3, 4, 5].includes(dateOf(1).getUTCDay()), true, `${tag} ${id}: "tomorrow" only before a weekday`)
        // "today at ..." books today's weekday (a weekend day 0 books the Friday before: the known limit)
        if (dow0 >= 1 && dow0 <= 5 && /\btoday at\b/.test(text)) eq(mine.every((b) => b.slot.startsWith(SHORT[dow0])), true, `${tag} ${id}: "today" books today`)
        if (!mine.length) continue
        // a booked call names a weekday only when it is one of its slots' (booked or cancelled) or
        // part of a spoken date (checked above); office hours may name any
        const slotDays = new Set(toolSlots.map((s) => SHORT.indexOf(s.slice(0, 3))))
        const bare = sentences(text.replace(DATED, '')).join(' ')
        const strays = [...bare.matchAll(WEEKDAY_WORD)].map((m) => (m[1] ? EN.indexOf(m[1]) : ES.indexOf(m[2]))).filter((w) => !slotDays.has(w))
        eq(strays, [], `${tag} ${id}: weekdays named match the call's slots`)
        // the booking line names the booked weekday ("booked for Friday the twenty-third")
        for (const b of mine) {
          const named = [...text.matchAll(DATED)].map((m) => (m[1] ? EN.indexOf(m[1]) : ES.indexOf(m[3])))
          if (named.length) eq(named.includes(SHORT.indexOf(b.slot.slice(0, 3))), true, `${tag} ${id}: ${b.slot} is spoken`)
        }
      }
      // the showpiece reads as one story: offer, booking, recap and text agree, and its week word fits
      const live = [...day.live.bookings.values()][0]
      const wd = EN[SHORT.indexOf(live.slot.slice(0, 3))]
      eq(textOf(day, 16524), `${wd} at ten works. She can sleep in for once.`, `${tag}: showpiece answer`)
      eq(textOf(day, 16541), `Ellie's all set for ${wd} at ten.`, `${tag}: showpiece recap`)
      eq(textOf(day, 16528).startsWith(`Perfect — Ellie is booked for ${wd} the `), true, `${tag}: showpiece booking line`)
      eq(day.live.steps.every((st) => st.event.data?.text === undefined || st.event.data.text === day.live.detail.events.find((e) => e.id === st.id).data.text), true, `${tag}: showpiece stream = drawer`)
      eq([...day.live.sms.values()].some((x) => (x.text ?? '').includes(live.slot)), true, `${tag}: showpiece text names ${live.slot}`)
      const liveDay = [...Array(15).keys()].find((i) => i > 0 && dateOf(i).getUTCDay() === SHORT.indexOf(live.slot.slice(0, 3)))
      const sameWeek = Math.floor((liveDay + ((dow0 + 6) % 7)) / 7) === 0
      eq(textOf(day, 16520).startsWith(sameWeek ? 'What do you have this week?' : 'What do you have next week?'), true, `${tag}: showpiece says ${sameWeek ? 'this' : 'next'} week for ${live.slot}`)
    }
  }

  // 23:30 New York is already the next day in UTC and Tokyo: day 0 stays the New York date
  const late = build('2026-10-22T03:30:00Z')
  eq(late.day0, { y: 2026, m: 10, d: 21 }, 'demo: 23:30 EDT is still Oct 21')
  // DST: Monday Nov 2 2026 (clocks fell back Sunday Nov 1): yesterday was 25 hours long
  const dst = build('2026-11-02T15:00:00Z')
  eq(dst.midnight(0) - dst.midnight(1), 25 * 3600, 'demo: fall-back day is 25 h')
  eq(dst.nowSec, Date.parse('2026-11-03T02:10:00Z') / 1000, 'demo: NOW = 21:10 EST')
  for (const days of [1, 2, 7, 30]) eq(strip(day0Stats(dst, days)), want(days), `demo (DST): stats(${days}) = manifest`)
  // spring forward: Monday Mar 15 2027 (clocks sprang Sunday Mar 14)
  const spring = build('2027-03-15T15:00:00Z')
  eq(spring.midnight(0) - spring.midnight(1), 23 * 3600, 'demo: spring-forward day is 23 h')
  for (const days of [1, 2, 7, 30]) eq(strip(day0Stats(spring, days)), want(days), `demo (spring): stats(${days}) = manifest`)
}

// ---- Katie's route (src/katie/motion/path.ts, pure): the hop apex keeps her crown on screen,
// and going down to a card is the brief's L (walk to the column, hop), not a detour to a shelf end
const path = await import(new URL('src/katie/motion/path.ts', root).href)
eq(path.hopArc(900, 96, 0.45, 40, 96)[0], 96, 'hop onto a top-row card: apex at feet y 96, crown at 0')
eq(path.hopArc(900, 96, 0.45, 40, 96)[1], 0.45, 'rising straight onto the card takes the whole air time')
eq(path.hopArc(452, 250, 0.35, 40, 96)[0], 210, 'lower hops keep the 40 px apex')
eq(path.hopArc(900, 95, 0.45, 40, 96)[0], 95, 'the floor never lifts the apex above the landing')
const chart = { y: 250, x0: 292, x1: 1388 }
const latest = { y: 452, x0: 292, x1: 905 }
eq(
  path.planPath({ x: 1372, y: 250 }, chart, { x: 889, shelf: latest }, { step: 24 }),
  [
    { kind: 'walk', x: 889, y: 250 },
    { kind: 'hop', x: 889, y: 452, shelf: latest },
  ],
  'down to a card below: walk to its column, hop down (no walk to the far shelf end)',
)
const floor = { y: 900, x0: 20, x1: 1420 }
eq(
  path.planPath({ x: 1372, y: 250 }, chart, { x: 1396, shelf: floor }, { step: 24, toFloor: true }).map((st) => st.kind),
  ['walk', 'hop', 'walk'],
  'down to the floor: walk to the shelf end nearest the target, hop off it, walk',
)
eq(
  path.planPath({ x: 1372, y: 250 }, chart, { x: 1396, shelf: floor }, { step: 24, toFloor: true })[0],
  { kind: 'walk', x: 1388, y: 250 },
  'down to the floor: the right end',
)

// ---- Occasional Katie (src/katie/stage/moments.ts, pure; MONDAY-LLAMA 3.3-3.4, 3.8)
const mo = await import(new URL('src/katie/stage/moments.ts', root).href)
const timing = await import(new URL('src/katie/motion/timing.ts', root).href)
const MIN = 60_000
eq(Object.entries(mo.RANK).sort((a, b) => a[1] - b[1]).map(([k]) => k), ['urgent', 'first-open', 'booking', 'line-wake', 'summon'], 'rank order')
eq([mo.COOLDOWN_MS, mo.DAILY_CAP, mo.URGENT_SPACING_MS, mo.URGENT_EXIT_GAP_MS], [15 * MIN, 6, 10 * MIN, MIN], 'caps')
eq([mo.QUIET_MS, mo.WAIT_MS, mo.URGENT_WAIT_MS, mo.HIDDEN_URGENT_MAX_MS], [1500, 20_000, 2 * MIN, 30 * MIN], 'waits')
eq(mo.MILESTONES, [1, 5, 10, 20, 30, 40, 50], 'milestones')
// hold = clamp(3 + chars / 25, 4, 9) s
eq(timing.holdSeconds(140), 8.6, '140 characters hold 8.6 s')
eq(timing.holdSeconds(60), 5.4, '60 characters hold 5.4 s')
eq([timing.holdSeconds(0), timing.holdSeconds(1000)], [4, 9], 'hold clamp 4..9 s')
eq([timing.HOLD.peek, timing.RISE.px, timing.RISE.dur, timing.SINK.px, timing.SINK.dur], [3, 100, 0.32, 100, 0.26], 'peek, rise, sink')

// practice day (stats.range.tz), whatever the machine tz; the day rolls over at local midnight
const day = mo.practiceDay(now, stats.range.tz)
eq(day, '2026-10-12', 'fixtures now is Monday Oct 12 in New York')
eq(mo.practiceDay(stats.range.from, NY), '2026-10-12', 'local midnight starts the day')
eq(mo.practiceDay(stats.range.from - 1, NY), '2026-10-11', 'one second before is the day before')
eq(mo.practiceDay(stats.range.from - 1, 'UTC'), '2026-10-12', 'the same instant is already Oct 12 in UTC')

// triggers
eq(mo.crossedMilestone(0, 1), 1, 'the day\'s first booking')
eq([mo.crossedMilestone(1, 2), mo.crossedMilestone(5, 9), mo.crossedMilestone(7, 7), mo.crossedMilestone(50, 51)], [null, null, null, null], 'no milestone between')
eq([mo.crossedMilestone(4, 5), mo.crossedMilestone(9, 10), mo.crossedMilestone(19, 20), mo.crossedMilestone(49, 50)], [5, 10, 20, 50], 'milestones crossed')
eq(mo.crossedMilestone(4, 11), 10, 'a jump past two milestones counts once (the higher)')
eq(mo.isLineWake(now, null, NY), true, 'no call yet: the line wakes')
eq(mo.isLineWake(now, stats.range.from - 60, NY), true, 'last call yesterday: the day\'s first call')
eq(mo.isLineWake(now, now - 30 * 60, NY), false, '30 min after the last call: no wake')
eq(mo.isLineWake(now, now - 60 * 60, NY), true, '60 min after the last call: wake')
eq(mo.isLineWake(now, status.last_call_at, NY), false, 'fixtures: the replay call comes 30 min after the last one')
eq(mo.firstOpenTarget(stats), 'urgent', 'first open with urgent callbacks: Callbacks waiting')
eq(mo.firstOpenTarget({ urgent: 0, calls: 3 }), 'first-open', 'first open with calls: the Calls cell / page')
eq(mo.firstOpenTarget({ urgent: 0, calls: 0 }), null, 'first open on an empty day: no filler')

// the bookings baseline is keyed to the practice day (a tab left open overnight)
{
  const d13 = '2026-10-13'
  const d14 = '2026-10-14'
  let seen = mo.seeBookings(null, { bookings: 12, day: d13 }, d13)
  eq(seen, { day: d13, seen: 12 }, 'baseline: 12 bookings on Oct 13')
  eq(mo.seeBookings(seen, { bookings: 11, day: d13 }, d13), { day: d13, seen: 12 }, 'a cancel does not lower the baseline (no repeated milestone)')
  eq(mo.bookingsBefore(seen, d14), 0, 'after midnight nothing is seen today yet')
  eq(mo.crossedMilestone(mo.bookingsBefore(seen, d14), 1), 1, "booking at 12:00:06 AM: the new day's first booking is a milestone")
  eq(mo.seeBookings(seen, { bookings: 12, day: d13 }, d14), seen, "yesterday's counts still cached after midnight are no baseline for today")
  eq(mo.crossedMilestone(mo.bookingsBefore(mo.seeBookings(seen, { bookings: 12, day: d13 }, d14), d14), 1), 1, 'so the first booking still counts')
  seen = mo.seeBookings(seen, { bookings: 0, day: d14 }, d14)
  eq(seen, { day: d14, seen: 0 }, "the new day's stats reset the baseline to its own count")
  eq(mo.crossedMilestone(mo.bookingsBefore(seen, d14), 1), 1, 'then 0 -> 1 is a milestone')
  eq(mo.seeBookings(null, { bookings: 3 }, d14), { day: d14, seen: 3 }, 'no stats day: the clock day')
  eq(mo.crossedMilestone(mo.bookingsBefore({ day: d14, seen: 1 }, d14), 2), null, 'same day 1 -> 2: nothing')
}

// decide: every rank fires on a fresh browser
const T = 1_800_000_000_000
const base = (kind, over = {}) => ({
  kind,
  now: T,
  arrivedAt: T,
  caps: { ...mo.EMPTY_CAPS },
  day,
  reduced: false,
  drawerOpen: false,
  hidden: false,
  lastInputAt: null,
  onScreenRank: null,
  ...over,
})
const v = (kind, over) => mo.decide(base(kind, over)).verdict
for (const k of mo.MOMENT_KINDS) eq(v(k), 'fire', `${k} fires on a fresh browser`)

// cooldown 15 min from her last exit (ordinary only; skipped, not queued)
for (const k of ['first-open', 'booking', 'line-wake']) {
  eq(v(k, { caps: { ...mo.EMPTY_CAPS, lastExit: T - 15 * MIN + 1 } }), 'skip', `${k}: inside the cooldown`)
  eq(v(k, { caps: { ...mo.EMPTY_CAPS, lastExit: T - 15 * MIN } }), 'fire', `${k}: cooldown over`)
}
// a second booking milestone 5 min after the first appearance ended
let caps = mo.recordExit(mo.recordShow(mo.EMPTY_CAPS, 'booking', T, day), T + 9000)
eq(mo.decide(base('booking', { now: T + 5 * MIN, arrivedAt: T + 5 * MIN, caps })), { verdict: 'skip', reason: 'cooldown' }, 'second milestone inside 15 min is skipped')
// daily cap 6 (ranks 2-4), per practice day
const capped = { ...mo.EMPTY_CAPS, countDay: day, dayCount: 6 }
eq([v('booking', { caps: capped }), v('line-wake', { caps: capped }), v('first-open', { caps: capped })], ['skip', 'skip', 'skip'], 'daily cap 6')
eq(v('booking', { caps: { ...capped, dayCount: 5 } }), 'fire', 'five so far: one more')
eq(v('booking', { caps: { ...capped, countDay: '2026-10-11' } }), 'fire', 'the count rolls over with the practice day')
eq(mo.countOn({ ...capped, countDay: '2026-10-11' }, day), 0)
// first open: once per practice day
eq(v('first-open', { caps: { ...mo.EMPTY_CAPS, firstOpenDay: day } }), 'skip', 'first open already shown today')
eq(v('first-open', { caps: { ...mo.EMPTY_CAPS, firstOpenDay: '2026-10-11' } }), 'fire', 'a new practice day: first open again')
// urgent ignores the cooldown and the daily cap ...
eq(v('urgent', { caps: { ...capped, lastExit: T - 5 * MIN } }), 'fire', 'urgent ignores cooldown and daily cap')
// ... keeps 10 min between urgent appearances ...
eq(v('urgent', { caps: { ...mo.EMPTY_CAPS, lastUrgent: T - 10 * MIN + 1 } }), 'skip', 'urgent spacing 10 min')
eq(v('urgent', { caps: { ...mo.EMPTY_CAPS, lastUrgent: T - 10 * MIN } }), 'fire', 'urgent spacing over')
// ... and waits (up to its 2 min window) for 60 s after her last exit
eq(mo.decide(base('urgent', { caps: { ...mo.EMPTY_CAPS, lastExit: T - 30_000 } })), { verdict: 'wait', reason: '60 s after her exit', at: T + 30_000 }, 'urgent waits for the exit gap')
eq(v('urgent', { now: T + 30_000, caps: { ...mo.EMPTY_CAPS, lastExit: T - 30_000 } }), 'fire', 'then fires')
eq(v('urgent', { arrivedAt: T - 100_000, caps: { ...mo.EMPTY_CAPS, lastExit: T - 30_000 } }), 'skip', 'an exit gap that outlasts the window drops it')
// quiet moment: 1.5 s without keydown, wheel, pointerdown; 20 s (urgent 2 min) at most
eq(mo.decide(base('booking', { lastInputAt: T - 1000 })), { verdict: 'wait', reason: 'not quiet', at: T + 500 }, 'waits for a quiet moment')
eq(v('booking', { lastInputAt: T - 1500 }), 'fire', '1.5 s quiet')
eq(v('booking', { arrivedAt: T - 20_001 }), 'skip', 'ordinary moment dropped after 20 s')
eq(v('booking', { arrivedAt: T - 19_000, lastInputAt: T - 100 }), 'skip', 'never quiet inside its window')
eq(v('urgent', { arrivedAt: T - 110_000, lastInputAt: T - 100 }), 'wait', 'urgent keeps waiting up to 2 min')
eq(v('urgent', { arrivedAt: T - 120_001 }), 'skip', 'urgent dropped after 2 min')
// drawer: urgent waits, others are dropped
eq([v('urgent', { drawerOpen: true }), v('booking', { drawerOpen: true }), v('first-open', { drawerOpen: true }), v('line-wake', { drawerOpen: true })], ['wait', 'skip', 'skip', 'skip'], 'drawer open')
// hidden tab: dropped, except one urgent shown on return if under 30 min old
eq([v('urgent', { hidden: true }), v('booking', { hidden: true }), v('summon', { hidden: true })], ['wait', 'skip', 'skip'], 'tab hidden')
eq(v('urgent', { hidden: true, arrivedHidden: true, arrivedAt: T - 29 * MIN }), 'wait', 'hidden urgent keeps up to 30 min')
eq(v('urgent', { arrivedHidden: true, arrivedAt: T - 25 * MIN }), 'fire', 'shown on return under 30 min old')
eq(v('urgent', { arrivedHidden: true, arrivedAt: T - 31 * MIN }), 'skip', 'older than 30 min: dropped')
// collisions: a higher rank retargets her, a lower or equal one is dropped
eq(v('booking', { onScreenRank: 1 }), 'skip', 'booking while urgent on screen: dropped')
eq(v('urgent', { onScreenRank: 2 }), 'fire', 'urgent while first-open on screen: retarget')
eq(v('urgent', { onScreenRank: 1 }), 'skip', 'a second urgent while one is on screen adds nothing')
eq(v('urgent', { onScreenRank: 3, caps: { ...mo.EMPTY_CAPS, lastExit: T - 10_000 } }), 'fire', 'retarget needs no exit gap')
// exit in progress (onScreenRank null, lastExit not written yet): she counts as gone at now
for (const k of ['first-open', 'booking', 'line-wake']) {
  eq(mo.decide(base(k, { exiting: true })), { verdict: 'skip', reason: 'cooldown' }, `${k} during her exit (fresh caps): cooldown`)
  eq(v(k, { exiting: true, caps: { ...mo.EMPTY_CAPS, lastExit: T - 20 * MIN } }), 'skip', `${k} during her exit (old lastExit): cooldown`)
}
eq(mo.decide(base('urgent', { exiting: true })), { verdict: 'wait', reason: '60 s after her exit', at: T + 60_000 }, 'urgent during her exit waits 60 s')
eq(v('urgent', { exiting: true, arrivedAt: T - 61_000 }), 'skip', 'an urgent whose window ends inside that gap is dropped')
eq(v('summon', { exiting: true }), 'fire', 'summon during her exit still fires')
eq(v('booking', { exiting: false, caps: { ...mo.EMPTY_CAPS, lastExit: T - 20 * MIN } }), 'fire', 'not exiting: the stored lastExit rules')
// asked for: never capped
eq(v('summon', { caps: { ...capped, lastExit: T - 1000, lastUrgent: T - 1000 }, drawerOpen: true, lastInputAt: T }), 'fire', 'summon ignores every cap and wait')
// reduced motion: only ranks 1, 2 and 5
eq(mo.MOMENT_KINDS.map((k) => v(k, { reduced: true })), ['fire', 'fire', 'skip', 'skip', 'fire'], 'reduced motion: urgent, first-open, summon only')
eq(mo.MOMENT_KINDS.filter(mo.allowedWhenReduced), ['urgent', 'first-open', 'summon'])

// recording an appearance
caps = mo.recordShow(mo.EMPTY_CAPS, 'first-open', T, day)
eq([caps.firstOpenDay, caps.countDay, caps.dayCount, caps.lastUrgent], [day, day, 1, null], 'first open counts and sets the day')
eq(mo.recordShow(mo.EMPTY_CAPS, 'first-open', T, day, true).lastUrgent, T, 'a first open to the urgent callbacks starts the urgent spacing')
eq(mo.decide(base('urgent', { now: T + 60_000, arrivedAt: T + 14_000, caps: mo.recordExit(mo.recordShow(mo.EMPTY_CAPS, 'first-open', T, day, true), T + 11_000) })), { verdict: 'skip', reason: 'urgent spacing' }, 'so the urgent note already in that sentence does not bring her back')
eq(mo.recordShow(mo.EMPTY_CAPS, 'booking', T, day, true).lastUrgent, null, 'only a first open carries the flag')
caps = mo.recordShow(caps, 'urgent', T + 1, day)
eq([caps.dayCount, caps.lastUrgent], [1, T + 1], 'urgent does not count, sets its spacing')
caps = mo.recordShow(caps, 'summon', T + 2, day)
eq(caps.dayCount, 1, 'summon does not count')
eq(mo.recordExit(caps, T + 9).lastExit, T + 9, 'every exit resets the cooldown (summon too)')
eq(mo.recordShow({ ...caps, countDay: '2026-10-11', dayCount: 6 }, 'booking', T, day).dayCount, 1, 'a new day counts from one')

// storage: mock -> sessionStorage (per tab), real -> localStorage (shared); try/catch, memory fallback
const fakeStorage = () => {
  const m = new Map()
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}
const ls = fakeStorage()
const ss = fakeStorage()
const win = { localStorage: ls, sessionStorage: ss }
eq(mo.pickCapStorage(true, win), ss, 'mock mode: sessionStorage')
eq(mo.pickCapStorage(false, win), ls, 'real mode: localStorage')
eq(mo.pickCapStorage(false, { get localStorage() { throw new Error('blocked') } }), null, 'a throwing getter: memory')
eq(mo.pickCapStorage(true, null), null)
const store = mo.createCapStore(mo.pickCapStorage(false, win))
store.set({ lastExit: T, lastUrgent: T - 5, countDay: day, dayCount: 3, firstOpenDay: day })
eq(store.get(), { lastExit: T, lastUrgent: T - 5, countDay: day, dayCount: 3, firstOpenDay: day }, 'caps read back')
eq([...ls.m.keys()].sort(), ['katie.dayCount', 'katie.firstOpenDay', 'katie.lastExit', 'katie.lastUrgent'], 'real mode writes the shared keys')
eq(ss.m.size, 0, 'real mode leaves sessionStorage alone')
eq([...ls.m.values()].every((x) => /^(\d+|\d{4}-\d{2}-\d{2}(:\d+)?)$/.test(x)), true, 'storage holds timestamps, counts and days only')
const tabB = mo.createCapStore(mo.pickCapStorage(false, win))
eq(tabB.get().dayCount, 3, 'another tab sees the same caps')
const mockStore = mo.createCapStore(mo.pickCapStorage(true, win))
eq(mockStore.get(), { ...mo.EMPTY_CAPS }, 'a mock tab starts clean (sessionStorage)')
mockStore.set({ ...mo.EMPTY_CAPS, firstOpenDay: day })
eq([ss.m.get('katie.firstOpenDay'), ls.m.get('katie.firstOpenDay')], [day, day], 'mock writes sessionStorage only')
// the cross-tab claim fallback (no Web Locks): one timestamp
store.setShowing(T + 0.4)
eq([ls.m.get(mo.SHOWING_KEY), tabB.showingAt()], [String(T), T], 'katie.showing: a timestamp, seen by the other tab')
store.setShowing(null)
eq([ls.m.has(mo.SHOWING_KEY), tabB.showingAt()], [false, null], 'released')
eq(mo.SHOWING_STALE_MS, 20_000)
store.setShowing(T)
store.reset()
eq([ls.m.size, store.get()], [0, { ...mo.EMPTY_CAPS }], 'reset removes the keys')
ls.m.set('katie.dayCount', 'Maria:3')
ls.m.set('katie.lastExit', 'nope')
eq(store.get(), { ...mo.EMPTY_CAPS }, 'garbage in storage reads as empty')
const throwing = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
const mem = mo.createCapStore(throwing)
mem.set({ ...mo.EMPTY_CAPS, lastExit: T })
eq([mem.get().lastExit, mem.backend()], [T, 'memory'], 'throwing storage: the in-memory copy still caps this tab')
eq(mo.createCapStore(null).backend(), 'memory')


// ------------------------------------------------------------------ sign-in (src/auth, src/live/sse)
const auth = await import(new URL('src/auth/helpers.ts', root).href)
const authCfg = await import(new URL('src/auth/config.ts', root).href)
const authBridge = await import(new URL('src/auth/bridge.ts', root).href)
const sse = await import(new URL('src/live/sse.ts', root).href)
const DAY = 86_400_000
const T0 = Date.parse('2026-11-04T12:00:00Z')

// remembered-date math (D3: 30 days, then forgetDevice and a code again)
eq(auth.parseRememberedAt('2026-10-05T12:00:00.000Z'), Date.parse('2026-10-05T12:00:00Z'), 'ISO date')
eq(auth.parseRememberedAt(String(T0)), T0, 'epoch ms as text')
eq([auth.parseRememberedAt(null), auth.parseRememberedAt(''), auth.parseRememberedAt('garbage')], [null, null, null], 'unreadable = not remembered')
eq(auth.rememberExpired(null, T0, 30), false, 'never remembered is not "expired"')
eq(auth.rememberExpired(T0 - 29 * DAY, T0, 30), false, '29 days: still remembered')
eq(auth.rememberExpired(T0 - 30 * DAY, T0, 30), false, 'exactly 30 days is not over')
eq(auth.rememberExpired(T0 - 30 * DAY - 1, T0, 30), true, 'a millisecond past 30 days is over')
eq(auth.rememberExpired(T0 - 31 * DAY, T0, 30), true, '31 days: over')
eq(auth.rememberExpired(T0 - 8 * DAY, T0, 7), true, 'the window comes from config.remember_days')
eq(auth.rememberExpired(T0 + 5 * DAY, T0, 30), false, 'a date in the future (clock change) is not expired')
eq([auth.rememberDaysLeft(T0 - 29.5 * DAY, T0, 30), auth.rememberDaysLeft(T0, T0, 30), auth.rememberDaysLeft(T0 - 31 * DAY, T0, 30), auth.rememberDaysLeft(null, T0, 30)], [1, 30, 0, 0], 'days left')
eq([auth.isRemembered(T0 - DAY, T0, 30), auth.isRemembered(T0 - 40 * DAY, T0, 30), auth.isRemembered(null, T0, 30)], [true, false, false], 'isRemembered')

// roles
eq(auth.ROLE_ORDER, ['owner', 'support', 'staff'], 'owner > support > staff')
eq([auth.roleRank('owner'), auth.roleRank('support'), auth.roleRank('staff'), auth.roleRank('x')], [0, 1, 2, 3], 'role rank')
eq([auth.canManagePeople('owner'), auth.canManagePeople('support'), auth.canManagePeople('staff'), auth.canManagePeople(null), auth.canManagePeople(undefined)], [true, true, false, false, false], 'who sees People and Activity')
eq([auth.canToggleSupport('owner'), auth.canToggleSupport('support'), auth.canToggleSupport('staff')], [true, false, false], 'only an owner flips the support switch')
eq([auth.roleLabel('owner'), auth.roleLabel('staff'), auth.roleLabel('support')], ['Owner', 'Staff', 'Support'])
{
  const P = (name, role, email = name + '@x.example', is_support = false) => ({ name, role, email, is_support })
  const sorted = auth.sortPeople([P('Zed', 'staff'), P('SAIDA support', 'support', 's@x.example', true), P('Amy', 'staff'), P('Priya', 'owner'), P('Bo', 'owner')])
  eq(sorted.map((p) => p.name), ['Bo', 'Priya', 'Amy', 'Zed', 'SAIDA support'], 'owners, then staff by name, the support row last')
  const input = [P('B', 'staff'), P('A', 'staff')]
  auth.sortPeople(input)
  eq(input.map((p) => p.name), ['B', 'A'], 'sortPeople does not change its input')
}
eq([auth.stateLabel('invited'), auth.stateLabel('active'), auth.stateLabel('reset'), auth.stateLabel('disabled')], ['Invited', 'Active', 'Password reset', 'Removed'])
eq([auth.mfaLabel('app'), auth.mfaLabel('email'), auth.mfaLabel('none')], ['Authenticator app', 'Email code', 'Not set up'])
eq(auth.personActions({ state: 'active', is_support: false, enabled: true }, false), ['reset-password', 'reset-code', 'remove'], 'active person')
eq(auth.personActions({ state: 'active', is_support: false, enabled: true }, true), ['reset-password', 'reset-code'], 'never remove yourself')
eq(auth.personActions({ state: 'invited', is_support: false, enabled: true }, false), ['resend', 'remove'], 'invited: send again')
eq(auth.personActions({ state: 'disabled', is_support: false, enabled: false }, false), [], 'removed: nothing')
eq(auth.personActions({ state: 'active', is_support: true, enabled: true }, false), [], 'the support row has the switch, not buttons')
eq(auth.actionLabel('resend'), 'Send invite again')

// plain-words checks
eq(auth.newPasswordProblem('short', 'short'), 'Use at least 12 characters.')
eq(auth.newPasswordProblem('a-long-enough-one', 'a-long-enough-two'), 'The two passwords are not the same.')
eq(auth.newPasswordProblem('a-long-enough-one', 'a-long-enough-one'), null)
eq([auth.looksLikeEmail('a@b.co'), auth.looksLikeEmail('a@b'), auth.looksLikeEmail(' a b@c.d')], [true, false, false])
eq([auth.cleanCode('482 719'), auth.cleanCode('48271955'), auth.cleanCode('ab'), auth.cleanCode('12-34')], ['482719', '482719', '', '1234'], 'codes keep six digits')

// activity sentences
eq(auth.tsToSec(1_700_000_000), 1_700_000_000, 'seconds')
eq(auth.tsToSec(1_700_000_000_000), 1_700_000_000, 'milliseconds')
eq(auth.tsToSec('2023-11-14T22:13:20Z'), 1_700_000_000, 'ISO')
eq(auth.tsToSec('1700000000'), 1_700_000_000, 'seconds as text')
eq([auth.tsToSec(null), auth.tsToSec(''), auth.tsToSec('nope')], [null, null, null])
eq([auth.nameFromEmail('jamie@x.example'), auth.nameFromEmail('jamie.lee@x.example'), auth.nameFromEmail('PAT_o-neil@x'), auth.nameFromEmail(''), auth.nameFromEmail(null)], ['Jamie', 'Jamie Lee', 'Pat O Neil', 'Someone', 'Someone'])
{
  const R = (action, email = 'jamie@x.example', role = 'staff', target = null) => ({ action, email, role, target })
  eq(auth.activitySentence(R('view_call', 'jamie@x.example', 'staff', 'CA860072416005')), 'Jamie opened a call', 'a call id never reaches the sentence')
  eq(auth.activitySentence(R('reveal_numbers')), 'Jamie revealed a number')
  eq(auth.activitySentence(R('signed_in')), 'Jamie signed in')
  eq(auth.activitySentence(R('signed_out')), 'Jamie signed out')
  eq(auth.activitySentence(R('locked')), "Jamie's screen locked after a while")
  eq(auth.activitySentence(R('person_removed', 'owner@x.example', 'owner', 'pat@x.example')), 'Owner removed Pat')
  eq(auth.activitySentence(R('person_added', 'owner@x.example', 'owner', 'pat.lee@x.example')), 'Owner added Pat Lee')
  eq(auth.activitySentence(R('code_reset', 'owner@x.example', 'owner', 'pat@x.example')), 'Owner reset the sign-in code for Pat')
  eq(auth.activitySentence(R('password_reset', 'owner@x.example', 'owner', null)), 'Owner reset a password')
  eq(auth.activitySentence(R('support_disabled', 'owner@x.example', 'owner')), 'Owner turned SAIDA support access off')
  eq(auth.activitySentence(R('signed_in', 'tom@example.com', 'support')), 'SAIDA support signed in', 'the support role is named as such')
  eq(auth.activitySentence(R('some_new_thing')), 'Jamie some new thing', 'an unknown action still reads as a sentence')
  for (const a of ['view_call', 'reveal_numbers', 'signed_in', 'signed_out', 'locked', 'unlocked', 'denied', 'person_added', 'person_removed', 'password_reset', 'code_reset', 'invite_resent', 'support_enabled', 'support_disabled', 'x_y']) {
    const sen = auth.activitySentence(R(a, 'jamie@x.example', 'staff', '(813) 555-0142'))
    soft(!/!|\d{3}|CA\d/.test(sen), `no digits, call ids or exclamation marks in "${sen}"`)
  }
  const rows = [R('a', 'zoe@x.example'), R('b', 'amy@x.example'), R('c', 'zoe@x.example')]
  const names = { 'zoe@x.example': 'Zoe Park', 'amy@x.example': 'Dr. Amy Cho' }
  eq(auth.firstNameOf('Dr. Amy Cho'), 'Amy', 'titles are skipped')
  eq([auth.firstNameOf('Marisol Vega'), auth.firstNameOf('Cher'), auth.firstNameOf('Mr Bo Li')], ['Marisol', 'Cher', 'Bo'])
  eq(auth.activitySentence(R('view_call', 'zoe@x.example'), names), 'Zoe opened a call', 'the People list gives the name')
  eq(auth.activitySentence(R('person_removed', 'amy@x.example', 'owner', 'zoe@x.example'), names), 'Amy removed Zoe', 'actor and target by name')
  eq(auth.activitySentence(R('signed_in', 'nobody@x.example'), names), 'Nobody signed in', 'unknown emails fall back to the local part')
  eq(auth.activityPeople(rows, names).map((p) => p.name), ['Dr. Amy Cho', 'Zoe Park'], 'the filter shows full names when known')
  eq(auth.activityPeople(rows), [{ email: 'amy@x.example', name: 'Amy' }, { email: 'zoe@x.example', name: 'Zoe' }], 'filter list: one per email, by name')
  eq(auth.filterActivity(rows, 'zoe@x.example').map((r) => r.action), ['a', 'c'])
  eq(auth.filterActivity(rows, null).length, 3)
}

// boot config
eq(authCfg.parseConfig(null), { auth: 'basic', idle_minutes: 15, remember_days: 30, support_email: '' }, 'no config = basic')
eq(authCfg.parseConfig({ auth: 'cognito' }).auth, 'basic', 'cognito without a pool is basic')
eq(authCfg.parseConfig({ auth: 'cognito', user_pool_id: 'us-east-1_x', client_id: 'c', region: 'us-east-1', idle_minutes: 10, remember_days: 7, support_email: 's@x.example', practice: 'P' }),
  { auth: 'cognito', idle_minutes: 10, remember_days: 7, support_email: 's@x.example', practice: 'P', user_pool_id: 'us-east-1_x', client_id: 'c', region: 'us-east-1' }, 'cognito config')
eq(authCfg.parseConfig({ auth: 'basic', idle_minutes: -5, remember_days: 'x' }).idle_minutes, 1, 'idle minutes are clamped')
eq(authCfg.parseConfig({ auth: 'basic', remember_days: 'x' }).remember_days, 30, 'bad remember days fall back to 30')
eq((await authCfg.fetchConfig('/api/dash', async () => new Response('x', { status: 404 }))).auth, 'basic', 'a 404 (an older box) is basic')
eq((await authCfg.fetchConfig('/api/dash', async () => { throw new Error('net') })).auth, 'basic', 'a network error is basic')
{
  let seenUrl = ''
  const cfg = await authCfg.fetchConfig('/api/dash', async (u) => ((seenUrl = String(u)), new Response(JSON.stringify({ auth: 'cognito', user_pool_id: 'p', client_id: 'c' }), { status: 200 })))
  eq([seenUrl, cfg.auth], ['/api/dash/config', 'cognito'], 'GET /config')
}

// the 401 reasons
eq([authBridge.parseUnauthorized({ error: 'sign in' }), authBridge.parseUnauthorized({ error: 'expired' }), authBridge.parseUnauthorized({ error: 'signed out' })], ['sign in', 'expired', 'signed out'])
eq([authBridge.parseUnauthorized({ error: 'weird' }), authBridge.parseUnauthorized(null), authBridge.parseUnauthorized('x')], ['sign in', 'sign in', 'sign in'], 'anything else reads as sign in')
for (const r of ['sign in', 'expired', 'signed out']) soft(!authBridge.unauthorizedMessage(r).includes('!'), 'no exclamation marks on the sign-in screen')

// the header: a Bearer token in cognito mode, nothing otherwise, and never anything for the URL
eq(await authBridge.authHeaders(), {}, 'basic mode: no header')
authBridge.configureBridge({ mode: 'cognito', accessToken: async () => 'tok-1' })
eq(await authBridge.authHeaders(), { Authorization: 'Bearer tok-1' }, 'cognito: Bearer')
authBridge.configureBridge({ mode: 'cognito', accessToken: async () => null })
eq(await authBridge.authHeaders(), {}, 'no token: no header')
authBridge.configureBridge({ mode: 'cognito', accessToken: async () => { throw new Error('x') } })
eq(await authBridge.authHeaders(), {}, 'a failing token source: no header')
{
  let got = null
  authBridge.configureBridge({ mode: 'cognito', accessToken: async () => 't', onUnauthorized: (r) => (got = r) })
  authBridge.notifyUnauthorized('expired')
  eq(got, 'expired', 'the session store hears about a 401')
}
authBridge.configureBridge({ mode: 'basic' })

// SSE parser: any chunking of the same stream gives the same messages
{
  const stream = ': ping\n\nevent: booking\ndata: {"a":1}\n\nevent: note\r\ndata: x\r\ndata: y\r\n\r\ndata: bare\n\nid: 7\nretry: 5\nevent:call.ended\ndata:{"k":2}\n\n'
  const want = [
    { event: 'booking', data: '{"a":1}' },
    { event: 'note', data: 'x\ny' },
    { event: 'message', data: 'bare' },
    { event: 'call.ended', data: '{"k":2}' },
  ]
  const run = (chunks) => {
    const out = []
    const p = sse.createSseParser((m) => out.push(m))
    for (const c of chunks) p.push(c)
    return out
  }
  eq(run([stream]), want, 'whole stream')
  eq(run([...stream]), want, 'one character at a time (a CR split from its LF too)')
  eq(run([stream.slice(0, 17), stream.slice(17, 60), stream.slice(60)]), want, 'cut anywhere')
  eq(run([': only a comment\n\n']), [], 'comments make no message')
  eq(run(['event: x\n\n']), [], 'no data, no message')
  eq(run(['data: unfinished']), [], 'an unfinished message waits')
}

// FetchEventSource: the header goes on the request, never the URL; messages reach listeners; an end or a 401 is an error
{
  const enc = new TextEncoder()
  const body = (parts) => new ReadableStream({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close() } })
  const seen = []
  const fakeFetch = async (url, init) => {
    seen.push({ url, headers: init.headers })
    return new Response(body(['event: booking\ndata: {"n":1}\n\n', 'event: note\nda', 'ta: {"n":2}\n\n']), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  const es = new sse.FetchEventSource('/api/dash/stream', { headers: async () => ({ Authorization: 'Bearer tok-2' }), fetchImpl: fakeFetch })
  const got = []
  let opened = 0
  let errored = 0
  es.onopen = () => opened++
  es.onerror = () => errored++
  es.addEventListener('booking', (m) => got.push(['booking', m.data]))
  es.addEventListener('note', (m) => got.push(['note', m.data]))
  for (let i = 0; i < 50 && errored === 0; i++) await new Promise((r) => setTimeout(r, 5))
  eq(got, [['booking', '{"n":1}'], ['note', '{"n":2}']], 'events reach their listeners')
  eq([opened, errored, es.readyState], [1, 1, 2], 'open once; the server ending the stream is an error (reconnect)')
  eq([seen.length, seen[0].url, seen[0].headers.Authorization, seen[0].headers.Accept], [1, '/api/dash/stream', 'Bearer tok-2', 'text/event-stream'], 'Authorization in the header')
  soft(!/tok-2|token|access|code=|password/i.test(seen[0].url), 'no token, code or password in the stream URL')

  let status = 0
  const es401 = new sse.FetchEventSource('/api/dash/stream', {
    headers: async () => ({}),
    onStatus: (s) => (status = s),
    fetchImpl: async () => new Response(JSON.stringify({ error: 'expired' }), { status: 401 }),
  })
  let err401 = 0
  es401.onerror = () => err401++
  for (let i = 0; i < 50 && err401 === 0; i++) await new Promise((r) => setTimeout(r, 5))
  eq([status, err401], [401, 1], 'a 401 is reported and is an error')

  const esClosed = new sse.FetchEventSource('/api/dash/stream', { headers: async () => ({}), fetchImpl: async (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))) })
  let errClosed = 0
  esClosed.onerror = () => errClosed++
  esClosed.close()
  await new Promise((r) => setTimeout(r, 20))
  eq([errClosed, esClosed.readyState], [0, 2], 'close() is quiet')
}

// ---- leads (DESIGN 6.13): the mock's lead record against the backend's own recorded answers
// (scripts/leads-fixtures.py wrote both the fixtures and the answers by running voice-agent's
// leads.py + dash_api.py), the week file on any date, and every word the page derives.
{
  const S = await import(new URL('src/mock/leadStore.ts', root).href)
  const M = await import(new URL('src/pages/leads/model.ts', root).href)
  const A = await import(new URL('src/api/leads.ts', root).href)
  const seed = fx('leads.json')
  const week = fx('leads-week.json')
  const acts = JSON.parse(readFileSync(fileURLToPath(new URL('scripts/fixtures/leads-actions.json', root)), 'utf8'))
  const lnow = seed.now

  // -- the three routes, as the box answered them
  const store0 = S.createLeadStore(seed)
  for (const [filter, ids] of Object.entries(acts.lists)) {
    const q = filter.startsWith('limit=') ? { stage: 'open', limit: 3 } : { stage: filter, limit: 2000 }
    eq(S.listLeads(store0, q, acts.now).map((l) => l.lead_id), ids, `leads list ${filter}: the box's rows in the box's order`)
  }
  const publicRows = S.listLeads(store0, { limit: 2000 }, acts.now)
  for (const row of seed.leads) eq(publicRows.find((l) => l.lead_id === row.lead_id), row, `lead row ${row.first_name}: the mock serves the box's row`)
  for (const l of S.listLeads(store0, { reveal: true, limit: 2000 }, acts.now)) eq(l.phone, acts.revealed[l.lead_id], 'reveal=1 answers ten digits, as the box does')
  eq(S.leadsSummary(store0, acts.now), seed.summary, 'leads summary equals the box\'s')
  eq(S.leadsRoute(store0, 'GET', '/leads/Lnope', new URLSearchParams(), undefined, acts.now), { status: 404, body: { error: 'no such lead' } })
  eq(S.leadsRoute(store0, 'GET', '/calls', new URLSearchParams(), undefined, acts.now), null, 'not a lead path: the other routes answer')
  eq(S.leadsRoute(S.createLeadStore(null), 'GET', '/leads', new URLSearchParams('stage=open'), undefined, acts.now).body.leads, [], 'an empty record lists nothing')

  // -- every coordinator tap the generator tried (each stage x each action, and pairs): the same
  // status, the same sentence, the same stored row, the same new events. And the row the page
  // shows straight after a tap (mergeLeadAfterAction) is the row the next refetch brings.
  let trials = 0
  for (const t of acts.trials) {
    const store = S.createLeadStore(seed)
    const before = (store.events.get(t.lead_id) ?? []).length
    t.steps.forEach((step, i) => {
      const at = acts.now + 60 * (i + 1)
      const shown = S.listLeads(store, { reveal: true, limit: 2000 }, at).find((l) => l.lead_id === t.lead_id)
      const res = S.leadAction(store, t.lead_id, step, acts.who, at)
      const got = res.status === 200 ? { status: 200, lead: res.body.lead } : { status: res.status, error: res.body.error }
      assert.deepEqual(got, t.results[i], `lead trial ${t.lead_id} ${JSON.stringify(t.steps)} step ${i}`)
      if (res.status === 200) {
        const after = S.listLeads(store, { reveal: true, limit: 2000 }, at).find((l) => l.lead_id === t.lead_id)
        assert.deepEqual(A.mergeLeadAfterAction(shown, res.body.lead, at), after, `after ${step.action}: the merged row is the refetched row`)
      }
      trials++
    })
    assert.deepEqual((store.events.get(t.lead_id) ?? []).slice(before), t.new_events, `lead trial ${t.lead_id} ${JSON.stringify(t.steps)}: events`)
  }
  eq(trials > 500, true, `${trials} coordinator taps replayed against the box's answers`)
  n += trials

  // -- the week file: each weekday's story is its own file on its own date, and on any other date
  // every weekday, clock time and "Thu 9:00 AM" label stays true (also across a clock change)
  eq(week.days.length, 7)
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const sameInstants = (v) =>
    JSON.parse(JSON.stringify(v), (k, x) => ((k === 'appointment_start' || k === 'start') && typeof x === 'string' ? (S.resolveConsultAt(x, 0, NY) ?? x) : x))
  week.days.forEach((day, i) => {
    eq(time.formatDateShort(day.now, NY).slice(0, 3), DAYS[i], `week file day ${i} is a ${DAYS[i]}`)
    // (an exam's ISO start comes back as the practice's wall-clock time, without the UTC offset
    // the box wrote, so it stays right on a date the other side of a clock change)
    eq(sameInstants(S.seedForDate(week, day.now)), sameInstants(day), `${DAYS[i]}: the week file on its own date is unchanged`)
    eq(S.seedForDate(week, day.now - 6 * 3600).now, day.now, 'any hour of the day gives that evening\'s story')
  })
  for (const weeks of [1, 3, 4, 9, 22, 30, -5]) {
    for (const day of week.days) {
      const moved = S.seedForDate(week, day.now + weeks * 7 * 86_400 + 1800)
      const same = (a, b, what) => {
        assert.equal(time.formatClock(a, NY), time.formatClock(b, NY), `${what}: same clock time ${weeks} weeks on`)
        assert.equal(time.formatDateShort(a, NY).slice(0, 3), time.formatDateShort(b, NY).slice(0, 3), `${what}: same weekday ${weeks} weeks on`)
      }
      same(moved.now, day.now, 'now')
      moved.leads.forEach((l, k) => {
        const src = day.leads[k]
        for (const f of ['stage_at', 'created_at', 'quoted_at', 'consult_at', 'last_touch_at', 'sms_stopped_at']) {
          if (typeof src[f] === 'number') same(l[f], src[f], `${src.first_name}.${f}`)
          else assert.equal(l[f], src[f])
        }
        assert.equal(l.appointment_label, src.appointment_label)
        // a label like "Thu 4:00 PM" names the exam's own weekday and time
        if (l.consult_at != null && /^\w{3} \d/.test(l.appointment_label ?? '')) {
          assert.equal(`${time.formatDateShort(l.consult_at, NY).slice(0, 3)} ${time.formatClock(l.consult_at, NY)}`, l.appointment_label)
        }
      })
      assert.deepEqual(S.leadsSummary(S.createLeadStore(moved), moved.now), S.leadsSummary(S.createLeadStore(day), day.now), 'the same counts on any date')
      n++
    }
  }

  // -- the filter in the URL
  for (const f of M.LEAD_FILTERS) {
    eq(M.parseLeadsFilter(M.leadsFilterSearch('?mock=1', f.value)), f.value, `?show= round trip: ${f.value}`)
    eq(M.leadFilterLabel(f.value), f.label)
  }
  eq(M.DEFAULT_LEADS_FILTER, 'open')
  eq(M.leadsFilterSearch('?mock=1&show=lost', 'open'), '?mock=1', 'the default filter is not written')
  eq(M.leadsFilterSearch('?mock=1', 'lost'), '?mock=1&show=lost')
  eq([M.parseLeadsFilter(''), M.parseLeadsFilter('?show=zzz'), M.parseLeadsFilter('?show=consult_missed')], ['open', 'open', 'missed_consult'], 'unknown -> open; the stage code means the pool')

  // -- the four counts, the chips, the taps
  eq(M.leadCounts(seed.summary).map((c) => [c.label, c.value, c.filter, c.accent]), [
    ['Missed consult', 3, 'missed_consult', true],
    ['Never booked', 1, 'never_booked', false],
    ['Booked', 4, 'consult_booked', false],
    ['Came in, not started', 1, 'consult_happened', false],
  ])
  eq(M.leadCounts(undefined).map((c) => c.value), [undefined, undefined, undefined, undefined], 'no summary yet: no numbers (never 0)')
  eq(M.leadCounts({}).map((c) => c.value), [undefined, undefined, undefined, undefined], 'an empty summary: no numbers')
  eq(S.LEAD_STAGE_ORDER.map((st) => [st, M.leadStageChip(st).label, M.leadStageChip(st).tone]), [
    ['quoted', 'Quoted', 'neutral'],
    ['consult_booked', 'Consult booked', 'callback'],
    ['consult_missed', 'Missed consult', 'missed'],
    ['consult_happened', 'Came in', 'live'],
    ['started', 'Started', 'booked'],
    ['lost', 'Lost', 'neutral'],
    ['paused', 'Paused', 'neutral'],
  ])
  soft(!/_/.test(M.leadStageChip('some_new_stage').label) && M.leadStageChip('some_new_stage').tone === 'neutral', 'an unknown stage is a readable neutral chip')
  eq(Object.fromEntries(S.LEAD_STAGE_ORDER.map((st) => [st, M.leadTaps(st).map((t) => `${t.label}${t.primary ? '*' : ''}${t.asks ? `[${t.asks}]` : ''}`)])), {
    quoted: ['Booked*[slot]', 'Came in', 'Lost[confirm]', 'Pause'],
    consult_booked: ['Came in*', 'No-show*', 'Lost[confirm]', 'Pause'],
    consult_missed: ['Booked*[slot]', 'Came in', 'Lost[confirm]', 'Pause'],
    consult_happened: ['Started*', 'Lost[confirm]', 'Pause'],
    started: [],
    lost: ['Reopen*'],
    paused: ['Reopen*'],
  }, 'the taps per stage, in the spec\'s order')
  // every tap a stage offers is one the record accepts from that stage (never a 409 from a button)
  for (const row of seed.leads) {
    for (const tap of M.leadTaps(row.stage)) {
      const body = tap.action === 'booked' ? { action: 'booked', slot_label: '2026-10-20T09:30' } : { action: tap.action }
      eq(S.leadAction(S.createLeadStore(seed), row.lead_id, body, 'front desk', lnow).status, 200, `${row.stage}: the ${tap.label} tap is accepted`)
    }
  }

  // -- a row's words (fixture clock: Mon Oct 12, 6:05 PM in New York)
  const by = Object.fromEntries(seed.leads.map((l) => [l.first_name, l]))
  const line = (l) => {
    const q = M.quoteLine(l.quote)
    return [M.leadPhone(l.phone), M.examLine(l, lnow, NY).text, q.plan, q.figures.join(' · ') + (q.more ? ` · +${q.more} more` : ''), M.agoLabel(l.last_touch_at, lnow, NY), M.touchLabel(l.last_touch)]
  }
  eq(line(by.Ava), ['(813) ***-0142', 'Oct 9, 9:00 AM · no check-in', 'Phase 1 · metal', '$3,200 · ins. pending · patient pays $3,200', '6 days ago', 'Quote texted'])
  eq(line(by.Dana), ['(813) ***-0141', 'Oct 9, 2:30 PM · cancelled', 'Comprehensive · metal', '$5,400 · ins. $1,500 · patient pays $3,900 · +1 more', '4 days ago', 'Exam cancelled'])
  eq(line(by.Mia), ['(813) ***-0190', 'Tomorrow 3:20 PM', 'Adult comprehensive · aligners', '$6,400 · ins. $0 · patient pays $6,400 · +1 more', '3 days ago', 'Quote texted'])
  eq(line(by.Owen), ['(656) ***-0133', 'No exam yet', 'Limited · aligners lite', '$2,900 · no insurance · patient pays $2,900', '6 hr ago', 'Quote texted'])
  eq(line(by.Pat), ['(813) ***-0170', '12 days, no exam', 'Comprehensive · metal', '$5,400 · ins. $1,000 · patient pays $4,400 · +1 more', '11 days ago', 'Replied by text'])
  eq(line(by.Jude).slice(-1), ['Exam booked, Thu 4:00 PM'])
  eq([M.examLine(by.Ava, lnow, NY).warn, M.examLine(by.Pat, lnow, NY).warn, M.examLine(by.Mia, lnow, NY).warn, M.examLine(by.Owen, lnow, NY).warn], [true, true, false, false], 'red only for an exam that did not happen or a week without one')
  eq([by.Ava, by.Dana, by.Sam, by.Zoe, by.Owen, by.Pat, by.Ruby].map((l) => M.examDetail(l, lnow, NY)), [
    'Oct 9, 9:00 AM · no check-in by 10:35 AM',
    'Oct 9, 2:30 PM · cancelled',
    'Oct 5, 1:00 PM · no check-in',
    'Came in Oct 9, 8:00 AM',
    'None yet',
    'None in 12 days',
    '',
  ], 'the drawer\'s Exam fact')
  eq([M.leadPhone('8135550141'), M.leadPhone('(813) ***-0141'), M.leadPhone(null), M.leadPhone('')], ['(813) 555-0141', '(813) ***-0141', '', ''], 'a revealed number is formatted; a masked one stays masked')
  eq([M.money(5400), M.money(0), M.money(null)], ['$5,400', '$0', M.DASH])
  eq(['verbal_yes_on_call', 'verified_patient_on_file', 'form_consent', 'something_new', null].map(M.consentLabel), ['said yes on the call', 'patient on file', 'form', '', ''], 'the raw consent basis is never shown')
  eq(['quote text sent', 'text out', 'text in: yes', 'text in: stop', 'text in: whatever', 'exam booked Thu 4:00 PM', 'coordinator: lost', 'coordinator: some_new_move', '', null].map(M.touchLabel), ['Quote texted', 'Text sent', 'Replied yes', 'Replied STOP', 'Replied by text', 'Exam booked, Thu 4:00 PM', 'Marked lost', 'Desk: some new move', '', ''])

  // -- reserved: next text and call now (one reader, model.nextStep)
  eq(seed.leads.map((l) => M.nextStep(l, lnow, NY)).filter((x) => x.call !== null || x.text.kind === 'due').length, 0, 'today the box sends neither: no prompt, no due text')
  eq(M.nextStep(by.Sam, lnow, NY), { text: { kind: 'stopped' }, call: null }, 'a lead who texted STOP reads Texts stopped')
  eq(M.nextStep({ ...by.Ava, next_text_at: lnow + 86_400, next_text_label: 'Day 2 text', call_now: true, call_now_reason: ' No reply to two texts ' }, lnow, NY), {
    text: { kind: 'due', when: 'Tomorrow', label: 'Day 2 text' },
    call: { reason: 'No reply to two texts' },
  })
  eq(M.nextStep({ ...by.Ava, next_text_at: lnow + 3600 }, lnow, NY).text, { kind: 'due', when: 'Today', label: 'Follow-up text' }, 'a due text without a label still reads')
  eq(M.nextStep({ ...by.Sam, next_text_at: lnow + 86_400, call_now: true }, lnow, NY), { text: { kind: 'stopped' }, call: { reason: '' } }, 'stopped texts win over a due text; the call prompt stays')
  eq(M.nextStep({ ...by.Finn, next_text_at: lnow + 86_400, call_now: true }, lnow, NY), { text: { kind: 'none' }, call: null }, 'a closed lead gets no prompt and no due text')
  eq(M.nextStep({ ...by.Ava, call_now: 'yes', next_text_at: '1791842740' }, lnow, NY), { text: { kind: 'none' }, call: null }, 'only true and a number count')

  // -- a refused move, the booked slot
  eq([
    M.refusalSentence('a consult_happened lead has no exam to miss'),
    M.refusalSentence('a lost lead is reopened first'),
    M.refusalSentence("a booking needs the slot (for example 'Thu 9:00 AM')"),
    M.refusalSentence(''),
    M.refusalSentence(null),
  ], ['A came-in lead has no exam to miss.', 'A lost lead is reopened first.', "A booking needs the slot (for example 'Thu 9:00 AM').", '', ''])
  const refusals = new Set(acts.trials.flatMap((t) => t.results.filter((r) => r.status === 409).map((r) => r.error)))
  eq(refusals.size > 3, true, 'the box refused several kinds of move in the trials')
  for (const r of refusals) soft(!/_/.test(M.refusalSentence(r)) && /^[A-Z].*[.?!]$/.test(M.refusalSentence(r)), `a refusal reads as a sentence without stage codes: ${r}`)
  eq([M.slotValue('2026-10-20', '09:30'), M.slotValue('2026-10-20', ''), M.slotValue('10/20/2026', '09:30')], ['2026-10-20T09:30', '', ''])
  eq(M.localDateInput(lnow, NY), '2026-10-12', 'today in the practice tz, whatever the machine tz')
  {
    // the value the booked form sends is one the record resolves to that wall-clock time
    const store = S.createLeadStore(seed)
    const res = S.leadAction(store, by.Ava.lead_id, { action: 'booked', slot_label: M.slotValue('2026-10-20', '09:30') }, 'front desk', lnow)
    eq([res.status, res.body.lead.stage, time.formatWhen(res.body.lead.consult_at, NY, lnow)], [200, 'consult_booked', 'Oct 20, 9:30 AM'])
  }

  // -- history: one sentence per thing that happened; the desk's duplicate record is skipped
  eq(M.historyLines(seed.events[by.Sam.lead_id], NY).map((x) => x.text), [
    'Quote sent: Limited, one option',
    'Front desk booked the exam: Mon 1:00 PM',
    'Front desk marked a no-show',
    'Text sent',
    'Texted STOP: no more texts go to this number',
  ], 'a STOP arrives as a text and as the stop; the page says it once')
  eq(M.historyLines(seed.events[by.Finn.lead_id], NY).slice(-1).map((x) => [x.text, x.quote]), [['Front desk marked lost', 'Chose another office']], 'the desk\'s own words ride under the move')
  eq(M.historyLines(seed.events[by.Ava.lead_id], NY).slice(-1)[0].text, 'No check-in by 10:35 AM', 'a no-show the clock marked says so')
  {
    // who did it, as the record may spell it: the shared login, a per-person sign-in's email, a bare account id
    const at = lnow - 600
    const who = (w) => M.historyLines([{ id: 1, ts: at, kind: 'stage', data: { from: 'quoted', to: 'lost', source: 'coordinator', who: w } }], NY)[0].text
    eq(who('front desk'), 'Front desk marked lost')
    eq(who('jane.doe@harborline.example'), 'Jane Doe marked lost', 'an email reads as the part before the @, in words')
    eq(who('tom@example.com'), 'Tom marked lost')
    eq(who('r_perez+desk@practice.example'), 'R Perez Desk marked lost')
    eq(who('3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c'), 'The desk marked lost', 'a bare account id is not a name')
    eq(who(''), 'The desk marked lost')
    eq(who('Dr. Patel'), 'Dr. Patel marked lost')
    const note = M.historyLines([{ id: 2, ts: at, kind: 'note', data: { who: 'Jane.Doe@harborline.example', note: 'call after 5' } }], NY)[0]
    eq([note.text, note.quote], ['Jane Doe wrote a note', 'call after 5'])
    for (const w of ['jane.doe@harborline.example', 'tom@example.com']) assert.equal(who(w).includes('@'), false, 'an address is never on the page')
  }
  {
    // an exam moved on the schedule: an ISO time with an offset is an instant; without one it is the practice's wall clock
    const moved = (start) => M.historyLines([{ id: 3, ts: lnow, kind: 'moved', data: { source: 'nexhealth', start } }], NY)[0].text
    eq(moved('2026-10-16T10:00:00-04:00'), 'Exam moved on the schedule to Fri, Oct 16, 10:00 AM')
    eq(moved('2026-10-16T14:00:00Z'), 'Exam moved on the schedule to Fri, Oct 16, 10:00 AM')
    eq(moved('2026-10-16T10:00:00'), 'Exam moved on the schedule to Fri, Oct 16, 10:00 AM', `an offset-less time is the practice's clock, not the machine's (TZ=${process.env.TZ})`)
    eq(moved('2026-10-16T10:00'), 'Exam moved on the schedule to Fri, Oct 16, 10:00 AM')
    eq(moved('2026-11-01T01:30:00'), 'Exam moved on the schedule to Sun, Nov 1, 1:30 AM', 'the fall-back morning resolves')
    eq(moved('2027-03-14T02:30:00'), 'Exam moved on the schedule to Sun, Mar 14, 3:30 AM', 'a time that does not exist on the spring-forward morning lands after the gap')
    eq(moved('Thu 9:00 AM'), 'Exam moved on the schedule to Thu 9:00 AM', 'a label stays as given')
    eq(moved('2026-13-40T10:00:00'), 'Exam moved on the schedule to 2026-13-40T10:00:00', 'a malformed date is shown as given, never NaN')
  }
  {
    // the Booked form: today the earliest day, and today only at a time still ahead of the practice's clock
    eq(M.localTimeInput(lnow, NY), '18:05', `the practice's clock now, whatever the machine tz (TZ=${process.env.TZ})`)
    eq(
      [
        M.slotInPast('2026-10-12', '18:00', lnow, NY),
        M.slotInPast('2026-10-12', '18:05', lnow, NY),
        M.slotInPast('2026-10-12', '18:06', lnow, NY),
        M.slotInPast('2026-10-11', '23:59', lnow, NY),
        M.slotInPast('2026-10-13', '08:00', lnow, NY),
        M.slotInPast('', '09:00', lnow, NY),
        M.slotInPast('2026-10-12', '', lnow, NY),
      ],
      [true, false, false, true, false, false, false],
      'earlier today or an earlier day is past; the current minute and anything later is not; a half-filled form is not past',
    )
  }
  const RAW = /consult_|missed_consult|never_booked|verbal_yes|form_consent|_on_file|coordinator:|text in:|undefined|null|NaN|\[object/
  for (const day of [seed, ...week.days]) {
    for (const l of day.leads) {
      const evs = day.events[l.lead_id] ?? []
      const lines = M.historyLines(evs, NY)
      const dup = evs.filter((e) => e.kind === 'coordinator' && e.data?.action !== 'note').length
      const stopTouch = evs.some((e) => e.kind === 'sms_stop') ? evs.filter((e) => e.kind === 'touch' && /^text in:\s*stop$/i.test(e.data?.what ?? '')).length : 0
      assert.equal(lines.length >= evs.length - dup - stopTouch && lines.length <= evs.length, true, `${l.first_name}: one line per event, minus the desk's duplicates and the STOP said twice`)
      const q = M.quoteLine(l.quote)
      const words = [
        M.leadName(l), M.leadStageChip(l.stage).label, M.examLine(l, day.now, NY).text, M.examDetail(l, day.now, NY), q.plan, ...q.figures,
        l.last_touch_at != null ? M.agoLabel(l.last_touch_at, day.now, NY) : '', M.touchLabel(l.last_touch), M.consentLabel(l.consent_basis),
        ...lines.flatMap((x) => [x.text, M.historyWhen(x.ts, day.now, NY)]),
        ...(l.quote?.options ?? []).flatMap((o) => [M.applianceName(o), M.applianceShort(o), M.insuranceText(o)]),
        M.categoryName(l.quote),
      ]
      for (const w of words) assert.equal(RAW.test(w), false, `${l.first_name}: a raw code or a hole on the page: ${JSON.stringify(w)}`)
      assert.equal(q.figures.some((f) => /you pay/i.test(f)), false, 'staff wording: patient pays, never you pay')
      for (const x of lines) assert.equal(typeof x.text === 'string' && x.text.length > 0, true)
      n++
    }
  }

  // -- the card title and Katie's sentence
  eq(M.LEAD_FILTERS.map((f) => M.leadsTitle(f.value, f.value === 'open' ? 11 : f.value === 'all' ? 14 : 1, seed.summary)), [
    '11 open leads', '3 missed consults', '1 never booked', '4 with a consult booked', '1 came in, not started', '3 quoted', '1 started', '1 paused', '1 lost', '14 leads',
  ], 'the title counts from the summary (a short page never shrinks it)')
  eq([M.leadsTitle('open', undefined, seed.summary), M.leadsTitle('open', 1, undefined), M.leadsTitle('missed_consult', 1, {}), M.leadsTitle('all', 1, {})], ['', '1 open lead', '1 missed consult', '1 lead'])
  eq(M.leadsSentence(seed.summary), '11 open leads. Three missed consults: start with those.')
  eq([M.leadsSentence(undefined), M.leadsSentence({}), M.leadsSentence({ total: 0, open: 0 })], ['', '', ''], 'nothing to say without leads')
  const sentences = new Set()
  for (const open of [0, 1, 2, 11, 240, 1999]) {
    for (const missed of [0, 1, 3, 180]) {
      for (const never of [0, 1, 7, 90]) {
        for (const happened of [0, 1, 12]) {
          const sum = { total: Math.max(open, 1) + 5, open, missed_consult: Math.min(missed, open), never_booked: Math.min(never, open), by_stage: { consult_happened: Math.min(happened, open) } }
          const t = M.leadsSentence(sum)
          assert.equal(t.length > 0 && t.length <= 140, true, `Katie's lead sentence fits 140: ${t.length} "${t}"`)
          assert.equal(/[.]$/.test(t) && !RAW.test(t), true, t)
          sentences.add(t)
        }
      }
    }
  }
  eq(sentences.has('No open leads right now. Everyone quoted has started, paused or closed.'), true)
  eq(sentences.has('One open lead. One missed consult: start with that one.'), true)
  n += sentences.size
}

console.log(`check-lib: ${n} assertions passed (TZ=${process.env.TZ ?? 'system'})`)
for (const m of softFails) console.error(`check-lib: OPEN DEFECT: ${m}`)
if (softFails.length) process.exitCode = 1
// the same checks with the machine in Tokyo (UTC+9, no DST): every time is practice-tz arithmetic
if (process.env.TZ === 'UTC' && !process.env.CHECK_LIB_CHILD) {
  const { spawnSync } = await import('node:child_process')
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, TZ: 'Asia/Tokyo', CHECK_LIB_CHILD: '1' },
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
