# Katie, occasional: what monday.com's llama actually does, and the spec that follows

2026-10-13. Tom's direction: Katie is too much. She should only pop up occasionally, the way the
llama does in monday.com. This document has three parts. Part 1 covers what the llama really does
inside monday.com. Part 2 gives the rules that keep an occasional mascot charming instead of
tiring. Part 3 is the replacement spec for Katie on this dashboard. Every URL is listed in
`sources-2026-10-13.md` beside this file.

**Marks.** VERIFIED means a researcher read the page or the help-center article text itself.
REPORTED means it came only from a search-result snippet, because the page returned 403, 404 or
410. support.monday.com and community.monday.com blocked direct fetches. The help-center text was
read through Zendesk's JSON API for the same articles, so those items are VERIFIED. Every
community-forum item is REPORTED.

---

## Part 1. The monday.com llama in the product

### The short answer

Inside monday.com the llama does not wander the screen, pop up, or react to clicks. It appears in
only one place, a widget that a user has to add on purpose. Its one loud moment, a "llama dance
party", fires only when every item in that widget is done. Everywhere else the llama is a
marketing character in TV, transit and social ads, including the late-2025 ads for the "monday
sidekick" AI assistant. The sidekick product itself shows no llama. The small, frequent moment
people remember from monday.com is a brief confetti spray when an item is marked done, and no
character appears in it.

Tom's picture of the llama popping up now and then is closer to Asana's celebration creatures,
which really do fly across the screen at random after a task is completed. The pattern Katie
should copy combines the two. From monday she takes the rule of one character saved for real
milestones. From Asana she takes the rule of not every time, with a setting to turn it off.

### Every in-product appearance found

| Appearance | Trigger | Behaviour | Duration and frequency | Entry and exit | User control | Mark |
|---|---|---|---|---|---|---|
| **Llama Farm widget**: one llama per board item, with baby llamas for subitems | The user adds it as a board view ("More views") or a dashboard widget | Each llama takes the color of a chosen Status column. The goal is to turn every llama green. Baby llamas show how many subitems exist but do not change color | Always visible while that view is open | Static inside the widget. The only movement described is "trotting" (REPORTED) | Opt-in. Settings in the widget's three-dot menu cover groups, start and due dates, goal title, status columns and boards | VERIFIED (help-center JSON, article 4415714043538, edited 2025-02-04) |
| **Llama dance party** | Every llama in the widget has turned green, meaning every item is done | The llamas dance | Duration, looping and clickability: **not established** | Not established | Only exists where someone added the widget | VERIFIED trigger ("Once all the llamas turn green…") |
| **Happy or sad llamas** | Items marked Done between the widget's start and due dates | Llamas "look happy and fed". If too little progress is made by the due date they "appear as sad" | A state, not an event | None | Dates are set in widget settings | VERIFIED in the help-center article text. One researcher's snippets left out the mood detail, but the article itself states it |
| **Done confetti** (no llama) | A status changes to a label the board defines as "done" | A "mini spray of confetti" | Duration and any rate limit: **not established** | Not established | Done labels are chosen under Customize Status column. A team that renamed "Done" to "Won" lost the confetti | Mechanism VERIFIED (article 360001269685 and the API's `is_done` flag). The animation itself is REPORTED (forum snippets, a Sunsama user's description, a 2017 blog GIF named "done-celebration-confetti") |
| **Goal widget confetti** (no llama) | A numeric goal battery reaches its target | The battery fills, then confetti | Once at the goal. Duration not stated | Not stated | Opt-in widget | VERIFIED (article 360017451079) |
| **Seasonal animations** (no llama) | Winter season | A dancing snowman in the bottom-left corner of boards, skiers on the home page | Ambient, always on in season | Not established | Partial. See the next row | REPORTED (forum thread 64338) |
| **"Hide Done Animations"** | n/a | A per-user monday.labs beta. Staff say it stops done animations | n/a | n/a | Users report it covered the snowman but not the skiers, had no Deactivate button, and that no account-wide switch exists | REPORTED. monday.labs being a per-user beta panel is VERIFIED (article 360002138760) |

**Not found anywhere.** No source shows a llama in empty states ("all caught up"), inbox zero,
notifications, loading screens, onboarding, errors or the 404 page. A help-center search for
"llama" returns exactly one article, the Llama Farm. A help-center search for "animation" returns
nothing about reduced motion.

