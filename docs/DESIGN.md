# Katie dashboard: design spec

This is the build spec for step 3 (shell and pages) and step 4 (Katie). Where it is silent,
`brief/PROMPT.md` rules; where the two disagree, this file rules, and section 2.4 lists every
such call. All numbers are CSS px at 1x unless marked "rig units" (Katie's SVG viewBox, see
`docs/KATIE-ART.md`). Example outputs use the fixtures (`src/mock/fixtures/`, "now" = Mon Oct 12,
6:05 PM, America/New_York) unless they say "demo": the closers' demo day (`?mock=demo`,
`docs/demo/DEMO-DATA.md`), materialized on the real date with "now" pinned to 9:10 PM.

**Top-tier pass, 2026-10-21.** The polish plan in
`docs/research/dashboard-inspiration-2026-10-21/FINDINGS.md` (items P1 to P25) amended this spec.
Where the plan and an older line here disagreed, the plan won; every such call is a row in 2.4
(conflicts 42 to 65), and the sections below already read as built.

**Glass skin, 2026-10-26 (Tom: "I want the whole UI to be glassy").** `docs/DESIGN-GLASS.md` is
the skin spec and it wins wherever it disagrees with this file. It supersedes **2.1 to 2.3**
(color, chips, radii and shadows: the values there are the flat skin's and are kept below only
as history) and the slop-checklist items that banned glass, blur, card shadows and icon tiles
(8: items 2, 7, 15, 19, 20, 21, 22, 23, amended in place). Everything else here stands: pages,
widgets, data rules, copy, no fake numbers, no welcome banner, Katie's occasional behaviour, the
Demo menu and the 1280 x 800 minimum. The two layout changes it makes (four KPI cards with icon
tiles, the drawer floating inside the slab) are written into 6.2 and 6.8, the slab into 5 and
7.2, and the call is conflict 66 in 2.4. Tokens live in `src/styles/glass.css` (CONTRACTS.md).
The shipped state is DESIGN-GLASS **section 8** ("the room", the second pass, 2026-10-26): the
app is a blurred slab standing in a photo room with an inset ladder of 28 / 40 / 48 / 64, a rim
and three glass objects. The shell block in 5, the vertical budget in 4, the drawer in 6.8 and
the floor in 7.2 are written to it; older glass values in 2.1 and 2.3 are the first pass's.

---

## 1. Direction: Desk, with grafts

**Chosen: B, Desk** (`docs/sketches/b-desk.html`). Widgets get their width from what the person
opening the screen has to do with them, not from a grid formula.

Why:
- **The front desk acts at 8 AM, and the owner checks in.** The front desk needs the callback
  reasons in full, because the reason is the job ("bracket came off, needs to be seen as soon
  as possible"). A cuts every reason to three words. C's two-to-one split gives callbacks 309 px
  at 1280. Desk is the only sketch where the reasons can be read without opening anything.
- **The owner needs four numbers and "is the line fine".** Desk gives the owner those in one card
  (four cells split by hairlines) beside a Line tile that is its own card. That avoids the slop
  list's row of tiles, and every top-row widget keeps a real top edge for Katie to stand on,
  which C's single sheet does not.
- **It is our own design, not a copy.** A is a monday board with our data in it, the "nobody's
  template" failure from the other direction.

**What changes from B:**
- The bottom row is **8 + 4 columns** instead of 1 + 1 (it was 7 + 5 until P7, conflict 45). The
  Reason column holds about 30 characters at 1280.
- Overview shows at most **5 callbacks**, with a "See all N callbacks" footer, so the two bottom
  cards come out about the same height.
- B's filler facts on the Line tile are dropped ("8 answered / 2:03 / English").
- Katie is **96 px**, not 128.

**Grafts:**

| from | what |
|---|---|
| C | ~~Solid status chips with white text~~: reversed by P2 (conflict 42). Chips are tinted with darker same-hue text (5.45:1 and better); only Urgent stays solid |
| C | Line sentence "Open, no call right now" / "Last call 5:35 PM" |
| C | Count labels over the bars, and the "Now" rule on the chart |
| C | "Yesterday N" under a number, only when N > 0 and the comparison is valid (P3, conflict 44) |
| C | Callback ordering: urgent first, then newest |
| A | Ruled table rows (44 px since P14, conflict 48) and 32 px header rows in Latest calls and on every list page |
| A | Text cleanup: urgent rows sort to the top, `URGENT:` and `[…]` are stripped, `unknown (…)` falls back to the masked number |
| B | Every value is a Vibe token, and the grey canvas is `--allgrey-background-color` |

---

## 2. Tokens

Import `@vibe/core/tokens` once (in `main.tsx`). Every color, radius, shadow and space below
is a token. The only literal values allowed are the font sizes (section 3), the focus-ring
alpha copied from Vibe's own components, Katie's art palette (`docs/katie-art/rig.json`), and the
two chip tints `--chip-positive-bg` and `--chip-negative-bg` defined once in `global.css` (Vibe has
no 10% tint of its green or red; conflict 42).

### 2.1 Color and surface

> **Superseded by the glass skin** (DESIGN-GLASS.md 2, `src/styles/glass.css`). Built values:
> ink #0f172a, secondary #56667d (measured, not the spec's #64748b), icons #64748b, accent
> #2563eb (hover #1d4ed8, selected #dbeafe, highlighted #eff6ff), negative #dc2626 (Urgent chip
> AA). Surfaces: the environment gradient and blobs, the slab `rgba(240,247,255,.78)`, cards
> `rgba(255,255,255,.62)` with a 20 px backdrop blur, floating things `rgba(255,255,255,.8)`.
> Rules `rgba(15,23,42,.07)`. The table below is the flat skin, kept as history.

| role | token | value |
|---|---|---|
| canvas (page background behind cards) | `--allgrey-background-color` | #f6f7fb |
| card, rail, top bar, drawer, bubble surface | `--primary-background-color` | #ffffff |
| card border (1px), no shadow | `--layout-border-color` (P13 replaced, conflict 61) | #d0d4e4 |
| dividers inside cards, rail edge, top-bar edge, table rules, KPI hairlines | `--layout-border-color` | #d0d4e4 |
| text, primary | `--primary-text-color` | #323338 |
| text, secondary (labels, sub-lines, table headers, system notes) | `--secondary-text-color` | #676879 |
| icons (rail, close) | `--icon-color` | #676879 |
| row hover / nav hover / **selected nav item** (P9) | `--primary-background-hover-color` | rgba(103,104,121,.1) |
| **the one accent** | `--primary-color` | #0073ea |
| accent uses (complete list) | | active nav icon, links ("All calls", "See all N callbacks"), booked chart bars, Callback chip text (`--primary-hover-color`) on its tint (`--primary-highlighted-color`), selected segment, focus rings (`--focus-ring`, `--focus-ring-inset`), Vibe Toggle on-state (conflict 34) |
| selected segment background (Calls range) | `--primary-selected-color` | #cce5ff |
| chart, the no-booking part of a bar (P4) | `--primary-selected-color` | #cce5ff |
| a Latest-calls row just after hang-up (held 2 s, then fades over 400ms) | `--primary-highlighted-color` | #f0f7ff |
| Booked chip background | `--chip-positive-bg` (literal, `global.css`) | #e6f3ed |
| skeleton | Vibe `Skeleton` default | |

### 2.2 Status chips

**Glass skin (DESIGN-GLASS.md 4, built):** pills, radius 999, height 22, padding 0 10, 12/600,
`white-space: nowrap`. Tinted pastels; **Urgent alone stays solid**.

| chip | background | text |
|---|---|---|
| Booked | `--chip-positive-bg` #dcfce7 | `--positive-color-hover` #15803d |
| Callback | `--chip-primary-bg` #dbeafe | `--primary-hover-color` #1d4ed8 |
| Live | `--chip-live-bg` #ffedd5 | `--chip-live-ink` #c2410c |
| Missed consult (Leads, 6.13) | `--chip-negative-bg` #fee2e2 | `--chip-negative-ink` #b91c1c (5.30:1 on the flat colors; dark: `rgba(248,113,113,0.24)` / #fecaca). A pastel, so Urgent is still the only solid chip |
| No booking, Dropped, FYI, Urgent quiet, any other | `--chip-neutral-bg` #f1f5f9 | `--chip-neutral-ink` #475569 |
| Urgent | `--negative-color` #dc2626, solid | white (4.83:1 on the fill) |

Every chip measured at least 4.5:1 on the rendered page (DESIGN-GLASS 7, `docs/VERIFICATION.md`).
The flat skin's chip rules follow as history.

Flat skin (history): use our own `<StatusChip>`, a span (P2, FINDINGS M3):
- height 20, padding 0 8, `--border-radius-small` (4px);
- 12px/20px, weight 500, centered, `white-space: nowrap`, width from the text (no min-width).
- **Tinted, not solid.** The background is the hue's light tint and the text is the same hue one
  step darker. **Urgent alone stays solid**, so it is the only loud chip on any screen.

| chip | when | background | text | contrast |
|---|---|---|---|---|
| Booked | disposition `phone-booked` | `--chip-positive-bg` #e6f3ed | `--positive-color-hover` #007038 | 5.45:1 |
| No booking | `phone-no-booking` | `--ui-background-color` #e7e9ef | `--primary-text-color` | 10.38:1 |
| Live | `live`, or status `live` | `--color-working_orange-selected` #fed59e | `--primary-text-color` | 9.14:1 |
| Dropped | `unknown-crash` | `--ui-background-color` (neutral since P2; it was a solid grey) | `--primary-text-color` | 10.38:1 |
| Callback | an action note, not urgent (conflict 44) | `--primary-highlighted-color` #f0f7ff | `--primary-hover-color` #0060b9 | 5.77:1 |
| Urgent | an action note, `urgent:true` | `--negative-color` #d83a52, solid | `--text-color-on-primary` | 4.52:1 |
| Urgent, quiet | an urgent note annotated informational, under "Noted on booked calls" on the Callbacks page (conflict 51) | `--ui-background-color` | `--primary-text-color` | 10.38:1 |
| FYI | note, `fyi:true` | `--ui-background-color` | `--primary-text-color` | 10.38:1 |
| any other disposition | unknown value | `--ui-background-color` | `--primary-text-color` | |

The Callback tint itself is faint against white (1.08:1); the blue text carries the chip. Contrast
measured with the WCAG formula on computed styles (`StatusChip.module.css` header comment; the
verify pass re-reads it).

For an unknown disposition: strip `phone-`, turn `-` into a space, and sentence-case the rest
(`phone-transferred` becomes "Transferred").

The Line dot is 8px, `border-radius: 50%`, and never animates:
- idle: `--color-wolf_gray`;
- on a call: `--color-working_orange`, the same color as the Live chip.

### 2.3 Radii, shadows, focus, motion

> **Superseded for radii and shadows by the glass skin** (DESIGN-GLASS.md 2, 3, 5). Radii: slab
> 24, cards 16, the drawer 20, bubble 12, icon tiles 10 (8 at 1280), pills and segmented
> choices 999, nav items 12, chart bars 4 at the top. Shadows: cards `0 8px 24px
> rgba(30,64,175,.08)` plus a 1 px white inset highlight; the slab a ring, `0 24px 60px
> rgba(30,64,175,.14)` and the highlight; floating things (drawer, menus, tooltips, bubble)
> `0 24px 60px rgba(30,64,175,.18)`; the active nav pill `0 6px 16px rgba(37,99,235,.35)`.
> Focus rings and motion are unchanged. The table below is the flat skin, kept as history.

