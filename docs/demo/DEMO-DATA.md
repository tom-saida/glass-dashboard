# Demo dataset: Harborline Orthodontics (fictional)

What the Katie dashboard shows in `mock=demo`: one full demo day (36 calls, the last one replayed live),
29 days of history behind it, and the stats a two-doctor orthodontic office would see. Built by
`node scripts/demo-data.mjs` into `src/mock/demo/`; the wiring contract for the mock is
`src/mock/demo/README.md`. Every person, number and practice is invented; all phone numbers are in the
reserved 555-0100..0199 range.

## The demo day at a glance

Day 0 is the day on screen. The mock pins its clock to **9:10 PM** that day: 35 calls are done, and the
36th (s36, the showpiece) starts live on screen when the dashboard opens.
Spoken dates assume day 0 is Tuesday the 21st.

| # | Time | Caller | Language | Outcome | What happened |
|---|---|---|---|---|---|
| s01 | 06:48 (after hours) | (813) ***-0101 | English | Booked | Mom books a first consult for her son, dentist referral. Booked Ethan Caldwell Thu 9:00 AM; text sent, replied yes. |
| s02 | 07:35 | (727) ***-0102 | English, greeted as Priya | Booked | Known patient, wire poking her cheek: urgent note, seen today. Booked Priya Nair Tue 11:20 AM; 1 urgent note; text sent, replied yes. |
| s03 | 08:02 | (813) ***-0103 | Spanish | Booked | Spanish: mom books a consult for her 14-year-old daughter. Booked Camila Ortega Wed 2:40 PM; text sent, replied yes. |
| s04 | 08:15 | (941) ***-0104 | English | Booked | "Do you take Delta Dental?" then an adult aligner consult. Booked Jordan Whitaker Fri 8:20 AM; text sent, replied yes. |
| s05 | 08:31 | (352) ***-0105 | English | Booked | Dad moves his son from Wed 3:20 PM (band practice). Booked Owen Castillo Thu 3:20 PM; cancelled Wed 3:20 PM; text sent, replied yes. |
| s06 | 08:47 | (904) ***-0106 | English | No booking | Mom asks for Dr. Reyes about a possible expander: message taken. No booking; 1 callback note. |
| s07 | 09:05 | (813) ***-0107 | English | Booked | Patient cracked her retainer: check booked, no care advice given. Booked Sam Whitlock Wed 10:00 AM; text sent, replied yes. |
| s08 | 09:22 | (656) ***-0108 | English | No booking | Dad asks about payment plans: no amounts, billing callback note. No booking; 1 callback note. |
| s09 | 09:40 | (727) ***-0109 | English | Booked | Mom books two kids back to back, Cigna. Booked Ava Mendez Thu 10:20 AM + Noah Mendez Thu 10:40 AM; text sent, replied yes. |
| s10 | 09:58 | (813) ***-0110 | English | Booked | Son's bracket off at breakfast: urgent note, seen today. Booked Lucas Castellano Tue 2:00 PM; 1 urgent note; text sent, replied yes. |
| s11 | 10:14 | (727) ***-0111 | English | Booked | Dentist referral, new adult on Cigna. Booked Priya Ramanathan Thu 1:00 PM; text sent, replied yes. |
| s12 | 10:30 | (352) ***-0112 | English | No booking | Asks about cleanings and whitening: ortho only, no note. No booking. |
| s13 | 10:47 | (941) ***-0113 | English, greeted as Marcus | No booking | Known patient lost his sticky note: Katie reads back tomorrow 10:40 AM. No booking. |
| s14 | 11:03 | (813) ***-0114 | Spanish | Booked | Spanish: existing patient moves Thu 8:40 AM to Friday. Booked Daniela Ríos Fri 9:20 AM; cancelled Thu 8:40 AM; text sent, replied yes. |
| s15 | 11:21 | (656) ***-0115 | English | Booked | "Are you in network with MetLife?" then a first consult. Booked Morgan Ellis Wed 9:40 AM; text sent, replied yes. |
| s16 | 11:38 | (904) ***-0116 | English | Booked | Asks what aligners cost: no price, doctor covers it at the consult. Booked Tessa Moreau Fri 10:20 AM; text sent, no reply. |
| s17 | 11:55 | (727) ***-0117 | English | Booked | Daughter stepped on her retainer: after-school visit. Booked Sophie Kemper Thu 4:00 PM; text sent, replied yes. |
| s18 | 12:10 | (352) ***-0118 | English | No booking | Lunch hour: possible double charge, billing callback. No booking; 1 callback note. |
| s19 | 12:42 | (352) ***-0119 | English | Booked | New adult consult, gives the birth date in two goes. Booked Dana Whitfield Wed 1:20 PM; text sent, replied yes. |
| s20 | 13:05 | (727) ***-0120 | English | Booked | Son's molar band loose: urgent note, seen today. Booked Theo Albright Tue 3:40 PM; 1 urgent note; text sent, replied yes. |
| s21 | 13:26 | (656) ***-0121 | English, greeted as Nadia | No booking | Known patient 15 minutes late for her 1:40: FYI note. No booking; FYI note. |
| s22 | 13:44 | (904) ***-0122 | English | No booking | Mom cancels Thursday 2:20 PM, will call back to rebook. No booking; cancelled Thu 2:20 PM; 1 callback note. |
| s23 | 14:03 | (813) ***-0123 | Spanish | Booked | Spanish: dad asks about Medicaid, son booked, coverage-check note. Booked Diego Fuentes Thu 11:00 AM; 1 callback note; text sent, replied yes. |
| s24 | 14:21 | (941) ***-0124 | English | Booked | Aetna question, adult consult, no price quoted. Booked Kevin Oduya Wed 4:20 PM; text sent, replied yes. |
| s25 | 14:39 | (352) ***-0125 | English | Booked | Grandmother books her granddaughter, unsure of the birth date. Booked Amara Okafor Fri 8:40 AM. |
| s26 | 14:58 | (727) ***-0126 | English | No booking | Wants to move Monday 10:00 AM: no openings, callback note. No booking; 1 callback note. |
| s27 | 15:17 | (656) ***-0127 | English | Booked | "Open Saturdays?" Katie gives the hours, adult consult booked. Booked Robert Halvorsen Thu 2:40 PM; text sent, replied yes. |
| s28 | 15:35 | (813) ***-0128 | English | Booked | 16-year-old books her own consult, mom's number on the note. Booked Brianna Calloway Wed 11:20 AM; 1 callback note. |
| s29 | 15:52 | (727) ***-0129 | English | Booked | Adult Invisalign consult, name corrected at the read-back. Booked Renee Shimanski Thu 9:40 AM; 1 callback note. |
| s30 | 16:10 | (352) ***-0130 | English | No booking | Parent wants early mornings from now on: scheduler note. No booking; 1 callback note. |
| s31 | 16:33 | (941) ***-0131 | English | Booked | "Do you take Humana?" son booked, coverage-check note. Booked Mason Pruitt Fri 11:40 AM; 1 callback note. |
| s32 | 16:55 | (904) ***-0132 | English | Booked | Bracket off at lunch: urgent note, first thing tomorrow, plus a care-question callback. Booked Zoe Lindqvist Wed 7:40 AM; 1 urgent note; 1 callback note. |
| s33 | 18:12 (after hours) | (813) ***-0133 | English | Booked | After hours: mom books a consult for her daughter. Booked Isabella Hartwell Thu 8:00 AM; text sent, replied yes. |
| s34 | 19:40 (after hours) | (656) ***-0134 | Spanish | Booked | After hours, Spanish: existing patient moves Mon 3:20 PM. Booked Mariela Quintero Tue 9:00 AM; cancelled Mon 3:20 PM; text sent, replied yes. |
| s35 | 20:55 (after hours) | (727) ***-0135 | English | Booked | After hours: wire poking his cheek, urgent note, first thing tomorrow. Booked Owen Brandt Wed 8:20 AM; 1 urgent note. |
| s36 | 21:10 (after hours) | (813) ***-0136 | English | Booked | LIVE SHOWPIECE: Delta Dental question, 13-year-old new patient, text confirmed. Booked Ellie Navarro Thu 10:00 AM; text sent, replied yes. |

