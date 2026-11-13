# Build the Katie dashboard

You are building a web dashboard for **Katie**, an AI phone receptionist for orthodontic practices, made by SAIDA (Tom Martorana's AI-automation company, Tampa). Katie answers the practice's phone line, books consultations into the practice's scheduling system, looks up existing patients, takes desk notes for callbacks, and texts confirmations. The dashboard is what the practice owner and the front desk open to see what Katie did: who called, what was said, what got booked, who needs a callback, what was texted — and, when the line is live, that a call is happening right now.

Two things make this dashboard different from a generic admin panel, and both are non-negotiable:

1. **Katie is in it, as a full-body character.** She walks around the dashboard. When you hover a widget she walks over, stands on it, and tells you the one thing worth knowing about it. When a call comes in she goes to the line tile and listens. She is the receptionist, not a chatbot bubble.
2. **It is as clean as monday.com, and it is not "AI slop".** Light theme, white surfaces, one accent, real data, generous space, a design system applied with discipline. Nobody looking at it should be able to tell it was built by an agent.

Work in this folder (`~/Desktop/SAIDA/katie-dashboard/`). Everything you need to start is under `brief/`: this prompt, API fixtures that match the real backend byte for byte (`brief/fixtures/`), and Katie's existing artwork (`brief/assets/katie/`). Read all of it before writing code.

---

## 1. What exists, and what you connect to

The backend is already built and will be running on SAIDA's box at `https://dash-backend.example.com`. It is a FastAPI app that records every call as it happens into an event store and serves it read-only under one basic-auth gate. You do not build any backend, database or auth. You build a static front end that calls these endpoints and is served from the same origin at `/dash/`.

**Base path:** the app is served at `https://dash-backend.example.com/dash/` — build with Vite `base: '/dash/'` and use client-side routes under it. Because it is the same origin as the API, every request is a relative `/api/dash/...` call; the browser carries the basic-auth session, so the front end has no credentials at all.

**Endpoints** (all `GET`, all JSON; timestamps are UNIX seconds in UTC — display them in the practice's timezone, which `stats.range.tz` tells you):

| Endpoint | Returns | Fixture |
|---|---|---|
| `/api/dash/status` | `{ok, line: "idle"\|"on-call", live_calls, last_call_at, boot_at, now, practice, model, agent}` | `status.json` |
| `/api/dash/stats?days=1` (1–90) | counts for the range: `calls, booked_calls, bookings, callbacks, urgent, sms_out, sms_in, avg_duration_s, by_hour[24]{hour,calls,booked}, dispositions{}, languages{}, range{from,to,days,tz}` | `stats.json`, `stats-7d.json` |
| `/api/dash/calls?limit=50&before=<ts>` | `{calls:[...]}` newest first; each `{call_id, started_at, ended_at, duration_s, caller, disposition, summary, bookings, notes, language, greeted_as, turns, status: "live"\|"ended", first_line}` | `calls.json` |
| `/api/dash/calls/{call_id}` | `{call:{...}, events:[{id, ts, kind, turn, data}]}` — the whole call in order | `call-*.json` |
| `/api/dash/bookings?limit=50` | `{bookings:[{id, ts, call_id, caller, name, slot, reason, insurance}]}` | `bookings.json` |
| `/api/dash/notes?limit=50` | `{notes:[{id, ts, call_id, caller, name, reason, urgent, fyi}]}` — desk notes = callbacks | `notes.json` |
| `/api/dash/sms?limit=50` | `{sms:[{id, ts, call_id, direction: "in"\|"out", phone, kind, chars}]}` | `sms.json` |
| `/api/dash/stream` | Server-Sent Events, one per event as it happens (`event:` = kind, `data:` = `{ts, call_id, kind, turn, data}`), a `: ping` comment every 15 s | `stream-sample.txt` |

**Event kinds** inside a call, in the order they happen: `call.started` → `greeting {name}` → repeated `turn.caller {text}` / `turn.bot {text}` (several bot events can share one `turn` number: they are the sentences of one reply — group them) → `tool {name, ok, ms, …}` (`lookup {verified}`, `context {open_slots}`, `book {slot, patient, already_booked}`, `cancel {slot}`, `message`) → the record kinds `booking {name, slot, reason, insurance}`, `note {name, reason, urgent, fyi}`, `cancel {name, slot}` → `sms.out {caller, kind, chars}` / `sms.in {caller, kind}` → `call.ended {duration_s, disposition, bookings, notes}`.

**Phone numbers are masked** by default: `(610) ***-7969`. Appending `?reveal=1` to any list or detail request returns full numbers. The dashboard has one "Show numbers" toggle (off by default, remembered per browser) that adds that parameter. Never log or cache revealed numbers anywhere else.

**Dispositions** you will see: `phone-booked`, `phone-no-booking`, `live` (in progress), `unknown-crash` (the server restarted mid-call). Show them as plain status chips: Booked, No booking, Live, Dropped.

**Local development:** build against the fixtures first. Put them in `src/mock/` and make `?mock=1` (and `VITE_MOCK=1`) serve them, replaying `stream-sample.txt` through a fake EventSource at one event every two seconds so Katie's live behaviour can be seen without a phone call. For the real API during development, do not fight CORS: add a Vite dev proxy for `/api/dash` to `https://dash-backend.example.com` with `changeOrigin: true` and an `Authorization: Basic …` header built from a `DASH_USER`/`DASH_PASS` pair read from a git-ignored `.env.local`. Ask Tom for that password; it is the only credential in the project and it never goes into the bundle.

**Deployment handoff:** you deliver `dist/`. SAIDA's own agent copies it to `/srv/dash/dist` on the box, where Caddy serves it. You never need the box, SSH, or any key.

---

## 2. Design — monday.com's discipline, nobody's template

Use monday.com's open design system, **Vibe**, as the reference and the token source. Install `@vibe/core` and `@vibe/icons`; import `@vibe/core/tokens` once and use its CSS variables for every color, radius, shadow and spacing value (`--primary-color`, `--primary-text-color`, `--secondary-text-color`, `--ui-border-color`, `--primary-background-color`, `--secondary-background-color`, `--positive-color`, `--negative-color`, `--warning-color`, the `--border-radius-*` and `--box-shadow-*` scale). Read the actual token file in `node_modules` and `https://vibe.monday.com` before you write CSS; do not hardcode colors from memory. Vibe's components (Table, Chips/Label, Button, Dropdown, Tooltip, Toggle, Skeleton) are welcome where they fit; write your own where they don't. Typography is the family the tokens declare (Figtree today — load it from Google Fonts; fall back to the token stack).

The feel we want, in monday terms: white cards on a `--secondary-background-color` canvas, 1px `--ui-border-color` borders, `--border-radius-medium` (8px) on cards, 4px on chips, shadows only on things that float (menus, drawers, Katie's speech bubble), an 8px spacing grid, a 240px left rail with the wordmark and six items, a 56px top bar with the page title and the date range, and content that is tables, lists and a few numbers — not tiles of icons. Status is color: a chip per outcome (Booked = positive, Callback = primary, Urgent = negative, No booking = neutral grey). Everything else is ink, grey and white. One accent.

Type: at most four sizes in the UI (12, 13/14, 16, 20) plus one display size for the KPI numbers (28–32, `font-weight: 600`, tabular numerals). Line length under 80 characters in any text block. Left-align everything except numbers in tables.

**The slop list — anything here is a bug:** gradient backgrounds or gradient text; glassmorphism, backdrop blur, glow borders, neon; a thick colored left border on a card; cards nested in cards; "Welcome back, Tom 👋" or any hero/welcome banner; emoji anywhere in the UI; a row of three icon tiles explaining features; "Live"/"New" pulsing badges (a live call is shown by Katie's pose and one steady dot, not by a pulse); fake deltas or sparklines (if yesterday's count is known show it as a number, otherwise show nothing); lorem ipsum or invented metrics; stock illustrations other than Katie; dark mode (v1 is light only); Inter at 14px grey-on-grey; wide letter-spacing on labels; rounded-everything; modals by reflex (a call opens in a side drawer, not a modal); a chart library's default look (draw the one bar chart yourself as SVG with the tokens); any "AI insight" box.

**Empty states are designed, not apologised for:** no calls today shows the table header, one quiet line ("No calls yet today — the line is open."), and Katie standing by the line tile. Loading uses Vibe skeletons at the exact size of the content they replace.

---

## 3. Katie — the full body, and how she moves

**Her look is already decided.** `brief/assets/katie/katie-master.png` is Katie from the chest up: blonde ponytail, round black glasses, blue V-neck scrubs with a chest pocket, a warm smile, flat cel shading with a thick dark outline. `katie-cutout.png` is the same on a transparent background. The full body must continue exactly this drawing: the same scrubs top, matching blue scrub pants, white sneakers, the same line weight (sample the outline color and width from the PNG), the same palette (sample the scrub blue, the skin, the hair). Proportions slightly stylised — about five heads tall — so she reads at 96 px on screen.

**Build her as a paper-doll rig, not a video.** The head and torso come straight from the PNG (crop the master at the armpits; keep the face pixel-identical). Draw the rest as SVG in the same style: upper arm + forearm + hand on each side (two layers each, pivoting at shoulder and elbow), hips/pants, upper leg + lower leg + shoe on each side (pivoting at hip and knee). Export the drawn parts as SVG and assemble everything in one `<svg>` with `<g>` groups whose `transform-origin` is the joint. The final rig is one React component, `<Katie />`, that renders at any size without blur. If you can produce a cleaner full-body turnaround (front, three-quarter, side) that matches her face exactly, you may use it instead — but the face must be hers, and a drawn body that matches beats a generated body that doesn't.

**Animation with GSAP 3** (free, including plugins). Every motion is a transform on a `<g>`; nothing animates `left/top`, nothing triggers layout, and Katie's layer is `position: fixed`, `pointer-events: none`, `will-change: transform`, above all cards. Keep her bundle under 60 KB gzipped and her assets under 400 KB.

**States:**
- `idle` — breathing (2–4 px chest rise, 3 s loop), a blink every 3–6 s, a weight shift every ~10 s. Stand at home: the bottom-right corner, feet on the viewport's bottom edge. On first load she walks in from the right edge.
- `walk` — a two-leg cycle (hip ±25°, knee ±20°, 0.55 s per cycle), arms counter-swing ±15°, body bob 3 px, head steady, direction flip with `scaleX(-1)`. Travel speed ~420 px/s (duration = distance / 420, clamped 0.25–1.4 s, `power1.inOut`).
- `hop` — she stands ON widgets: feet on the hovered card's top edge, at its right end (titles are left-aligned so she never covers text). Paths are L-shaped: walk along her current shelf (the viewport floor or a card edge) to the target's column, then a short arc hop (250–450 ms, slight squash on landing) onto the target's top edge, then a step to her spot. Cards therefore need a 24 px gap above them; set the grid gap accordingly.
- `present` — on arrival she turns toward the card's center, extends the near arm toward it, and a speech bubble appears 150 ms later: a white 8px-radius bubble, 1px border, the small token shadow, 13 px Figtree, one or two lines, max 160 characters, anchored beside her head on the side away from the card edge.
- `listen` — one hand to her ear (she has no headset in the drawing; the hand-to-ear pose is the "on a call" signal), used while `status.line === "on-call"`; she stands by the Line tile for the whole call.
- `celebrate` — a small bounce and a nod when a `booking` event arrives on the stream, then back to what she was doing. No confetti, no sparkles.
- `rest` — after 90 s without pointer movement her eyes close and her shoulders drop 2 px; any pointer movement wakes her with a blink. No "zzz".

**What she says** comes from data, never filler. Each widget declares `data-katie` (a function of its current data) returning one sentence a receptionist would actually say: "Three people are waiting on a callback, one of them urgent." / "Six calls so far today, four of them booked." / "The line is quiet — last call was at 1:34." / "Noah Morgan is booked Monday at three twenty; the confirmation text went out." If a widget has nothing to say, she stands there and says nothing.

**Choreography rules:** a 120 ms hover intent before she commits (so skimming across cards doesn't send her zigzagging); if the pointer moves on before she arrives, kill the tween and retarget from where she is; keyboard focus on a card counts as hover; the bubble hides while she travels; when the pointer leaves all widgets she waits 1.2 s, then walks home. Cache target rectangles on hover start and recompute on `resize`/`scroll` (throttled); never read layout inside a tween. Pause all idle loops when the tab is hidden. Under `prefers-reduced-motion` she doesn't walk: she fades out, fades in at the target, and the bubble appears instantly. Below 1024 px viewport width she is not rendered at all (no hover on touch). She is `aria-hidden`; everything she says is already visible in the widget.

---

## 4. Pages and widgets

A single-page app, left-rail navigation, routes under `/dash/`:

- **Overview** `/dash/` — top row: the **Line** tile (idle / on a call, last call time; Katie's listening spot) and four **today** numbers: calls, booked, callbacks waiting, texts sent, each with yesterday's number underneath as plain text when the 7-day stats provide it. Middle: **Calls by hour** (today, a bar per hour, booked hours filled, others outlined, drawn as SVG). Bottom: **Latest calls** (time, caller, first line, outcome chip, duration — the last ten) and **Callbacks waiting** (urgent first, with the reason). Clicking a call opens the call drawer.
- **Calls** `/dash/calls` — a Vibe table with a range control (Today / 7 days / 30 days) and an outcome filter; rows: time, caller, first line, language, outcome chip, bookings, notes, duration. Click → `/dash/calls/:id` opens a right-hand drawer (not a modal): header with caller, duration, outcome, language; then the **transcript** as a conversation — caller lines plain on the left, Katie's on the right with a 20 px head-only avatar (crop from the master) — with tool and record events rendered as quiet one-line system notes in the right places ("Looked up the chart — no match", "Booked Tuesday 9:00 AM", "Desk note filed — urgent", "Confirmation text sent"); keep the `turn` grouping so one reply reads as one block.
- **Bookings** `/dash/bookings` — list newest first: when, patient, slot, reason, insurance, caller, a link to the call.
- **Callbacks** `/dash/callbacks` — the desk notes, urgent first, with the caller name, reason, the number (masked unless revealed) and a link to the call. This is the page a front desk opens at 8 AM.
- **Texts** `/dash/texts` — SMS in and out, with kind and time.
- **Settings** `/dash/settings` — Show numbers toggle, Katie on/off, Katie's home corner (bottom-right / bottom-left), and in development the API base and mock toggle.

Live updates: open the SSE stream once per tab (reconnect with backoff), and on any event invalidate the affected queries (TanStack Query) so the tables refresh without a reload. `call.started` flips the Line tile and sends Katie to it; `call.ended` sends her home after the data refreshes; `booking` triggers `celebrate`.

---

## 5. Stack

Vite + React 18 + TypeScript (strict). `react-router` for routes, `@tanstack/react-query` for data, GSAP 3 for Katie, CSS Modules with the Vibe tokens (no Tailwind), `@vibe/core` + `@vibe/icons` where they fit. No other UI kit, no chart library, no animation library besides GSAP, no state library. `npm run build` must produce a `dist/` that works when served from `/dash/` with no runtime environment variables. Target the last two versions of Chrome and Safari; 1280 × 800 is the smallest desktop layout you must support, 1440 × 900 is the one you design on.

---

## 6. How to work (do this in order)

1. Read `brief/` completely: this prompt, every fixture, both PNGs (look at them — open them, note the exact colors).
2. Write `docs/DESIGN.md` before any component: the token choices, the type scale, the grid, each widget's content and empty state, the chip palette, the Katie spec restated in your own words with the frame timings you will use. Sketch three layout directions as throwaway HTML files in `docs/sketches/` (ten minutes each), pick one, and write down why. This step is what keeps the result from drifting to the statistical average.
3. Build the shell and every page against the fixtures in mock mode until each page looks finished with real-shaped data.
4. Build Katie: the rig first (static, every joint posable in a Storybook-style `KatiePlayground` route at `/dash/_katie` with sliders for each state), then idle, then walk/hop/present, then the data-driven bubbles, then the live behaviours.
5. Wire the real API behind a flag, keep mock mode working.
6. Polish pass against the slop list in section 2, line by line. Then run the Impeccable slop checker if it is installable (`npx impeccable`), and fix what it flags.
7. Verify in a real browser with Playwright: screenshots of every page at 1440 × 900 and 1280 × 800 into `docs/screenshots/`, a short recording of Katie walking to three widgets and presenting, a Lighthouse run (performance ≥ 90, accessibility ≥ 95), zero console errors, 60 fps while Katie walks (record a performance trace, no long tasks over 50 ms during the tween).
8. Write `README.md`: how to run (mock and proxied), how to build, what `dist/` is and where it goes, and a one-paragraph note on how Katie's rig is organised so a designer can swap parts.

Do not claim a step is done without the artifact that proves it (the file, the screenshot, the trace). Commit after each step with a message that says what changed and what you checked.

---

## 7. Things to remember

- Katie is a receptionist. Her bubbles sound like a person at a front desk, in full sentences, with no exclamation marks and no cheer. She never apologises for empty data.
- The practice's name, phone numbers and patient names in the fixtures are fictional ("Harborline Orthodontics" is a demo practice). On a live practice this data is protected health information: the front end must never send it anywhere but the same-origin API, never put it in a URL, never store revealed numbers.
- The brand wordmark is the only place SAIDA's brand colors appear; the rest of the UI uses Vibe's tokens. "SAIDA" is the company; "Katie" is the product name on every screen.
- If something in this brief conflicts with what you find in the fixtures, the fixtures win — they are generated by the real backend. Note the conflict in `docs/DESIGN.md`.