| thing | token |
|---|---|
| cards, drawer inner panels, Katie's bubble, transcript blocks | `--border-radius-medium` (8px) |
| chips, nav items, buttons, segments | `--border-radius-small` (4px) |
| dots, the 20px avatar | `50%` |
| Vibe `Toggle` track | Vibe's own pill radius (100px, from `@vibe/core`, not in `src`; conflict 34) |
| the Line tile's inner link (`.lineInner`) | `inherit` (the card's `--border-radius-medium`) |
| | no other radius exists |
| Katie's bubble shadow | `--box-shadow-small` |
| drawer shadow | `--box-shadow-medium` |
| menus, dropdowns, tooltips | Vibe defaults |
| everything else | `box-shadow: none` |
| focus ring (`:focus-visible` only) | `--focus-ring: 0 0 0 3px hsla(209,100%,50%,.5), 0 0 0 1px var(--primary-hover-color) inset`, defined once in `global.css` and copied from Vibe's components (the light theme has no focus token) |
| inset focus ring (rows, KPI cells, the Calls row, the transcript scroller, links that fill a card) | `--focus-ring-inset: inset 0 0 0 2px var(--primary-color)`, defined once in `global.css`; an outer ring would be clipped by the card |
| cards | border only (`--layout-border-color`), `box-shadow: none` (P13's hairline shadow was not taken: shadows are for floating things; conflict 61) |
| UI transitions | `--motion-productive-medium` (100ms) for hovers (list rows 70ms); drawer slide `--motion-expressive-short` (250ms) with `--motion-timing-enter` / `--motion-timing-exit` |
| one-shot motion (transform and opacity only, none loops, reduced motion honoured) | a new Latest-calls row: `translateY(4px)` + opacity, 150ms (`lcEnter`); after hang-up the row's tint holds 2 s and fades over 400ms (`lcHold`, opacity of a pseudo-element); the Line tile's held outcome fades in over 150ms (`lineIn`). Three `@keyframes` in `overview.module.css`, all opacity/transform (conflict 59) |

### 2.4 Conflicts and resolutions

The fixtures win over the brief. Where a token or fixture conflicts with the brief, this table
records the call.

| # | conflict | resolution |
|---|---|---|
| 1 | Brief puts the canvas on `--secondary-background-color`, but in Vibe light that token is #ffffff, the same as the cards | Canvas = `--allgrey-background-color` (#f6f7fb) |
| 2 | Brief says 1px `--ui-border-color` everywhere; on ruled tables #c3c6d4 feels heavy (sketch A) | Outer card border = `--ui-border-color` (as the brief says). Every rule *inside* a card, plus the rail and top-bar edges = `--layout-border-color` |
| 3 | Token `--title-font-family` is **Poppins** and `--font-h1..h4` use it; the brief says Figtree | Figtree everywhere via `--font-family`. Never use `--title-font-family` or the `--font-h*` shorthands |
| 4 | Token `--font-weight-bold` = 500; the brief wants 600 for KPI numbers | Use numeric weights 400 / 500 / 600 (section 3), not the weight tokens |
| 5 | Vibe sizes are 14/16/18/24/30; the brief wants 12, 13/14, 16, 20 + 28–32 | Literal sizes 12, 14, 16, 20 + display 32. 13 px is used **only** in Katie's bubble, because brief section 3 mandates it; it is not a UI size |
| 6 | No focus-ring token in light theme | `--focus-ring` as in 2.3 |
| 7 | Vibe `--link-color` #1f76c2 would be a second blue | Links use `--primary-color` (one accent) |
| 8 | "Yesterday's number when the 7-day stats provide it": a 7-day aggregate cannot give yesterday | `yesterday = stats?days=2 − stats?days=1` for `calls`, `booked_calls`, `callbacks`, `sms_out`. Valid only when `d2.range.days===2` and `d1.range.from − d2.range.from` is between 82,800 and 90,000 s (DST-safe; `range.from` is local midnight, verified: days=1 from = Oct 12 00:00 ET, days=7 from = Oct 6 00:00 ET). If invalid or the request fails, show nothing |
| 9 | Mock has no days=2 fixture | (Since P3 "Yesterday 0" never renders: a sub-line shows only N > 0.) Mock serves `stats?days=N` (N ≥ 2) = `stats-7d.json` counts, with `range.days=N` and `range.from` = local midnight N−1 days back. This is exact, not invented: stats1 ≤ stats2 ≤ stats7 and stats1 = stats7, so stats2 = stats1. Mock therefore shows **"Yesterday 0"**, which is true for this data |
| 10 | `stats.json` and `stats-7d.json` have identical counts (only `range` differs) | Expected. All fixture activity is today. The 7 days / 30 days views show the same numbers in mock |
| 11 | `/calls` has no `days` param; the brief wants Today / 7 days / 30 days | Page `/calls?limit=50&before=<oldest started_at>` until the oldest row is older than `range.from` (from `stats?days=N`), max 20 pages. Filter client-side to `started_at ≥ range.from`. Totals in the Katie sentence come from `stats?days=N` |
| 12 | `/bookings`, `/notes`, `/sms` take only `limit` | Lists show `limit=50`. A "Show more" text button re-requests with limit +50, up to 500 |
| 13 | `call.ended.data.duration_s` (1815, 3136, …) disagrees with the call row (54.5, 142.4, …) | Always use the **call row** `duration_s`. Ignore the event's value. In the transcript "Call ended" note, use the row too |
| 14 | `duration_s` is fractional (54.5); sketch A showed 0:54, B/C 0:55 | `Math.round(s)` then `m:ss` (`h:mm:ss` from 3600). 54.5 → **0:55**; avg 123 → 2:03 |
| 15 | `call.summary` is test junk (`booked=0 scenario=…`) | Never rendered, never in a `title`, never in a Katie sentence. Drop it in the API mapping layer (the view model has no `summary` field) |
| 16 | Bot sentences arrive glued: `right now.Let me` | Display text = `text.replace(/([a-z0-9)'"’][.?!])(?=[A-Z])/g, '$1 ')`. "U.S." and "Dr. Reyes" are untouched. Bot events of one `turn` join with a single space into one block |
| 17 | Note reasons carry `[system annotations]` and an `URGENT:` prefix | Clean in this order: (1) remove every `\s*\[[^\]]*\]`; (2) remove leading `URGENT:\s*` (case-insensitive), because the chip carries urgency; (3) a leading run of 2+ ALL-CAPS words becomes sentence case (`NAME CORRECTION on…` → `Name correction on…`); (4) collapse whitespace, trim, end with `.` if no terminal `.?!`. Annotations are never shown anywhere |
| 18 | `name` can be `unknown (booking to follow on this call)` / `unknown (name to follow if given)` / empty | `isUnknown = !name \|\| /^unknown\b/i.test(name)`. If the row has a single identity slot (Overview callbacks, Katie sentences), show the masked caller number. If the row also has a Number column (Callbacks page), show "Not given" in secondary text. The word "unknown" never renders |
| 19 | The brief's "URGENT" note is sometimes followed by a booking on the same call (`[NOT an emergency … booking the soonest visit]`) | Keep the Urgent chip (`urgent:true` is the record). If that note's call has `bookings > 0`, add "· booked on this call" (12px secondary) after the chip. Fixture: note 90 (3:34 PM call booked 2) |
| 20 | Booking names can conflict with a later correction note (booked "Max De Lagado", note "Max Delgado") | Show each record as given. Nothing is merged; the correction is visible as a callback |
| 21 | `status.last_call_at` = the last call's **start** (5:35 PM); sketch B showed "ended 5:36" | Line tile shows "Last call 5:35 PM" from `last_call_at` |
| 22 | `tool context.open_slots` is 0 just before a slot is offered (CA860072416005, turn 9) | The system note never states a count: "Checked the schedule" |
| 23 | SMS `ts` equals `status.now` for every row (seeded at generation) | Show `ts` as given (all 6:05 PM in mock); sort by `id` desc as the tie-break. In the drawer, SMS notes sit where the events sit |
| 24 | Detail fixtures exist for 4 of 8 calls | Mock returns 404 for the other 4. The drawer still shows the header (from the list row) and the 404 copy (6.8). Screenshots use the four that exist |
| 25 | `status.practice` = "Harborline Orthodontics (DEMO practice - fictional)" | Rail shows the text before ` (` as the practice name. ~~If the parenthetical matches `/demo/i`, a second line says "Demo practice".~~ (dropped by P17, conflict 50) `status.model` is never shown |
| 26 | Notes have no "done" state | "Waiting" = notes with `ts ≥ stats.range.from` that are action notes (`isActionNote`: `fyi:false` and not annotated informational; conflict 44). The KPI and the rail count both use it (fixtures 4, demo 12); `stats.callbacks` (7 / 16) is no longer shown |
| 27 | The brief puts the date range in the top bar, but Overview is "today" by definition | Overview top bar shows static text "Today, Monday, October 12". Only Calls has the Today / 7 days / 30 days control. Bookings / Callbacks / Texts show no range (limit-only endpoints) |
| 28 | The brief lists Show numbers under Settings, but the desk needs it where the numbers are | One setting (`localStorage['katie.showNumbers']='1'`), one control in the top bar's right end on every data page. Settings has the same toggle bound to the same state |
| 29 | Brief: Katie "reads at 96 px"; the sketches used 128 | `--katie-height: 96px` |
| 30 | Katie standing on a top-row card rises into the 56px top bar; at 96px with a 40px top padding her head reaches y = 0 | Accepted and transient while she presents a top-row widget, but she and her bubble keep clear of both top-bar groups (`data-katie-avoid`, conflict 36). The off-screen rule is in 7.4 and conflict 37 |
| 31 | `greeting.name` and `greeted_as` are empty in every fixture | No "Greeted as" note when empty |
| 32 | `languages` are ISO codes (`en`) | `new Intl.DisplayNames(['en'],{type:'language'}).of(code)` → "English" |
| 33 | `insurance` is `"not provided"` or `""` | Both render "Not given" in secondary text |
| 34 | Vibe `Toggle` (Settings rows, top-bar Show numbers) fills with `--primary-color` when on and has a 100px pill radius, outside 2.1's accent list and 2.3's radii (F5) | Accepted: the brief names Toggle among the welcome Vibe components and 6.11 prescribes it. It keeps Vibe's default look: on-state `--primary-color`, off-state `--ui-border-color`, pill radius. Listed in 2.1, 2.3 and checks 15, 19, 20 |
| 35 | Bubble "one or two lines, max 160 characters" against the brief's "text under 80 characters per line": 160 cannot fit two lines under 80 | Cap 140 (`KATIE_MAX_CHARS`). The bubble width is fitted by `fitBubble` (7.5), not a fixed 280 |
| 36 | 7.5's accepted overlap against the Show numbers control (RV-1): presenting on a list page or the Texts cell hid it | `[data-katie-avoid]` regions (both top-bar groups) win over the crown-aligned bubble and the right-end spot (7.2, 7.5). A dropped bubble may cover up to 8px of the target card's top edge |
| 37 | 7.4's off-screen rule "top < `--katie-height` + 8" against 4's top-row cards at exactly y = 96 | The rule is top < 96 (`KATIE_H − 1`, 1px slack), so she stands on the 96px top row. Bottom: top > `innerHeight − 8` |
| 38 | 6's column widths were content widths; with cell padding (0 16, 20 at the table edges) several did not fit the measured content in Figtree (a revealed "(656) 555-0150" is 107px) | Every column width in 6 includes its cell padding, and columns were widened where content did not fit. The widths in 6.4, 6.6, 6.7, 6.9 and 6.10 are the ones in `src/pages/**` |
| 39 | 7.3's listen pose (sR shoulder −120°, elbow −128°) puts the fingers across her glasses | Tuned against the art (`docs/KATIE-ART.md` 9): sR shoulder −122°, elbow −136°, wrist 55°, neck 3°. Palm on the ear, fingers up into the hair |
| 40 | `max-width: 72ch` did not keep lines under 80 characters (Callbacks reasons ran 86–100, F2): `ch` is the width of "0", and Figtree text averages narrower, so 72ch holds more than 72 characters | `max-width: 35em`, in the element's own font size (35em at 14px = 490px). Measured longest line 76 at 1920 |
| 41 | Brief section 3 (and the first version of 7.2-7.4) made Katie always on: standing at home, walking in on every page load, walking to whatever the pointer or keyboard focus rested on, listening at the Line tile for the whole call, celebrating every booking and resting after 90 s. Tom, 2026-10-13, after seeing the built dashboard: she is too much, and should pop up only occasionally, like the llama in monday.com | **Tom's direction wins.** Katie is off screen by default and appears only for the moments in 7.4, under the caps there. The behaviour spec is `docs/research/MONDAY-LLAMA-2026-10-13.md` Part 3 (3.1-3.10), which supersedes brief section 3 and the old 7.2-7.4 wherever they conflict (hover following, home standing, rest, the whole-call listen). The rest of the brief and of this document still applies, including every hard rule on what she says (7.6, 3.9 there) |
| 42 | P2 against graft C "Solid status chips" (B's pale chips failed AA at 12 px): solid fills were the loudest thing on every screen, and an Urgent chip weighed no more than a Booked one | **Tinted chips, Urgent alone solid** (2.2). The AA concern is met: Booked 5.45:1, Callback 5.77:1, Live 9.14:1, neutral 10.38:1, Urgent 4.52:1. Dropped became neutral so Urgent is the only solid chip. The two tints are literals in `global.css` (`--chip-positive-bg`, `--chip-negative-bg`) |
| 43 | P5: list pages showed the top-bar title and the same word again as a 16/600 card title | The top bar keeps the only page title. A list card's header is a 14/500 **count sentence**, filters on the right: "35 calls today · 26 booked", "27 bookings today · 17 new patients", "12 waiting · 1 urgent", "20 texts sent today · 19 replies" (demo). Filtered: "0 of 35 calls today". Zero counts read "0 waiting", so the header does not repeat the empty state (`pages/lists/titles.ts`) |
| 44 | P6 / P3 against 6.2's Calls / Booked / Callbacks waiting / Texts sent with "Yesterday N" under each, and conflict 26's "KPI number = `stats.callbacks`" | **Calls answered · Appointments booked · New-patient consults · Callbacks waiting** (6.2). "Texts sent" moved into the Booked sub-line ("19 confirmed by text"). Sub-lines state real facts, "Yesterday N" only when N > 0 and conflict 8 is valid. **Callbacks waiting counts action notes only** (`isActionNote`: not `fyi`, not annotated "note is informational"), so it no longer equals `stats.callbacks` (demo: 12 against 16); the rail count uses the same rule. Informational notes show in the drawer's outcome block and under "Noted on booked calls" on Callbacks |
| 45 | P7 against 6.4 / 6.6's "First line" column (the caller's raw first utterance, e.g. a mishearing) and the 7 + 5 bottom row | A **Reason** column: the booking reason, then the note reason, then the cleaned first line (`deriveReason`, `lib/reason.ts`, max 48 characters; " · insurance" drops to a 12px second line). The bottom row is **8 + 4** so Reason holds about 30 characters at 1280 (about 20 at 7 + 5). The raw first line lives in the drawer |
| 46 | P11 against 6.8's chat-bubble transcript (caller left, Katie in grey panels with a 20px head) | **The drawer is a document**: header (name 20/600 + chip; number · time · duration · language), an **Outcome block** (one line per action, each scrolls to and tints its transcript row), then the transcript as rows of speaker (64px) · `m:ss` (36px) · text 14/20, no bubbles. Katie's rows carry a 2px `--layout-border-color` left rule. The speaker label is plain **"Katie"** with her 16px head (orchestrator's call; FINDINGS 6 rule 9's "(AI receptionist)" suffix is not used). Event rows 12/16 secondary with a 16px Vibe icon. The scroll region's `aria-label` is "Call details" |
| 47 | P12 against 6.1's "Open, no call right now" / sub-line states | **The Line tile is the live stage** (6.1): idle "Open · last call 8:55 PM"; on a call a steady orange dot, "On a call · name or masked number", a ticking tabular timer and the last line said; on a booking "Booked new-patient consult · Thu 10:00 AM"; after hang-up the outcome holds 30 s. FINDINGS' "Answered every call today" line is not shown (the API has no unanswered count to back it) |
| 48 | P14 against 2.2/4's 40px rows (graft A) | `--row-height` 44px (screen share at an effective 1280 × 720); header rows stay 32. Latest calls shows 5 rows above the fold at 1280 × 800 and 7 at 1440 × 900 (vertical budget, 4) |
| 49 | P15 against 6.10's log table (Direction, Kind, Characters; reply and confirmation as separate rows) | **Texts as conversations**: Time · Patient · Message · Status, the reply folded into the row of the text it answers. Status says **"Sent"**, not FINDINGS' "Delivered": the API has no delivery receipt, so "Delivered" would be a claim the data cannot back. The message body (`Sms.text`) exists in demo data only; the real API never sends bodies (PHI), and real mode shows "Confirmation text" / "Reply: Yes" |
| 50 | P17 against 5's wordmark ("Katie" 20/600, the practice at 12px, "Demo practice") and conflict 25's second line | Row 1: Katie's 24px head (the same image as the top-bar Katie button) + "Katie" 16/600. Row 2: the practice name 14/500 primary text. **"Demo practice" is gone** (the top bar already says Demo). Conflict 25's name parsing stays |
| 51 | P18 against 6.5 / 6.9's one row per note and a chip on every row | Callbacks are **grouped by caller** (two reasons = two one-line rows under one name), urgent first, then newest. On Overview the chip shows only for Urgent (every row there is a callback). The Callbacks page has, per day: action notes, then **"Noted on booked calls"** (informational notes, reasons in secondary text, an urgent one with a quiet grey Urgent chip: solid red stays for notes the desk must act on), then "FYI" |
| 52 | P9 against 5's active nav item (`--primary-selected-color` fill, the second-loudest element) | Active: `--primary-background-hover-color` fill, weight 500, primary text, the icon alone in `--primary-color`. Inactive text `--secondary-text-color` (4.81:1 on the hover fill), primary on hover |
| 53 | P4 against 6.3's "All 24 hours always show" and hollow no-booking bars | The span runs from min(first call, 7 AM, now) to max(last call, 5 PM, now) + 1 (demo 6 AM to 9 PM, fixtures 7 AM to 6 PM). The no-booking part is filled `--primary-selected-color`; bars have a 2px top radius (the one radius outside 2.3, conflict 60). 7 AM and 5 PM labels are weight 600 landmarks (`pages/overview/hours.ts`). The legend is one 12px line under the title. Katie still answers around the clock: a call outside the span widens it |
| 54 | P8 against 6.7 / 6.9 / 6.10's "View call" column | Whole-row click on Calls, Bookings, Callbacks and Texts; the "View call" column is gone. A 44px column holds a 16px chevron in `--icon-color` shown on hover and focus. Keyboard: the focus ring, Enter opens, Esc closes and focus returns to the row (found again by `data-call-row`) |
| 55 | P10 / P19 against a number-first identity and a Language column of "English" on every row | Names first (14/500) with the masked number under them (12 secondary); the number alone at 14 when there is no name. Name order: a name correction made on the call, then the booking, then the note, then the greeting (`callName`). Calls' Language column shows only "Spanish"; English rows are blank. The Bookings, Notes and Characters columns are gone |
| 56 | P20 against 6.x's single empty line | Lists use `EmptyState`: one sentence with a period, a hint under 14 words, a dashed 1px `--layout-border-color` box three rows tall. Filtered-to-zero is worded differently ("No calls match Live." / "Change the filter to see more.") |
| 57 | P21 against 5's static "Demo data" label | In demo mode (`?mock=demo` or the demo build) the top bar's right group starts with a quiet **"Demo"** text button (16px chevron) opening one menu: Reset the day (R), Play a sample call (P), Play at 2x, Bring Katie in (K), Show / Hide numbers (5). `?mock=1` keeps the "Demo data" line. Settings hides its Demo data row in the demo build (the toggle could not keep its promise there). FINDINGS 5c's "Watch the demo line" is not in the menu: it needs a server feed (an engineering gate, 5d) |
| 58 | P1: the fixtures (a real surname, a mishearing as the headline, duplicate slots, a frozen date) cannot be screen-shared | `?mock=demo` serves a made-up practice day on the **real date**, "now" pinned to 9:10 PM (the day is complete and after-hours calls are in; the showpiece call plays "now" on demand). The dataset was written for a Tuesday; the materializer moves **every** weekday token of every call by **one** business-day offset from Tuesday to the real day 0 (Wed +1, Thu +2, Fri +3, Mon -1, a Saturday or Sunday as Friday; Fri +1 wraps to Mon): slots ("Thu 9:00 AM" stays in that form), the book and cancel data, booking and note reasons, confirmation texts, and the transcripts, where spoken dates from `manifest.date_phrases` get the moved weekday and the real day-of-month and bare weekdays ("Fridays are easiest") move too. Everything moves together, so no two bookings share a slot, "today" stays the call's day and "tomorrow" the next business day. Office hours ("Monday through Thursday", "Fridays from seven thirty until one") and weekend days never move; a "tomorrow" that lands past a weekend becomes the weekday's name, and a call whose days all land in a later week says "next week" for "this week". **Open:** on a Wed, Thu or Fri day 0 some afternoon slots land on Friday afternoon, after the 1 PM Friday close (Wed: Robert Halvorsen 2:40 PM, in the call that states the hours); on a weekend day 0 the same-day visits land on the Friday before |
| 59 | Check 8 allowed no `@keyframes` except the drawer slide | Three one-shot keyframes are allowed, opacity and transform only, none looping, all off under reduced motion: `lineIn`, `lcEnter`, `lcHold` (2.3) |
| 60 | Checks 3 and 15: no left border but 1px rules; no radius outside the list | Allowed: Katie's transcript rows' 2px `--layout-border-color` left rule (P11, neutral grey, not a colored bar) and the chart bars' 2px top radius (P4) |
| 61 | **P13 not taken.** FINDINGS proposed a lighter border plus `0 1px 2px rgba(16,24,40,.05)` on every card | The brief allows shadows only on floating things. Cards take only the lighter border, `--layout-border-color` (#d0d4e4), with `box-shadow: none`; the inside rules are the same color |
| 62 | **P16 not taken.** FINDINGS proposed a dimming scrim under the drawer that closes it on click | The brief: no modal by reflex, the drawer stays `role="complementary"` with no backdrop and the page stays interactive (6.8, check 16). Known: the open drawer covers the top bar's Demo control and Show numbers; R / P / K still work |
| 63 | **P22 to P25 not taken.** An estimated-production dollar figure, a call audio player, a callback "done" state, dark mode | P22 is a dollar claim on screen (Tom's call; not built, so not shown). P23 needs Katie to keep recordings, a BAA and policy decision. P24 needs a backend field (notes have no done state, conflict 26). P25 is against the brief (light only) |
| 64 | 6.8's "the ring returns once it loads" on the drawer heading | The heading is a programmatic focus target, not a control: it never draws a ring, so a mouse-opened drawer shows no blue box around the patient's name. `.visually-hidden` text is 14px (it measured 16.38px and tripped check 23) |
| 65 | "N after hours" needs office hours the API does not carry | `pages/overview/hours.ts`: 7 AM to 5 PM, Monday to Friday, until the API carries office hours. In real mode the after-hours fact is only as right as that constant. The KPI never pitches Katie as after-hours: it is a count of calls, shown only when there is no Spanish fact |
| 66 | **Glass skin (Tom, 2026-10-26).** The brief and this file banned glassmorphism, blur, shadows on cards and icon tiles (2.3, 8 items 2, 7, 21), and kept one card with four KPI cells (6.2) and an edge-to-edge drawer (6.8) | `docs/DESIGN-GLASS.md` rules the skin: a still environment, one slab holding the app (the content scrolls inside it), glass cards with a 20 px backdrop blur, a solid blue active nav pill, pastel pill chips, four KPI cards with icon tiles and a real comparison line, the drawer floating 12 px inside the slab, Katie's floor on the slab. Kept: no gradient text, no glow or neon, no pulsing, no fake numbers, no welcome banner, Lighthouse accessibility 100, zero console errors. Measured changes from the spec's values are in DESIGN-GLASS 7 (secondary #56667d, negative #dc2626, no backdrop-filter on the slab for Katie's 60 fps). **Second pass (DESIGN-GLASS 8, Tom's call the same day):** the environment is a room photo, the slab is pulled in (inset 28 / 40 / 48 / 64) and blurred again, a rim and three glass objects are added, secondary text is #334155, and the drawer floats 12 inside the slab (52 from the viewport at 1280 x 800) |

---

## 3. Type

Load Figtree 400, 500, 600 from Google Fonts in `index.html`, with `display=swap` and a
preconnect to fonts.gstatic.com. The stack is `var(--font-family)`.

Turn on `font-variant-numeric: tabular-nums` for every time, duration, phone and count, and
never change `letter-spacing`.

| size / line | weight | used for |
|---|---|---|
| 12 / 16 | 400 | table header cells, chart labels and legend, KPI sub-lines, card meta, the masked number under a name, the drawer's speaker labels, `m:ss` stamps and event rows, timestamps in callback rows, "· insurance" under a reason |
| 12 / 16 | 600 | the chart's 7 AM and 5 PM landmark labels (P4) |
| 12 / 20 | 500 | chips |
| 14 / 20 | 400 | body, table cells, nav items, callback reasons, transcript text, KPI labels (two lines at 1280), buttons, the Line tile's second line |
| 14 / 20 | 500 | names, active nav item, the rail's practice name, list count titles (P5) |
| 16 / 24 | 600 | Overview card titles, the rail's "Katie" beside her 24px head (P17) |
| 16 / 24 | 500 | Line status sentence |
| 20 / 28 | 600 | top-bar page title, drawer patient name |
| 32 / 40 | 600 tabular | KPI numbers (display size) |
| 13 / 18 | 400 | Katie's bubble only |

Text blocks (reasons, transcript lines, empty states, Settings helpers) get `max-width: 35em`
(em of the element's own size; 35em at 14px = 490px; conflict 40). The drawer's one-line system
notes are capped at 35em too. Everything is
left-aligned except numeric table columns (durations), which are right-aligned.

---

## 4. Grid and spacing

Spacing comes only from the `--space-*` tokens (an 8px grid, with 4 and 12 for tight
insides).

| | 1440 × 900 (design) | 1280 × 800 (minimum) |
|---|---|---|
| rail | 240 fixed, full height | 240 |
| top bar | 56, sticky, spans the content area only | 56 |
| content padding (top / right / bottom / left) | 40 / 32 / 128 / 32 | same |
| content inner width | 1136 | 976 |
| inner max width | 1376, centered when wider | |
| grid | 12 columns, `column-gap: 24`, `row-gap: 24` | same |
| column width | ≈72.7 | ≈59.3 |
| Line tile (cols 1–4) | 363 | 309 |
| KPI card (cols 5–12, 4 equal cells, 1px hairlines) | 749 (cells ≈187) | 643 (cells ≈160) |
| Calls by hour (cols 1–12) | 1136 | 976 |
| Latest calls (cols 1–8, P7) | 749 | 643 |
| Callbacks waiting (cols 9–12, P7) | 363 | 309 |

Why these numbers:
- **Row gap 24 is the Katie rule.** Every card she stands on has 24px of clear canvas above it,
  so her feet sit on a visible edge. Nothing may ever sit in a row gap.
- **Top padding 40 = `--katie-height` − top bar.** A top-row card's top edge lands at
  y = 96, so she fits standing on it.
- **Bottom padding 128 = `--katie-height` + 32.** Any last row can scroll clear of her corner
  while she peeks or enters.

Card insides:
- padding 20 (`--space-20`);
- card header row is 56px tall, padding 0 20, title left, meta and links right (Calls by hour: 60,
  with its legend line under the title);
- tables run edge to edge inside the card, with cell padding 0 16 and the first and last
  cells 20 (Latest calls: 0 8, with 20 on the first and last cells);
- a column width includes its cell padding (conflict 38).

Below 1280 nothing is designed; the grid stays 12 columns down to 1024. Below 1024 the
columns stack into one, and Katie is not rendered.

### Vertical budget, Overview

Glass skin, second pass (DESIGN-GLASS.md 8.2 and 8.7, measured 2026-10-26 on `?mock=demo` with Playwright, headless
Chromium, device scale 1, after `document.getAnimations()` is empty): the app sits in the slab, which stands in the room
with the inset ladder (`--slab-inset`): 40 at 1280 x 800, 48 from 1440 x 900, 64 from 1920 x 1080, 28 below 1280 wide or
800 high (1280 x 720). Every y below is a viewport y; the fold is the slab's inner bottom edge, where `#content` ends.

| row | 1440 × 900 | 1280 × 800 | 1280 × 720 | 1920 × 1080 |
|---|---|---|---|---|
| slab | 48–852 | 40–760 | 28–692 | 64–1016 |
| top bar | 49–105 | 41–97 | 29–85 | 65–121 |
| top row (Line + four KPI cards) | 145–283 (height 138: 36 px tiles) | 137–263 (height 126: the KPI labels wrap to two lines beside a 24 px tile) | 125–251 (126) | 161–299 (138) |
| chart card | 307–485 (height 178, its own 60px header with the legend pills) | 287–465 | 275–453 | 323–501 |
| bottom row starts | 509 | 489 | 477 | 525 |
| fold (slab inner bottom) | 851 | 759 | 691 | 1015 |
| Latest calls rows wholly above the fold (rows 44, P14) | 5 | 4 | 2 | 9 |
| Callbacks waiting rows wholly above the fold | 3 | 2 | 1 | 4 |

Tom accepted the cost in rows when he chose the second pass (DESIGN-GLASS 8.7: at least 4 / 5 / 2 at 1280 x 800 /
1440 x 900 / 1280 x 720); `scripts/verify.mjs` checks exactly that budget (its fold table in `docs/VERIFICATION.md`).
The first glass pass (inset 12 / 16) showed 5 and 7 Latest calls rows at 1280 x 800 and 1440 x 900. The content's 40 px
top padding stays (Katie's head on the top row).

The plan expected about 8 Latest-calls rows at 1280; the wrapped KPI labels cost one row more.
Accepted as built (the verifier's D11): shorter labels would break the KPI wording.

---

## 5. Shell

**Glass skin, second pass (DESIGN-GLASS.md 8, built 2026-10-26).** Where this note and the flat-skin
text below disagree, this note rules.
- **Room** (`div.env`, fixed, z 0, `aria-hidden`): `src/assets/scene.webp` (an out-of-focus office,
  1664 x 1024, 10,870 bytes, graded to a bright blue-white day room) under a white bloom top-right
  and a light inset vignette; `html, body` are `#8ba5cb` so nothing flashes before it paints.
  Nothing in it moves. It holds glass objects **A** (`Mobile`) and **B** (`Calendar`) behind the
  slab's top-right and bottom-right corners: their glyphs sharp in the corner gaps, their tiles
  blurred where the slab covers them.
- **Slab** (`div.slab.frame`, `data-katie-floor`): `position: fixed; inset: var(--slab-inset)`, the
  ladder 40 / 48 from 1440 x 900 / 64 from 1920 x 1080 / 28 below 1280 wide or 800 high; radius 24;
  `--glass-slab` (`rgba(238,245,255,.72)`) with **`backdrop-filter: blur(28px) saturate(1.25)`**
  (Tom's call, 8.8); a 1.5 px white border, a deep shadow `0 40px 90px rgba(6,20,60,.45)`, a faint
  white ring and inset highlights; `overflow: hidden`. It is a grid: the 240 rail | a column of the
  56 top bar over `#content`. **The window never scrolls; `#content` scrolls inside the slab.**
  `useContentScroll` hands `#content` the wheel over the rail, the top bar, the room and objects A
  and B, and the scroll keys when focus is on the page, a rail link or the top bar; it never moves
  focus.
- **Rim** (`div.rim`, `aria-hidden`, the slab's next sibling, z 2, no pointer events): the bright
  edge, a 2 px gradient ring (brightest top-left) plus an inner edge light, over the slab's box.
- **Object C** (`Check`, fixed, z 3, no pointer events) whole in the viewport's bottom-left corner,
  in front of the slab's rounded corner, clear of "Made by SAIDA". None of the three objects renders
  below 1024 wide.
- **Entrance**: the slab, the rim and C tilt in once per page load (`slab-in`, 900 ms, from opacity
  .5); never on a route change; none under reduced motion.
- **Fallbacks**: under `prefers-reduced-transparency` (and without backdrop-filter support) the slab
  is .93, cards .92, objects .85, and the slab, cards and objects drop their blur.
- **Rail**: transparent, right edge 1 px `--glass-rule`. Wordmark "Katie" 16/700. Nav items 44
  high, radius 12, 14/500, inactive `--nav-ink` #334155 with the icon in `--icon-color`; hover
  white .55; **active = a solid `--primary-color` pill, white text, icon and Callbacks count,
  `--nav-pill-shadow`** (white on #2563eb 5.17:1). This replaces P9's neutral active item
  (conflict 52) for this skin.
- **Top bar**: transparent, bottom 1 px `--glass-rule`, title 20/700. The right-hand controls are
  36 px **glass pills** (`--glass-card`, white edge, radius 999, inset highlight, no blur of
  their own): the Demo control, the Show numbers toggle with its label, and the Katie button as
  a 36 px glass circle. The Calls range and Settings' choices are **glass segmented pills**
  (`.glass-segmented`, 36 high, segments 30, the chosen one `--primary-selected-color` with ink
  600).
- The Demo menu is a glass menu (`dialogClassName="glass-menu"`); the tooltips are glass
  (`className="glass-tooltip"`, `zIndex={30}` so they sit above the slab).
- Layers: room 0 (with A and B), slab 1, rim 2, object C 3, Vibe tooltips 30, Katie 50 (her layer
  covers the slab exactly and clips to its radius), drawer 100.

Flat skin (the structure still holds; colors, radii and the active state above win):

**Rail** (240, `--primary-background-color`, right border 1px `--layout-border-color`,
padding 16):
- **Header block** (P17, conflict 50), padding 4 8: row 1 is Katie's 24px head (the same image
  as the top-bar Katie button, one construction at every size) with "Katie" 16/24 600 beside it;
  row 2 is the practice name 14/20 500 `--primary-text-color` (the name the owner cares about,
  no longer the smallest text in the rail). There is no "Demo practice" line.
  - The wordmark is plain ink. SAIDA brand colors may only appear inside this wordmark block,
    and none are specified for v1.
  - "SAIDA" appears once, as "Made by SAIDA" 12/16 secondary pinned 16 above the rail bottom,
    on the left.
  - The rail bottom-left (above that line) must stay empty: it is Katie's floor when
    home = bottom-left.
- **Nav**: 6 items, 8px below the wordmark. Each is 40 high with a 4 gap, padding 0 12,
  radius 4. Icon 20px from `@vibe/icons`, then 12 gap, then the label 14/20.

| item | route | icon |
|---|---|---|
| Overview | `/dash/` | `Home` |
| Calls | `/dash/calls` | `Mobile` (Vibe has no handset; `SmartCall` carries an AI sparkle and is banned) |
| Bookings | `/dash/bookings` | `Calendar` |
| Callbacks | `/dash/callbacks` | `Reply` |
| Texts | `/dash/texts` | `Comment` |
| Settings | `/dash/settings` | `Settings` |

Nav states (P9, conflict 52):
- idle: label `--secondary-text-color` 400, icon `--icon-color`;
- hover: background `--primary-background-hover-color`, label `--primary-text-color`;
- active (`aria-current="page"`): background `--primary-background-hover-color` (neutral
  grey), label 500 `--primary-text-color`, the icon alone in `--primary-color`;
- focus: `--focus-ring`.

Callbacks shows today's waiting count on the right (12/16 secondary, tabular, not a pill),
and only when it is greater than 0. It counts **action notes** (`isActionNote`, conflict 44), the
same number as the Overview KPI (demo 12, fixtures 4), not `stats.callbacks`. No other item has a
count.

**Top bar** (56, `--primary-background-color`, bottom 1px `--layout-border-color`,
padding 0 32, sticky):
- **Left**: page title 20/28 600, then 16 gap, then the range:

| page | range shown |
|---|---|
| Overview | "Today, Monday, October 12" 14/20 secondary from 1440px wide; "Monday, October 12" below 1440 (`formatTodayShort`), so at 1280 it ends (x 502) before Katie's Line-tile spot (x 534) (RV-2) |
| Calls | Vibe `ButtonGroup` (size small) through `PressedButtonGroup`, which adds `aria-pressed`: Today / 7 days / 30 days |
| other pages | nothing |

- **Right**, in order:
  - **demo mode** (`?mock=demo`, or any tab of the demo build): the **Demo control** (P21,
    conflict 57), a quiet text button "Demo" 14/20 with a 16px `DropdownChevronDown`, accessible
    name "Demo controls", the neutral hover fill when open (no blue). It opens one Vibe menu:

    | item | shortcut | what it does |
    |---|---|---|
    | Reset the day | R | re-materializes the day, stops a playing sample call, clears Katie's caps, closes the drawer (navigates to the page's root) and refetches every query |
    | Play a sample call | P | replays the showpiece call (s36) through the live path at its real pacing (about 130 s); shows "Playing…" and is disabled while it plays |
    | Play at 2x | | the same at half the gaps (about 65 s) |
    | Bring Katie in | K | `requestSummon()`; disabled with a reason on Settings or when Katie is Off |
    | Show numbers / Hide numbers | | the Show numbers setting |

    The shortcuts ignore inputs, selects, textareas, contenteditable and the textbox, combobox
    and searchbox roles, any key with a modifier and auto-repeat. The menu's code is lazy and
    loads only in demo mode (about 13 KB gzipped kept out of a practice's bundle);
  - "Demo data" 12/16 secondary, no chip: production builds in any other mock scenario
    (`?mock=1`, `empty`, `slow`, `error`);
  - the session line (`SessionLine`), real mode after a 401 only: "Signed out. Reload the page
    to sign in again." with a Reload button (dev: "The API refused the dev proxy's sign-in
    (DASH_USER / DASH_PASS)."). Polling and stream reconnects pause until a request succeeds;
  - Vibe `Toggle` (small) labelled "Show numbers" on Overview, Calls, Bookings, Callbacks and
    Texts. Settings shows no top-bar toggle.
- Both groups (`header > div.topLeft`, `header > div.topRight`) carry `data-katie-avoid`
  (7.2, 7.5).
- **Tab title**: "<Page> · Katie" ("Overview · Katie", "Calls · Katie" …), "Call · Katie" while a
  drawer is open. Never a number or a name.

**Drawer layer:** see 6.8. Katie's layer sits below the drawer: z-index cards 0, top bar 10,
Katie 50, drawer 100, Vibe menus and tooltips use their own layer above.

Data and live behaviour:
- **Data**: one QueryClient. Query keys include `reveal`. Revealed data is never persisted,
  logged, or put in a URL. Toggling Show numbers off removes every `reveal:true` query, and list
  placeholder data never carries `reveal:true` rows under a masked key (`maskedPrevious`, DATA-1).
- **Day rollover**: when the practice's local day changes, every `['dash']` query is invalidated
  (`bindDayRollover`, a 60 s check plus a timer just after midnight; once per day change).
- **Calls range start** falls back to the local midnight after the first failed stats attempt,
  so the error line shows in about 7 s, not 15 (RV-11).
- **401**: never retried; status polling stops; widgets show "Couldn't load this." (no "Trying
  again") and the top bar shows the session line.
- **Code splitting**: the shell, Overview, Bookings, Callbacks and Texts are in the entry chunk.
  Lazy chunks: Calls and Settings (prefetched when the browser is idle after the first render),
  `KatieStage` (with GSAP and the rig), the `/_katie` playground, the mock server with its
  fixtures (loaded only when a scenario is on), `DemoMenu` (demo mode only) and the demo backend
  with its dataset (`backend-*.js`, about 810 KB raw / 135 KB gzipped, loaded only for
  `?mock=demo`; it trips Vite's 500 KB warning and never reaches a practice). Vibe's `CustomSvgIcon` is resolved to a null
  component by a plugin in `vite.config.ts` (`vibeNoSrcIcons`), which keeps DOMPurify,
  react-inlinesvg and react-from-dom (about 16 KB gzipped) out; the dashboard uses no URL-based
  Vibe icons, so nothing renders differently.
- **SSE**: one `EventSource('/api/dash/stream')` per tab, with reconnect backoff 1, 2, 4, 8,
  16, 30 s. `status` also refetches every 15 s.
- Invalidation per event kind:

| event kind | invalidates |
|---|---|
| `call.started` | status, calls |
| `turn.*` / `tool` | `calls/:id` if open |
| `booking` | bookings, stats, calls |
| `note` | notes, stats |
| `sms.*` | sms, stats |
| `call.ended` | status, calls, stats, `calls/:id` |
| `cancel` | bookings, stats |

---

## 6. Widgets and pages

### Formats used everywhere

All in `tz = stats.range.tz`, with `America/New_York` until stats has loaded.

| what | format |
|---|---|
| time today | `5:35 PM` |
| time yesterday | `Yesterday 5:35 PM` |
| within 6 days | `Sat 5:35 PM` |
| older | `Oct 1, 5:35 PM` |
| duration | `m:ss` (rule in conflict 14) |
| phone | exactly as given (masked `(656) ***-0150`, or full when revealed) |
| slot | as given (`Mon 3:20 PM`) in tables. Katie expands it to "Monday at 3:20 PM" when it matches `^(Mon\|Tue\|Wed\|Thu\|Fri\|Sat\|Sun) (.+)$` |
| counts in Katie sentences | words one to ten, digits from 11, "no" for zero |

Every clickable row:
- is a link: `role="link"`, `tabIndex=0`, Enter opens;
- on hover gets `--primary-background-hover-color` and `cursor: pointer`;
- shows `--focus-ring-inset` when focused;
- keeps its own semantics: table rows stay rows and the first cell carries the link; in lists
  the `<li>` stays a listitem and an inner element is the link. Nothing gets `role="link"` on a
  `section`, `li` or `tr`.

Every list's empty state is an `EmptyState` (P20, conflict 56): one sentence with a period, a
hint under 14 words saying when data appears, in a dashed 1px `--layout-border-color` box three
rows tall, so the card keeps its size. A filter that leaves nothing is worded differently
("No calls match Live." / "Change the filter to see more."). Katie never appears on an empty
state.

Every widget's error state is one 14px secondary line in its body, "Couldn't load this.
Trying again.", with a "Retry" text button. React Query does 3 retries with backoff. While
signed out after a 401 (never retried) the line reads "Couldn't load this." with Retry
(`ERROR_COPY_SIGNED_OUT`).

### 6.1 Line tile (Overview, cols 1–4, `data-katie`): the live stage (P12, conflict 47)

Layout: label "Line" 14/20 secondary; 12 gap; dot + status 16/24 500 (with the timer at the
right end on a call); 4 gap; the second line 14/20, one line with an ellipsis (it may wrap to two
lines when it states a booking, and the slot never splits).

| state | dot | status | second line |
|---|---|---|---|
| idle | wolf grey | Open · last call 8:55 PM (`Yesterday 5:35 PM` / `Oct 9, 5:35 PM` when older; "Open · no calls yet") | empty |
| on a call | working orange, steady | On a call · Ellie Navarro (the caller's name once known, else the masked number), then the elapsed `m:ss`, tabular, ticking every 1 s | the last thing said, "Caller …" / "Katie …" (speaker in secondary), replaced per turn with no animation; "Answering…" before the first turn |
| on a call, after a booking event | working orange | as above | "Booked new-patient consult · Thu 10:00 AM" (`bookingLabel`), until the caller speaks again |
| just ended (30 s) | wolf grey | Open · last call 9:10 PM | the outcome, faded in once over 150ms: "Booked new-patient consult · Thu 10:00 AM", "Call ended · callback note left" or "Call ended · no booking"; then idle |
| status error | none | Can't reach the line right now | Trying again; blank while signed out (401) |

- The second line reads the open call's detail query, which the stream refreshes on every event.
- Nothing pulses or glows. `data-line-tile` and `data-line-state` (`idle` / `live`) stay on the
  card; Katie's line-wake moment still targets it.
- Measured (demo, Play at 2x): on a call within 0.5 s, a caller line by about 12 s, the booked
  line at 43 s of call time, ended at 65.5 s, idle again 30 s later.
- The Card is a plain `section` with `data-katie` and `data-line-tile` and no role. It is a tab
  stop only when there is no link inside.
- Click: nothing on idle. On a call, an inner div that fills the card (padding 20, radius
  `inherit`) is the link, named by its visible text (no `aria-label`); it opens that call's
  drawer, and Escape returns focus to it.
- Skeleton: 160×24 bar, then a 200×14 bar; the card is the loaded height (166 at 1280, 146 at
  1440).

### 6.2 Today numbers (Overview, cols 5–12, one card, four cells; P6 / P3, conflict 44)

**Glass skin (DESIGN-GLASS.md 4, conflict 66): four separate KPI cards**, cols 5–6, 7–8, 9–10,
11–12, each a glass card, its own link and its own Katie target with the same `data-katie` /
`data-katie-moment` as the old cells. Inside: a pastel **icon tile** (36 px, radius 10, 20 px
icon; at 1280 the cards are about 136 wide and the tile is 24 px, radius 8, 16 px icon) with the
label 12/500 secondary beside it (two lines at 1280); the number **28/32 700** ink, tabular, 4
below the head, never wrapping; the fact sub-line 12 secondary as before; then the
**comparison line**. Tiles: Calls answered `Mobile` on blue, Appointments booked `Calendar` on
purple, New-patient consults `Person` on green, Callbacks waiting `Reply` on orange.

The comparison line replaces "Yesterday N". It is drawn only from real counts: today's number
against yesterday's, where yesterday's is known by the same rule as before (conflict 8, the
bookings list reaching back for consults) and above zero. Today ahead: `↑ +5 vs yesterday` in
`--positive-color-hover` 12/600; today behind: `↓ −3 vs yesterday` in secondary (never red);
equal or unknown: nothing (the line's height stays reserved). Callbacks waiting never has one.
Yesterday = 0 shows nothing, because a quiet day and missing data look the same. Demo: Calls
35 `↑ +5 vs yesterday` (yesterday 30), Appointments 27 `↑ +3 vs yesterday` (24), consults and
callbacks none. The error state is one card across cols 5–12; the skeleton is four cards with
the real labels and tiles. Card heights: about 136 at 1280 x 800 and 140 at 1440 x 900.

Flat skin (history; the cell content rules still hold except where the note above changes them):

Each cell is its own `data-katie` target (Calls answered carries `data-katie-moment="first-open
summary"`, Appointments booked `booking`). Cell layout: padding 20, label 14/20 secondary, 8 gap,
number 32/40 600 tabular, 4 gap, up to two sub-lines 12/16 secondary. Cells are split by 1px
`--layout-border-color` vertical rules and share rows through a CSS subgrid, so at 1280 the
labels wrap to two lines and the numbers stay on one line. The second sub-line is always
reserved, so heights do not shift (card 166 at 1280, 146 at 1440, skeleton included).

| cell | label | number | first sub-line | second sub-line | click |
|---|---|---|---|---|---|
| 1 | Calls answered | `stats.calls` | "N in Spanish" (`languages.es`), else "N after hours" (conflict 65), else nothing | "Yesterday N" | `/calls` |
| 2 | Appointments booked | `stats.bookings` | "N confirmed by text" (today's incoming texts of kind yes) | "Yesterday N" | `/bookings` |
| 3 | New-patient consults | today's bookings where `isNewPatientBooking` (the `new_patient` flag, else the reason) | nothing ("N adults" needs an age field the API lacks) | "Yesterday N" only when the bookings list reaches back past yesterday's midnight | `/bookings` |
| 4 | Callbacks waiting | today's action notes (`isActionNote`, conflict 26) | "N urgent" | | `/callbacks` |

- Demo: 35 (4 in Spanish · Yesterday 30) / 27 (19 confirmed by text · Yesterday 24) / 17 / 12
  (1 urgent); after the sample call 36 / 28 / 18 / 12. Fixtures: 8 (2 after hours) / 7 (4
  confirmed by text) / 5 / 4. Empty: four zeros and no sub-lines.
- "Yesterday N" appears only when N > 0 and conflict 8 is valid. "Yesterday 0" never renders.
  No arrows, no deltas, no color, no count-up.
- Cells have no `aria-label`; their accessible name is their visible text.
- The skeleton shows the real labels, so the loading card is the loaded height.
- Empty: the numbers show 0. There is no other empty state.

### 6.3 Calls by hour (Overview, cols 1–12, card 178, `data-katie`; P4, conflict 53)

- **Header** (60): "Calls by hour" 16/600, and under it one 12/16 secondary legend line: a 12px
  `--primary-color` swatch "Booked" and a 12px `--primary-selected-color` swatch "No booking".
- **Span**: from min(first call, 7 AM, now) to max(last call, 5 PM, now) + 1 hour (demo: 6 AM
  to 9 PM; fixtures: 7 AM to 6 PM). Katie answers around the clock, so any call outside the
  practice day widens the span instead of hiding.
- **SVG**: hand-drawn, width = card inner width (ResizeObserver, drawn in px).
  - slot = width / hours in the span; bar = 0.56 × slot, centred; square at the baseline with a
    2px top radius (conflict 60).
  - Each hour stacks `booked` (bottom, `--primary-color`) under `calls − booked` (filled
    `--primary-selected-color`, no stroke). No hollow bars.
  - Count label 12/16 secondary, tabular, on top of any bar with calls > 0.
  - Baseline 1px `--ui-border-color`. No y axis, no gridlines.
  - An hour label under every slot, 12/16 secondary; the opening (7 AM) and closing (5 PM)
    hours at weight 600 as landmarks (`pages/overview/hours.ts`).
- **Now rule**: 1px `--secondary-text-color`, label "Now 9:10 PM" 12/16 secondary, flipping left
  near the right edge.
- Hover on a bar: Vibe `Tooltip` "3 PM: 3 calls, 2 booked".
- Accessibility: `<title>` "Calls by hour, today", plus a visually hidden table of the nonzero
  hours.
- The card is 178 tall loading, empty and loaded alike.
- Empty (0 calls): baseline, hour labels and the Now rule only, with no copy.

### 6.4 Latest calls (Overview, cols 1–8, `data-katie`; P7 / P10, conflicts 45, 55)

- **Header**: "Latest calls" left, "All calls" link right (→ `/calls`).
- **Data**: the 10 newest calls with `started_at ≥ stats.range.from`, newest first.
- Column header row 32 (12/16 secondary). Rows 44, 1px `--layout-border-color` rules.

Widths include cell padding (conflict 38; `COL` in `src/pages/overview/LatestCalls.tsx`).

| column | width | content |
|---|---|---|
| Time | 88 | 8:55 PM; a live row says "Now" |
| Who | 140 | the name 14/20 500 over the masked number 12/16 secondary (`callName`); the number alone at 14 when there is no name |
| Reason | flex | `deriveReason`: the booking reason, else the note reason, else the cleaned first line, max 48 characters; " · insurance" drops to a 12/16 second line. A live row reads "In progress" |
| Outcome | 96 | chip |
| Duration | 76, right | 1:31; a live row ticks every 1 s |

- Motion (FINDINGS 5d): a row that arrives while the page is open enters with `translateY(4px)`
  + opacity over 150ms; after hang-up the row's `--primary-highlighted-color` tint holds 2 s and
  fades over 400ms, once.
- Click a row: the drawer opens over Overview. URL `/dash/calls/:id`, with
  `state.background` = the Overview location.
- Skeleton: min(10, `stats(1).calls`) rows of 44 once stats is in, otherwise 10.
- Empty: `EmptyState` "No calls yet today." / "Each call shows here the moment Katie picks up."
  Katie does not appear on an empty day.

### 6.5 Callbacks waiting (Overview, cols 9–12, `data-katie`; P18, conflict 51)

- **Header**: "Callbacks waiting" left. Right: "1 urgent" 12/16 secondary when > 0.
- **Data**: today's **action notes** only (conflict 26), **one row per caller** (a caller's two
  reasons are two one-line reasons in the same row), urgent first, then newest. Show 5. Footer
  row 40: "See all {N} callbacks" link (→ `/callbacks`) when more than 5 are waiting.
- The name comes from the booking made on the call when the note was filed before the caller
  gave it, and a name correction on the call wins (`callName`).
- **Row**: line 1 is the identity (name 14/20 500 + the masked number in secondary, truncated
  first when space runs out), the **Urgent** chip only (every row here is a callback, so a
  Callback chip would be noise), "Booked on this call" 12/16 secondary under the name when true,
  and the time right-aligned. Then the cleaned reason (`cleanNoteText`: no "Existing patient X,
  DOB on file:" prefix), clamped to 2 lines.
- Click: opens the note's call drawer.
- Demo: 12 waiting, 1 urgent (Owen Brandt, 8:55 PM, solid Urgent chip, booked on this call), 5
  shown plus the footer. Katie's sentence: "Start with Owen Brandt from 8:55 PM. …".
- Empty: `EmptyState` "No callbacks waiting." / "New callbacks show here the moment a call ends."

### 6.6 Calls page `/dash/calls` (`data-katie` on the table card)

- **Toolbar** inside the card header: the count sentence 14/20 500 left ("35 calls today · 26
  booked"; "0 of 35 calls today" when a filter leaves nothing; P5, conflict 43). Right: an outcome filter, a native
  `<select aria-label="Outcome">` (not Vibe `Dropdown`, whose markup failed
  `aria-allowed-attr`): 160 wide, 32 high, 14/20 type, 1px `--ui-border-color` border,
  `--border-radius-small`, a CSS chevron, `--focus-ring`. Options: All outcomes / Booked /
  No booking / Live / Dropped. The range lives in the top bar.
- **Table**: 44 rows and a 32 header. Widths include padding (conflict 38).

| column | width | content |
|---|---|---|
| Time | 120 (Today), 168 (7 and 30 days, for "Yesterday 12:35 PM") | per the formats table |
| Caller | 200 | name 14/20 500 over the masked number 12/16 (P10); a revealed number fits |
| Reason | flex | `deriveReason` (P7), ellipsis, `title` |
| Language | 104 | "Spanish" only; English rows are blank (P19) |
| Outcome | 120 | chip |
| Duration | 96, right | 2:10 |
| (chevron) | 44 | 16px chevron in `--icon-color`, on hover and focus (P8) |

The Bookings and Notes count columns are gone (their facts are in the drawer). On the 7- and
30-day ranges the oldest rows show the number and the cleaned first line: the bookings and notes
lists stop at 50 rows, so those calls have nothing to join to (known, accepted).

- Sort: newest first, no sort UI. Filtering is client-side. URL keeps
  `?range=7d&outcome=booked` (not PHI).
- Rows keep row semantics. The time cell's span is the keyboard link, named "Call from
  {caller} at {time}", and carries `data-call-row` so focus returns to it when the drawer closes.
  A click anywhere on the row opens the drawer (→ `/dash/calls/:id`, over the page). The focused
  row shows the hover tone plus `--focus-ring-inset`.
- Skeleton: the row count comes from `stats(range)`: `.calls` for All, `.booked_calls` for
  Booked, otherwise 12, capped at 20; 0 holds a 56px block. Before stats arrives it shows 12.
- Empty:

| case | copy (`EmptyState`) |
|---|---|
| Today, no calls | "No calls yet today." with a hint |
| 7 days, no calls | "No calls in the last 7 days." |
| 30 days, no calls | "No calls in the last 30 days." |
| a filter is active | "No calls match Live." / "Change the filter to see more." |

### 6.7 Bookings `/dash/bookings` (`data-katie` on the card)

- Header: the count sentence "27 bookings today · 17 new patients" (P5).
- Table, newest first by `ts`, rows 44, whole-row click (P8). Widths include padding (conflict 38).

| column | width | content |
|---|---|---|
| Booked | 168 | booking `ts` (the header says "Booked", not "When") |
| Patient | 200 | name 500 over the caller's masked number 12/16 (DATA-2: a revealed number fits) |
| Slot | 128 | Thu 10:00 AM |
| Reason | flex | `bookingLabel` ("New-patient consult"), 1 line, ellipsis + `title` |
| Insurance | 152 | "Not given" (secondary) for `""` / `not provided` |
| (chevron) | 44 | on hover and focus |

- "Show more" (conflict 12).
- Skeleton: 8 rows of 44. The row count cannot be known before load.
- Empty: `EmptyState` "No bookings yet." / "Every appointment Katie books shows here with its slot."

### 6.8 Call drawer `/dash/calls/:id`

**Glass skin (DESIGN-GLASS.md 3.6, conflict 66): the drawer floats inside the slab.** `position:
fixed`, top, bottom and right at `--float-inset` (the slab inset + 12: 52 from the viewport at
1280 x 800, 60 at 1440 x 900), width 560, radius 20, `--glass-strong` with a 28 px backdrop
blur, a white edge and the float shadow, z 100 (above Katie). Measured box (s03, second pass): 668–1228 x 52–748 at
1280 x 800, 820–1380 x 60–840 at 1440 x 900. The slide, focus handling, Escape, `role="complementary"` and the
no-scrim rule are unchanged; the frame bullets below are the flat skin's.

**Frame:**
- `position: fixed`, right 0, top 0, height 100vh, width 560;
- `--primary-background-color`, left border 1px `--layout-border-color`,
  `--box-shadow-medium`, z 100;
- slides in with `translateX(100%)` → 0 (250ms enter, 200ms exit, none under reduced motion);
- **not a modal**: no backdrop and no scrim (P16 not taken, conflict 62), the page stays
  interactive, `role="complementary"`, `aria-label="Call from (656) ***-0150"`.

Behaviour:
- Esc and the close `IconButton` (`Close` icon, top-right, 16 from the edges) close it and
  navigate back to the background location (or `/calls`).
- Focus moves to the drawer heading on open and returns to the row on close (found again by its
  call id, `data-call-row`). The heading is a programmatic focus target and never draws a ring
  (conflict 64).
- While open, the drawer covers the top bar's Show numbers toggle and the Demo control (close it
  to reach them; the R / P / K shortcuts still work).
- Opening a different row swaps the content in place.

**Header** (padding 24, bottom rule `--layout-border-color`; P11, conflict 46):
- Line 1: the patient's name 20/28 600 (`callName`; the masked number when there is none),
  12 gap, the outcome chip.
- Line 2: 14/20 secondary, "(813) ***-0103 · Wed 8:02 AM · 1:56 · Spanish" (the language only
  when it is not English).
- Data comes from the list row first, so the header renders instantly, then from `call`.

**Outcome block** (padding 16 24, bottom rule; `section aria-label="Outcome"`): label "Outcome"
12/16 secondary, then one line per action in call order, 14/20 with a 16px Vibe icon in
`--icon-color`. Examples (demo s03): "Checked the chart: new patient" · "Booked new-patient
consult · Thu 2:40 PM" · "Confirmation text sent · replied Yes 8:03 AM". Each line is a button
that scrolls to its transcript row and tints it (`--primary-highlighted-color`) until focus
leaves. Informational notes show here too ("Desk note filed · urgent …"). A history call with no
transcript builds its outcome from the list rows and says the transcript isn't available.

**Transcript** (the scroll area, `role="region" aria-label="Call details" tabIndex=0`,
`--focus-ring-inset` when focused):
- Rows on a grid of speaker 64px · stamp 36px · text: the speaker 12/16 secondary ("Katie" with
  her 16px head, or "Caller"), the `m:ss` offset from the call's start 12/16 tabular, the text
  14/20 `--primary-text-color`, `max-width: 35em`. No bubbles, no panels.
- Katie's rows carry a 2px `--layout-border-color` left rule (conflict 60). The label is plain
  "Katie" (no "(AI receptionist)").
- **Grouping**: all `turn.bot` events with the same `turn` form one row, joined with a space
  after the fix in conflict 16.
- **Event rows**, in event order: 12/16 secondary with a 16px Vibe icon (Mobile, Person, Calendar,
  Check, CloseSmall, Note, Comment, Reply, Warning), one line, full text in `title`.

| event | row copy |
|---|---|
| `call.started` | Call started 8:02 AM |
| `greeting {name}` | Greeted as {name}. Hidden when name is empty |
| `tool lookup` | Checked the chart: existing patient / new patient / not on file (a live call reads "not on file" until its booking says new patient) |
| `tool context ok` | Checked the schedule |
| `tool book ok, already_booked:true` | Already booked {slot} |
| any `tool` with `ok:false` | "Chart lookup didn't go through", "Booking didn't go through — {slot}", … (warning icon; booking, cancel and message failures also go into the outcome block) |
| `booking` | Booked {name} · {slot} · {what} · {insurance} |
| `cancel` | Cancelled {slot} for {name} |
| `note` | Desk note filed (· urgent) · {cleaned reason}; FYI note filed · … |
| `sms.out` | Confirmation text sent / Text sent |
| `sms.in` | Replied Yes by text / Text reply received |
| `call.ended` | Call ended · 1:56 · Booked (row duration, chip label as text) |
| unknown kind | not rendered |

States:
- Live call: events append from the stream (invalidate `calls/:id`), and the scroll stays
  pinned to the bottom unless the user has scrolled up.
- Skeleton: the header from the row, then transcript-shaped rows, in a `role="group"
  aria-busy="true" aria-label="Loading transcript"` wrapper.
- Empty (no turns): "No conversation was recorded on this call."
- 404: "The transcript for this call isn't available."
- Other error: "This call could not be loaded." + Retry.

### 6.9 Callbacks `/dash/callbacks` (`data-katie` on the card; P18, conflict 51)

This is the page the front desk opens at 8 AM.

- Header: the count sentence "12 waiting · 1 urgent" (action notes only, P5); "0 waiting" on a
  day with none.
- **Grouping**: by local day, newest day first; group header row 32: "Today" / "Yesterday" /
  "Sat, Oct 10", 12/16 secondary. Inside a day, three sections:
  1. the **action notes**, grouped by caller (one row per caller, a reason per line), urgent
     first, then newest;
  2. **"Noted on booked calls"**: notes annotated informational (the call was booked and the
     note is for the record), reasons in secondary text; an urgent one shows a quiet grey Urgent
     chip (2.2);
  3. **"FYI"**: `fyi` notes not on a booked call (e.g. "running late").
- **Rows** auto height, min 44, padding 12 16, whole-row click (P8). Widths include padding.

| column | width | content |
|---|---|---|
| Priority | 104 | Urgent / Callback / FYI chip |
| Caller | 200 | name 500 over the masked number 12/16 (the booking's patient name when Katie filed the note before she had it; a correction wins); "Not given" in secondary only when nothing names the caller |
| Reason | flex | the cleaned reason (`cleanNoteText`), wraps, never truncated, `max-width: 35em`. "Booked on this call" on its own 12/16 line under it when true |
| Time | 104 | |
| (chevron) | 44 | on hover and focus |

- Show more: conflict 12.
- Skeleton: 6 rows of 65px. The row count cannot be known before load.
- Empty: `EmptyState` "No callbacks waiting." / "New callbacks show here the moment a call ends."

### 6.10 Texts `/dash/texts` (`data-katie` on the card; P15, conflict 49)

- Header: the count sentence "20 texts sent today · 19 replies" (P5).
- **Conversations, not a log**: each confirmation is one row and the patient's reply is folded
  into it (`foldTexts`, `pages/lists/people.ts`). Rows 44, newest first, whole-row click.

| column | width | content |
|---|---|---|
| Time | 168 | when the text went out |
| Patient | 200 | name 500 over the masked number 12/16 |
| Message | flex | `sms.text` with the leading practice name removed ("Ellie Navarro is booked Thu 10:00 AM. Reply YES to confirm."), one line, ellipsis; without a body (real mode) "Confirmation text" |
| Status | 184 | "Replied Yes 7:41 PM" or "Sent" (never "Delivered": no delivery receipt) |
| (chevron) | 44 | on hover and focus |

- The Direction, Kind and Characters columns are gone.
- Skeleton: 10 rows of 44.
- Empty: `EmptyState` "No texts yet." / "Confirmation texts show here after Katie books a visit."

### 6.11 Settings `/dash/settings` (no `data-katie`)

One card, max-width 640, rows 56 split by rules. Each row has its label at 14/20 500 with a
12/16 secondary helper under it, and the control on the right.

| row | control | helper |
|---|---|---|
| Show numbers | Toggle | "Shows full phone numbers in this browser only. Off by default." |
| Katie | ButtonGroup through `PressedButtonGroup` (`aria-pressed`): Occasional (default) / Off. Stored in `katie.enabled`, `'0'` = Off, so earlier on/off choices survive (MONDAY-LLAMA 3.7) | Under Occasional: "Katie steps in for urgent callbacks, the day's first booking and a few other moments, then gets out of the way." |
| Katie's corner | ButtonGroup through `PressedButtonGroup` (`aria-pressed`): Bottom right / Bottom left. Decides which side she enters from and where she peeks | |
| API base (dev only, `import.meta.env.DEV`) | TextField, default `/api/dash`; only a same-origin absolute path is accepted (`sanitizeApiBase`), anything else falls back to the default | |
| Mock data (dev only) | Toggle | "Serves the bundled fixtures instead of the API." |
| Demo data (production build with `?mock` only; **hidden in the closers' demo build**, which has no backend to turn to, conflict 57) | Toggle, on | "This tab shows made-up sample calls. Turn off to see the practice's own." Turning it off stores 'off' for the tab and reloads without the fixtures |

Settings are stored in localStorage under `katie.*`, with every access wrapped in try/catch. Katie's
appearance caps use the same `katie.*` prefix (7.4 and CONTRACTS.md); they hold timestamps, counts
and the practice day only.


### 6.12 People and Activity (Settings, cognito mode, owner and SAIDA support only)

Two full-width cards after the toggles card and before The glass. Staff and basic mode see neither
(`isCognitoMode() && canManagePeople(role)`). Look: docs/sketches/signin-2026-11-04.

**People who can sign in** (`data-card="people"`): a one-line lead ("Each person has their own login and their own
code. Remove someone and they are signed out everywhere at once."), then a ruled table, edge to edge: Person (name 14/20
600 + a small role chip, the email under it at 13/18 secondary), Status (chip: Active green, Invited and Password reset
amber, Removed grey), Sign-in code (Authenticator app, Email code, Not set up), Last signed in (`formatWhen`, or Never),
and the actions as 30 px glass pills at the right: Reset password, Reset code, Remove (red text) on an active person;
Send invite again and Remove on an invited one; none on a removed one; never Remove on your own row. The last row is
"SAIDA support" (Support chip, "<email> · only when you ask") with a Toggle instead of buttons: an owner flips it, support
sees it disabled. Under the table: a primary "Add a person" pill with one line of what happens, a status line
(`role="status"`) after each action, a plain error line (`role="alert"`) and the note about the access log. Every action
opens a dialog first (a white card, 22 px radius, over a dim layer at z 200; Escape or a click outside cancels; the
buttons are Cancel and the action, red for Remove): "Remove Jessica Lane?" / "Jessica is signed out of Katie on every
computer and phone right now and cannot sign in again, including with a remembered computer." / "Jessica's name stays on
the calls they viewed, for the practice's records.", "Reset Marisol's password?", "Reset Marisol's sign-in code?", "Send
Devon the invite again?" and "Add a person" (email, name, role: staff or owner). The server's `{"error": "..."}` words show in
the dialog as they come; a 403 shows "Not allowed." on the card.

**Activity, last 30 days** (`data-card="activity"`): a Person filter (native select, "Everyone" first) in the card header,
then one row per entry, newest first: a plain sentence on the left ("Jamie opened a call", "Jamie revealed a number",
"Jamie signed in", "Owner removed Pat"), the time on the right. A sentence never holds a number, a call id or an address.
Names come from the People list; without it, from the email's local part. 25 rows, then "Show more".

**Sign-in screens** (`src/auth/screens`): the room behind (same markup as the shell's `.env`), one 440 px glass pane
(radius `--radius-slab`, the slab fill, a highlight and a soft shadow), Katie's 60 px head, a 28/34 700 title, a 15/22
secondary line, white 44 px fields (12 px radius), a 46 px blue pill button with the nav-pill shadow, text links in
`--primary-color`, and a 12/16 footer. Six code boxes are 48 x 56. Errors are 14/20 500 in `--negative-color`.

---

### 6.13 Leads `/dash/leads` and the lead drawer `/dash/leads/:id` (`data-katie` on the list card)

Source: `voice-agent/handoff/LEADS-PAGE-SPEC-2026-11-04.md` (the three routes, the stages, the
taps). A lead is someone who was quoted and has not followed through. The page is the treatment
coordinator's: who to chase first, and where to record what happened. Rail: "Leads" between
Bookings and Callbacks (the `Team` icon), no count badge. The page shows numbers (`numbers: true`
in `shell/pages.ts`), so the top bar keeps Show numbers.

**Four counts** (cols 3 each; each a card whose whole face is a button):

| card | number | hint | filter it sets |
|---|---|---|---|
| Missed consult (red dot; the number takes `--chip-negative-ink` above 0) | `summary.missed_consult` | No-show or cancelled | `missed_consult` |
| Never booked (orange dot) | `summary.never_booked` | Quoted a week ago or more | `never_booked` |
| Booked (blue dot) | `summary.by_stage.consult_booked` | Exam on the schedule | `consult_booked` |
| Came in, not started (green dot) | `summary.by_stage.consult_happened` | Had the exam | `consult_happened` |

Label 12/16 500, number at the KPI size, hint 12/16 secondary. Before the first answer: a skeleton
bar. When the request failed, or the summary came back empty: an en dash, never a 0 that is not
known. Tapping a count filters the list to it (`aria-pressed="true"`, a 2px accent ring inside the
card); tapping the pressed one returns to the open leads.

**The list card.** Title: the count sentence for the filter on screen ("11 open leads",
"3 missed consults", "1 never booked", "4 with a consult booked", "1 came in, not started",
"3 quoted", "1 started", "1 paused", "1 lost", "14 leads"), counted from the summary so a short
page never shrinks it. Header right: a select labelled "Show": Open leads (default), Missed
consult, Never booked, Consult booked, Came in, not started, Quoted, Started, Paused, Lost, All
leads. The filter lives in the URL as `?show=` (absent for the default; the stage code
`consult_missed` is read as the pool). Order: as served, newest stage change first. A new filter
shows the skeleton, never the last filter's rows under the new name.

Rows: auto height (two lines in most cells), min 44, whole-row link (P8, `[data-lead-row]`). The
row whose drawer is open keeps the selected tint. Widths include padding.

| column | width | content |
|---|---|---|
| Lead | 148 | first name 500 over the phone 12/16, masked "(813) \*\*\*-0141" unless Show numbers (the box then sends ten digits; `leadPhone` formats them) |
| Stage | 188 | the stage chip; under it the exam line 12/16: "Wed 8:00 AM" / "Tomorrow 3:20 PM" (booked), "Oct 9, 9:00 AM · no check-in" or "· cancelled" (missed, in `--chip-negative-ink`), "No exam yet", or "12 days, no exam" (quoted a week or more, same red ink) |
| Quote | flex | the plan "Comprehensive · metal" over "$5,400 · ins. $1,500 · patient pays $3,900 · +1 more" 12/16: the first option as quoted, "+N more" for the others, "ins. pending" / "no insurance" when so. Staff read this, so it says "patient pays" where the patient's own text says "you pay". A line breaks between figures, never inside one |
| Last touch | 140 | how long ago ("6 hr ago", "Yesterday", "4 days ago", "2 weeks ago", then the date; the full time in the cell's title) over what it was: "Quote texted", "Text sent", "Replied yes", "Replied STOP", "Exam booked, Thu 4:00 PM", "Exam cancelled", "Marked lost" |
| Next text | 132 | **reserved** for the follow-up ladder (below). Today: a neutral "Texts stopped" chip for a lead who texted STOP, an em dash for everyone else |
| (chevron) | 44 | on hover and focus |

Stage chips (2.2): Quoted neutral, Consult booked the Callback blue, **Missed consult the pastel
red**, Came in the Live orange, Started the Booked green, Lost and Paused neutral. An unknown stage
is a neutral chip with its code in words.

**Reserved: the next text and the call-now prompt.** The next backend pieces (the follow-up text
ladder, the day-3 call prompt) will add four optional fields to a lead row. The page already has
their places, and exactly one function reads them (`pages/leads/model.ts` `nextStep`), so a rename
on the wire is a one-line change:

| field | type | where it shows |
|---|---|---|
| `next_text_at` | unix seconds or null | Next text cell: the day in a word ("Tomorrow", "Thu", "Nov 7") over the label; the drawer's Next text fact |
| `next_text_label` | string | under the day ("Day 2 text"); "Follow-up text" when absent |
| `call_now` | `true` when a person should call this lead now | an accent pill "Call now" at the top of the Next text cell, and a block at the top of the drawer: "Call Dana now", the phone, the reason |
| `call_now_reason` | string | under the pill and in the drawer block ("No reply to two texts") |

Only an open lead gets either. A lead who texted STOP reads "Texts stopped" whatever
`next_text_at` says; the call prompt still shows. `window.__katieMock.patchLead(id, fields)` sets
them in mock mode so the slots can be looked at before the fields exist.

**Freshness.** No `lead.*` events on `/stream` yet: the list and an open lead ask again every 60 s
and when the window comes back (data older than 10 s), and at once after a tap. Polling stops on a
401 or 403. "Tomorrow" and "4 days ago" move with a one-minute clock.

Show more: 200 rows, +200 up to 2,000 (the route's own cap). Skeleton: 6 two-line rows. Empty:
`EmptyState` "No open leads." / "Choose All leads to see started, paused and lost ones."; with no
leads at all "No leads yet." / "A lead shows here when a quote goes out."; another filter "No leads
match {filter}." Error: the `ErrorLine` with Retry.

**The drawer** (`/dash/leads/:id` over the page it was opened from, like the call drawer, 6.8; a
direct load opens it over the open leads). Tab title "Lead · Katie": never a name or a number.
Header: the first name with the stage chip; under it the phone and, when not English, the
language. Then one scroller of ruled blocks:

1. **Call now** (only when `call_now`): tinted block, "Call {name} now" over the phone and reason.
2. **Follow-up**, three facts. Exam: "Wed 8:00 AM"; "Oct 9, 2:30 PM · cancelled"; "Oct 9, 9:00 AM
   · no check-in by 10:35 AM" when the clock marked the no-show (the time it stopped waiting, said
   as a fact about the schedule, not about the patient); "Came in Oct 9, 8:00 AM"; "None yet" /
   "None in 12 days". Texts: "Allowed: said yes on the call" / "patient on file" / "form" (the raw
   consent basis is never shown), or "Stopped Wed, Oct 7: they texted STOP". Next text: the
   reserved fact, "None scheduled" or "None: texts are stopped" today.
3. **Update**: the taps of the lead's stage, in the spec's order, the stage's main moves filled:

   | stage | taps |
   |---|---|
   | Quoted, Missed consult | **Booked** (asks the day and time), Came in, Lost, Pause |
   | Consult booked | **Came in**, **No-show**, Lost, Pause |
   | Came in | **Started**, Lost, Pause |
   | Lost, Paused | **Reopen** |
   | Started | none: "Started treatment. Nothing more to do here." |

   A tap is one POST, never retried; the answered lead replaces the row at once, then the lists
   and the lead are fetched again (order, counts, history). A saved tap says so on a hidden
   `role="status"` line ("Marked came in.", "Booking saved.", "Note saved.") and puts focus on
   the block's heading, because the tapped button is disabled while it saves and often gone
   after; a saved note keeps focus in the note field. **Booked** opens an inline form "When is
   the exam?" with a day (today the earliest) and a time (any minute); a time already behind the
   practice's clock is refused in place ("That time has already passed.", Save off); Save booking
   sends `slot_label: "YYYY-MM-DDTHH:MM"`, the practice's own wall-clock time, and the form is
   blank the next time it opens. **Lost** is the only tap that asks first: "Mark {name} as lost?",
   "Follow-up stops. You can reopen the lead later.", an optional reason saved as the note. Esc
   or Cancel inside either form closes the form (not the drawer), drops what was typed and puts
   focus back on the tap that opened it. A move the record refuses (409) shows the box's own
   sentence with stage codes said plainly ("A lost lead has no exam to miss."), `role="alert"`,
   and the lead is fetched again so the taps match its real stage. Other failures: "That did not
   save. Try again."; signed out: "You are signed out, so that did not save." The block is
   mounted per lead, so a pending tap, its message or a half-typed form never follows the drawer
   to another lead. Under the taps: a one-line **Note** field with Save note.
4. **Quote**: the plan's name and the practice's sentence for it, then a table: Option, Fee,
   Insurance ("estimated" under an estimate, "Pending", "None"), Patient pays, Monthly (the down
   payment under it); "The exam is free." or "Exam fee $N." Without a quote on file: "The quote is
   not on file."
5. **History**, oldest first: time, an icon, one sentence per thing that happened ("Quote sent:
   Comprehensive, two options", "Booked the exam on a call with Katie: Wed 8:00 AM", "Front desk
   booked the exam: Tue 9:30 AM", "No check-in by 10:35 AM", "Cancelled the exam by text",
   "Replied yes", "Texted STOP: no more texts go to this number", "Front desk marked lost"). The
   desk's own words ride under its line in quotes. The record writes a coordinator's move twice (a
   stage change and who did it); the page says it once, and a STOP that arrived both as a text and
   as the stop is one line too. Who did it is what the sign-in gave the box: the shared login
   reads "Front desk"; a per-person sign-in's email reads as the part before the @, in words
   ("Jane Doe"); a bare account id, or nothing, reads as "The desk"; an address is never shown.
   An exam moved on the schedule reads "Exam moved on the schedule to Fri, Oct 16, 10:00 AM": a
   time with an offset is an instant, one without is the practice's clock, never the browser's.

An unknown lead: "This lead is not on the list any more.", no taps. Never rendered: `token`, the
raw `consent_basis`, `practice_slug`, a stage code.

## 7. Katie: implementation spec

### 7.1 Rig and layer

- **One component, `<Katie />`.** It renders one `<svg viewBox="0 0 652 1544"
  overflow="visible">` whose height is `--katie-height: 96px`, so the width is about 40.5px
  plus reach. The scale is 0.0622 screen px per rig unit (1 screen px ≈ 16 rig units).
- **Layer**: a `position: fixed; inset: 0; pointer-events: none; z-index: 50` div with
  `aria-hidden="true"`. Inside it sits one positioned wrapper, `will-change: transform`,
  moved only by `x` / `y` transforms. It is anchored at the feet center: `xPercent: -50`,
  `yPercent: -100`.
- **Groups**, back to front:

| # | group | pivot |
|---|---|---|
| 1 | far leg (thigh → shin → shoe) | hip, knee |
| 2 | near leg (thigh → shin → shoe) | hip, knee |
| 3 | pelvis / pants | |
| 4 | drawn lower top | top edge at **y 620**, not 640: 50 units of overlap so a 32-unit breath never opens a gap |
| 5 | torso raster | |
| 6 | torso side strokes | shown when an arm swings out > 10° |
| 7 | sL arm (sleeve + upper arm → forearm → hand) | shoulder, elbow |
| 8 | head raster | neck pivot (322, 352) |
| 9 | sR arm (sleeve + upper arm → forearm → hand) | shoulder, elbow |
| 10 | eyelid shapes | inside the head group |

  - In `listen` the sR arm group moves after the head in DOM order. Keep it there
    permanently; at rest it does not overlap the head.
  - Pivots come from `rig.json`, set as `svgOrigin` in GSAP.
- **Facing**: the rig faces right. `scaleX(-1)` on an inner group flips her. When she presents
  from a card's right end she faces left (toward the card center), so her "near arm" toward
  the card is **sR in rig terms** (rig +x = screen left when flipped).
- **Limits**: head nod ≤ 4° (art limit 5°), head-to-body offset ≤ 6 rig units. Breathing moves
  torso, head and arms together, so there is no offset.

### 7.2 Positions

**Glass skin (DESIGN-GLASS.md 3.7): Katie's floor is the slab.** The stage reads the slab's inner
box from `[data-katie-floor]` (CONTRACTS.md) as her *frame*: the floor is its inner bottom edge
(y 759 at 1280 x 800, 851 at 1440 x 900, second pass), the corners are 44 in from its left and right inner
edges, the side-edge entry starts 40 outside them, the bubble stays inside it, and a card's top
counts as "on card" when it is at least 96 below the frame's top. Her layer covers the slab
exactly and clips to its radius, so she enters, rises and sinks at the slab's edges, never in the
margin; off screen means her wrapper is below the frame's bottom (clipped). Scroll, summon scroll
and resize follow `#content`, which is what scrolls. Without a `[data-katie-floor]` element the
viewport is the frame, as in the table below. `moments.ts` is unchanged. Read every "viewport" /
`innerHeight` / `innerWidth` in the table as the frame's edge.

Katie is **off screen by default** (conflict 41). There is no standing home any more: "home" is
now only the corner she enters from and peeks in, and between moments she is below the
viewport's bottom edge with her idle timelines stopped.

| name | definition |
|---|---|
| floor | feet at y = `innerHeight` |
| off screen | wrapper `y` = floor + 100 px (`SINK.px`), so her crown is below the bottom edge; `state().offscreen` is true |
| corner (bottom-right, default) | floor, x = `innerWidth − 24 − 20` (feet center). Set by Settings "Katie's corner" |
| corner (bottom-left) | floor, x = 24 + 20, in the rail's empty bottom |
| side edge | the viewport edge on her corner's side, where a walk-in starts (x = `innerWidth + 40`, or −40 for bottom-left) |
| spot on a widget | feet at `rect.top`, x = `rect.right − 16 − 20`. For a KPI cell, the cell rect; its walkable span (shelf) is the whole card's top edge, inset 20 |
| peek spot | her corner, on the floor. Used by the line wake-up and by the urgent fallback on pages without a callbacks widget; no travel |

- **Targets per moment** come from `data-katie-moment` on the page's widgets (`urgent`,
  `first-open`, `booking`, `summary`; CONTRACTS.md), never from selectors that know the pages.
- **Avoid rule** (RV-1, conflict 36): her figure is her body (21px each side), her presenting
  arm (44px on the side she faces) and an 8px gap, from feet y − 96 to feet y. If it would
  cover a `[data-katie-avoid]` region, she stands at the nearest clear x on the shelf and faces
  the target's centre; if there is none, she keeps the usual spot. The regions are read when a
  moment starts and on resize only. On the list pages she stands at x 1167 at 1440 (1007 at
  1280), left of the top bar's controls.
- The old note that she stands over a tall page's bottom-right content no longer applies: she is
  only on the floor while entering, peeking or leaving.

### 7.3 States, timings, easing

Every motion is a GSAP tween on a `<g>` transform or the wrapper's x/y. Nothing reads layout
inside a tween. "px" means screen px.

| state | motion | timing / easing |
|---|---|---|
| **idle** | breath: torso + head + arms `y −32` units (2px) | 3.0 s loop, `sine.inOut`, yoyo |
| | blink: lids on | close 60ms, hold 40ms, open 80ms, next blink at a random 3–6 s |
| | weight shift: pelvis + legs `x ±32` units, whole body `rotation ±1°` at the feet | every 10 s (±2 s jitter), 600ms `power1.inOut`, hold 2 s, return 600ms |
| **enter by walking** (urgent, first open, Katie button) | start off screen at her corner's side edge (x = `innerWidth + 40`, or −40 for bottom-left) on the floor, then the walk and the L-shaped path below to the target spot (`enterFromRight` + `goTo`) | walk and hop timings below; travel clamp 0.25-1.4 s |
| **rise** (booking milestone, line wake-up, the urgent peek) | wrapper `y` from the landing y + 100 px (hidden by the bottom edge) up to the floor, then the hop's land squash; for a card target one hop up follows | 320ms `power2.out` (`RISE` in `timing.ts`) |
| **hold** | idle breath and blink run, the weight shift may fire; the bubble shows 150ms after arrival | `holdSeconds(chars)` = `clamp(3 + chars / 25, 4, 9)` s (`HOLD`): 140 characters hold 8.6 s, 60 characters 5.4 s. A peek holds 3 s (`HOLD.peek`) |
| **leave by herself** | bubble out 80ms; from a card one hop down to the floor at her x, then **sink**: wrapper `y` to floor + 100 px | sink 260ms `power2.in` (`SINK`); the whole exit about 1.1 s |
| **waved off** | any `pointerdown`, `wheel`, scroll, Escape, the drawer opening or a route change ends the hold at once. On a card she drops straight from where she stands to floor + 100 px (no hop); on the floor she sinks. Transforms only, no opacity (MONDAY-LLAMA 3.9) | drop 250ms `power2.in` (`SINK.dropDur`); off screen 240-260ms after the event (`VERIFICATION.md`) |
| **walk** | cycle 0.55 s: hips ±25°, trailing knee 0→20°, arms counter-swing ±15° with elbows −10°, body bob 3px (48 units) down at each contact (2 per cycle), head rigid with the body | the cycle is a repeating timeline. Travel `x` duration = `clamp(dist / 420, 0.25, 1.4)` s, `power1.inOut`. The flip is instant at walk start. The cycle stops on arrival and settles to rest in 150ms |
| **hop** | crouch, then an air arc, then land | crouch: body `scaleY 0.94` from the feet, knees 15°, 80ms `power1.out`. Air: duration = `clamp(0.25 + abs(dy) / 2000, 0.25, 0.45)` s; `x` linear; `y` up to apex = `max(min(startY, endY) − 40, min(96, startY, endY))` with `power2.out`, then down `power2.in` (`hopArc(…, minApexY)`, the controller passes her height): her crown never goes above the viewport top, and a landing on the top row rises straight onto the card and decelerates into it; in flight hips −15° and knees 30°. Land: `scaleY 0.92 / scaleX 1.04` 90ms, back to 1 in 120ms `power2.out` |
| **path** | L-shaped. (1) Walk along the current shelf (floor or her current card's top edge) to x = target spot x, clamped to the shelf's x span; if the shelf ends first, walk to its end. (2) One hop to the target top edge. (3) Step ≤ 24px to the exact spot. With the same shelf (same top edge), walk only. Going down to another card: the same L (walk to the target column, hop down across the card she leaves; `planPath` without `toFloor`). Only target = floor (`toFloor`) walks to the shelf end nearest the target, then hops down | |
| **present** | turn to face the card center (instant flip). Near arm: shoulder −70°, elbow −20° | arm 250ms `power2.out`. Bubble 150ms after arrival: opacity 0→1 and y 4→0px over 150ms `power1.out` |
| **listen** | at her peek spot, facing into the page: sR shoulder −122°, sR elbow −136°, sR wrist 55° (palm on the ear, fingers up into the hair; conflict 39; `LISTEN` in `src/katie/motion/timing.ts`, `PRESETS.listen` in `src/katie/pose.ts`), head (neck) 3° toward the hand | 350ms `power2.inOut`. Idle breath and blink continue, weight shift stops. Used only in the line wake-up peek (3 s, no bubble); she is no longer held at the Line tile for the whole call |
| **celebrate** | bounce up 12px, then land squash, then a nod twice | up 160ms `power2.out`, down 200ms `power2.in`, squash as in hop. Nod: head from base = min(neck, 1°) to base + 4° down 120ms, back up 160ms, twice. While listening the head eases 3° → 1° during the bounce up and ends back at 3°, so the nod shows its full 4°. Total ≈ 0.9 s, then back to the prior state. Only in the booking-milestone moment: after she lands on Booked, then she presents. Never for an urgent note (straight face) |
| **rest** | lids close, shoulders (torso + head + arms) drop 2px (32 units), breath 4.5 s | lids 400ms, drop 600ms `sine.inOut`. **No longer used on the dashboard** (she is off screen when nothing is happening); `rest()` stays in the controller for the `/dash/_katie` playground |

### 7.4 Choreography: occasional moments

The behaviour spec is **`docs/research/MONDAY-LLAMA-2026-10-13.md`, Part 3 (3.1-3.10)**, Tom's
direction of 2026-10-13 (conflict 41). This section summarises it and records the orchestrator's
adjustments; where the two differ in detail, Part 3 plus the adjustments below win. The code is
`src/katie/stage/moments.ts` (pure: when she may appear) and `director.ts` (one appearance: travel
or rise, hold, exit, dismissal).

**When she appears** (rank order; a higher rank retargets her with `goTo`, a lower one is dropped
while she is on screen):

| rank | moment | trigger | goes to | does | caps |
|---|---|---|---|---|---|
| 1 | urgent callback | `note` event with `data.urgent === true`, after its `refreshed` resolves | `data-katie-moment="urgent"`: Overview Callbacks waiting, or the Callbacks page list. On Calls, Bookings and Texts: a silent 3 s corner peek facing the rail, no bubble | walks in, hops up, presents with a straight face (no celebrate) | ignores the cooldown and the daily cap; at most one per 10 min; never within 60 s of her last exit (it **waits** for that, adjustment 2) |
| 2 | first open of the practice day | first time this browser (or, in mock mode, this tab) shows the dashboard on a new practice-local day, once stats has loaded. `stats(1).urgent > 0` → the urgent widget; else `stats(1).calls > 0` → the Calls cell (`first-open`); else nothing (no filler) | as rank 1, or the Calls cell | walks in from her side edge, presents | once per practice day; if the page has no matching widget the flag stays unset |
| 3 | booking milestone | `booking` event; after `refreshed`, `stats(1).bookings` has crossed 1, 5, 10, 20, 30, 40 or 50 on the same practice day | `data-katie-moment="booking"`: the Booked cell, or the Bookings page summary | rises under the target column, hops up, celebrates (0.9 s), presents | 15-min cooldown and daily cap; inside the cooldown it is skipped, not queued |
| 4 | line wakes up | `call.started` that is the day's first call or comes 60 min or more after the previous one (`status.last_call_at` read before the refetch) | her corner, no travel | rises, listen pose 3 s, sinks; **no bubble** | cooldown and daily cap; never with reduced motion |
| 5 | asked for | the top bar's Katie button (below) | the most pressing widget on the page: urgent, then callbacks waiting, then the Line tile on a call, then the page summary | walks in and presents; the widget scrolls into view and takes focus | no cap; it still restarts the cooldown |

**Never a trigger**: hover, keyboard focus, idle time, timers, page navigation, returning to the
tab, `call.ended` on its own, non-urgent notes, `cancel`, `sms.*`, `greeting`, `turn.*`, `tool`.
The stage reads only event kinds, the `urgent` flag, the `stats(1)` counts and
`status.last_call_at`; never a name, reason, caller or slot from a payload.

**Caps** (`moments.ts`):

| cap | value |
|---|---|
| cooldown between ordinary appearances (ranks 2-4) | 15 min from her last exit (`COOLDOWN_MS`). A moment arriving during her exit animation counts her as gone at that instant (`exiting`), so it cannot turn her straight back |
| daily cap (ranks 2-4) | 6 per practice day (`DAILY_CAP`) |
| urgent spacing | one per 10 min (`URGENT_SPACING_MS`); never within 60 s of an exit (`URGENT_EXIT_GAP_MS`), and an urgent note that arrives inside that gap waits for it, up to its 2-minute window |
| quiet moment | fire only after 1.5 s with no `keydown`, `wheel` or `pointerdown`; wait up to 20 s, then drop. Urgent waits up to 2 min |
| drawer open | no appearance. Urgent waits until it closes (2-minute limit); others are dropped |
| tab hidden | moments are dropped, except one urgent note, which shows once on return if it is under 30 min old |
| several windows | real mode: the caps live in **localStorage** (`katie.lastExit`, `katie.lastUrgent`, `katie.dayCount`, `katie.firstOpenDay`) and a tab takes the `katie-appearance` Web Lock (fallback `katie.showing`) before she comes on screen, so two windows never show two Katies. **Mock mode** (`?mock=…`) keeps the caps in **sessionStorage**, per tab, so a fresh demo tab always shows the first-open moment (adjustment 1). Every access is in try/catch with an in-memory fallback; only timestamps, counts and the practice day are stored |

**One appearance**: show → enter (walk or rise, 7.3) → present and hold her widget's own
`data-katie` sentence for `holdSeconds(chars)` → leave by herself (hop down, sink). While she is
on screen, and only then, `pointerdown`, `wheel`, scroll, Escape, the drawer opening and route
changes are listened for; any of them ends the hold at once (waved off, 7.3). A click on the
widget she presents still goes through, because her layer is `pointer-events: none`. She does not
ride the page when it scrolls: scrolling sends her away. Off screen her idle timelines are stopped
(`stopIdle`), nothing observes layout and nothing runs per frame.

- **Commit**: read the target's `getBoundingClientRect()` once when the moment starts, plan the
  path, hide the bubble while she travels. **Retarget**: a higher-ranked moment while she moves
  kills the current timeline and starts from her current position, read with `gsap.getProperty`.
- **Off-screen target**: if the target's top edge is `< 96 − 1` (`KATIE_H − 1`; conflict 37) or
  `> innerHeight − 8` (`BOTTOM_CLEAR`), she does not hop. She presents from the floor at the
  target's spot x.
- **The Katie button** (MONDAY-LLAMA 3.6, adjustment 3): her 24 px head (the 40/60 px avatar
  assets scaled) in a 32 px transparent button at the end of the top bar's right group, inside its
  `data-katie-avoid`. Hover background `--primary-background-hover-color`, the standard
  `--focus-ring`, `aria-label` and a Vibe `Tooltip` "Point out what needs attention". Hidden when
  Katie is Off, below 1024 px and on Settings (no widgets there).
- **`prefers-reduced-motion: reduce`**: only urgent, first open and the Katie button fire (no
  booking celebration, no line peek). She appears with opacity 0 → 1 in 120ms at the spot, the
  bubble shows at once, she holds for the same time and leaves with opacity 1 → 0 in 120ms. No
  walk, rise, hop, bob, breath, weight shift or celebrate; a blink is a single instant lid swap
  every 3–6 s.
- **Under 1024px wide** (`matchMedia('(max-width: 1023px)')`): not rendered, no listeners, no
  Katie button.
- **Katie Off** in Settings: not rendered, no Katie button.
- **Not a moment yet**: "callbacks waiting reached zero" needs a resolved state on notes that the
  backend does not have (MONDAY-LLAMA 3.10).

### 7.5 Bubble

- **Element**: one, inside Katie's layer. `--primary-background-color`, 1px
  `--ui-border-color`, `--border-radius-medium`, `--box-shadow-small`, padding 8 12.
- **Text**: 13/18 Figtree 400 `--primary-text-color`, at most 140 characters (`katieLine`
  guarantees it; conflict 35).
- **Width** is set by `fitBubble` (`src/katie/stage/fitBubble.ts`): one line up to 79
  characters (`BUBBLE_LINE_CHARS`); otherwise the narrowest width that gives
  ceil(length / 79) balanced lines, which is two for 140 or fewer. The CSS max-width is only a
  ceiling, `min(640px, 100vw − 32px)`; the room above about 450px is for sentences full of
  capitals or digits. The `/dash/_katie` playground uses the same fit.
- **Placement** (`bubbleAt` in `src/katie/stage/placement.ts`):
  - avoid boxes = the top bar's children (when her crown is in the top 64px) plus every
    `[data-katie-avoid]` rect, read at commit and on resize;
  - the gap is 8 from her head, or from her fingertips on the side her presenting arm reaches
    to (reach 44), so the hand never sits on the bubble;
  - try, in order: the side she faces (toward the card centre, away from the near card edge)
    level with her crown (feet y − 96), first one line, then the same sentence as two lines;
    the same side dropped to the lowest avoided box's bottom + 8; the other side at her crown;
    the other side dropped. On a top-row card this puts the bubble beside her in the strip
    between the top bar's controls and the card;
  - a candidate must stay right of `rail width + 16` and 16 from the viewport edge;
  - if nothing is clear, use the one-line bubble at her crown on the first side that fits
    (accepted overlap);
  - then clamp inside the viewport with a 16 margin;
  - no tail or arrow.
- **Hidden** while she travels and when the sentence is empty. The text updates in place if
  the data changes while she presents.
- **Accepted overlap**: the bubble and her body may cover the bottom-right of the card above
  the one she presents (or the top bar's right end, for the top row) while she presents. This
  is transient. Nothing in a card's bottom-right 48 × 72 px may be the only place a fact
  appears. `[data-katie-avoid]` regions are never accepted overlap (conflict 36). A dropped
  bubble may cover up to 8px of the target card's top edge.
- **Known, not fixed**: the bubble can cover more of the card above than the bottom-right
  corner. Presenting Latest calls, it covers the chart's x-axis labels from about 3 AM to
  12 PM; presenting Callbacks waiting, it covers the 2 PM bar. Both are transient and the facts
  stay readable once she moves.

### 7.6 What she says (`data-katie` templates)

Rules for every sentence:
- full sentences as a front-desk person would say them;
- no exclamation marks, no cheer, no apology, no em-dash filler;
- 140 characters or fewer (`KATIE_MAX_CHARS`, conflict 35);
- `katieLine` ties a phone number's area code to the rest ("(656) ***-0150") and a time to its
  AM/PM with a no-break space (U+00A0), after collapsing whitespace and before the cut, so the
  bubble never breaks inside either (RV-6). Tests comparing `data-katie` to the strings below
  replace U+00A0 with a space first;
- counts follow the formats table (words one to ten, digits from 11), and the first letter is
  capitalised;
- names follow conflict 18, reasons are the cleaned reason (conflict 17);
- an empty string means she stands silently.

Templates live in `src/pages/overview/say.ts`, `src/pages/lists/sentences.ts` and
`src/pages/calls/sentence.ts`. They are pure functions of the query data, unit-tested on the
fixtures in `scripts/check-lib.mjs` (run with `TZ=UTC`; Node 22.15 or later): every fixture
string below exactly, the variant cases, and for every sentence 1–140 characters, no "!" or em
dash, capitalised, no breakable space inside a phone number or time.

The Bookings K and the Callbacks C / U counts come from `stats(1)`, taking the larger of the
stats count and the list's count (so a sentence never says fewer than the visible rows while
stats is a refetch behind). The list only picks the latest booking or who to start with
(DATA-7).

**Overview: Line tile** (6.1)

| case | template |
|---|---|
| on-call | "I'm on a call with {caller}. It started at {time}." |
| idle, a call today | "The line is quiet. The last call came in at {time}." |
| idle, none today | "The line is open. No one has called yet today." |
| status error | "" |

Fixture: **"The line is quiet. The last call came in at 5:35 PM."**

**Overview: Calls answered cell** (6.2; changed by P6 / P3)

| case | template |
|---|---|
| calls > 1 | "{N} calls answered so far today, {B} of them booked. The average call ran {avg}." |
| calls = 1 | "One call answered so far today, and it …" |
| Spanish calls > 0 | append " {S} were in Spanish." (else, after-hours calls > 0: " {A} came in after hours.") |
| yesterday known and > 0 | append " Yesterday there were {Y}." |
| 0 calls | "" |

Fixture: **"Eight calls answered so far today, six of them booked. The average call ran 2:03. Two came
in after hours."** Demo: "35 calls answered so far today, 26 of them booked. The average call ran
1:30. Four were in Spanish. Yesterday there were 30." (124 characters)

**Overview: Appointments booked cell**

| case | template |
|---|---|
| booked > 0 | "{B} of today's {N} calls ended in a booking, {K} appointments in all." plus " {C} patients confirmed by text." when C > 0 |
| calls > 0, booked 0 | "Nothing has been booked yet today." |
| 0 calls | "" |

Fixture: **"Six of today's eight calls ended in a booking, seven appointments in all. Four patients
confirmed by text."**

**Overview: New-patient consults cell** (new, `sayNewPatientCell`)

| case | template |
|---|---|
| > 1 | "{P} new-patient consults booked today." |
| 1 | "One new-patient consult booked today." |
| 0, calls > 0 | "No new-patient consults booked yet today." |
| 0 calls | "" |

Demo: **"17 new-patient consults booked today."**

**Overview: Callbacks waiting cell** (fed the action-note count, conflict 44)

| case | template |
|---|---|
| > 0 | "{C} callbacks are waiting, {U} of them urgent." (", none of them urgent" when U = 0; "One callback is waiting." when C = 1) |
| 0 | "No one is waiting on a callback." |

Fixture: **"Four callbacks are waiting, none of them urgent."** Demo: "12 callbacks are waiting, one of
them urgent."

The Texts sent cell is gone (P6); `sayTextsCell` is kept only so `check-lib.mjs` still loads it.
The Line tile, Latest calls and Callbacks waiting sentences name the caller instead of the number
when a name is known ("Start with Owen Brandt from 8:55 PM.").

**Overview: Calls by hour** (6.3)

| case | template |
|---|---|
| calls > 0 | "The busiest hour was {H}, with {n} calls. The first call came in at {time}." Ties go to the earliest hour; "{H}" is like "3 PM" |
| busiest hour has 1 call | "Calls have been spread out, one an hour at most. The first came in at {time}." |
| 0 calls | "" |

Fixture: **"The busiest hour was 3 PM, with three calls. The first call came in at 2:40 PM."**

**Overview: Latest calls** (6.4)

The newest call drives the sentence.

| case | template |
|---|---|
| live | "A call from {caller} is on the line now. It started at {time}." |
| booked | "The last call came in at {time} from {caller}. It booked {k} appointment(s) and left {n} note(s) for the desk." Drop the note clause when n = 0 |
| not booked | "The last call came in at {time} from {caller}. Nothing was booked, and it left {n} notes for the desk." n = 0: "…Nothing was booked." |
| none | "" |

Fixture: **"The last call came in at 5:35 PM from (656) ***-0150. Nothing was booked, and it left two
notes for the desk."** (109)

**Overview: Callbacks waiting** (6.5)

The top row in sort order drives the sentence.

| case | template |
|---|---|
| any | "Start with {identity} from {time}. {cleaned reason}" |
| over 140 characters | cut the reason at the last word boundary that fits and end it with "…" |
| none | "" |

Fixture: **"Start with (656) ***-0150 from 5:35 PM. Daughter's bracket came off this morning, needs to
be seen as soon as possible."** (119)

**Calls page** (6.6)

R = "today" / "in the last 7 days" / "in the last 30 days". Totals come from `stats?days=N`; when
a filter is set, the count is the filtered rows.

| case | template |
|---|---|
| no filter | "{N} calls {R}, {B} of them booked." Append " {S} were in {Language}." for each non-English language |
| Booked | "{n} calls ended in a booking {R}." |
| No booking | "{n} calls ended without a booking {R}." |
| Live | "One call is on the line now." |
| Dropped | "{n} calls dropped when the line restarted {R}." |
| 0 | "" |

Fixture, Today: **"Eight calls today, six of them booked."**

**Bookings page** (6.7)

| case | template |
|---|---|
| ≥ 1 today | "{K} appointments were booked today. The latest is {name} for {Day at time}, and the confirmation text went out." |
| no matching confirmation | drop ", and the confirmation text went out". A match is an `sms.out` with the same `call_id` and kind `confirmation` |
| 0 today, list not empty | "Nothing booked yet today. The last booking was {name} for {Day at time}." |
| empty | "" |

Fixture: **"Seven appointments were booked today. The latest is Max De Lagado for Monday at 3:20 PM,
and the confirmation text went out."** (124)

**Callbacks page** (6.9)

| case | template |
|---|---|
| > 0 | "{C} callbacks are waiting, {U} of them urgent. Start with {identity} from {time}." |
| 0 | "No one is waiting on a callback." |

Counts action notes only (conflict 44). Fixture: **"Four callbacks are waiting, none of them
urgent. Start with (656) ***-0150 from 5:36 PM."** Demo: "Start with Owen Brandt from 8:55 PM."

**Texts page** (6.10)

The sentence the old Texts sent cell used (`sayTextsCell`'s wording, kept in `lists/sentences.ts`), plus " The latest went to {phone}." when the latest row is `out`.

Fixture, where the latest row is `in` yes from (813) ***-0173: **"Six confirmation texts went
out today, and four people replied yes."**

**Leads page** (6.13), `src/pages/leads/model.ts` `leadsSentence(summary)`, on the list card with
`katieMoment={['summary']}` (she comes only when asked):

| case | template |
|---|---|
| missed consults > 0 | "{O} open leads. {M} missed consults: start with those." ("that one" for one) |
| else never booked > 0 | "{O} open leads. {N} have gone a week without booking an exam." |
| else came in, not started > 0 | "{O} open leads. {H} have had the exam and not started yet." |
| else | "{O} open leads. Every one has an exam on the schedule or a fresh quote." |
| no open leads | "No open leads right now. Everyone quoted has started, paused or closed." |
| no leads at all, or no summary | "" |

Fixture: **"11 open leads. Three missed consults: start with those."**

**Settings, drawer, rail**: no `data-katie`, so she never goes there.

### 7.7 Budget and checks

- Katie JS + inline SVG ≤ 60 KB gzipped. Drawn parts ≤ 203 KB, so assets total ≤ 400 KB.
- Measured on the shipped build (`docs/VERIFICATION.md`, re-measured 2026-10-21 after the
  top-tier pass, unchanged within 0.1 KiB):
  - code 48.4 KiB gzipped: `KatieStage-[hash].js` 8.2 (the appearance runner and `moments.ts`
    make it larger than the always-on stage's 5.0) + the shared chunk 39.7 (GSAP, the rig and the
    motion code) + `KatieStage-[hash].css` 0.4. The bundler names the shared chunk after
    `fitBubble.ts` (`fitBubble-[hash].js`); nothing refers to the name;
  - image files 191.3 KiB (head webp 97.4, torso webp 80.7, avatars 40 and 60 px 4.4 and 8.8;
    the Katie button reuses the avatars);
  - motion at 1440 × 900, now traced over a forced appearance of each kind (the Katie button's
    walk-in, the booking rise, hop and celebrate, the first-open walk-in, the line-wake peek, each
    waved off with Escape; 8 tweens, 5.3 s of travel): 60 fps, frame time p95 16.7 ms, 0 of 310
    frames over 20 ms, longest task 4.7 ms;
  - off screen she costs nothing per frame: her idle timelines are stopped (`verify.mjs` counts
    no active tweens while she is away).
- `/dash/_katie` playground:
  - a slider per joint;
  - a button per state;
  - the "Show bubble" sample sentences above;
  - a 50% master-art overlay (dev server only; the art is never in `dist/`).

---

## 8. Slop checklist (reviewers tick each; every item is testable)

| # | check | how to test |
|---|---|---|
| 1 | No gradient text; the only gradients are the environment's | `grep -rnE 'gradient\(' src` hits only `src/styles/glass.css` (second pass: the room's bloom, the rim's ring, the glass objects' fill, and the mask trick) |
| 2 | ~~No glassmorphism, blur~~ (glass skin, conflict 66); still no glow or neon | `backdrop-filter` only on the slab (DESIGN-GLASS 8.2), the glass objects, cards, the drawer, the glass menu and tooltip and Katie's bubble (`grep -rn 'backdrop-filter' src`); no `filter: blur` in src; one `drop-shadow`, under the glass objects' glyphs (8.4); no `text-shadow` |
| 3 | No thick colored left border | no `border-left` other than `--layout-border-color`: 1px rules, and the 2px neutral rule on Katie's transcript rows (conflict 60) (`grep -rn 'border-left' src`) |
| 4 | No card inside a card | Playwright: no element with the card class has a descendant with the card class |
| 5 | No welcome or hero banner | no "Welcome", "Hi Tom", "Good morning" in src or rendered text |
| 6 | No emoji | `/\p{Extended_Pictographic}/u` on all rendered text of every page = 0 matches, and on src |
| 7 | No row of icon tiles explaining features | the glass skin's four KPI tiles label real numbers, not features (conflict 66); otherwise icons appear only in the rail, the drawer close, the Outcome lines and dropdown carets |
| 8 | No pulsing or blinking badges; Live is a steady dot | `@keyframes` outside `src/katie` are only `lineIn`, `lcEnter` and `lcHold` in `overview.module.css`: one-shot, opacity and transform only, off under reduced motion (conflict 59); the Line dot has no animation or transition |
| 9 | No fake deltas or sparklines; the comparison is real or absent | no %, ▲▼ or sparkline SVG in KPI cards; the only arrow is the glass skin's comparison line (`↑ +N` / `↓ −N vs yesterday`, 6.2), drawn only when yesterday's count is valid (conflict 8) and above zero and differs from today; "Yesterday 0" never renders (verify.mjs demo step) |
| 10 | No lorem, no invented metrics | every rendered number traces to a fixture or demo-dataset field (reviewer spot-checks 6.2/6.3 against `stats.json`; the demo KPIs and the 7- and 30-day counts equal `manifest.json`'s `stats_at_now`, checked by `check-lib.mjs` on many dates and by `verify.mjs` on screen) |
| 11 | No stock illustration except Katie | only `src/katie/assets/*` images in `dist/` |
| 12 | No dark mode | `grep -rn 'prefers-color-scheme' src` is empty; no `.dark-app-theme` use |
| 13 | Figtree, not Inter; no grey-on-grey 14px | computed `font-family` starts with Figtree on body; secondary text ≥ 4.5:1 measured on the rendered glass (DESIGN-GLASS 5, 7; Lighthouse); inactive rail labels are `--secondary-text-color` (4.81:1 on the hover fill). Verified by `node scripts/verify.mjs` on 2026-10-21: Lighthouse accessibility 100 on Overview, Calls and Callbacks in both `?mock=1` and `?mock=demo` (`docs/VERIFICATION.md`) |
| 14 | No wide letter-spacing | `grep -rn 'letter-spacing' src` is empty |
| 15 | Not rounded-everything | glass skin radii only (2.3 note): slab 24, cards 16, drawer 20, bubble 12, tiles 10/8, nav items 12, pills 999, chart bars 4 at the top, `50%`, `inherit`; Vibe Toggle's pill comes from `@vibe/core` (conflict 34) |
| 16 | No modal by reflex; the call opens in a drawer | no Vibe `Modal` import; the drawer has no backdrop or scrim and `role="complementary"` (P16 not taken, conflict 62) |
| 17 | No chart-library look; one hand-drawn SVG | `package.json` has no chart dependency; the chart is `<svg>` in `src` |
| 18 | No "AI insight" box | no element with text matching /insight\|AI summary\|suggest/i |
| 19 | One accent | `--primary-color` (#2563eb) only in 2.1's places plus the active nav pill (glass skin); the KPI tiles' four pastels are status-like labels, not a second accent |
| 20 | Status is color; everything else is ink, grey and white (and glass) | the only filled colors are chips (pastel; Urgent alone solid), chart bars, the Line dot, the selected segment, the just-ended row's 2 s tint, the Vibe Toggle on-state, the KPI tiles, the active nav pill (glass skin) and Katie |
| 21 | Shadows are the glass skin's and no others | cards and the slab carry the glass shadows with an inset highlight; floating things the float shadow; the only outer-only static shadow is the active nav pill's (conflict 66). verify.mjs's demo step finds no other static shadow on any page |
| 22 | All colors are tokens | `grep -rnE '#[0-9a-fA-F]{3,8}\b' src --include=*.css --include=*.tsx` hits only `src/katie/**` (art palette), `src/styles/glass.css` (the glass skin's tokens) and code comments |
| 23 | Type scale holds | Playwright collects every computed `font-size` of visible text (elements wider and taller than 1px, so `.visually-hidden` is skipped; it is 14px anyway, conflict 64) on every page and drawer ⊆ {12, 14, 16, 20, 28} plus 13 inside Katie's layer (28 is the glass skin's KPI number, was 32) (verify.mjs demo step, both sizes) |
| 24 | Text blocks ≤ 80 characters per line | reasons, transcript and empty states have `max-width: 35em`; count rendered characters per line at 1920 × 900 on Callbacks, Overview and the drawer, at most 79 (measured: 76) |
| 25 | Left-aligned, except numeric table columns | Duration cells are `text-align: right` and tabular (the Bookings, Notes and Characters columns are gone); nothing is centered except chip text |
| 26 | Empty states designed | each list rendered with `?mock=empty` shows its `EmptyState` (sentence, hint, dashed box three rows tall) and its table header; a filter that leaves nothing is worded differently |
| 27 | Loading uses skeletons at content size | throttle the network in Playwright (`mock=slow`); per-row heights match within 4px everywhere, and card heights match wherever the count is knowable (Calls after stats, Latest calls and Callbacks waiting after stats, Texts). The Callbacks page and Bookings row counts are unknowable before load (6.7, 6.9). Known: Overview at 1280 grows 16px (6.5) |
| 28 | `summary` never shown, `unknown (` never shown, `[` annotations and `URGENT:` never shown | rendered text of every page and drawer contains none of `scenario=`, `unknown (`, `[NOT`, `URGENT:` |
| 29 | Katie's lines are clean | every `data-katie` value ≤ 140 characters, contains no `!` and no em dash, and does not start with "Sorry" (`check-lib.mjs` enforces the templates) |
| 30 | Katie is not a chatbot bubble | no floating chat launcher, no input box, the bubble has no tail |
| 31 | Times in the practice tz | Overview first row reads 5:35 PM with the fixtures, whatever the machine timezone (`TZ=UTC` run); the demo materializer is checked under TZ=UTC and TZ=Asia/Tokyo and across both DST changes (`check-lib.mjs`) |
| 32 | Clean run | zero console errors; no horizontal scroll at 1280 and 1440 (`scrollWidth === innerWidth`). `index.html` has `<link rel="icon" href="data:,">`, which stops the favicon 404 and keeps non-Katie images out of `dist/`. Verified by `node scripts/verify.mjs` on 2026-10-21: 0 console messages across 32 route loads (mock=1, mock=empty, mock=demo, real mode via fake-api), no horizontal scroll in all 54 screenshots (28 mock=1/empty, 26 demo) (`docs/VERIFICATION.md`) |
| 33 | Katie is occasional, not a fixture (conflict 41) | `verify.mjs` katie step: a fresh `?mock=1` tab run 180 s on Playwright's clock shows exactly one appearance (the first open) and she is off screen otherwise; every page screenshot in `docs/screenshots/final/` except the moment shots has no Katie |
| 34 | Hover and focus summon nothing | `verify.mjs`: hovering every widget and the Katie button and pressing Tab for 30 s of fake time gives 0 appearances; `grep -nE 'pointerover\|pointerout\|focusin\|focusout' src/katie/stage` is empty |
| 35 | She never comes straight back | `verify.mjs`: a booking inside the 15-minute cooldown, a booking during her exit animation and a second urgent note inside 10 minutes are all skipped; an urgent note within 60 s of an exit waits for the gap |
| 36 | Every way of waving her off works at once and stays transforms-only | `verify.mjs`: click, wheel, page scroll, Escape, route change and the drawer each take her off screen within about 0.4 s; the wrapper's opacity stays 1 unless reduced motion is on |
| 37 | Nothing new about patients | the bubble equals a `data-katie` on the current page; the stage reads only `e.data?.urgent` from payloads (`grep -n 'e.data' src/katie/stage`); her storage holds only `katie.*` timestamps, counts and the practice day |
| 38 | Demo is safe to screen-share | `?mock=demo` and the demo build make 0 requests to `/api/dash`; no real surname (`grep -ri martorana src` is empty); rendered text has none of the forbidden strings (`verify.mjs` demo and demobuild steps) |
| 39 | Rows read at screen-share size | data rows 44px on Calls, Bookings and Texts, at least 44 on Callbacks (grouped rows grow), header rows 32 (`verify.mjs` demo step) |