## The numbers

| | Calls | Booked calls | Bookings | Callbacks | Urgent | FYI | Texts out / in | Spanish | After hours | Avg length |
|---|---|---|---|---|---|---|---|---|---|---|
| Day 0 at 9:10 PM (before the live call) | 35 | 26 (74%) | 27 | 16 | 5 | 1 | 20 / 19 | 4 | 4 | 90.1 s |
| Day 0 after the live call | 36 | 27 (75%) | 28 | 16 | 5 | 1 | 21 / 20 | 4 | 5 | 91.2 s |
| Yesterday | 30 | 24 (80%) | 24 | 7 | 1 | 2 | 18 / 17 | 1 | 5 | 95.1 s |
| Last 30 days (at 9:10 PM) | 666 | 416 (62%) | 425 | 170 | 42 | 34 | 311 / 265 | 61 | 102 | 80.5 s |

"Callbacks" are desk notes the team has to act on (every note that is not FYI); urgent notes are included
in them. "After hours" means outside 7:30 AM-5:00 PM Mon-Fri, and all weekend.

Calls by starting hour, 6 AM to 10 PM:

| Hour | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Day 0 | 1 | 1 | 4 | 4 | 3 | 4 | 2 | 3 | 4 | 3 | 3 | 0 | 1 | 1 | 1 | 1 | 0 |
| 30 days | 9 | 17 | 84 | 73 | 97 | 61 | 39 | 50 | 72 | 76 | 51 | 13 | 8 | 10 | 5 | 1 | 0 |