### How users react

- **Some people like it.** One reviewer called the Llama Farm her "favorite aspect" and said the
  llama party is motivating (VERIFIED, softwarefinder.com, June 2023). A Capterra snippet says the
  same (REPORTED). One user wanted the confetti badly enough to ask Sunsama to copy it (VERIFIED,
  Nov 2024).
- **Many people do not know it exists, or do not care.** In a staff poll asking "Do you use the
  Llama Farm widget?", replies ranged from "My team loves the llamas!" to users who had never heard
  of it, and one who said the effort belonged in basic features (REPORTED).
- **The always-on animations draw complaints.** A thread titled "Button to turn off all
  animations" called the seasonal animations "utterly overstimulating" and raised ADHD, autism,
  battery use and the ADA. Users asked for a user-level or account-level off switch (REPORTED).
  Another thread asked to bring back the "fireworks" after the hide toggle removed them, so some
  users miss the effect once it is gone (REPORTED, title only).

The lesson for Katie: the character that is opt-in and tied to a real milestone gets fondness. The
animation that plays on its own, all the time, gets a request for an off switch. Katie today
behaves like the second kind.

### What could not be established

- How long the dance party or the done confetti lasts, how either enters or leaves, and whether
  either can be clicked.
- Whether every done change fires confetti or only some. No throttle or randomness is documented.
- The current state of the labs toggle, and whether monday honours the OS setting
  `prefers-reduced-motion`.
- When the Llama Farm launched (the earliest dated llama sources are the January 2025 ads) and why
  monday chose a llama.
- Any monday.com brand guideline, Vibe design-system page or talk with rules for when or how often
  the llama or celebrations should appear.
- The full text of any community.monday.com thread (all returned 404).

---

## Part 2. What makes an occasional mascot charming instead of tiring

Each rule below is tied to its sources. Several products reached the same rules on their own.

| # | Rule | Evidence |
|---|---|---|
| R1 | **Appear only on a real accomplishment or a real need, never on a timer, idle time or hover.** | monday saves the dance party for the moment every item is done, and fires confetti only on statuses marked done (VERIFIED). Asana celebrations fire on task completion only (VERIFIED). Mailchimp's high-five plays only after a successful send or submit (VERIFIED). Duo's Fire form appears only at streak milestones (VERIFIED). Clippy appeared on a guess ("Dear…") and was hated for it (VERIFIED, Mental Floss). |
| R2 | **Not every time. Make it rare.** | Asana: "Celebrations don't appear every time you complete a task" (VERIFIED, 2016 blog). One Asana user saw them only a few times across more than 100 tasks (REPORTED). Users who ask for "every time" are a minority, and Asana has not granted the request in four years of forum posts (VERIFIED). monday's llama party is once per goal (VERIFIED). |
| R3 | **Frequent events get a small effect, not the character.** | monday gives each finished item a brief confetti burst and keeps the llama for finishing the whole goal (VERIFIED and REPORTED as marked in Part 1). For Katie, confetti is banned, so the small effect is the number on the card updating, and nothing more. |
| R4 | **Big moments are milestones, not counts of one.** | Duolingo transforms Duo only at one week, one month, 100 days and one year (VERIFIED). Asana's yeti hides under the oldest, hardest tasks (VERIFIED). |
| R5 | **Never be playful in a frustrating moment.** | Mailchimp's Mark DiCristina: "we never try to be playful in moments where there might be some frustration" (VERIFIED, Creative Review 2020). Mailchimp's style guide: "If you're unsure, keep a straight face" (VERIFIED). |
| R6 | **Do not interrupt work in progress. Wait for a quiet moment.** | Horvitz's CHI 1999 principles list "poor timing of action" as a core failure and recommend deferring action to "a time when action will be less distracting" (VERIFIED, PDF). |
| R7 | **Leave on its own, and step aside at once when waved off.** | Horvitz's LookOut agent would "nod… and disappear" when told no. When ignored it would "wait patiently" and then "evaporate" (VERIFIED). Asana's creatures are "only there for a fleeting moment" (VERIFIED, Zapier). |
| R8 | **Let people invoke it on purpose and turn it off.** | Horvitz principle 6 asks for "efficient means by which users can directly invoke or terminate" the agent (VERIFIED). Asana has a Display setting and an on-demand "Extra Delight" option (VERIFIED). monday users' main complaint is the missing off switch (REPORTED). Clippy was turned off by default in 2001 to 2002 (VERIFIED and REPORTED). |
| R9 | **Respect motion settings.** | WCAG 2.3.3: motion triggered by interaction can be disabled, through `prefers-reduced-motion` or a setting, because some users experience "distraction or nausea" (VERIFIED). Motion that starts on its own falls under WCAG 2.2.2 Pause, Stop, Hide (REPORTED). monday users with ADHD and autism asked for exactly this (REPORTED). |
| R10 | **The character never narrates for its own sake.** | Mailchimp's Freddie "does not talk" (VERIFIED). GitHub's Octocat "must never speak" (VERIFIED). Katie is different because her job is speaking, so the rule becomes this: she says only the one data sentence the widget already shows, and never a greeting, a joke or filler. That is already the brief's rule. |
| R11 | **Do less, but be right.** | Horvitz principle 8 prefers "doing less" but doing it correctly when the agent is unsure (VERIFIED). Clippy's careful Bayesian timing was reportedly swapped for a cruder rule so he would appear more often, and that is what made him hated (REPORTED, quoted on LessWrong). His own designers had worried the plan "would be distracting to users" (VERIFIED, Horvitz site). |

