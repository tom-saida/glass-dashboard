# Dashboard inspiration and polish plan: Katie dashboard, 2026-10-21

This file is for the orchestrator and the build agents. It is not written for Tom; Tom gets a published page.

**Inputs.** Five research passes (saas-craft, type-color-data, practice-market, demo-craft, character-delight), merged and checked against the build as it stands. What I read myself:
- all seven `docs/screenshots/final/*-1440x900.png` named in the task, plus `overview-live` and `overview-booking`;
- `src/styles/global.css`, `src/shell/Shell.module.css`, `src/pages/overview/overview.module.css`, `src/components/*.module.css`, `src/pages/calls/CallDrawer.module.css`, `src/pages/lists/ListTable.module.css`;
- `docs/DESIGN.md` sections 1 to 4 (including conflict table 2.4);
- the light-theme values in `node_modules/@vibe/core/dist/tokens/tokens.css`.

**Tags.** VERIFIED means a researcher read it on the cited page. REPORTED means it came from a search snippet or a third-party source. Unmarked numbers are measurements or calculations I made in this session; contrast ratios were computed with the WCAG formula.

**Standing rules every change below must respect:**
- Brief: light theme, one accent (`--primary-color` #0073ea), no gradients, glass, glow or neon, no emoji, no pulsing badges, no fake deltas, no "AI insight" boxes, no default chart-library look, no welcome banners.
- Tom's rules from memory:
  - Katie answers every call 24/7, so nothing may pitch her as after-hours, overflow or backup.
  - Katie pops up only occasionally.
  - Brand colours appear only next to the wordmark.
  - No guardrail or limitation talk in sales-facing copy.
  - A feature that is built but switched off still counts as a feature; anything that is not built is cut.
  - Only Fable edits voice-agent code; other agents write specs to `voice-agent/handoff/`.

---

## 1. The recurring moves of premium 2026 dashboards

Each move lists its sources and a recipe with numbers that can be applied to this build.

| # | Move | Sources (2 or more) | Recipe |
|---|---|---|---|
| M1 | **Navigation recedes, content leads.** The sidebar is dimmer and the active state quiet. | Linear 2026 refresh, VERIFIED ("a few notches dimmer", muted inactive text, fewer and smaller icons); Front 2025 inbox, VERIFIED (top bar removed, calmer colours); Vercel 2026 nav, REPORTED (hideable sidebar) | Active item: neutral fill, either `rgba(103,104,121,.1)` (`--primary-background-hover-color`) or `--primary-highlighted-color` #f0f7ff, with weight 500 text and the accent kept on the icon only. Inactive text `--secondary-text-color`. Icons 16 to 20px, one stroke weight. |
| M2 | **Structure is implied, not drawn.** Fewer, softer rules; each border drawn once; a hairline plus a soft shadow rather than a heavy border. | Linear 2026, VERIFIED ("structure is implied rather than drawn"); Vercel guidelines, VERIFIED (border combined with a two-layer shadow, never overlapping alpha borders); Refactoring UI, VERIFIED (chapter title "Use fewer borders"); Atlassian elevation, VERIFIED (a flat card gets a border, not a raised shadow) | Static card: 1px border of about 1.4–1.5:1 against white, plus at most `0 1px 2px rgba(16,24,40,.04)`. Overlays (drawer, menus) get a real shadow, `--box-shadow-medium` = `0 6px 20px rgba(0,0,0,.2)`. Table rules run in one direction only, light, with no outer table border. |
| M3 | **Status is a tinted chip, not a solid fill.** Only the state that demands action gets the loud form. | Stripe accessible colour, VERIFIED (tinted background with darker same-hue text, each moved "up one level"); Stripe badge semantics, VERIFIED (six types; only "urgent" means resolving is required); Geist Badge, VERIFIED (a "subtle" form "tones colors down on dense surfaces"; no check or X icons); Vibe ships `*-selected` tints for exactly this | Height 20, radius 4, 12/20 weight 500. Background is the hue at 10–12% on white; text is the hue's `-hover` token. Contrast measured below in P2: all three pass AA at 4.9:1 or better. |
| M4 | **Few weights and sizes, each with a job.** | Geist type, VERIFIED (Heading / Label / Copy role families with Strong and Subtle modifiers; Label-13 tabular); Vibe typography, VERIFIED ("Bold" is only 500); Linear, VERIFIED (Inter Display for headings only); Refactoring UI, VERIFIED titles ("Size isn't everything", "De-emphasize to emphasize") | Three weights (400/500/600) and five sizes (12/14/16/20/32). Hierarchy comes from colour and weight before size. Titles 16/600, body 14/400, secondary 12–13. |
| M5 | **Tabular numerals and number discipline.** | Vercel guidelines, VERIFIED (`tabular-nums`, numerals for counts, consistent decimals); Geist Label, VERIFIED; MDN `font-variant-numeric`, VERIFIED; A List Apart tables, VERIFIED (right-align numbers, `lining-nums tabular-nums`) | Every time, duration, count and phone number uses `font-variant-numeric: tabular-nums`. Numeric columns are right-aligned with right-aligned headers. |
| M6 | **Answer first, trend second, comparison honest.** | Stripe chart layout, VERIFIED (the value sits above the chart, "users get the answer before checking the trend"); Refactoring UI, VERIFIED ("Labels are a last resort"; fold the label into the value); Carbon big number, VERIFIED ("Total 450"); Curve Dental, VERIFIED (5–7 KPIs; activity counts with no outcome attached are vanity metrics) | Four KPIs at most. Each has a 14px label, a 32/600 number and a 12px sub-line that states another real fact. Show a comparison only when the data has one. Never show "Yesterday 0". |
| M7 | **Calm charts with fixed heights.** | Stripe chart layout, VERIFIED (180px in cards, 320px for a featured chart, one height across a row and across loading, empty and error states; bar charts start at zero); Carbon axes, VERIFIED (never interpolate over empty periods, a semibold landmark label); NN/g clutter, VERIFIED (direct labels instead of a legend, no gridlines when bars carry labels, no gradients or 3D); Resend metrics, VERIFIED (hover detail) | 176–180px card. The axis is cropped to the hours that matter. One series colour plus one tint. Value labels at the bar ends, no gridlines, the legend replaced by direct labels or kept small. |
| M8 | **Density is chosen on purpose, and the rest lives in the drawer.** | Linear, VERIFIED (density tested from "very condensed" to spacious against Apple's standards); Front, VERIFIED (only essential details in the list, metadata collapsed); Raycast, VERIFIED (Compact Mode) | Lists show who, why, when and outcome. Engineering columns (Characters, Notes count, Language "English" on every row) move to the drawer. Rows are 44px for screen share: 40px compresses badly at an effective 1280x720. |
| M9 | **One icon system, one size, one stroke.** | Attio, VERIFIED (16px icons and avatars everywhere, Aug 2026); PostHog, VERIFIED (1.5px outline set); Raycast, VERIFIED (one stroke and one corner radius); Lucide spec, VERIFIED (24 canvas, 2px stroke) | Keep the Vibe icon set at one size: 20px in the rail, 16px inline. No coloured icon backgrounds. |
| M10 | **Concentric radii and layered elevation.** | Geist materials, VERIFIED (6px base and small, 12px medium and large; a child radius never exceeds its parent); Vercel guidelines, VERIFIED (shadows have at least two layers); Atlassian elevation, VERIFIED (raised shadow reserved for movable cards) | Cards 8, chips and controls 4, drawer edge 0. Cards are flat; only the drawer, menus and tooltips are raised. |
| M11 | **Designed empty, sparse and error states, each with a next step.** | Stripe empty states, VERIFIED (the title states what is missing, with a period; the description is under 14 words; filtered-to-zero is worded differently from no-data; a dashed section box); PostHog, VERIFIED ("Clarity > cleverness"); Vercel guidelines, VERIFIED (design empty, sparse, dense and error states) | One sentence, a dashed 1px `--layout-border-color` box, and the same height as the loaded state. |
| M12 | **Short, interruptible motion on transform and opacity only.** | Vercel guidelines, VERIFIED (never `transition: all`, honour reduced motion, loader show-delay 150–300ms and minimum 300–500ms); Atlassian motion, VERIFIED (focus 0ms, list hover 50ms, popup 150ms, modal 250ms in and 200ms out, exits 50–100ms shorter); Carbon, VERIFIED (a drawer uses the standard curve `cubic-bezier(0.2,0,0.38,0.9)`) | Hover 50–100ms. A new row enters at 150ms (translateY 4px plus opacity). The drawer enters at 250ms and leaves at 200ms. Nothing loops. |
| M13 | **Restraint is the brand.** | PostHog, REPORTED ("Gradients are a cliché of generic SaaS design"); Linear 2024, VERIFIED (less blue chrome for a "more neutral and timeless appearance"); Mercury, REPORTED (no promotional accents). Resend's glass and metal buttons are the counter-example. | One accent, used only for the action or state that matters. Everything else is grey. |
| M14 | **Evidence over personality for an AI agent.** | PolyAI transcripts, VERIFIED (a timestamp per utterance, an audio player beside the transcript, tool calls behind a toggle, a summary); Bland call logs, VERIFIED (clicking a message seeks the audio; summary, variables and citations); Retell, VERIFIED (outcome, transcript, audio, summary); Ada, VERIFIED (a step trace with tool rows); Intercom Fin, VERIFIED (a quiet avatar plus a text label "Fin AI Agent" under each message) | Header metadata, then the outcome, then a summary, then a speaker-labelled, timestamped transcript with inline event rows. The agent's character is never the frame. |

---

## 2. Gap analysis of the current build

Verdicts: **Right** means keep it. **Fine** means acceptable but not top tier. **Cheap** means it reads as template or demo-broken on a screen share. "Shot" is the screenshot in `docs/screenshots/final/`; "File" is where the change lives.

### 2a. Visual system

| Area | What it is now (measured) | Verdict | Shot | File |
|---|---|---|---|---|
| Base type | Figtree 400/500/600; body 14/20; table headers 12/16; KPI numbers 32/40/600 tabular (the `.tabular` class is applied in `TodayNumbers.tsx:113`) | **Right**: matches M4 and M5 | overview | `global.css`, `overview.module.css .kpiNumber` |
| Grid | 12 columns, 24 gaps, 40/32/128 content padding, Desk layout with the 7+5 bottom row | **Right** | overview | `Shell.module.css .content`, `Grid.module.css` |
| Focus rings | `:focus-visible` only, with inset rings on rows | **Right**: matches Vercel | n/a | `global.css` |
| Drawer motion | 250ms in, 200ms out, transform only, reduced-motion honoured | **Right**: matches M12 | calls-drawer | `Drawer.module.css` |
| Masked numbers plus Show numbers | Off by default, visible in the top bar | **Right**: a trust signal (character research, rule 4) | all | `TopBar.tsx` |
| Status chips | Solid saturated fills with white text: Booked #00854d, Urgent #d83a52, Callback #0073ea, at 12/20/500 with a 72px minimum width | **Cheap**: the loudest thing on every screen. Eight green blocks down the Calls table outshout the data, and an Urgent chip has no more weight than a Booked one (M3) | overview, calls, callbacks | `StatusChip.module.css`; DESIGN 2.2 |
| KPI sub-lines | "Yesterday 0" on all four cells (DESIGN conflict 9: true for this fixture, fatal in a demo) | **Cheap**: reads as a dead account | overview | `TodayNumbers.tsx:58` (`y()`) |
| KPI choice | Calls / Booked / Callbacks waiting / Texts sent | **Fine**: "Texts sent" is an activity count with no outcome (Curve), and there are no new-patient consults, no Spanish count and no money figure (practice-market) | overview | `TodayNumbers.tsx` |
| Calls-by-hour chart | Hours 12 AM to 12 AM (`slot = width / 24`, `CallsByHour.tsx:39,115`). In this data about 14 of 24 slots are empty, so about 60% of the 1136px frame carries nothing. No-booking bars are hollow 1.5px outlines. Legend at top right; labels 12px `--secondary-text-color` (5.48:1, so they are not too light). | **Cheap**: the empty left 60% says "nothing happens here", and the hollow bars read as missing data | overview | `CallsByHour.tsx`, `overview.module.css .barOpen/.legend*` |
| Canvas | `--allgrey-background-color` #f6f7fb against white cards: **1.07:1**. The card border #c3c6d4 against the canvas is 1.59:1. | **Fine**: the cards are defined only by their border, and on a Zoom-compressed share the canvas and cards merge into one white field. This is the same canvas monday.com uses, so it is not wrong, just flat | all | `Card.module.css`, DESIGN 2.1 |
| Card border | `--ui-border-color` #c3c6d4 outside, `--layout-border-color` #d0d4e4 inside | **Fine**: the outer #c3c6d4 is heavier than the inner rules, so cards look boxed (M2) | all | `Card.module.css .card` |
| Rail active item | `--primary-selected-color` #cce5ff fill with a blue icon | **Fine to Cheap**: a solid light-blue pill is the 2022 template look, and after the chips it is the second-loudest element (M1) | all | `Shell.module.css .item[aria-current]` |
| Rail wordmark | "Katie" as plain 20/600 text, the practice name at 12px, "Demo practice", no mark | **Cheap**: no logo, no avatar, nothing a closer can point at. The practice name, which is what the owner cares about, is the smallest text in the rail | all | `Shell.module.css .wordmark/.brand/.practice`, `Rail.tsx` |
| Rail footer | "Made by SAIDA" in 12px grey | **Fine** | all | `Shell.module.css .made` |
| Page title vs card title | Top bar 20/600 "Calls", then a card header 16/600 "Calls". The same happens on Bookings, Callbacks and Texts. | **Cheap**: a duplicate title costs 56px and looks generated | calls, bookings, callbacks, texts | `Card.tsx` header usage in `Calls.tsx`, `Bookings.tsx`, `Callbacks.tsx`, `Texts.tsx` |
| Card headers on Overview | 16/600, a 56px row with a bottom rule | **Right** on Overview; the weight competes with the 20/600 page title only slightly | overview | `Card.module.css .title` |
| Table rows | 40px rows with 32px header rows and ruled dividers | **Fine**: a little tight for a screen share at an effective 1280x720 (demo-craft) | all lists | `global.css --row-height` |
| Row hover and click | Calls and Overview rows are whole-row links with hover (`rowLinkClass`). **Bookings, Callbacks and Texts rows have no hover and no row click**; only the blue "View call" text links. | **Cheap**: a column of seven identical blue "View call" links is template-like, and the inconsistent affordance shows when a closer clicks a row and nothing happens | bookings, callbacks, texts | `ListTable.module.css`, `pages/lists/parts.tsx`, `RowLink.module.css` |
| "First line" column | The caller's raw first utterance, truncated ("Hi, um, my daughter has a bracket that…") | **Cheap** for an owner. The reason for the call ("New-patient consult · Delta Dental") is what they want. | overview, calls | `LatestCalls.tsx`, `Calls.tsx` |
| Calls page columns | Language (every row "English"), Bookings and Notes counts | **Fine**: engineering density (M8) | calls | `Calls.tsx` columns |
| Texts page | A Characters column (3 / 36); "Reply: yes" and "Confirmation" as separate rows; every row at 6:05 PM | **Cheap**: reads like a log table, not something an owner uses | texts | `Texts.tsx:25`, `src/mock/fixtures/sms.json` |
| Drawer header | Masked number as the title even when the name is known; "English · 1 booking · 1 note" | **Fine**: needs name-first, outcome and a summary | calls-drawer | `CallDrawer.tsx`, `CallDrawer.module.css .header` |
| Drawer transcript | Chat bubbles: caller plain on the left, Katie in grey bubbles on the right with a 20px head; system notes 12px grey | **Fine**: works, but consumer-chat-like. Agent products (PolyAI, Bland, Retell) use a document transcript with a speaker column, timestamps and event rows (M14). | calls-drawer | `CallDrawer.module.css .callerLine/.katie/.panel/.note` |
| Drawer backdrop | None (DESIGN 6.8) | **Fine**: the table bleeds through on the left, and a closer can mis-click it | calls-drawer | `Drawer.module.css` |
| Line tile | 363px wide for one sentence plus "Last call 6:06 PM" | **Fine**: it is the natural live-demo stage and is under-used (see section 5) | overview, overview-live | `LineTile.tsx`, `overview.module.css .line*` |
| Settings page | A 640px card on an empty canvas; the right two-thirds blank | **Fine**: off the demo path | settings | `Settings.module.css` |
| Katie pop-up | Full body, 96px, over the top bar, with a white bubble and a 1px border | **Right** as Tom's direction (MONDAY-LLAMA). Bubble copy should stay plain (section 6). | overview-booking | `src/katie/stage/*` |

### 2b. Demo content (the biggest problem, and it is data, not CSS)

The fixtures are captured from a real test database (`status.json` `db_path` is a temp sqlite file). On a screen share they show:

1. **A real surname.** "Verified caller (Tommy Martorana's father)…" on Callbacks. This must go before any closer shares the screen.
2. **A speech-to-text error as the headline.** The top call's first line is "Um yeah, do you take Edna?" (Aetna misheard), and the drawer opens on two clarifications.
3. **Duplicate slots.** On Bookings, 5 of 7 bookings sit in the same "Mon 3:20 PM" slot, and "Max De Lagado" and "Max Delgado" are the same person.
4. **Clumped times.** All ten texts are at 6:05 PM, and all calls fall between 2:40 and 6:06 PM.
5. **Repeated reasons.** Three of seven callbacks are "Daughter's bracket came off".
6. **Missing names.** "Not given" appears five times in the Name column.
7. **No comparison.** "Yesterday 0" on every KPI.
8. **Missing practice-day realities.** No Spanish call, no new-vs-existing split, no emergency, no cancellation, no morning.
9. **A frozen date.** The day is pinned to Mon Oct 12, so the top bar says "Today, Monday, October 12" on any date.

---

## 3. Ranked polish plan (visible impact per hour of work)

"Brief" says whether the change stays inside the brief's rules. **TOM** marks a change that needs Tom's call. "Spec" means DESIGN.md needs an amendment; the build agent writes it into DESIGN 2.4 as a new conflict row.

| Rank | Change | Exact change | Justified by | Brief | Effort |
|---|---|---|---|---|---|
| **P1** | **Replace the fixture day with a synthetic, relative-time demo day** (section 5b spec) | New `src/mock/demoDay.ts` generator with offsets in minutes from practice open; recomputed at load against the real date. A new `?mock=demo` scenario in `mode.ts`. Keep `?mock=1` for regression tests. Purge "Martorana" from every fixture (`grep -ri martorana src/mock` must return nothing). | Demostack, VERIFIED (realistic data sized to the prospect); Supademo, VERIFIED (full names, varied records, one believable imperfection, never customer records); Salesforce and Microsoft date shifters, REPORTED (store offsets, recompute at load) | Inside | 4–6 h |
| **P2** | **Tinted chips; Urgent alone stays solid** | `StatusChip.module.css`: `.booked{background:var(--chip-positive-bg);color:var(--positive-color-hover)}` (#007038 on #e6f3ed = **5.45:1**); `.callback{background:var(--primary-highlighted-color);color:var(--primary-hover-color)}` (#0060b9 on #f0f7ff, both real tokens); `.urgent` stays solid `--negative-color` with white text, so it is the only solid chip on screen; `.neutral` stays `--ui-background-color`. Add to `global.css :root`: `--chip-positive-bg:#e6f3ed; --chip-negative-bg:#fbebee` (10% tints of the Vibe hues; red tint text #b63546 = 5.08:1, used if Urgent is ever tinted). Drop `min-width:72px` to `auto` with padding 0 8. | M3: Stripe, Geist, Vibe `*-selected` tints | Inside. **Spec**: DESIGN 2.2 graft "Solid status chips" reversed, because the AA concern that drove it is met at ≥5:1 | 1 h |
| **P3** | **Kill "Yesterday 0"; every sub-line states a real fact** | `TodayNumbers.tsx`: replace `y()` with per-cell facts. Calls: "N in Spanish" (or nothing). Booked: "N new-patient consults". Callbacks: "N urgent" (already there). Fourth cell: see P6. Show "Yesterday N" only when N > 0 and the comparison is valid (conflict 8). | M6: Refactoring UI, Stripe; the brief's no-fake-deltas rule; Curve (outcome over activity) | Inside | 1 h |
| **P4** | **Crop the chart to the practice day and fill the no-booking bars** | `CallsByHour.tsx`: hour span = `min(firstCallHour, open−1)` to `max(nowHour, close)+1`, so about 7 AM to 6 PM gives 11–13 slots instead of 24. Bar width 56% of the slot, top radius 2px (`rx` on a path, or a clip). `.barOpen{fill:var(--primary-selected-color);stroke:none}` (#cce5ff) stacked under `.barBooked`. Drop the legend for direct labels: one 12px line under the title, "Booked" in a 10px #0073ea swatch and "Other calls" in a #cce5ff swatch, or keep the current legend without the hollow swatch. Label the open and close hours on the axis in 12/16 weight 600 as landmarks (Carbon), the rest weight 400. The Now rule stays. | M7: Stripe, Carbon, NN/g | Inside | 2–3 h |
| **P5** | **Remove the duplicate titles on list pages; the card header becomes a count sentence** | On Calls, Bookings, Callbacks and Texts, the card header shows a 14/500 sentence such as "38 calls today · 19 booked", "19 bookings · 9 new patients" or "5 waiting · 1 urgent", with the filters at the right. The top-bar title stays the only title. | Linear 2026, VERIFIED (consistent headers); Refactoring UI, VERIFIED ("labels are a last resort") | Inside | 1 h |
| **P6** | **KPI set in the owner's terms** | Cells: **Calls answered** · **Appointments booked** · **New-patient consults** · **Callbacks waiting**. "Texts sent" moves into the Booked sub-line ("17 confirmed by text"). | Curve, VERIFIED (5–7 KPIs, no vanity); practice-market (ortho owners talk in consults, then starts; Peerlogic splits new and existing patients, VERIFIED; Weave's July 2026 release, VERIFIED) | Inside. Needs a `new_patient` flag on bookings (the demo data has it; for real mode, check the API) | 2 h |
| **P7** | **A reason column instead of the raw first line** | Latest calls and Calls: the "First line" column becomes "Reason", taken from the booking reason, then the note reason, then the cleaned first line. Example: "New-patient consult · Delta Dental", "Broken wire, in pain", "Reschedule Thu adjustment". The raw first line moves to the drawer. | M8 (Front: essentials in the list); demo-craft (never open on a mishearing) | Inside | 2 h |
| **P8** | **Whole-row click and hover on Bookings, Callbacks and Texts; "View call" goes** | Apply `rowLinkClass` to `<tr>` in `pages/lists/parts.tsx` (it is already in `Calls.tsx:222`). Remove the "View call" column and replace it with a 16px chevron in `--icon-color` shown on hover. Hover background `--primary-background-hover-color`, 50–100ms. | Vercel, VERIFIED (hover has more contrast than rest); M12 | Inside | 1–2 h |
| **P9** | **Quieter rail active state** | `.item[aria-current='page']{background:var(--primary-background-hover-color);font-weight:500}`; keep `.icon{color:var(--primary-color)}` on the active item; inactive item text `--secondary-text-color`, hover to primary. | M1: Linear 2026, Front | Inside | 0.5 h |
| **P10** | **Names first, everywhere a name exists** | Overview callbacks, Latest calls, the Callbacks page and the drawer title show the name in 14/500 with the masked number after it in secondary text. With the new data, "Not given" becomes rare (only the one realistic caller who would not give a name). | Supademo, VERIFIED (full role-specific names); demo-craft A4 | Inside | 1 h |
| **P11** | **Document-style transcript with summary and outcome on top** | `CallDrawer`: header is name 20/600, masked number, outcome chip, then "Tue 9:14 AM · 2:08 · Spanish". Next comes an **Outcome block** (one line per action: "Booked new-patient consult · Thu Oct 29, 9:40 AM · Delta Dental, in network" / "Confirmation text sent 9:16 AM · patient replied Yes"), each line linking to its turn. Then the transcript as rows with a 64px speaker column ("Katie" with her 16px head, or "Caller") plus a 12px tabular timestamp column (0:00, 0:14…), equal-weight 14/20 text with no bubbles, and Katie's rows marked by a 2px `--layout-border-color` left rule. Event rows ("Checked insurance: Delta Dental PPO, in network", "Looked up the chart: new patient", "Booked", "Text sent") are 12/16 secondary with a 16px icon. | M14: PolyAI, Bland, Retell, sipgate, Ada; Fin's label pattern | Inside. Needs per-turn timestamps (the events have `ts`) | 4–6 h |
| **P12** | **Line tile as the live stage** | Idle: "Open · last call 4:31 PM", plus "Answered every call today" only when the data shows zero unanswered calls (never a hold-time or similar claim the API cannot back); otherwise no second line. On a call: the 8px orange dot (no pulse), caller name or masked number, a ticking tabular timer, and **the last line said** (14/20, one line, truncated), updating per turn. On hang-up: "Booked new-patient consult · Thu 9:40 AM" for 30 s, then back to idle. | demo-craft rule 9; ProspectUp and Phonevoice live sequences, VERIFIED vendor pages | Inside (no pulse, no glow) | 3 h |
| **P13** | **Card edge: lighter border plus a hairline shadow** | `Card.module.css .card{border-color:var(--layout-border-color);box-shadow:0 1px 2px rgba(16,24,40,.05), 0 0 0 0 transparent}`. The second layer stays empty unless a review wants more. Canvas unchanged (#f6f7fb, monday's own). | M2: Vercel (border plus layered shadow), Linear (softer dividers) | Inside (no glow; a 2px blur at 5% alpha). **Spec**: DESIGN 2.3 says "everything else box-shadow: none" | 0.5 h |
| **P14** | **Rows 44px, header rows 32px** | `global.css --row-height:44px`. Re-check the Overview vertical budget (DESIGN 4): Latest calls drops from 9 to about 8 rows above the fold, which is acceptable. | demo-craft (screen share at an effective 1280x720; Zoom compression, REPORTED) | Inside. **Spec**: DESIGN 4 vertical budget | 0.5 h plus screenshots |
| **P15** | **Texts page as conversations, not a log** | Columns: Time · Patient · Message (the first 60 characters of the actual text, e.g. "Harborline Orthodontics: you're booked Thu Oct 29 at 9:40 AM…") · Status ("Replied Yes" / "Delivered"). Drop Characters and Direction; fold the reply into its confirmation row. | M8; Curve (outcomes) | Inside. Needs the SMS body in the API (check; the PHI and BAA rules apply to real mode) | 2 h |
| **P16** | **Drawer scrim** | A fixed overlay under the drawer, `background:rgba(50,51,56,.16)`, opacity 0 to 1 in 200ms; clicking it closes the drawer. | Atlassian elevation, VERIFIED (overlays raised); Carbon, VERIFIED (dimming) | Inside. **Spec**: DESIGN 6.8 "no backdrop" | 1 h |
| **P17** | **Rail header: practice first, Katie as the product mark** | `.wordmark`: row 1 is Katie's 24px head (the same asset as the top-bar summon button) plus "Katie" 16/600; row 2 is the practice name 14/500 primary text; "Demo practice" goes, because the top bar already says Demo. | M1; practice-market (the owner's own name on screen is the hook) | **TOM**: whether the mark is Katie's head, a SAIDA wordmark (brand colours only next to the logo) or nothing | 1 h |
| **P18** | **Overview callbacks grouped by caller, urgent first** | When one caller has two notes (today's (656) ***-0150 urgent plus callback), show one row with both reasons. Already sorted urgent-first; keep that. | demo-craft (never show duplicate rows) | Inside | 1–2 h |
| **P19** | **Spanish shown as a fact, not a feature tile** | The Calls KPI sub-line reads "5 in Spanish". On the Calls page, the Language column shows only non-English rows: an empty cell for English, "Spanish" in 14/400 for Spanish. | practice-market (Weave lists multilingual as "Coming soon", VERIFIED; Spanish is 77% of Florida's limited-English population, lep.gov, year unknown) | Inside | 1 h |
| **P20** | **Designed empty and error states** | Every list: one sentence with a period ("No callbacks waiting."), a sub-line under 14 words saying when data appears ("New callbacks show here the moment a call ends."), and a dashed 1px `--layout-border-color` box the height of 3 rows. Filtered-to-zero uses different words: "No calls match All outcomes: Booked." | M11: Stripe, PostHog | Inside | 1–2 h |
| **P21** | **Demo control menu** (section 5c) | The "Demo data" label in the top bar becomes a quiet text button, "Demo" with a 16px Vibe chevron-down icon, opening a Vibe Menu: Reset the day · Play a sample call · Watch the demo line · Bring Katie in · Show numbers. | demo-craft (one URL, no login, reset, replay) | Inside | 3–4 h |
| **P22** | **Estimated production booked** | One KPI sub-line or a fifth cell: "≈ $14,600 in consults booked (estimate, at your $X per start × your consult-to-start rate)". The values are entered in Settings, so nothing is invented. | Weave ("every dollar generated"), Savvy ("AI-booked production $11,420"), Viva, Goodcall: all VERIFIED vendor pages | **TOM**: a dollar claim on the screen. Off by default; the demo shows it only if Tom says so | 3 h |
| **P23** | **Call audio player in the drawer** | A play bar above the transcript; clicking a line seeks the audio to it (Bland, PolyAI). | Arini, Goodcall, Weave, Bland, PolyAI | **TOM**: needs Katie to keep recordings, which is a BAA and policy decision, not design. Do not build until decided | n/a |
| **P24** | **Callback "Done / called back by" state** | A check control on each callback row, showing "Called back 9:20 AM · Dana". | Weave forum complaints, REPORTED (no way to confirm missed calls get returned); VoiceStack staff snapshot, VERIFIED | **TOM**: notes have no done state (conflict 26), so this needs a backend field. Under the "not built gets cut" rule, it stays out of the demo until it is built | n/a |
| **P25** | **Dark mode for demos** | n/a | n/a | **TOM**: against the brief (light only). Not recommended: the screen shares to an owner who lives in light-theme practice software | n/a |

**Do not do:**
- an after-hours tile or card (Tom: Katie answers every call; the full-day chart already shows the 7 AM calls);
- week-over-week delta chips;
- hot, warm or cold scoring (VoiceStack);
- big ROI numbers inside the product (Arini, Viva);
- an "AI insight" summary box on Overview;
- a counting-up number animation;
- a "Welcome back" banner.

---

## 4. The prospect comparison: what Katie's screen must show that the dashboards an owner already knows do not

What the owner is likely to have seen: **Weave** (ADA Member Advantage endorsed, so most likely), Peerlogic, Arini, Savvy, Viva, Dental Intelligence, and their PM system (Dentrix, Cloud 9, OrthoFi). **NexHealth has no native receptionist dashboard**: it is an API layer (docs.nexhealth.com, VERIFIED). All competitor facts below are from their own marketing pages; the researchers could not see their actual UIs.

| Widget on Katie's screen | What it proves | Who lacks it (verified pages) |
|---|---|---|
| **Drawer outcome block plus transcript with inline system events** ("Checked insurance: Delta Dental PPO, in network" → "Booked Thu 9:40 AM" → "Confirmation text sent · replied Yes") | Every claim traces to the exact line of the call | Weave's AI receptionist page does not mention transcripts; Viva puts transcripts on its Gold plan only; Savvy does not mention them. None of the pages read shows chart and scheduling actions inside a transcript. |
| **A Spanish call in Latest calls, opened to show the Spanish transcript, with an English summary in the outcome block** | Spanish today, not "coming soon" | Weave lists multilingual as "Coming soon". Arini does not mention Spanish. |
| **The callback queue with reason plus urgency, urgent on top**, the urgent one already "booked on this call" | Nothing she can't handle gets lost; there's a list with the reason written up | Weave forum users ask for a way to know missed calls were returned (REPORTED) |
| **The KPI "New-patient consults"** | Ortho language: consults become starts | No receptionist competitor page found talks in consults or starts; Peerlogic and Weave split new vs existing, but not in ortho terms |
| **The full-day chart from 7 AM**, with a Now rule | Every call answered across the whole day, with no special after-hours mode | Dental Intelligence leads with a "Calls received outside of business hours" card and Weave with "47% of bookings after hours". Katie's screen does not need that card: the 7 AM bars say it without pitching after-hours. |
| **Live: the prospect calls the demo line and the row appears** (section 5d) | It is real, it is now, and it is on their screen | RevenueWell has a public demo line, but its page does not say the call shows on a dashboard. ProspectUp's vendor page is the only one showing a live on-screen sequence. |
| **Masked numbers by default with a Show numbers switch** | Privacy is the default | Not described on any competitor page |
| (TOM) **Estimated production booked** | Money, which every competitor leads with (Weave, Savvy, Viva, Goodcall, Peerlogic) | Katie shows only counts today, which is the biggest gap if Tom approves P22 |
| (TOM) **Audio** | Hear her voice | Arini, Goodcall and Weave have it. This depends on the recording decision (P23). |

The calm screen is itself a contrast: owners spend all day in PM software reviewers call "outdated" with an "XP/Win7 feel" (Dentrix G2 and Capterra summaries, REPORTED). Do not copy the 50-KPI scorecard walls of Jarvis or Dental Intelligence.

---

## 5. The demo plan

### 5a. The 90-second storyline (closer screen-sharing a 1280x800 browser window, zoom 100%)

The arc comes from Cohan (lead with the result, VERIFIED), Gong (no monologue longer than 76 s; one or two value points; more time on next steps, VERIFIED) and Tell-Show-Tell (VERIFIED). The exact timings are my synthesis, not a sourced benchmark.

| Time | Screen | On-screen beat | Closer's line (approximate) |
|---|---|---|---|
| 0–10 s | Camera, or Overview with no clicks | Overview loaded and Katie already gone (her first-open moment ran before the share) | "This is a practice's phone today with Katie answering. Every call, nobody on hold." |
| 10–30 s | **Overview** | Point at **Appointments booked 19** → **New-patient consults 9** → the chart's 7 AM and noon bars | "Nineteen booked, nine of them new consults. Look at eight o'clock and lunch, when your desk is slammed. How many of those calls does your team miss today?" (Then stop and let them answer.) |
| 30–50 s | **Drawer: the Spanish new-patient consult** (row 3 of Latest calls) | Outcome block: "Booked new-patient consult · Thu 9:40 AM · Delta Dental, in network · confirmation text sent, replied Yes". Scroll two Spanish lines; the English summary is on top. | "She checked insurance, booked the slot in your schedule and texted the confirmation. In Spanish." |
| 50–65 s | **Overview → Callbacks waiting**, the one Urgent row | "Ethan Brooks · Urgent · broken wire poking his cheek, in pain · booked first slot tomorrow 8:00 AM" | "Anything she shouldn't handle lands here already written up, urgent on top." |
| 65–85 s | **Live: the prospect calls (813) 530-1664** with the Overview open (section 5d) | Line tile flips to On a call → new Live row → last line updates → hang-up → Booked or Callback | "Call it right now from your cell. Watch your screen." |
| 85–90 s | Stop sharing | n/a | "Live on your number in two weeks. Let's set your go-live date." (Assume the sale; no "try it out" wording.) |

Fallback for 65–85 s: if the prospect won't call, or the line fails, use **Demo menu → Play a sample call**, which replays a scripted call through the same live path.

### 5b. The demo dataset spec (`src/mock/demoDay.ts`)

**Practice.** "Harborline Orthodontics", fictional; one location; Dr. Elena Reyes (Dr. Reyes already appears in the fixtures); hours Mon–Thu 8:00 AM–5:00 PM, Fri 8:00 AM–1:00 PM; area codes 813, 727 and 656, with revealed numbers in the fictional 555-01xx range.

**Clock.** The date is the real local date. The demo "now" is the real local time when that falls between 11:00 AM and 8:00 PM; otherwise it is pinned to **4:40 PM**, so the screen is never empty at 8 AM or a dead evening. Calls are generated up to "now" only. On Saturday and Sunday the date is the previous Friday's, shown as "Friday, Oct 16" with the real date. (The orchestrator should confirm the pin with Tom only if a closer demos at odd hours.)

**Volume at 4:40 PM.** 38 calls. This is an assumption for a busy one-doctor ortho office; no sourced benchmark was found. Check it against the real demo line's volume if it exists.

| Hour | 7 AM | 8 | 9 | 10 | 11 | 12 PM | 1 | 2 | 3 | 4 (to 4:40) |
|---|---|---|---|---|---|---|---|---|---|---|
| Calls | 4 | 6 | 4 | 3 | 3 | 6 | 3 | 4 | 3 | 2 |
| Booked | 2 | 4 | 2 | 1 | 2 | 3 | 1 | 2 | 1 | 1 |

That gives a chart with a peak at opening, a dip mid-morning, a lunch peak, then a taper. The first call is at 7:12 AM and there is no after-hours label.

**Outcomes for the 38 calls:**
- **19 booked:**
  - 9 new-patient consults (6 children by a parent, 3 adults);
  - 4 repairs or adjustments;
  - 4 reschedules, one of them the cancellation;
  - 2 retainer checks.
- **11 answered with no booking needed:** hours, directions, "do you take Cigna", a billing balance question answered from policy, a parent confirming an appointment time.
- **5 callbacks**, 1 of them urgent:
  1. **Urgent** (Ethan Brooks, 14, via his mom): broken wire poking his cheek, in pain; booked the first slot tomorrow at 8:00 AM, so the row shows "booked on this call".
  2. A treatment coordinator question on a payment plan.
  3. A referring dentist's office asking for records.
  4. A caller who wants Dr. Reyes personally.
  5. An insurance pre-authorization question Katie could not answer.
- **2 not for the practice:** one wrong number and one robocall, each about 0:20, chip "No booking". This is the believable imperfection.
- **1 hang-up at the greeting** (0:06).

**Other facts in the day:**
- **Spanish:** 5 calls, 3 of them booked (including the consult used in the storyline).
- **Insurance checks:** 11 (Delta Dental 4, Aetna 2, Cigna 2, MetLife 1, Guardian 1, United Concordia 1). One was out of network and handled plainly: "We're out of network with them; the office can file for you."
- **Cancellation:** 1. A Thursday adjustment was cancelled and rebooked to next Tuesday; it counts as a reschedule and shows as a booking with reason "Rescheduled from Thu".
- **Texts:** 19 confirmations sent, one per booking, within about 1 minute of hang-up. 15 patients replied "Yes" at realistic delays of 1 to 40 minutes. 0 STOP.
- **Durations:** 0:06 to 4:10, median about 2:05, `Math.round`-formatted.
- **Yesterday:** seed a real yesterday (41 calls, 21 booked) so "Yesterday N" may appear where the build keeps it.

**Names.**
- Full and varied, and plausible for Tampa Bay. Starter list: Sofia Ramírez, Daniela Ortiz, Luis Hernández, Mia Castillo, Ethan Brooks, Ava Nguyen, Jordan Mitchell, Priya Raman, Marcus Bell, Hannah Kowalski, Grace O'Neill, Tyler Washington, Chloe Bennett, Isaiah Carter, Emma Larsen, Noah Patel.
- Parents calling for children say so ("for my son Ethan").
- Exactly one caller declines to give a name.
- Never use real people, SAIDA staff or Tom's family. Never reuse a name across two unrelated calls.

**Bookings.**
- Slots are spread over the next 10 business days at real slot times (8:00, 8:40, 9:20…), with **no two bookings in the same slot**.
- New-patient consults are flagged `new_patient: true`.

**Transcripts.**
- Write full turn-by-turn transcripts for the 6 calls a closer is likely to open: the Spanish consult, the urgent wire, an English child consult with insurance, the cancellation and reschedule, the wrong number and the Dr. Reyes callback.
- The rest get a 4–6 turn transcript.
- No mishearings in the opened calls.
- Event rows: chart lookup, insurance check, schedule check, booked, text sent, callback note.

**Determinism.** Seed by date so a refresh shows the same day, and **Reset** regenerates it.

### 5c. Demo controls a closer needs

1. **One URL, no login.** A `/demo` route (or `?mock=demo`) that never calls the real API and never writes. Once set, it is sticky for the tab (the existing `katie.mock` session key). The URL contains no tokens.
2. **Demo menu** in the top bar, replacing the static "Demo data" label (P21):
   - **Reset the day**: reseed, clear the Katie caps, and close the drawer.
   - **Play a sample call**: run a scripted call through the same live-event path as `stream-sample.txt` (≈70 s, compressible to 40 s with a 2× option).
   - **Watch the demo line**: subscribe to real events from (813) 530-1664 (see 5d).
   - **Bring Katie in**: the existing summon (`requestSummon()`); the summon moment bypasses the caps.
   - **Show numbers**.
3. **Keyboard shortcuts** for the closer, listed in the menu: `R` reset, `P` play, `K` Katie. They must never fire while focus is in an input.
4. **Window size.** Tell closers to share a 1280x800 browser window (the designed minimum) at 100% zoom, share the window rather than the screen, and turn off Zoom's "Optimize for video clip" (REPORTED). This is a closer instruction, not code.

### 5d. The call-the-line-live moment

**Wiring (an engineering gate, not design).** The demo line runs on the backend server (dash-backend.example.com). The dashboard's real mode already consumes a live stream (`src/live/stream.ts`).
- What is needed: a **demo-scoped, read-only event feed** for 530-1664 calls only, merged over the synthetic day in `?mock=demo`.
- Any server-side change is voice-agent code, so it goes as a spec to `voice-agent/handoff/` for Fable.
- Never expose another line's calls. The prospect's own number stays masked by default.

**On-screen sequence.** No pulsing, no glow; each step uses one 150ms transform and opacity transition at most.
1. **Ring or answer** (within 1–2 s of the call event): the Line tile dot turns orange `--color-working_orange` (static) and the tile reads "On a call · (813) ***-0142 · 0:03", with the timer ticking in tabular numerals.
2. **A new top row in Latest calls**: Live chip (`--color-working_orange-selected` #fed59e tint with primary text), "Now", and the reason cell reading "In progress". The row enters at 150ms with translateY(4px) to 0 plus opacity; the rows below shift with no bounce.
3. **Per turn**, the Line tile's second line shows the last thing said ("Caller: I'd like a consult for my son"), truncated to one line.
4. **On a booking event**, the Line tile second line reads "Booked new-patient consult · Thu 9:40 AM".
5. **Hang-up**: the chip turns Booked (tinted green), and the row background holds `--primary-highlighted-color` #f0f7ff once for 2 s, then fades out over 400ms. It runs once and never loops. The Appointments booked KPI goes 19 to 20 with no count-up, the text row appears on Texts, and Katie's booking moment may fire under the existing caps.
6. **Clicking the row** opens the drawer with the transcript that just happened.
7. **Failure states:**
   - No call within 20 s of "Watch the demo line": the Line tile shows "Waiting for a call to (813) 530-1664."
   - The stream drops: "Lost the live feed. Play a sample call instead?" with a link that runs P (Play a sample call).
   - Each message is one sentence, and Katie never appears on these (section 6).

---

## 6. Katie's presence rules applied to this build

These keep Tom's 10-13 direction (occasional, monday-llama style, MONDAY-LLAMA Part 3) and apply the character research on top. Rules 1, 2, 3, 4, 7 and 8 match the existing `moments.ts` (ranks, caps, off by default).

1. **She appears only after a good, completed outcome or when asked.** The existing moments are first-open, booking, line-wake, urgent and summon. Asana ("occasional", after completed work, VERIFIED) and Mailchimp (one known emotional moment, VERIFIED) support this.
2. **Never on frustration.** She does not appear on error lines, failed loads, "no match" lookups, empty states, the dropped-stream state or Settings problems. Mailchimp: "we never try to be playful in moments where there might be some frustration" (VERIFIED). Check that `moments.ts` cannot fire `line-wake` on a reconnect after an error.
3. **She never blocks work.** Every moment waits for 1.5 s of quiet, never sits over an open drawer (urgent waits), and leaves on her own. This is already in `moments.ts`.
4. **In a demo:** the first-open moment runs once (before the share ideally), the closer summons her at most once, and **Reset** clears the caps so a second demo behaves like the first.
5. **Bubble copy is plain product voice**: one factual sentence, dry, no exclamation marks, no jokes, no first-person cuteness. Good: "Nineteen of today's thirty-eight calls ended in a booking." Bad: "Woohoo, I booked 19!" (Mailchimp: "forced humor can be worse than none", VERIFIED). The cap of 140 characters (conflict 35) stays.
6. **One construction at every size.** The 20px transcript head, the 24px top-bar head, the proposed 24px rail mark (P17, Tom's call) and the 96px body must be the same drawing: the same palette, the same line weight, and the line weight matched to the icon stroke (Duolingo construction, VERIFIED; Slack's in-product art is "quieter", VERIFIED).
7. **In the drawer she is a label, not a character.** A 16px head beside the speaker label "Katie" on her rows only (Fin-style quiet label, VERIFIED). No bubbles once P11 lands.
8. **She is never decoration.** No empty-state illustration of Katie and no Katie on the Settings page. Icons and copy come first (Atlassian illustrations, VERIFIED).
9. **AI disclosure stays plain and visible without being a guardrail line.** The drawer speaker label can read "Katie (AI receptionist)" on first mention, following Pew 2026 (patients want to know when AI schedules visits, VERIFIED) and Fin's label. It must not become a warning banner (Tom's no-guardrail-talk rule). **TOM** if any wording beyond the label is wanted.
10. **Settings keeps Occasional / Off and the corner choice.** Demo mode defaults to Occasional.

Open tension to record, not resolve: the character research (Mailchimp: Freddie "does not talk") argues against a speaking bubble; Tom chose the monday-llama pattern, which speaks. Tom's direction wins. Rule 5 is the mitigation.

---

## 7. Sources

**Premium SaaS craft**
- https://linear.app/now/how-we-redesigned-the-linear-ui: LCH themes from 3 inputs, Inter Display headings, less blue chrome (VERIFIED)
- https://linear.app/now/behind-the-latest-design-refresh: dimmer sidebar, warmer grey, softer and fewer dividers (VERIFIED)
- https://linear.app/changelog/2026-03-12-ui-refresh: consistent headers (REPORTED)
- https://vercel.com/geist/typography: Heading, Label, Copy role families; tabular labels (VERIFIED)
- https://vercel.com/geist/colors: 10-step scales with fixed jobs (VERIFIED)
- https://vercel.com/geist/materials: 6/12/16 radii by elevation (VERIFIED)
- https://vercel.com/geist/badge: subtle badges on dense surfaces, no check or X icons (VERIFIED)
- https://vercel.com/design/guidelines: tabular-nums, layered shadows, motion and loader rules, states (VERIFIED)
- https://vercel.com/changelog/dashboard-navigation-redesign-rollout: sidebar navigation 2026 (REPORTED)
- https://stripe.com/blog/accessible-color-systems: CIELAB scales, badge one-level-up (VERIFIED)
- https://docs.stripe.com/stripe-apps/components/badge.md?app-sdk-version=9: six badge semantics (VERIFIED)
- https://docs.stripe.com/stripe-apps/patterns/chart-layout: answer first, fixed chart heights, sparklines (VERIFIED)
- https://docs.stripe.com/stripe-apps/patterns/empty-state: empty-state wording rules (VERIFIED)
- https://docs.stripe.com/stripe-apps/style: spacing 2/4/8/16/24/32/48 (VERIFIED)
- https://www.925studios.co/blog/stripe-dashboard-design-breakdown: colour for status only (REPORTED)
- https://www.925studios.co/blog/mercury-design-breakdown: no anxiety reds (REPORTED)
- https://github.com/mondaycom/vibe/blob/master/packages/style/src/typography.scss: Vibe type tokens (VERIFIED)
- https://github.com/mondaycom/vibe/blob/master/packages/style/src/themes/light-theme.scss: Vibe light colours and shadows (VERIFIED)
- https://posthog.com/handbook/brand/in-practice: display face for titles only, 1.5px icons, clarity over cleverness (VERIFIED)
- https://posthog.com/handbook/brand/visual-identity: no gradients (REPORTED)
- https://raycast.com/blog/a-fresh-look-and-feel: one icon stroke, action bar, Compact Mode (VERIFIED)
- https://attio.com/changelog/2026/changelog-august-25-2026: 16px icons and avatars (VERIFIED)
- https://attio.com/changelog/2026/changelog-january-14-2026: custom accent (VERIFIED)
- https://attio.com/changelog/2025/changelog-august-14-2025: record inputs (REPORTED)
- https://styles.refero.design/style/08c8700c-f278-42bc-812e-f60dc6ce996e: Attio Inter 500 (REPORTED, conflicting)
- https://front.com/blog/the-new-front-inbox: top bar removed, calmer colours (VERIFIED)
- https://community.front.com/product-q-a-45/like-this-post-if-you-want-the-old-version-back-2899: backlash (REPORTED)
- https://resend.com/changelog/enhanced-metrics-dashboard: metrics charts, hover, help icon (VERIFIED)
- https://resend.com/blog/rebranding-resend: glass and metal counter-example (VERIFIED)
- https://www.notion.com/blog/updating-the-design-of-notion-pages: neighbour-aware spacing (VERIFIED)
- https://cal.com/blog/calcom-v6-6: coss.com/ui rebuild (VERIFIED, dates conflict)
- https://www.shadcn.io/design/cal: Cal radii (REPORTED)
- https://www.shadcn.io/design/mercury: Mercury fonts (REPORTED)
- https://bakkenbaeck.com/case/ramp: Ramp bento grid (VERIFIED, no values)
- https://styles.refero.design/style/b38702a0-75ab-474c-9106-00b624535825: Ramp type and colour (REPORTED)
- https://read.cv/petrie: Plain merged views (REPORTED)
- https://www.intercom.com/changes/en/2394-an-all-new-intercom: 2018 redesign (VERIFIED, old)
- https://design.lattice.com/articles/redesigning-lattice-com: website only (VERIFIED)

**Type, colour, data**
- https://tailwindcss.com/docs/font-size: the 12/16 to 36/40 scale (VERIFIED)
- https://www.refactoringui.com/: chapter titles (VERIFIED)
- https://www.refactoringui.com/previews/building-your-color-palette: palette counts (VERIFIED)
- https://www.refactoringui.com/previews/labels-are-a-last-resort: fold labels into values (VERIFIED)
- https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886: text colours and weights (REPORTED, 403)
- https://atlassian.design/foundations/elevation: border for flat cards, shadow for overlays (VERIFIED)
- https://atlassian.design/foundations/spacing: 8px scale (VERIFIED)
- https://atlassian.design/foundations/motion/applying-motion: durations and easing (VERIFIED)
- https://atlassian.design/components/lozenge/usage: lozenge rules (VERIFIED)
- https://atlassian.design/foundations/illustrations: spots for empty, error, wins; icons first (VERIFIED)
- https://atlassian.design/resources/illustration-library/spot/: spots small, no people (REPORTED)
- https://carbondesignsystem.com/data-visualization/chart-anatomy/: big number, direct labels (VERIFIED)
- https://carbondesignsystem.com/data-visualization/axes-and-labels/: zero baseline, landmark labels (VERIFIED)
- https://carbondesignsystem.com/data-visualization/color-palettes/: status mapping (VERIFIED)
- https://carbondesignsystem.com/elements/motion/overview/: durations and curves (VERIFIED)
- https://www.nngroup.com/articles/clutter-charts/: no legend, no gridlines with labels (VERIFIED)
- https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric: tabular-nums (VERIFIED)
- https://en.wikipedia.org/wiki/Inter_(typeface): Inter tabular figures (REPORTED)
- https://alistapart.com/article/web-typography-tables/: table alignment and rules (VERIFIED)
- https://lucide.dev/contribute/icon-design-guide: icon grid and stroke (VERIFIED)
- https://guides.library.illinois.edu/visualize-your-data/bar-charts: one colour per single-series bar chart (REPORTED)
- https://substack.com/@nastengraph/note/c-131356012: bar gap 30–50% (REPORTED)
- https://v6.mui.com/x/react-charts/bars/: barGapRatio (REPORTED)
- https://playfairdata.com/data-ink-ratio-animation-and-how-to-apply-it-in-tableau: gridlines (REPORTED)
- https://think.design/?p=6943: KPIs at top-left (REPORTED)
- https://smithery.ai/skills/copyleftdev/google-material-design: Material 3 durations (REPORTED)

**Dental and ortho market**
- https://www.getweave.com/reports/: Weave phone analytics and call intelligence (VERIFIED)
- https://www.getweave.com/ai-receptionist/: "every dollar generated", multilingual "Coming soon" (VERIFIED)
- https://www.getweave.com/press-releases/weave-expands-enterprise-ready-platform-to-deliver-greater-security-ai-powered-automation-and-streamlined-front-office-workflows/: new vs existing (VERIFIED)
- https://www.getweave.com/use-cases/phones-for-dentists/: colour-coded calls (REPORTED)
- https://feedback.getweave.com/forums/952282-analytics/filters/new: missed-call complaints (REPORTED)
- https://feedback.getweave.com/forums/310747-desktop-app/suggestions/48240848-missed-call-reminder-feature: returned-call tracking request (REPORTED)
- https://lp.peerlogic.com/ai-built-for-dental: Est. Lifetime Value card (VERIFIED)
- https://www.peerlogic.com/post/peerlogic-dso-case-study: 4,280 calls, 62% answered, 25%/56% conversion (VERIFIED, vendor data)
- https://www.arini.ai/: 68% conversion graph, play controls (VERIFIED)
- https://www.savvyagents.ai/: "Booked by Ira" $11,420 (VERIFIED)
- https://softwarefinder.com/call-center/savvy-agents: ortho integrations (REPORTED)
- https://www.getviva.ai/: production from AI-scheduled appointments (VERIFIED)
- https://www.goodcall.com/: "what it's worth" tiles (VERIFIED)
- https://voicestack.com/resources/article/unlocking-missed-potential: opportunity dashboard (VERIFIED)
- https://mangovoice.com/support/dental-intelligence: Mango plus Dental Intelligence (REPORTED)
- https://www.dentally.com/en-gb/partners/mango-voice: Mango features (REPORTED)
- https://get.dentalintel.com/analytics/: KPI drill-down (VERIFIED)
- https://educate.dentalintel.com/en/articles/15623750-review-call-stats-in-the-ai-receptionist-dashboard: Dental Intelligence AI receptionist stats (VERIFIED)
- https://jarvisanalytics.com/: 50+ KPIs (VERIFIED)
- https://www.dentrixascend.com/dental-solutions/practice-data-and-analytics/: Insights dashboard (REPORTED)
- https://blog.dentrixascend.com/2021/02/16/tracking-your-kpis-to-see-amazing-growth/: KPI tracking (REPORTED)
- https://orthodonticproductsonline.com/practice-products/software/practice-management-software/you-have-your-reports-now-what/: Cloud 9 reports (REPORTED)
- https://www.orthotown.com/magazine/article/7601/product-profile-orthofi: OrthoFi dashboard (REPORTED)
- https://dentalproductsreport.com/view/new-orthofi-yes-optimizes-the-patient-intake-conversion-processes: OrthoFi conversion (REPORTED)
- https://www.g2.com/products/dialzara/discuss: Dialzara, no dashboard detail (REPORTED)
- https://docs.nexhealth.com/docs/whats-possible-with-nexhealth: NexHealth is an API layer (VERIFIED)
- https://lep.gov/node/396: Spanish 77% of Florida's limited-English population (VERIFIED, year unknown)
- https://www.curvedental.com/dental-blog/what-your-dental-kpi-dashboard-should-actually-show: 5–7 KPIs, vanity metrics (VERIFIED)
- https://www.g2.com/products/dentrix: "feels outdated" (REPORTED)
- https://www.capterra.com/p/2329/Dentrix/reviews/?page=4: XP/Win7 feel (REPORTED)

**Demo craft**
- https://www.skmurphy.com/blog/2014/02/20/improve-your-sales-pitch/: Cohan, present the end result first (VERIFIED)
- https://www.gong.io/blog/sales-demos: 76 s pitch limit, best part first (VERIFIED)
- https://www.gong.io/blog/product-demo: 9-minute rule, next steps (VERIFIED)
- https://review.firstround.com/your-product-demos-suck-because-theyre-focused-on-your-product/: result first, start macro (VERIFIED)
- https://www.presalescollective.com/content/the-1-most-important-foundational-demo-technique-on-the-planet-tell-show-tell: Tell-Show-Tell (VERIFIED)
- https://echai.ventures/startingup/founder-sales/when-my-product-is-technical-and-i-am-selling-to-non-technical-buyers-how-do-i-demo-it-without-confusing-them: non-technical buyers (VERIFIED summary page)
- https://www.guideflow.com/blog/sales-engineering-demo-best-practices: aha early (REPORTED)
- https://www.demostack.com/post/demo-environment: realistic sized data (VERIFIED)
- https://supademo.com/blog/dummy-data: names, imperfections, refresh (VERIFIED)
- https://github.com/SFDC-Assets/Demo-Date-Shifter: date shifting (REPORTED)
- https://learn.microsoft.com/en-us/power-platform/admin/configure-date-settings-for-demo-data: date shifting (REPORTED)
- https://trailhead.salesforce.com/content/learn/modules/demo-storytelling-public: persona story (REPORTED)
- https://saleo.io/how-to-script-the-best-demo-story/: story arc (REPORTED)
- https://www.guideflow.com/blog/sales-demo-storytelling: story arc (REPORTED)
- https://docs.navattic.com/help/best-practices.md: 5–13 steps, 25–30 words (VERIFIED)
- https://www.navattic.com/report/state-of-the-interactive-product-demo-2023: shorter first sections (REPORTED)
- https://www.excelcampus.com/tips/screen-sharing/: an effective 1280x720 share (VERIFIED)
- https://support.livestorm.co/article/93-best-practices-screen-sharing: resize then zoom (REPORTED)
- https://mitchellhamline.edu/technology/knowledge-base/stream-a-video-clip-in-zoom: Zoom video-clip setting (REPORTED)
- https://community.zoom.com/meetings-2/zoom-sharing-portion-of-the-screen-as-presenter-participants-see-slides-as-blurry-16090: blurry shares (REPORTED)
- https://thesweetsetup.com/mousepose-better-live-software-demos/: cursor highlight (REPORTED)
- https://help.webex.com/en-us/article/WBX53784/: Webex scaling (REPORTED)
- https://www.revenuewell.com/dental-ai-receptionist: public live demo line (VERIFIED)
- https://www.prospectup.ai/features/voice-ai-demos: live on-screen call sequence (VERIFIED, vendor)
- https://phonevoice.ai/demo: live transcript plus failure state (VERIFIED)
- https://callingly.com/demo: scenario demo calls (VERIFIED)
- https://telavox.co.uk/demo-ai-receptionist/: test-number demo (VERIFIED)
- https://www.gong.io/resources/guides/demo-cheat-sheet: gated, not read

**Character, delight, agent transcripts**
- https://styleguide.mailchimp.com/voice-and-tone/: Freddie does not talk; dry humour (VERIFIED)
- https://www.creativereview.co.uk/mailchimp-on-playfulness/: playfulness only at anxious, not frustrating, moments (VERIFIED)
- https://mailchimp.com/en/design/: space around Freddie (VERIFIED)
- https://asana.com/inside-asana/new-celebrations.md: occasional celebrations (VERIFIED)
- https://asana.com/nl/inside-asana/new-celebrations-meet-the-yeti: celebrations (VERIFIED)
- https://www.zapier.com/blog/asana-celebrations: flight path (REPORTED)
- https://blog.duolingo.com/shape-language-duolingos-art-style/: few shapes, clear silhouette (VERIFIED)
- https://design.duolingo.com/illustration/characters: construction rules (REPORTED, redirects)
- https://slack.design/?p=19338: objects in product, people in marketing (VERIFIED)
- https://www.byalicelee.com/slack: product art quieter (VERIFIED)
- https://linear.app/blog/how-we-redesigned-the-linear-ui: restraint (VERIFIED)
- https://itbrief.com.au/story/monday-com-launches-playful-ai-campaign-to-combat-workplace-angst: llama campaign (REPORTED)
- https://campaignbrief.com/?p=302795: llama campaign (REPORTED)
- https://library.motionapp.com/monday-com: llama reassurance (REPORTED)
- https://movingbrands.com/work/vanta/: "expert but with a wink" (VERIFIED)
- https://www.notion.com/ja/blog/the-thinking-behind-our-latest-brand-campaign: Notion illustration (REPORTED)
- https://www.itsnicethat.com/articles/roman-muradov-200616: Notion illustration (REPORTED)
- https://www.ebaqdesign.com/blog/brand-illustration: Headspace (REPORTED)
- https://simplified.com/blog/branding/10-examples-of-illustration-inspiration-in-branding: Headspace (REPORTED)
- https://link.springer.com/article/10.1007/s41449-025-00481-6: anthropomorphism can reduce trust in task settings (REPORTED)
- https://aisel.aisnet.org/ecis2021_rp/12: anthropomorphism after chatbot failure (REPORTED)
- https://arxiv.org/pdf/2512.17898: humanlike design and competence (REPORTED)
- https://blogs.sas.com/content/sgf/2019/05/29/what-can-we-learn-from-clippy-about-ai/: Clippy (REPORTED, site down)
- https://www.bankinfosecurity.com/survey-patients-want-disclosure-on-ai-use-in-healthcare-a-32713: Pew 2026 AI disclosure (VERIFIED)
- https://www.santelog.com/actualites-sante-nasdaq/new-research-reveals-patient-frustrations-ai-when-patients-call-they-want: 90% prefer a human (REPORTED, vendor)
- https://www.drbicuspid.com/dental-business/industry-updates/article/15705983/weave-launches-call-intelligence: Weave call intelligence (REPORTED)
- https://adanews.ada.org/ada-news/2026/march/ada-member-advantage-endorses-weave-as-patient-engagement-platform/: ADA endorses Weave (REPORTED)
- https://www.intercom.com/help/en/articles/9794969-set-up-fin-ai-agent-identity: Fin label under each message (VERIFIED)
- https://www.intercom.com/solutions/technology: Fin handoff (REPORTED)
- https://docs.poly.ai/call-data/studio-transcripts: timestamped transcript, audio, tool toggles (VERIFIED)
- https://docs.bland.ai/tutorials/call-logs: click-to-seek, citations, outcomes (VERIFIED)
- https://sierra.ai/blog/agent-traces: traces, simplified reasoning view (VERIFIED)
- https://community.retellai.com/t/lesson-21-call-analysis-post-call-insights/2939: outcome, transcript, summary (VERIFIED)
- https://docs.ada.cx/docs/optimization/conversations: step trace and tool rows (VERIFIED)
- https://decagon.ai/modules/watchtower-qa: flag rules (VERIFIED, no visuals)
- https://help.sipgate.com/documentation/en/post-processing/summaries-and-transcripts.md: summary plus transcript per call (VERIFIED)

**Local files read for this file**
- `docs/screenshots/final/{overview,overview-live,overview-booking,calls,calls-drawer,callbacks,bookings,texts,settings}-1440x900.png`
- `src/styles/global.css`, `src/shell/Shell.module.css`, `src/pages/overview/overview.module.css`, `src/components/{Card,Drawer,Lines,RowLink,Skeletons,StatusChip}.module.css`, `src/pages/calls/CallDrawer.module.css`, `src/pages/lists/ListTable.module.css`
- `docs/DESIGN.md` §1–4
- `node_modules/@vibe/core/dist/tokens/tokens.css`