Month dispositions: phone-booked 416, phone-no-booking 250. Languages: es 61, en 605.

**Does it read like a real office?** Day 0 is a busy Tuesday: 36 calls against a usual 26-32 (avg 27.8) on
Tuesdays, which suits the day a demo shows. 75% of today's calls booked, against
62% for the month: the scene writers leaned toward bookings (only 9
of 36 calls end without one), so the demo day is a strong day rather than an average one, and the month
underneath is the realistic baseline. The rest reads true to a two-doctor practice: new-patient consults
are the biggest share, then reschedules, insurance questions, broken brackets and wires, retainer trouble,
billing questions and people running late; a handful of after-hours calls every weekday evening, a short
Friday, a quiet weekend, and roughly one call in ten in Spanish. Day 0 is also heavy on desk work:
16 callbacks and 5 urgent notes, against a history average of 5.3 callbacks and
1.3 urgent notes a day. That is deliberate (the scenes show every kind of note Katie files) and
fine for a demo, but it is the day's one number a practice manager might call high.

**Dates.** The transcripts speak dates as if day 0 is Tuesday the 21st ("Thursday the twenty-third"), and
the history's weekday shape assumes a Tuesday too. The mock anchors day 0 to the real date, so on any
other day the spoken day-of-month is off (on Wednesday, October 21, 2026, "Thursday the twenty-third" is
really a Friday). `manifest.date_phrases` lists every spoken date so the mock can rewrite them;
see the README.

## History (days -1 to -29)

- Weekday profile: Mon 29-32 (avg 31), Tue 26-32 (avg 27.8), Wed 28-34 (avg 32), Thu 30-34 (avg 32), Fri 14-18 (avg 16), Sat 6-9 (avg 7.5), Sun 3-5 (avg 3.8) calls.
- Time of day: morning peak 8-11, lunch dip at 12, afternoon peak 2-4, a tail of after-hours calls until about 9 PM.
- Mix, by weight: new consult 28, insurance then book 10, reschedule 10, urgent 6, retainer 4, sibling 1.5, confirm 8, question no booking 4, running late 4.5, cancel callback 4.5, billing 7, not our service 2.5, no openings 2, preference 2.5, hangup 3. 62% of history calls book.
  Confirmation texts go out at hangup on about three in four booked calls; most get a "yes" back.
- No `unknown-crash` calls. A real month on this line could have one, but the dashboard's crash chip is
  already covered by the fixtures, and a "crashed" call in a sales demo costs more than it teaches.
  Instead about 4% of history calls are hang-ups and wrong numbers (one caller turn, under 20 s), as a real line has.
- Rows only: history calls have rows, bookings, notes and texts but no transcripts (the drawer gets a 404),
  except the **8 most recent**, yesterday from 4 PM on, which were written as full calls:
  a consult after school, a loose front bracket before picture day (urgent, booked for 7:40 the next
  morning), a Spanish consult, an after-hours insurance pre-authorization question (callback note), an
  after-hours adult aligner consult (no price quoted), an after-hours reschedule, a known patient checking
  her time, and a dog-chewed retainer (booked, plus a callback for the care question).