The Clippy failure, in one line: he was unsolicited, he was triggered by guesses instead of real
events, he kept coming back after people learned the task, and he had no easy way to send him off.
Today's Katie walks to every widget the pointer touches, which is the same failure in a friendlier
costume.

---

## Part 3. Katie spec: occasional appearances that replace the always-on walking

### 3.1 The model in one paragraph

Katie is **off screen by default**. There is no standing at home, no walking in on every page load,
no hover following and no resting. She steps in only for a short list of real moments that the
event stream or the stats show for certain. She walks or rises to the one widget that matters, says
that widget's own `data-katie` sentence, holds it for a few seconds, and leaves by herself. Any
click, scroll or Escape sends her away at once. Strict caps keep her rare: one ordinary appearance
per 15 minutes and six per day. Urgent callbacks are the only exception to those caps.

### 3.2 What the data supports

These checks are against `src/api/types.ts`, `src/live/stream.ts` and `director.ts`.

| Signal | Available as | Usable for a moment? |
|---|---|---|
| `call.started` | stream event. `status.line` flips to `on-call` | Yes |
| `call.ended` | stream event with `disposition`, `bookings`, `notes` | Not as a moment of its own (see 3.3) |
| `booking` | stream event, then `stats(1).bookings` after `refreshed` | Yes, by milestone |
| `note` | stream event with `urgent: boolean` | Yes, urgent only |
| `cancel` | stream event | No (R5: a cancellation is not a happy moment) |
| `sms.out` / `sms.in` | stream events, `kind` = confirmation / yes | No (too frequent and low value) |
| `status.last_call_at` | `/status` | Yes, to find "first call after a quiet hour" |
| `stats(1).urgent`, `.callbacks`, `.calls`, `.bookings` | `/stats?days=1` | Yes, for first open and milestones |
| **Callbacks list cleared** | **Not available.** `Note` has no resolved or done field, and `stats.callbacks` only grows during a day | **No.** See 3.10 |

### 3.3 When she appears (ranked)

| Rank | Moment | Exact trigger | Where she goes | What she does | Caps |
|---|---|---|---|---|---|
| 1 | **Urgent callback lands** | `note` event with `data.urgent === true`, after its `refreshed` resolves (so the widget sentence already counts it) | The Overview **Callbacks waiting** list, or the Callbacks page list. On other pages, see the fallback below | Walks in from her corner's side edge, hops up, **presents** (arm out, bubble). Straight face: no celebrate (R5) | Ignores the 15-minute cooldown and the daily cap. At most one per 10 minutes. Never within 60 s of her last exit. A second urgent note inside 10 minutes adds nothing, because the sentence already says "three of them urgent" |
| 2 | **First open of the practice day** | The first time this browser shows the dashboard on a new practice-local date (the `stats.range.tz` day), once stats has loaded. If `stats(1).urgent > 0`, the target is Callbacks waiting. Otherwise, if `stats(1).calls > 0`, it is the Calls cell (overnight and early calls). If neither, she does not appear (no filler) | As in rank 1, or the Overview Calls cell, or the Calls page summary | Walks in from the right (the existing `enterFromRight`), goes to the widget, presents | Once per practice day per browser. If the current page has no matching widget, the flag stays unset so the first visit that day to Overview or Callbacks triggers it |
| 3 | **Booking milestone** | `booking` event. After `refreshed`, `stats(1).bookings` has crossed **1, 5, 10, 20, 30, 40 or 50** (the day's first booking, then milestones, per R4) | Overview **Booked** cell, or the Bookings page summary | Rises from the bottom edge under the target column (or walks in), hops up, **celebrates** (the existing bounce and double nod, 0.9 s), then presents | 15-minute cooldown and the daily cap. A milestone that falls inside the cooldown is skipped, not queued |
| 4 | **Line wakes up** | `call.started` when it is the first call of the practice day, or when the previous call started 60 minutes or more earlier (`status.last_call_at` read before the event's refetch) | Her corner, on the floor. No travel | **Peek**: rises from the bottom edge, holds the **listen** pose (hand to ear) for 3 s, sinks back. **No bubble**, because the Line tile already shows who is calling and her pose carries the meaning. This also keeps a caller's identity out of the bubble on pages that do not show it | 15-minute cooldown and the daily cap. Never during reduced motion |
| 5 | **Asked for** (the only summon, see 3.6) | The person clicks the small Katie button in the top bar | The highest-priority widget on the current page: urgent callbacks, then callbacks waiting, then the Line tile when on a call, then the page summary | Walks in and presents, then scrolls the widget into view and gives it focus | No cap, because she was asked. It still resets the cooldown |

**Never a trigger:** hover, keyboard focus, idle time, timers, page navigation, returning to the
tab, `call.ended` alone, non-urgent notes, `cancel`, `sms.*`, `greeting`, `turn.*`, `tool`.

**Fallback when the page has no matching widget.** On the Calls, Bookings and Texts pages there is
no callbacks widget. For rank 1 she does a silent corner **peek**: she rises, faces toward the
rail's Callbacks link, holds 3 s and sinks. There is no bubble, because the rail has no urgent
badge today and the sentence would carry a caller's identity onto a page that does not show it.
Ranks 2 to 4 are skipped, and skipping does not consume the cooldown. A bubble may only ever show
the `data-katie` text of an element on the current page.

**Collisions.** If a higher-ranked moment fires while she is on screen, she retargets with the
existing `goTo` retarget. A lower-ranked moment is dropped.

### 3.4 Frequency caps and the reasoning

| Cap | Value | Why |
|---|---|---|
| Cooldown between ordinary appearances | **15 min** from her last exit | A practice where Katie answers every call might see 20 to 60 calls and 15 to 40 bookings in a 10-hour day. This is an estimate; the fixture day has 8 calls and 7 bookings. One booking every 15 to 40 minutes would put her on screen all day if each one summoned her. With a 15-minute cooldown plus the milestone rule, she reaches at most about 7 bookings a day and usually 3 or 4 (R2, R4) |
| Daily cap (ranks 2 to 4) | **6** per practice day per browser | Asana users report a few appearances per 100 or more tasks, and monday's party comes once per goal. Six keeps her an event, not a fixture. Urgent (rank 1) and asked-for (rank 5) do not count |
| Urgent spacing | 1 per 10 min, never within 60 s of an exit | Urgency is the most useful thing she can point at, but back-to-back walk-ins read as alarm |
| Quiet-moment wait (R6) | Fire only after 1.5 s with no `keydown`, `wheel` or `pointerdown`. Wait up to 20 s, then drop the moment. Urgent waits up to 2 min | Do not land on top of someone typing or scrolling |
| Drawer open | No appearance. Urgent waits until the drawer closes (2-minute limit). Others are dropped | The drawer is focused reading |
| Tab hidden | Moments are dropped, except one urgent note, which shows once on return if it is under 30 minutes old | A pile-up on return is the overstimulation monday users describe |
| Several tabs | Cooldown, daily count and the first-open date are shared through `localStorage` (`katie.lastExit`, `katie.dayCount`, `katie.firstOpenDay`), with every access wrapped in try/catch and an in-memory fallback. Only visible tabs fire | Two open tabs must not give two Katies. These keys hold timestamps and counts, never data |

### 3.5 How she enters, stays and leaves

| Phase | Motion | Timing |
|---|---|---|
| **Enter by walking** (ranks 1, 2, 5) | From off-screen at her corner's side edge, using the existing walk and L-shaped hop path (`goTo`) to the target spot | Existing walk and hop timings. Travel clamp 0.25 to 1.4 s |
| **Enter by rising** (ranks 3, 4) | A new `rise`: wrapper `y` from floor + 100 px to the floor, so the viewport's bottom edge hides her, then the existing land squash. For a target card, one hop up follows | Rise 320 ms `power2.out`. Squash as in hop |
| **Hold** | Idle breath and blink continue. The weight shift may fire. The bubble shows 150 ms after arrival, as today | `hold = clamp(3 + chars / 25, 4, 9)` s. A 140-character sentence holds 8.6 s and a 60-character one 5.4 s. That is about 15 to 17 characters a second of reading plus 2 to 3 s to notice. This formula is our estimate, since no source publishes durations. Peek (rank 4) holds 3 s |
| **Leave by herself** (R7) | Bubble out (80 ms). From a card she makes one hop down to the floor at her x, then a new `sink`: `y` to floor + 100 px | Sink 260 ms `power2.in`. Exit at most about 1 s |
| **Waved off** (R7, R8) | Any `pointerdown`, `wheel`, scroll, Escape, the drawer opening or a route change ends the hold at once and runs the exit. A click on the widget she presents also counts, and the click still goes through because her layer is `pointer-events: none` | Immediate |
| **Live call** | She is not held at the Line tile for the call. The Line tile's own state shows the call. The listen pose appears only in the rank 4 peek | n/a |

### 3.6 Hover and the one summon

**Hovering or focusing a widget no longer summons her** (R1, R6, R8, and the Clippy lesson). The
120 ms intent, the 1.2 s leave timer and focus-as-hover all go away.

The deliberate affordance is a **small Katie button**, recommended but optional. It is the 24 px
head-only avatar (cropped from the existing 40 px asset), placed in the top bar's right group, which
is already `data-katie-avoid`. Its `aria-label` is "Point out what needs attention". Clicking it
brings her in (rank 5) and also scrolls the target widget into view and moves focus to it, so the
button is useful to keyboard and screen-reader users even though her layer stays `aria-hidden`.
Like Asana's on-demand "Extra Delight", this gives people who like her a way to see her without
making everyone else watch her. It is hidden when Katie is Off and below 1024 px.

### 3.7 Settings

Replace the on/off toggle with a two-option control: **Katie: Occasional / Off**. Occasional is the
default.

- Helper text for Occasional: "Katie steps in for urgent callbacks, the day's first booking and a
  few other moments, then gets out of the way."
- The storage key `katie.enabled` is unchanged, with `'0'` meaning Off, so existing choices
  survive.
- Keep the corner setting, renamed **Katie's corner** (bottom-right or bottom-left). It now decides
  which side she enters from and where she peeks.
- Do not add more modes. An "urgent only" option can wait until someone asks for it.

### 3.8 Reduced motion and narrow screens

- **`prefers-reduced-motion: reduce`.** Only ranks 1, 2 and 5 fire. There are no booking
  celebrations and no line peeks (R9, WCAG 2.3.3). She appears with the existing reduced-motion
  move: opacity 0 to 1 in 120 ms at the spot. The bubble shows instantly, holds for the same time,
  and she leaves with opacity 1 to 0 in 120 ms. There is no walk, rise, hop, bounce or celebrate.
- **Below 1024 px.** Unchanged: she is not rendered, no listeners are attached, and the summon
  button is hidden.

### 3.9 Hard rules kept from the brief

- Every sentence she shows is the `data-katie` of an element on the current page, which is text
  already visible in a widget, in the receptionist voice, with no exclamation marks and at most 140
  characters. Moments add no new sentences.
- The director reads only event **kinds**, the `urgent` flag and the counts in `stats`. It never
  reads `data.name`, `data.reason`, `caller` or `slot` from an event payload. There is **no new
  PHI** in the bubble, in storage (timestamps and counts only) or in logs.
- No confetti and no sparkles. The per-booking feedback is the Booked number changing, which
  already happens (R3).
- Transforms only on the rig and the wrapper (`x`, `y`, scale, rotation). Opacity is used only in
  the reduced-motion path and on the bubble, as today. Her layer stays `position: fixed`,
  `pointer-events: none` and `aria-hidden`.
- Idle loops pause when the tab is hidden. While she is off screen, **stop the idle timelines
  entirely** (`stopIdle`) and start them on entry, so an absent Katie costs zero frames.

### 3.10 What changes in the code

**Keep as is.**
- The rig: `src/katie/Katie.tsx`, `rig.ts`, `pose.ts`, `parts.ts`, `geometry.ts`, `traced.ts`.
- `src/katie/motion/gait.ts` and `path.ts`, and the walk, hop, present, listen, celebrate,
  `enterFromRight`, reduced-motion and pause code in `controller.ts`.
- `src/katie/stage/placement.ts` (`spotFor`, `bubbleAt`, `homeSpot`, the avoid rule) and
  `fitBubble.ts`.
- `src/live/stream.ts` needs no change. The bus already carries every kind and its `refreshed`
  promise.
- The `/dash/_katie` playground.

**Change.**
- **`src/katie/stage/director.ts`** becomes an appearance runner. Remove hover intent
  (`pointerover`/`pointerout`/`focusin`/`focusout`, `INTENT_MS`, `LEAVE_MS`, `committed`,
  `pending`). Remove rest (`REST_MS`, `scheduleRest`, wake-on-move). Remove the whole-call listen
  at the Line tile (`callActive` driving `desired()`). Remove the `zeroCallsToday` rest spot, the
  walk-in on every mount, and scroll riding, because scrolling now dismisses her. Add a single
  `show(moment)` → travel → hold → exit sequence, with dismissal listeners attached only while she
  is on screen.
- **New `src/katie/stage/moments.ts`**, a pure module. It holds the trigger rules, the rank order,
  the cooldown, the daily cap, the urgent spacing, the milestone list and the practice-day key, and
  it decides `fire | skip | wait` from plain inputs (now, last exit, counts, reduced, drawer,
  hidden). Unit-test it in `scripts/check-lib.mjs` alongside the sentence tests.
- **`src/katie/motion/controller.ts`**: add `rise(x, floorY)` and `sink()` (wrapper `y` tweens,
  run through `track()`), plus an `offscreen` flag in `getState()`. Constants go in
  **`timing.ts`** as `RISE` and `SINK`, along with the hold formula.
- **`src/katie/stage/KatieStage.tsx`**: drop the `zeroCallsToday` input. Feed `stats(1)` (`calls`,
  `bookings`, `urgent`, `range.tz`) and `status.last_call_at` to the director. The mock-mode
  `__katieStage` hook gains `trigger(moment)` and the cap state, so Playwright can force each
  moment.
- **`src/components/Card.tsx`**: a Katie target no longer becomes focusable just for Katie (the
  "focus counts as hover" reason is gone). Add `data-katie-moment="urgent | first-open |
  booking | summary"` so the runner finds the right widget on each page without a hard-coded
  selector list.
- **`src/pages/Settings.tsx` and `src/settings/store.ts`**: the Occasional / Off control and the
  helper text from 3.7. The comment "Katie walks to what you point at" becomes false.
- **`src/shell/TopBar.tsx`**: the optional summon button (3.6).

**Remove.**
- The stage's use of rest. The `rest()` method can stay in `controller.ts` for the playground but
  is no longer called. `walkInPlace` is untouched.
- Hover-driven checks in `scripts/verify.mjs`. Replace them with one check per moment, a cap
  check (a second booking inside 15 minutes does not fire) and a dismissal check.

**Docs to update afterwards (owned elsewhere).** Brief section 3 (the `hop` on hover, `listen` for
the whole call, `rest`, and the choreography rules) and DESIGN.md 7.2 to 7.4 (home position, rest
spot, hover intent, the live section) describe the old always-on Katie and should point to this
spec.

**A future moment that needs the backend.** If notes gain a resolved or done state, then
**"callbacks waiting reached zero"** becomes Katie's true Llama Farm moment: the whole goal done.
It would be the one appearance that earns a full celebrate after a busy morning. Today the data
cannot tell a cleared list from a list that never filled, so this moment is not in the spec.