- First lines are written per call type (none copied from today's scenes); names, slots, reasons and
  insurance plans are drawn from the scenes and recombined. Booked slots never collide with each other or
  with any appointment the scenes mention.

Per day: 0 Tue 35, -1 Mon 30, -2 Sun 4, -3 Sat 9, -4 Fri 14, -5 Thu 30, -6 Wed 33, -7 Tue 27, -8 Mon 32, -9 Sun 3, -10 Sat 8, -11 Fri 17, -12 Thu 32, -13 Wed 34, -14 Tue 26, -15 Mon 29, -16 Sun 3, -17 Sat 7, -18 Fri 18, -19 Thu 32, -20 Wed 28, -21 Tue 26, -22 Mon 32, -23 Sun 5, -24 Sat 6, -25 Fri 15, -26 Thu 34, -27 Wed 33, -28 Tue 32, -29 Mon 32.

## The live showpiece

s36 (`CA418009612779`) starts at 9:10 PM, the moment the demo opens: a mom calls late about braces for
her 13-year-old, asks first whether the office takes Delta Dental ("Yep, we do take Delta Dental!"),
and Katie books Ellie Navarro, a new patient referred by her dentist, for Thursday the 23rd at 10:00 AM,
reads the spelling back and asks before texting; at hangup the confirmation text goes out and the "yes"
comes back. 130 seconds,
46 events. The replay file is `src/mock/demo/live-s36.txt`.

## Output

- `src/mock/demo/README.md`: 7.1 KB
- `src/mock/demo/backend.ts`: 11.0 KB
- `src/mock/demo/events.ts`: 1.0 KB
- `src/mock/demo/history.json`: 505.1 KB
- `src/mock/demo/live-s36.txt`: 8.1 KB
- `src/mock/demo/manifest.json`: 59.9 KB
- `src/mock/demo/materialize.ts`: 30.2 KB
- `src/mock/demo/scenes.json`: 202.6 KB
- Total 825.0 KB (limit 1,536 KB).

## Fixes made to scene files

The script validates every scene before it builds anything (shape, timing, counts, office hours, the
20-minute slot grid, spoken dates and times against the slots, texting consent, no prices, one booking
call per patient, no near-duplicate or shared names across unrelated callers). These scene files failed
as delivered and were fixed by hand, changing as little as possible:

- **s10**: patient "Owen Castellano" renamed "Lucas Castellano". Why: near-duplicate of s05 "Owen Castillo" (same first name, surnames share "Cast"), and the same patient as s20 (rule: a patient is booked by one call a day).
- **s20**: patient "Owen Castellano" renamed "Theo Albright". Why: same patient booked twice today (s10 and s20, two urgent same-day visits); also the fourth Owen of the day.
- **s21**: patient "Priya Raman" renamed "Nadia Brooks" (greeted_as, greeting, note name, transcript). Why: near-duplicate of s11 "Priya Ramanathan"; third Priya of the day.
- **s15**: patient "Jordan Whitfield" renamed "Morgan Ellis". Why: near-duplicate of s04 "Jordan Whitaker"; surname shared with s19 "Dana Whitfield" (unrelated caller, both on the bookings list).
- **s17**: surname "Navarro" changed to "Kemper" (Sophie Kemper). Why: surname shared with s36 "Ellie Navarro" (unrelated caller, both on the bookings list).
- **s14**: surname "Ortega" changed to "Ríos" (Daniela Ríos). Why: surname shared with s03 "Camila Ortega" (unrelated caller, both on the bookings list).
- **s22**: surname "Brennan" changed to "Lowry" (Sophie Lowry). Why: surname shared with s06 "Rachel Brennan" (unrelated caller, both on the notes list).
- **s33**: the confirmation text and its "yes" moved from mid-call (turns 9-10) to hangup (93.2 s / 93.5 s, turn 10); Katie's "Done — it's on its way." became "Great — I'll send that over when we hang up.". Why: the text went out while the caller was still talking; Katie sends the one confirmation text at hangup, after the yes.
- **s34**: same move (now 66.0 s / 66.3 s, turn 7); "Ya se lo envié." became "Se lo mando al colgar.". Why: same rule.
- **s36**: same move (now 129.4 s / 129.7 s, turn 12); "Done — it's on its way." became "Great — I'll send it as soon as we hang up.", "Just reply yes to it and you're all set." became "Just reply yes when it comes in.", and the caller's "Oh — got it. Okay, I said yes. Um, should we bring anything?" became "Oh — okay, got it. Um, should we bring anything?". s36-live.txt rebuilt from s36.json with the same framing (46 blocks). Why: same rule; the replay file must match the scene event for event.
- **s35**: the urgent note's annotation "note is informational" became "please call the parent first thing in the morning". Why: Katie tells the parent "I've flagged this as urgent, so the team sees it first thing in the morning", so the note asks the desk to act; without it the demo day had no urgent callback waiting (every urgent note was informational).
- **s16**: Katie's line "...at the consultation — and the consultation is complimentary." cut to "...at the consultation."; the caller's reply "Oh, it's free? Okay." became "Okay, that makes sense.". Why: Katie quoted a price ("complimentary" = $0); she never quotes prices.

Writer choices kept as they are (they pass): texts go out a fraction of a second before `call.ended`
instead of after it; `sms.out` chars are 36 in most scenes and about 90 in s33, s34 and s36; several
writers made Katie read back the caller's real last four digits rather than the fixtures' fixed
"zero, one, eight, eight".
