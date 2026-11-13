# Glass skin (Tom's direction, 2026-10-26)

Tom: "I want the whole UI to be glassy." Reference: `docs/research/glassy-reference/` (the cover frame of the reel he
sent, code.xr's "Glassy Dashboard V4"). This file supersedes DESIGN.md wherever the two disagree: the brief's bans on
glassmorphism, blur, shadows on cards and icon tiles are lifted for this skin. Everything else in DESIGN.md stands:
the pages, the widgets, the data rules, the receptionist copy, no fake numbers, no welcome banner, Katie's occasional
behaviour, the demo menu, the 1280x800 minimum.

> **Read section 8 first: it is the shipped state** (the second pass, "the room", 2026-10-26, with its as-built notes
> in 8.10, the review changes in 8.11 and the polish after review in 8.13). Sections 2, 3 (3.1 and 3.2), 5 and 6 are superseded wherever section 8 says
> otherwise: the room photo replaces the gradient and blobs, the slab is pulled in to the inset ladder and blurred,
> the three env shapes are now glass objects, and 6's checklist is replaced by 8.9. Sections 1 to 7 stand for
> everything 8 leaves alone. The consolidated review of the second pass is `docs/review/glass-v2-review.md`; the
> measured evidence is `docs/VERIFICATION.md`, `docs/perf/contrast.json` and `docs/screenshots/glass-v2/`.

## 1. What the reference does (and what we take from it)

| In the reference | We do |
|---|---|
| A bright, cool blue-white environment (blurred glass building, plants) behind everything | A fixed CSS environment: a cool gradient plus five soft colour blobs and three large translucent glass shapes, no photo, no asset |
| One big frosted glass slab holding the whole app, floating with a margin, bevelled light edges, soft blue shadow | The app frame is one slab, 20 px from the viewport edges (16 / 12 on shorter screens), radius 24, a dense light tint (no backdrop blur, see 7), white edge highlight, a faint blue ring, blue-tinted shadow |
| Whiter translucent cards inside the slab, 1 px white border, 16 px radius, faint shadow | Same, on every Card, the drawer, menus, Katie's bubble |
| Sidebar inside the slab, active item a solid blue pill with white text and icon | Same |
| Stat cards with a small pastel icon tile, a bold number and a green delta | Four separate KPI cards with icon tiles; the comparison line is real ("+5 vs yesterday") or absent |
| Dark navy type, bold numbers, grey labels | Ink #0f172a, numbers 700, labels #64748b |
| Pastel pill chips, blue area chart, donut, avatars | Pastel pill chips; our bar chart on a faint grid; no donut, no avatars, no "Welcome back" |
| Floating 3D glass icon cubes around the slab | Not icons: three abstract glass shapes in the environment, mostly off-screen |

## 2. Tokens (`src/styles/glass.css`, loaded after the Vibe tokens; it redefines the Vibe variables the modules use)

```
:root {
  /* ink */
  --primary-text-color: #0f172a;  --secondary-text-color: #56667d;  --icon-color: #64748b;  /* secondary: measured, see glass.css */
  /* accent */
  --primary-color: #2563eb;  --primary-hover-color: #1d4ed8;  --primary-selected-color: #dbeafe;
  --primary-highlighted-color: #eff6ff;  --primary-background-hover-color: rgba(255,255,255,.55);
  /* status */
  --positive-color: #16a34a;  --positive-color-hover: #15803d;  --negative-color: #ef4444;  --warning-color: #f59e0b;
  --chip-positive-bg: #dcfce7;  --chip-primary-bg: #dbeafe;  --chip-live-bg: #ffedd5;  --chip-live-ink: #c2410c;  --chip-neutral-bg: #f1f5f9;  --chip-neutral-ink: #475569;
  /* glass */
  --env-base: linear-gradient(160deg, #e9f1ff 0%, #f6f9ff 45%, #e6f0fb 100%);
  --glass-slab: rgba(240,247,255,.78);   /* was .55 + blur 28; no backdrop-filter on the slab (7, H1) */
  --glass-slab-ring: rgba(30,64,175,.12); --env-shape-blur: 14px;   --env-edge: rgba(52,92,178,.55);
  --glass-card: rgba(255,255,255,.62);   --glass-card-blur: 20px;
  --glass-strong: rgba(255,255,255,.80); /* drawer, menus, bubble */
  --glass-edge: rgba(255,255,255,.80);   --glass-edge-soft: rgba(255,255,255,.55);
  --glass-rule: rgba(15,23,42,.07);      /* table rules, hairlines */
  --glass-shadow-card: 0 8px 24px rgba(30,64,175,.08);
  --glass-shadow-slab: 0 24px 60px rgba(30,64,175,.14);
  --glass-shadow-float: 0 24px 60px rgba(30,64,175,.18);
  --glass-highlight: inset 0 1px 0 rgba(255,255,255,.9);
  --nav-pill-shadow: 0 6px 16px rgba(37,99,235,.35);
  --radius-slab: 24px;  --radius-card: 16px;  --radius-pill: 999px;  --radius-tile: 10px;
  /* KPI icon tiles */
  --tile-blue-bg: #dbeafe;  --tile-blue: #2563eb;  --tile-purple-bg: #ede9fe;  --tile-purple: #7c3aed;
  --tile-green-bg: #dcfce7; --tile-green: #16a34a; --tile-orange-bg: #ffedd5; --tile-orange: #ea580c;
}
```

Figtree stays, with weight 700 added to the Google Fonts link. Type sizes stay 12/14/16/20 plus 28 for KPI numbers
(was 32; the cards are narrower now) and 13 in Katie's bubble.

## 3. Layers, back to front

1. **Environment** (`body::before` or a fixed `div.env`): `--env-base`, then five radial blobs (sky `#bfdbfe` 55% top-left,
   lavender `#ddd6fe` 40% right-middle, white 70% top-centre, mint `#ccfbf1` 25% bottom-left, a small warm `#fde68a` 12%
   bottom-right). Three glass shapes (`div.env-shape`): large rounded rectangles / circles, `rgba(255,255,255,.18)` fill,
   1 px `--glass-edge-soft` border, a still `filter: blur(var(--env-shape-blur))` (not backdrop-filter), soft shadow, placed
   partly off-screen (top-right, left middle, bottom-right), `pointer-events: none`. They never move (no float animation).
   A mid-blue band deepens the environment toward the viewport edges (`box-shadow: inset 0 0 110px 28px var(--env-edge)`
   on `.env`), so the slab's edge and shadow read against it; the area under the slab stays light.
2. **Slab** (`div.slab`, the app frame): `position: fixed; inset: 20px` (16 px up to 920 high; 12 px up to 820 high and
   below 1280 wide), `border-radius: 24px`, `background: var(--glass-slab)` and no backdrop-filter, `border: 1px solid
   var(--glass-edge)`, `box-shadow: 0 0 0 1px var(--glass-slab-ring), var(--glass-shadow-slab), var(--glass-highlight),
   inset 0 -1px 0 rgba(255,255,255,.35)`,
   `overflow: hidden`. The rail, the top bar and the scrolling content live inside it; the content scrolls inside the slab,
   not the window.
3. **Rail** (inside the slab, transparent, 240 wide, right edge `1px solid var(--glass-rule)`): wordmark row = Katie's
   24 px head + "Katie" 16/700; practice name 14/500 ink. Nav items 44 high, radius 12, 14/500; inactive text `#334155`,
   icon `--icon-color`; hover `rgba(255,255,255,.5)`; **active = solid `--primary-color` pill, white text and icon,
   `--nav-pill-shadow`**. The count on Callbacks stays, white on the active pill.
4. **Top bar** (transparent, bottom `1px solid var(--glass-rule)`): title 20/700, date 14 secondary. Right-hand controls sit
   in glass pills (height 36, `--glass-card`, blur, radius 999, border `--glass-edge`): the Demo control, the Show numbers
   toggle with its label, and the Katie head button as a 36 px glass circle.
5. **Cards** (`Card.module.css .card`): `background: var(--glass-card)`, `backdrop-filter: blur(var(--glass-card-blur))`,
   `border: 1px solid var(--glass-edge)`, `box-shadow: var(--glass-shadow-card), var(--glass-highlight)`, radius 16. Card
   headers keep their rule but in `--glass-rule`. Inner rows use `--glass-rule`. Row hover `rgba(255,255,255,.55)`.
6. **Floating** (drawer, Vibe menus and tooltips, Katie's bubble): `--glass-strong`, blur 28 (bubble 16), border
   `--glass-edge`, `--glass-shadow-float`. The drawer floats inside the slab: top/bottom/right inset 12 px, radius 20,
   width 560. Nothing else changes in the drawer.
7. **Katie** stands on the slab's inner bottom edge, not the viewport bottom: the stage reads the floor and her home
   corner from the slab element (`[data-katie-floor]`), everything else in `moments.ts` / `director.ts` is unchanged.

## 4. Widgets

- **Overview top row**: the Line tile stays a card (cols 1–4). The four numbers become **four separate cards** (cols 5–6,
  7–8, 9–10, 11–12): a 36 px icon tile (radius 10) top-left, the label 12/500 secondary beside it, the number 28/700 ink
  (32 line, 4 above) tabular below, then the fact line 12 secondary, then the comparison line when real: `↑ +5 vs yesterday` in
  `--positive-color` 12/600, `↓ −3 vs yesterday` in secondary (never red: fewer callbacks is good, fewer calls is not a
  fault), nothing when equal or unknown. Tiles: Calls answered = `Mobile` icon on blue, Appointments booked = `Calendar`
  on purple, New-patient consults = `Person` on green, Callbacks waiting = `Reply` on orange. At 1280 (cards 136 wide)
  the tile is 24 px (radius 8, 16 px icon) and the label stays beside it on two lines; the number never wraps.
- **Calls by hour**: bars `--primary-color` with 4 px top radius, no-booking segment `#bfdbfe`; three faint horizontal
  gridlines `--glass-rule`; axis labels 12 secondary with the landmark hours 600; the Now rule `--primary-color` at 50%;
  hover tooltip as a small glass card. Legend as two tiny pills (height 20, padding 0 8, radius 999, `--chip-neutral-bg`).
- **Tables / lists**: unchanged structure; header 12/500 secondary; rows 44; rules `--glass-rule`; names 14/600 ink.
- **Chips**: pill (radius 999), 12/600, height 22, padding 0 10: Booked `--chip-positive-bg`/`--positive-color-hover`,
  Callback `--chip-primary-bg`/`--primary-hover-color`, Live `--chip-live-bg`/`--chip-live-ink`, No booking
  `--chip-neutral-bg`/`--chip-neutral-ink`, FYI like neutral; **Urgent stays solid** `--negative-color` with white text.
- **Empty states**: dashed 1 px `rgba(37,99,235,.25)` on `rgba(255,255,255,.35)`, radius 12.
- **Skeletons**: `rgba(15,23,42,.06)` bars; same sizes as before.
- **Settings**: the one card, glass; controls unchanged.
- **Segmented choices** (the Calls range in the top bar, Settings' Katie and corner choices): one glass pill (36 high,
  `--glass-card`, `--glass-edge` border, radius 999, no blur), segments 30 high, radius 999, the chosen one
  `--primary-selected-color` with ink text 600.
- **Demo menu**: a glass menu.

## 5. Rules that keep it fast and readable

- `backdrop-filter` only on: cards (there are at most ten on a page), the drawer, menus, Katie's bubble. Never on the slab
  or the environment shapes (7, H1), rows, chips, buttons, tiles or text. Katie's walk must stay at 60 fps with no task
  over 50 ms; if the trace shows jank, lower the card blur to 12 px before anything else.
- Text contrast on glass: ink on `--glass-card` over the brightest blob must stay ≥ 7:1 for 14 px text and secondary text
  ≥ 4.5:1 (measure on the rendered page, not the token).
- `@supports not (backdrop-filter: blur(1px))`: cards `rgba(255,255,255,.9)`, slab `rgba(240,247,255,.92)`.
- `@media (prefers-reduced-transparency: reduce)`: the same opaque fallbacks.
- No gradients on text, no glow, no neon, no animated blobs, no pulsing. The only gradient is the environment base.
- No hex outside `glass.css` and `src/katie/**`; the modules use the tokens above.
- Print nothing new in the console; Lighthouse accessibility stays 100.

## 6. What to check with the reference open

Side by side with `docs/research/glassy-reference/02-dashboard-crop.jpg`: the slab's edge light and shadow, the card
whiteness against the slab, the active nav pill, the stat-card tile/label/number arrangement, the chip pastels, the
overall brightness (cool, bright, airy; never grey, never dark). Ours must read as the same family at a glance, with our
own content and no copied layout.

## 7. Changes after the glass review (2026-10-26, `docs/review/glass-review.md`)

- **H1, Katie's walk**: with software rendering the slab's full-viewport `backdrop-filter` held her walk at 33.7 fps
  (74 frames over 20 ms). The slab now has no backdrop-filter: its tint is denser (.78) and the three environment shapes
  carry a still `filter: blur(14px)` instead of their own backdrop-filter. Same harness after: 60.0 fps, 0 frames over
  20 ms (software and Metal); the verifier's 8-tween trace: 59.8 fps, longest main-thread task 1.4 ms.
- **M1, scrolling**: the content still scrolls inside the slab; `src/shell/useContentScroll.ts` hands it the wheel over
  the rail, the top bar and the margin, and the scroll keys when focus is on the page, a rail link or the top bar. It
  never moves focus.
- **M2, the fold**: the slab's inset is 16 up to 920 high and 12 up to 820 high; the KPI number sits 4 below the head on
  a 32 line; at 1280 the label stays beside a 24 px tile. Latest calls rows above the fold: 1280x800 5, 1440x900 7,
  1280x720 3 (as before the glass skin). DESIGN.md's Vertical budget has the new table.
- **M3, the environment**: the mid-blue edge band (`--env-edge`) and the slab's faint outer ring. Sampled at 1440x900:
  margin about #afc1e5 (reference #a1b7d9), slab #f0f7ff, cards #f8faff. Secondary text measured 4.81:1 at its worst
  ("Made by SAIDA", 1280x800) with `--secondary-text-color: #56667d`; ink at least 14.6:1.
- **L1**: the KPI label is 12/500 (13 stays only in Katie's bubble). **L2**: segmented choices are glass pills (4).
  **L3**: the chart legend is two 20 px neutral pills.

## 8. The room: the second pass (2026-10-26, Tom's call)

Side by side with the reel, the first pass read as a pale dashboard with a blue frame, not as glass: nothing was behind
the glass to see through, the slab had no blur, and it filled about 96% of the viewport. Tom chose this rebuild knowing
it costs rows above the fold. Where this section differs from 2, 3.1, 3.2, 5 and 6, this section wins.

### 8.1 Environment: a room, not a gradient

- `.env` paints `src/assets/scene.webp` (1664 x 1024, 10,870 bytes since 8.11; 25 KB before the re-grade): a locally generated, out-of-focus office in blue and
  white, no people, no text (FLUX.2 klein through Draw Things; the source PNG and its prompt/seed sidecar are in
  `docs/research/glassy-reference/scene/`). Its blacks are lifted to a navy floor (rgb 14, 28, 64) and it is softened
  (Gaussian 10 px at 1664 wide) so no detail survives; the darkest 8 x 8 block is about rgb(16, 33, 77). **8.11:** then
  graded to a day room, each channel mapped linearly from 0-255 to rgb(140, 162, 202)-rgb(242, 246, 253).
  **8.13:** re-graded from the source once more so the windows, the plant and the floor read: Gaussian 6 px, each
  channel 0-255 to rgb(78, 96, 138)-rgb(240, 246, 254), 18,078 bytes; the darkest 1/64 block is about rgb(79, 100, 146).
- `.env { background: radial-gradient(42% 55% at 90% 4%, rgba(255,255,255,.26), rgba(255,255,255,0) 70%),
  url(../assets/scene.webp) center / cover no-repeat #8ba5cb; box-shadow: inset 0 0 140px 24px rgba(8, 22, 60, .12) }`
  (8.11: were `#16305e` and `.5`). The url goes through Vite (relative to glass.css), so the file is hashed into the build.
  `body { background: #8ba5cb }` (8.11: the room's margin mean)
  so nothing white flashes before the image paints. The five blobs, `--env-base` and `--env-edge` go.

### 8.2 The slab, pulled in and blurred

- `--slab-inset: 40px`; 48 at `(min-width: 1440px) and (min-height: 900px)`; 64 at `(min-width: 1920px) and
  (min-height: 1080px)`; 28 at `(max-width: 1279px), (max-height: 799px)`. `--float-inset` keeps its form.
- `--glass-slab: rgba(238, 245, 255, 0.72)`; `.slab { -webkit-backdrop-filter: blur(28px) saturate(1.25);
  backdrop-filter: blur(28px) saturate(1.25) }`; `border: 1.5px solid rgba(255,255,255,.88)`; `box-shadow:
  0 40px 90px rgba(6, 20, 60, .45), 0 0 0 1px rgba(255,255,255,.3), inset 0 1px 0 rgba(255,255,255,.95),
  inset 0 -1px 0 rgba(255,255,255,.4)`. `--glass-slab-ring` and `--env-shape-blur` go.
- `.rim`, a sibling right after the slab in `Shell.tsx`, `aria-hidden`: `position: fixed; inset: var(--slab-inset);
  z-index: 2; pointer-events: none; border-radius: var(--radius-slab); box-sizing: border-box`. It draws the bright
  glass edge: (a) a 2 px gradient border through the mask trick (`padding: 2px; background: linear-gradient(135deg,
  rgba(255,255,255,.98) 0%, rgba(255,255,255,.4) 28%, rgba(255,255,255,.14) 52%, rgba(255,255,255,.7) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude`), and (b) the inner
  edge light, `.rim::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0
  36px rgba(255,255,255,.22), inset 0 1px 0 rgba(255,255,255,.9) }`. No diagonal white sheet across the content: over
  the nav pill it would take white-on-blue under 4.5:1. **8.13:** the gradient ring is now `.rim::before` at 4 px,
  and the bevel (a 6 px inner band, a faint blue line, the inner light) sits on `.rim` itself, unmasked: the mask on
  `.rim` had clipped the old `::after` light to the 2 px ring, so it never showed.

### 8.3 Cards and ink

- `--glass-card: rgba(255,255,255,.72)`, `--glass-card-blur: 16px` with `saturate(1.1)`; `--glass-strong:
  rgba(255,255,255,.84)`; `--glass-rule: rgba(15,23,42,.08)`; `--glass-shadow-card: 0 10px 30px rgba(6,20,60,.10)`;
  `--glass-shadow-float: 0 30px 70px rgba(6,20,60,.28)`.
- Ink stays `#0f172a`. `--secondary-text-color: #334155` (the slab over the room's darkest block computes to about
  L 0.48; #334155 is about 5.2:1 there, #475569 about 3.8:1). `--nav-ink: #1e293b`; `--icon-color: #475569`. Chips
  unchanged. Measure, do not trust the estimate: the contrast probe samples each secondary text's rendered background
  at 1280 x 800 and 1440 x 900, demo day and empty state, and the worst case must be at least 4.5:1.

### 8.4 Three glass objects

The three `.env-shape`s become glass objects. `.glass-object { box-sizing: border-box; display: grid; place-items:
center; border-radius: 28%; background: linear-gradient(145deg, rgba(255,255,255,.66), rgba(219,234,254,.4) 55%,
rgba(255,255,255,.55)); border: 1.5px solid rgba(255,255,255,.92); box-shadow: 0 30px 60px rgba(6,20,60,.35), inset 0
1px 0 rgba(255,255,255,.95), inset 0 -12px 28px rgba(37,99,235,.14); -webkit-backdrop-filter: blur(12px) saturate(1.3);
backdrop-filter: blur(12px) saturate(1.3); pointer-events: none }`, holding one Vibe icon at 52% of the box (8.11: was 46%), `color:
#2563eb`, `filter: drop-shadow(0 8px 12px rgba(37,99,235,.35))`. **8.13:** border 2 px, a 4 px inner band, a near shadow, a
deeper bottom glow, the icon at 54% and a .7 stroke on its path (thickness; the values are in 8.13).

- **Superseded by 8.11** (sizes and places of A, B and C). A, behind the slab (inside `.env`, `position: absolute`): `Mobile`, 112 px, `top: calc(var(--slab-inset) - 34px);
  right: calc(var(--slab-inset) - 46px); transform: rotate(-12deg)`.
- B, behind the slab (inside `.env`): `Calendar`, 96 px, `left: calc(var(--slab-inset) - 44px); top: 50%; transform:
  translateY(-50%) rotate(10deg)`.
- C, in front of the slab: `Check` (`Reply` if Vibe has no Check), 80 px, its own fixed element after `.rim`,
  `z-index: 3; left: calc(var(--slab-inset) - 40px); bottom: calc(var(--slab-inset) - 40px); transform: rotate(-8deg)`:
  centred on the slab's bottom-left corner, 20 px of it over the rounded corner, never over "Made by SAIDA" (which
  starts 24 px in). Katie's layer (z 50) stays above it.

A and B show through the slab blurred where it covers them and sharp outside it: the see-through proof. C over the edge
is the depth proof. Below 1024 wide none of the three renders.

### 8.5 Entrance: tilt in, settle flat

`@keyframes slab-in { from { opacity: .5 (8.11: was 0); transform: perspective(1600px) rotateX(6deg) rotateY(-4deg) translateY(18px)
scale(.98) } to { opacity: 1; transform: none } }`, 900 ms `cubic-bezier(.22, .8, .26, 1)`, fill `both`,
`transform-origin: 50% 60%`, on `.slab`, `.rim` and object C, once per page load (they are mounted once by the shell,
never on a route change). Under `prefers-reduced-motion: reduce` there is no animation. Katie's layer is a sibling with
the slab's inset, so it needs nothing, but her first measurement must come after the slab settles: the stage waits for
`[data-katie-floor]`'s animations (`element.getAnimations()`, their `finished` promises) before the first placement, and
`verify.mjs` waits for `document.getAnimations().length === 0` before any geometry read or screenshot.

### 8.6 Fallbacks

`@supports not (backdrop-filter)`: slab `.93`, cards `.92`, strong `.96`, the objects' blur off and their fill `.85`.
`prefers-reduced-transparency: reduce`: the same.

### 8.7 The fold: the new budget (accepted)

Expected at `?mock=demo`: slab 40 to 760 at 1280 x 800, 48 to 852 at 1440 x 900, 28 to 692 at 1280 x 720. Latest-calls
rows wholly above the fold: at least 4 at 1280 x 800, 5 at 1440 x 900, 2 at 1280 x 720. The measured numbers go into
VERIFICATION.md and into verify.mjs's expectations. The content's 40 px top padding stays (Katie's head on the top row).

### 8.8 Performance

The slab blur is back by Tom's decision; 5's rule against it is withdrawn for the slab. Measure the Katie walk in
headless Chromium as before and record it; it will come in under the flat build's number in software rendering, which
is not the demo machine. What gates shipping is the walk in a GPU browser, measured by hand in the app's browser pane:
at least 58 fps, no task over 50 ms. If software rendering drops under 30 fps, reduce `--glass-card-blur` to 12 and
drop the objects' backdrop-filter first; the slab keeps its blur.

### 8.9 What to check with the reel open (replaces 6)

Side by side with `02-dashboard-crop.jpg` at 1440 x 900: the room visible around the slab on all four sides, darker and
busier than the slab; the slab reading as a lighter pane *of the room* (cooler on the left, brighter on the right,
following the windows); the cards whiter than the slab; a bright edge all round; the two objects behind the glass
blurred where the slab covers them and sharp outside it; the one in front over the corner; the nav pill, tiles and chips
as in 4. Ours must look like a sheet of glass standing in the same room, at a glance, with our own layout.

### 8.10 As built (2026-10-26)

Where the build differs from 8.1 to 8.8, and why. Measured numbers: `docs/VERIFICATION.md` (the fold table) and
`docs/perf/contrast.json` (`node scripts/contrast-probe.mjs`).

- **C's position** (superseded by 8.11): `left / bottom: calc(var(--slab-inset) - 56px)`, not `- 40px`. At 40 its box reached 40 px into the
  slab and covered the "M" of "Made by SAIDA" (which starts 25.5 px in, past the 1.5 px border); at 56 its centre sits
  16 px outside the corner, 24 px of it reaches over the rounded corner and it ends left of the text.
- **Entrance fill `backwards`**, not `both`: the end state is the elements' own style (opacity 1, no transform), so it
  looks the same; with `both` a finished animation stays in `document.getAnimations()` forever and the verifier's "no
  animations left" could never hold.
- **C's tilt** is the individual `rotate` property, so the entrance's `transform` composes with it.
- **The fold at 1280 x 800** (the 1440 part superseded by 8.11): with the 40 px margin the top row (138) left the fourth Latest calls row 7.5 px under the
  fold. The narrow KPI card (container under 155 px) now pads its cell 10 x 8 (was 14 x 8), and its 24 px tile actually
  applies: the container rule sat before the base `.kpiTile` rule, so the tile had stayed 36 inside narrow cards. The top
  row is 126 at 1280 and 1440. Below 1440 wide the grid's column gap is 16 (row gap stays 24, the Katie rule), so a KPI
  card stays about 136 wide at 1280 and "Appointments" fits beside its tile. Result: 4 rows at 1280 x 800, 6 at
  1440 x 900, 2 at 1280 x 720.
- **Reduced transparency** also turns off the slab's and the cards' blur (the fills are near-opaque then anyway).
- **Contrast**: the tokens of 8.3 held; nothing was darkened. Worst cases are in VERIFICATION.md's glass notes.
- **Software rendering at device scale 2** drops the slab's backdrop blur in headless Chromium (object A shows crisp
  through the slab); at scale 1, and at scale 2 with the Metal GPU, the blur renders. The demo Mac renders with the GPU.
- **Performance (8.8)**: the verifier's perf step (headless Chromium, software rendering, 1440 x 900, 8 tweens): 32.2 fps,
  frames at 33.3 ms, longest main-thread task 3.0 ms in the tweens and 4.2 ms in the whole trace. That is above the
  30 fps line, so `--glass-card-blur` stays 16 and the objects keep their blur. The same walk in headless Chromium with
  the Metal GPU: 60.0 fps at device scale 1 and 2, no frame over 20 ms. The gate (a GPU browser by hand, at least 58 fps,
  no task over 50 ms) is still Tom's to run in the app's browser pane.

### 8.11 Changes after review (round 1, 2026-10-26)

From `docs/review/glass-v2-review-round1.md` (viewer score 3.5: a night room, and objects that read as clipped blank
tiles). Numbers measured with Playwright (headless Chromium, device scale 1, after `document.getAnimations()` is empty)
on `?mock=demo`; the "before" numbers are the reviewer's.

- **The room is a day room (R1-H1).** `scene.webp` re-graded: each channel mapped linearly from 0-255 to rgb(140, 162,
  202)-rgb(242, 246, 253) (sharp `linear`, webp q72, 10,870 bytes; the image mean went from rgb(118, 149, 181) to rgb(187, 211,
  238)). The vignette drops from `.5` to `.12`; `html, body` and the image's fallback color go from `#16305e` to
  `#8ba5cb`. Slab, rim, shadow and tokens unchanged. Mean colors at 1440 x 900, before -> after: left margin #142e59 ->
  #7c98c1, top #263d69 -> #90aad2, right #2e5188 -> #89a6cc, bottom #496586 -> #8299b6; the slab's empty rail #b8d0e0 ->
  #d7e9fa, the content gap under the top row #cbd7e9 -> #dfebfb; cards #f6f9fc -> #f8fbff (reference: margins #99b1cd to
  #a8c0e3, slab #e4ecfd). Contrast went up everywhere on the slab (`node scripts/contrast-probe.mjs`): secondary on the
  slab 5.34 -> 7.36 (worst "Made by SAIDA", 1440 x 900), ink on the slab 9.23 -> 13.35, inactive nav 5.71 -> 7.99 (the
  rail count), nav icons 3.84 -> 5.51; chips 4.57 and the nav pill 5.17 unchanged.
- **The objects sit at the slab's corners, glyphs whole and sharp (R1-H2).** On a straight edge the 48 px margin is
  narrower than a glyph, so a glyph straddling an edge is always half blurred away; the corners are the only place a
  glyph fits beside the slab. Sizes and places follow the inset (`--slab-inset`), so they hold at every size:
  - A (`Mobile`): `calc(56px + inset * 1.17)` (89 / 103 / 112 / 131 at the 28 / 40 / 48 / 64 insets), its centre
    `--obj-d = (inset - 28px) * .6` outside the slab's top-right corner point on the diagonal (`top` and `right:
    calc(inset - --obj-d - size / 2)`), `rotate(-12deg)`.
  - B (`Calendar`): moved from the left edge to the slab's **bottom-right** corner, the same way, `calc(48px + inset)`
    (76 / 88 / 96 / 112), `rotate(10deg)`. The reference's three visible cubes sit at its top-right, bottom-left and
    bottom-right corners.
  - C (`Check`): `min(72px, inset * 1.4)` (39 / 56 / 67 / 72), `left` and `bottom: calc(size * .07 + 1px)` (the overhang
    of the -8deg turn), so it is whole inside the viewport's bottom-left corner, over the slab's rounded corner.
  - The icons are 52% of the box (was 46%).
  - Measured at 1440 x 900: A's glyph 96% visible and sharp (4% under the slab), B's 98%, C whole (box 0.4,822.8 -
    76.3,898.7; was cut 13 px by the viewport bottom and 14 by the left). Its rotated shape ends 6.6 px left of "Made by
    SAIDA" (11.9 at 1280 x 800; at 1280 x 720 and 1920 x 1080 it sits wholly below the text). At 1280 x 720 A's glyph is
    81% visible, B's 84%. A's and B's tiles run off the viewport edge by about a third, like the reference's corner
    cubes; under 1024 wide none renders, as before.
- **36 px KPI tiles at 1440 (R1-M1).** The narrow-card query is `@container (max-width: 148px)` (was 155), and the base
  cell pads 14 x 12 (was 16 x 14). A 151 px card or wider (1440 x 900: 153, 1366 x 768: 154) keeps the 36 px tile with
  the label beside it ("Appointments" fits, 83 px of label width, no clipping); 1280 (136) keeps the 24 px tile. The top
  row is 138 at 1440 x 900 (was 126), and 5 Latest calls rows sit above the fold there (was 6; the budget is 5). 1280 x 800
  stays 4 rows, 1280 x 720 2.
- **The entrance starts at opacity .5 (R1-M2).** A paint at opacity 0 is not contentful to Chromium, so a fade from 0 held
  the first contentful paint back until the animation's first frame. Lighthouse (13.5.0, desktop preset) on the demo
  pages, three runs each against a preview plus the verifier's run: Overview 98 / 99 / 98 / 98 (LCP 904 to 951 ms),
  Callbacks 99 / 99 / 99 / 99 (LCP 925 to 945 ms); was 87 and 82 in the verifier's run.
- **Reduced transparency** turns the cards' backdrop-filter off (`none`, was `blur(0px) saturate(1.1)`) (R1-L2).
- **Performance (8.8)**: the verifier's software-rendering walk after these changes: 30.2 and 31.0 fps in two runs
  (was 32.2), longest task 2.8 ms; above the 30 fps line, so the blurs stay. The GPU-browser gate is still Tom's (R1-L3).

### 8.12 Final verification (2026-10-26, after review round 2)

Review round 2 (`docs/review/glass-v2-review-round2.md`) scored the pass 4.0 against the reel and said ship; its four
low findings are summed up, with what was done about each, in `docs/review/glass-v2-review.md`. Measured on the final
tree:

- `node scripts/verify.mjs` (every step: katie, shots, demo, perf, console, lighthouse, video, demobuild): exit 0, 96
  checks ok, 0 FAIL. Fold: slab 40-760 / 48-852 / 28-692 and 4 / 5 / 2 Latest calls rows at 1280 x 800 / 1440 x 900
  / 1280 x 720. Lighthouse 13.5.0 desktop: performance 98 on the three demo pages, 99 / 100 / 99 on mock=1,
  accessibility 100 and best practices 100 on all six. Console 0 messages (mock 16 routes, demo 8, real 8). Perf
  (software rendering): 32.6 fps rAF, 31.1 fps DrawFrame, frame p95 33.4 ms, 0 long tasks, longest 2 ms in the tweens
  and 4.4 ms in the whole trace. The verifier's perf table now grades software rendering against this section's 30
  fps line and states the 60 fps gate as open (it used to print a 58 fps "fail" that 8.8 expects).
- `node scripts/contrast-probe.mjs`: every class at or above its floor (secondary on the slab 7.36, chips 4.57, nav
  pill 5.17; `docs/perf/contrast.json`).
- Screenshots of the shipped state: `docs/screenshots/glass-v2/` (Playwright, device scale 1, animations settled),
  with `reel-vs-ours-1440.png` side by side with `02-dashboard-crop.jpg`.
- Still open: the GPU-browser walk of 8.8 (Tom, by hand), and the polish in the review's R2-L1 and R2-L4. (8.13
  applied the R2-L1 polish and measured the walk in headless Metal Chromium; R2-L4 stays open.)

### 8.13 Polish after review round 2 (2026-10-26, the same evening)

Looked at next to the reel crop after round 2, three gaps were still plain: the room was a shapeless wash, the corner
objects were flat pale tiles with thin glyphs, and the slab's edge was a hairline where the reel has a bevel (the
review's R2-L1). All three were closed in `glass.css` and `scene.webp`, plus one bug found while the evidence was taken.

- **The room reads.** `scene.webp` was re-graded from the source PNG: Gaussian 6 px (was 10), each channel mapped
  linearly from 0-255 to rgb(78, 96, 138)-rgb(240, 246, 254) (was rgb(140, 162, 202)-rgb(242, 246, 253)), WebP q80,
  18,078 bytes. The windows, the plant and the floor now show as soft shapes; the darkest 1/64 block is about
  rgb(79, 100, 146), the mean luminance .68. Margin means at 1440 x 900 (`overview-1440x900.png`, `?mock=1`): left
  #547d9f, top #5d76a3, right #5b7db2; the slab's empty rail #c6dbed; a card #edf0f4. The slab is still a lighter pane
  than the room, and the room's variation shows through it (cooler left over the plant, brighter right over the
  windows), which is what the reel's pane does.
- **The edge is a bevel.** The 2 px masked ring became a 4 px `.rim::before` (stops .98 / .45 / .18 / .75), and `.rim`
  itself now carries, unmasked, `box-shadow: inset 0 0 0 6px rgba(255,255,255,.16), inset 0 0 0 7px
  rgba(37,99,235,.08), inset 0 0 40px rgba(255,255,255,.2), inset 0 1px 0 rgba(255,255,255,.9)`. The old `.rim::after`
  inner light is gone: the mask on `.rim` clipped it to the 2 px ring, so it never painted.
- **The objects have thickness.** `.glass-object`: `border: 2px solid rgba(255,255,255,.94)`; `box-shadow: 0 30px 60px
  rgba(6,20,60,.35), 0 6px 14px rgba(6,20,60,.16), inset 0 0 0 4px rgba(255,255,255,.35), inset 0 1px 0
  rgba(255,255,255,.95), inset 0 -18px 30px rgba(37,99,235,.22)`. The icon is 54% of the box, and
  `.glass-object > svg path { stroke: currentColor; stroke-width: .7; stroke-linejoin: round }` thickens the Vibe
  glyphs (filled outline paths) on both edges, about 2 px at the 112 px object.
- **A new page opens at its top.** `Shell.tsx` sets `#content.scrollTop = 0` in a layout effect when `pagePath`
  changes. Before, the scroller kept the last page's position (Calls scrolled 300 px, click Callbacks, Callbacks
  opened at 300 px; present since d8cf83e). A drawer and the range change leave `pagePath` alone, so they keep it.

Measured on this tree:

- `node scripts/contrast-probe.mjs`: every class at or above its floor. Worst secondary on the slab 6.35:1 ("Made by
  SAIDA", 1440 x 900 demo; was 7.36 on the paler room), secondary on cards 9.45.
- `node scripts/verify.mjs --skip-build --steps=katie,shots,console`: exit 0, 44 ok, 0 FAIL; fold 4 / 5 / 2 rows at
  slab 40-760 / 48-852 / 28-692, unchanged.
- **8.8's GPU walk, measured:** headless Playwright Chromium 1.63 with Metal (`--enable-gpu --use-angle=metal
  --ignore-gpu-blocklist`), 1440 x 900, four moments (summon, booking, first-open, line-wake) over `?mock=demo` on the
  built dist: **59.0 fps at device scale 1** (302 tween frames, 1 over 20 ms) and **60.0 fps at scale 2** (307 frames,
  0 over 20 ms), 0 long tasks in both. Software rendering on the same build: 32.9 fps. The app's browser pane could not
  give a number this evening: the session was not open in a window, so its page ran as a background page (31
  animation frames in 40 s). The gate (at least 58 fps, no task over 50 ms) passes on the Metal run; a walk in the
  pane with the window in view would be the last word.

## 9. The look is a setting: the third pass (2026-11-02)

Tom rejected the second pass the morning of 2026-11-02: the slab "isn't real glass", the fonts were poor, and he
asked for more research on the glass itself. The research ran as a verified sweep (four angles: Apple's Liquid Glass
and its web copies, glassmorphism fundamentals, the property stacks working designers use, typography on glass; each
angle re-checked by a skeptic who reopened every source; a fifth agent audited `glass.css` and the screenshots
against the findings) and was published with an interactive model as the Katie Glass Lab
(https://claude.ai/artifact/EnXw8VGUeZC2Qx2zvyBCLo; the research page, the lab template, the lens map and the dusk
photo are kept in `docs/research/glass-lab-2026-11-02/`). The confirmed causes, in order: the pane was 72 % white
(glass is a low fill over a blurred backdrop, 20-35 %), the backdrop was pre-blurred so the pane's blur had nothing to
show, the cards' own blur was dead inside the pane (the pane was their ancestor, so they could only see it), and the
text was set in the thinner antialiased smoothing mode. Tom's two changes on the lab's recipe ("lessen the blur a
little", "a little more gradient on the edges") became its default preset, and his next ask, "I like the ability to
edit it, if we can just throw that in the settings too", is this pass: every ingredient of the glass is a per-browser
setting, edited live on the Settings page, with the four reference looks as presets and his tweak as the default.

Nothing but the skin, the Settings page and the page grid's gap rule changed: pages, data, copy, Katie's behaviour,
the Demo menu and the verify hooks are as in 8.

### 9.1 Behind the glass

`.env` (Shell.tsx, z 0) holds the backdrop, one of four (`data-look-backdrop`): `room`, the shipped office
(`scene.webp`, 8.13); `room-clear`, the same office graded less and blurred less (`room-clear.webp`, 1280 x 788), so the
pane's own blur has something to do; `photo`, a dusk office photo (`photo.webp`, 1280 x 788; its source is recorded in
`docs/research/glass-lab-2026-11-02/photo-source.json`) for the dark glass; and `field`, a colour field drawn in CSS
(`.field`: a warm sun top-left, a blue disc bottom-right, a window shape, a dark bar and three leaf shapes), the lab's
default and the one Tom's preset uses. Glass is only visible as the difference between sharp and blurred, so every
backdrop has edges in it; the field's shapes are sharp where the pane does not cover them and soft where it does.
The three glass objects of 8.4 are a switch (`data-look-objects`), off in the default look.

### 9.2 The pane

`.pane-glass` (z 1) is the frosted pane: `position: fixed; inset: var(--slab-inset-y) var(--slab-inset)`, the
pane fill `rgba(238, 245, 255, var(--look-pane-a))`, `backdrop-filter: blur(var(--look-blur)) saturate(var(--look-sat))`,
a radius of `--look-radius`, and inside it the sheen (a 118deg white highlight plus a radial at the top, `.pane-sheen`)
and the grain (an SVG fractal-noise tile at .09 multiply, `.pane-grain`), both switches. The shadow is a switch too
(`0 32px 80px rgba(10, 18, 50, .34), 0 4px 12px rgba(10, 18, 50, .12)`).

The pane is a sibling of the app frame, not its parent (the second confirmed cause above). An element with a
backdrop-filter, an opacity below 1, a filter or a mask is a backdrop root (CSS Filter Effects 2): its descendants
see only it, never what is behind it. In 8 the slab carried the blur and held the app, so the cards' own blur saw a
flat pane. Now the pane holds nothing, the app frame is transparent beside it, and a card's blur (9.5) sees the pane
and the room through it. The entrance (8.5) stays transform-only for the same reason: an opacity on the pane would
switch its blur off while it plays.

Two WebKit facts shape the code. WebKit does not resolve `var()` inside `backdrop-filter` (bug 297620), so the look
store also writes the filter inline on the pane (`applyLook`, after the shell mounts it). And an SVG filter inside
`backdrop-filter` renders only in Chromium (WebKit bug 245510; Firefox ignores it), so the refraction switch
(`lens`: `url(#rimlens)` in front of the blur, a 640 x 400 displacement map `lens.png` stretched over the pane by an
inline `<filter id="rimlens">` in Shell.tsx, `feDisplacementMap scale -34`) is composed only where `'chrome' in
window`; elsewhere `data-look-lens` is never set and the pane keeps its blur. The Settings switch says "Chrome and
Edge only" and is disabled where it cannot run.

The inset is per axis now, and since 9.11 it is not part of the look: `slabInsets(w, h)` gives `round(1 % of
innerWidth)` for x and `round(1 % of innerHeight)` for y, at least 16 (16 x 16 at 1440 x 900, 19 x 16 at 1920 x
1080); the store writes `--slab-inset` and `--slab-inset-y` on `<html>` and recomputes them on resize (one rAF). It
was a look field ("Room around the pane", 0 to 10 %, 0 for the shipped px ladder of 8.2) until Tom pinned it at 1 %
on every preset and had the control removed. Everything that used the one inset reads both: the pane, the frame,
the rim, Katie's stage layer and its `.space` offsets, the drawer (`--float-inset-y` for top and bottom).

### 9.3 The frame and the type

`.slab` (z 2, `data-katie-floor`) is the app frame: the same inset and radius, `overflow: hidden`, transparent. Its
two grid items (the rail and the main column) carry the text size: `.slab > * { zoom: var(--look-zoom) }`, 1 / 1.07 /
1.14 for `data-look-text` shipped / larger / largest, and the KPI numbers follow `--kpi-size` (28 / 34 / 40 px,
`.kpiNumber`). Zoom scales layout, so a 1.07 page has 7 % less width to lay out in (9.6). "Crisper text"
(`data-look-crisp`) sets `--font-smoothing-webkit: auto` and `-webkit-font-smoothing: auto` on the body: Vibe's token
asks for the thinner antialiased mode, which is the fourth confirmed cause above.

### 9.4 The edge

`.rim` (z 3) sits over the frame, the same inset and radius, no pointer events, with four full-pane children. The
ring is one of three (`data-look-edge`): `shipped`, 8.13's bevel (a 1.5 px border, the 6 px band, the blue line, the 40
px inner light and the 4 px masked gradient ring); `crisp`, one 1 px hairline at .62 white; `gradient`, a 1 px .3
border plus a 1.5 px masked ring whose brightness runs round the edge, .96 at the top-left corner, .12 across the
middle, .92 at the bottom-right, the two-corner light of the dark-glass reference. Then `.rim-lit` (a 1 px light along
the top and left, a 1 px shade along the bottom and right; the "lit from the top left" switch), `.rim-glow` (the
shipped 60 px white fog, a switch, off in the default) and `.rim-edgeg`, the edge gradient Tom asked for: four inset
box-shadows of `--look-edge-g` (0-36 px, 18 in the default), bright along the top (.62) and left (.4), faint on the
right (.14), a touch of shade along the bottom (.13 navy). Inset shadows follow the rounded corners, which a gradient
border would not; at 0 px nothing paints. The dark tint halves every edge value.

### 9.5 The cards

Every `Card` carries `.card-glass` (Card.tsx; `Card.module.css` keeps only position and min-width): fill
`rgba(255, 255, 255, var(--look-card-a))` (.6 in the default; .72 shipped), a 1 px edge in `--glass-card-edge`
(clear when the card-edge switch is off), radius `--look-card-r`, the card shadow and the top highlight. Flat by
default, as the recipe has it; "cards blur the glass behind them" adds `backdrop-filter: blur(14px) saturate(1.3)`
on every card, which works now because of 9.2 (and costs a layer per card; the shipped look has it on). With the
gradient rim, a card with an edge gets the same two-corner light at 1 px as a masked `::before` ring. The drawer,
menus, tooltips and pills keep their 8 styles.

### 9.6 The page inside a narrower pane

The default look holds a page 843 px wide at 1440 x 900 (inset 115 each side, the 240 rail, 32 px paddings, and the
7 % zoom; measured), where 8's narrowest case was 896 at 1280 x 800. Three rules that keyed off the window now key off
the page, and the scroll math learned about the zoom:

- The grid's column gap (Grid.module.css): 16 px when the page is 1025 or narrower, 24 above, as a container query on
  Shell's `.inner` (`container-type: inline-size`). The old rule was `max-width: 1439px` on the window; the shipped
  look is unchanged by the move (1040 wide at 1440 x 900 keeps 24, 896 at 1280 x 800 gets 16; the 1439 case moves
  from 16 to 24 with its cards at 156, above the 151 the full tile needs).
- The one-column collapse (Grid.module.css): at a page of 680 or less (the shipped look at about 1040 wide, the
  default look at about 1200; both under the 1280 minimum), the same container query. It was `max-width: 1023px` on
  the window, which the default look's narrower page could reach at 1100-1200 with 73 px KPI cards.
- The KPI card (overview.module.css 6.2), already a container: at 148 or less the 24 px tile and the 8 px cell of 8.11,
  plus, new, the fact and comparison lines wrap to two lines instead of clipping ("19 confirmed by text" is 112 px,
  the card's content 111 at 1440 x 900); at 123 or less the tile sits above the label (a 1280 window under the 8 % margin
  the pass shipped with had 114 px cards, and "Appointments" is 78 px). The override for the fact lines sits after the base rules in
  the file: same specificity, later wins, the trap 8.11 already notes for the tile.
- Scrolling under the zoom (`src/lib/zoom.ts`, `effectiveZoom`): `getBoundingClientRect()` is in viewport px, and
  `scrollBy()` on the content scroller is in its own px, 7 % smaller at "larger" (measured: a 100 px scroll moves the
  page 107 px). Katie's summon (director.ts) and the wheel forwarded from the rail and the margin (useContentScroll.ts)
  divide their viewport distance by the scroller's rendered width over its offset width before they scroll; lines,
  pages and the keys were already in the scroller's own px.

The fold (8.7) is measured under both looks now (`scripts/verify.mjs`, the Original look stored as
`{ preset: 'shipped' }` before the page loads). With the margin pinned at 1 % (9.11) the slab is 16-784 at 1280 x
800, 16-884 at 1440 x 900, 16-704 at 1280 x 720 and 16-1064 at 1920 x 1080 under every look; Original shows 5 / 7 / 3
Latest calls rows at 1280 x 800 / 1440 x 900 / 1280 x 720 and Daylight 3 / 5 / 9 at 1280 x 800 / 1440 x 900 / 1920 x
1080. (Under the 8 % margin the pass shipped with, the default look gave 0 / 3 / 6 and the shipped look 4 / 5 / 2 at
its 40 / 48 / 28 px ladder; the zero at 1280 x 800 was what that margin cost with the larger text.)

### 9.7 The store and the Settings card

`src/settings/look.ts` is the store, built like `store.ts`: one JSON value under `katie.look` in localStorage,
read once at module init (main.tsx imports it after glass.css, so the first paint is already the stored look),
`useSyncExternalStore` through `useLook()`, a `storage` listener so a second tab follows, and `applyLook()` which
writes `data-look-*` for the choices and switches, `--look-*` for the numbers and the two insets onto `<html>`,
plus the inline backdrop-filter on the pane. `sanitizeLook` checks every field, clamps each number to its range
(`LOOK_RANGES`) and snaps it to the slider step through `toFixed` at the step's decimals (35 x 0.01 is
0.35000000000000003 in floating point, which would never equal a preset's 0.35); anything missing or wrong falls
back to the default preset, and a stored `{ preset: name }` means that preset (the verifier's way in). A look equal
to the default preset is removed from storage rather than written. Nothing in it is about calls or people. The
values in `:root` are the default preset, so a browser with storage blocked still paints it.

The four presets (`PRESETS`, named in Settings for what you see, 9.11): `tweak`, "Daylight", the default (field,
light, fill .26, blur 14, saturate 1.6, radius 44, gradient rim, edge gradient 18, lit, sheen, shadow, no glow, no
grain, no lens, no objects, cards .6 with an edge and no blur at radius 20, larger text, crisper text); `recipe`,
"Frost" (the lab's recipe before his tweak: blur 18, crisp hairline, no edge gradient); `apple`, "Dusk" (the dusk
photo, dark tint, fill .24, radius 36, edge gradient 16, no sheen, lens on, cards .36); `shipped`, "Original" (8.13's
glass: room, fill .72, blur 28, saturate 1.25, radius 24, the shipped edge with its glow, objects, cards .72 blurred
at radius 16, shipped text; its 40 / 48 / 64 px inset ladder went with the margin field, so it stands at the 1 %
margin like the rest).

Settings > The glass (`src/pages/settings/LookCard.tsx`, the shared rows in `rows.tsx`): "Start from" with the four
presets as pressed buttons (the pressed one is the preset the look equals, none when it has been edited), then
Behind the glass (Backdrop, Corner glass objects), The pane (Tint, Fill, Blur, Colour boost, Corner radius; the room
around the pane is not a control, 9.11), The edge (Edge, Edge gradient, Lit from the top left, Sheen, Drop shadow,
Inner glow, Grain, Refraction at the rim), The cards (Card fill, Card edge, Cards blur the glass behind them, Card
corner radius), The type (Text size, Crisper text) and Back to the default. Every slider is a labelled native range
(`accent-color` the primary blue) with its value beside it; the choices are Vibe button groups like the rest of the
page; the page changes as a control moves. The look is per browser, like Show numbers.

### 9.8 Fallbacks, the dark tint and the known limits

- No backdrop-filter at all: the pane's fill goes to .93 and the cards to .92, as `!important` values: the store
  writes the fills inline on `<html>`, and only an `!important` stylesheet value beats an inline one (found in
  review). The objects lose their blur (8.6 kept).
- `prefers-reduced-transparency`: the same fills, and every backdrop-filter off.
- `prefers-reduced-motion`: no entrance (8.5 kept).
- Firefox and WebKit: no lens (9.2); the inline `-webkit-backdrop-filter` carries Safari.
- Dark tint (`html[data-look-tint='dark']`, `color-scheme: dark`): the ink, icon, link, chip, rule, hover, menu and
  selected tokens are redefined for white ink on dark glass; the chips go translucent with light inks
  (`--chip-positive-ink`, `--chip-primary-ink`, read by StatusChip.module.css with the light accents as fallbacks);
  the pane fill becomes a dark navy, the sheen drops to .4, the grain goes to screen, every edge value halves (the
  shipped bevel, the lit hairlines and the glow included). Light remains the default; the dark set exists for the
  Apple preset. Known limit: text set straight in `--primary-color` (the Retry line, the session button) stays
  #2563eb, 3.3:1 on the dark card.
- The text size zooms the pane's contents; the drawer, the Demo menu, tooltips and Katie's bubble sit outside the
  frame (portals or their own layers) and stay at 100 %.
- Safari is untested on this tree: the zoom standardisation (Chromium 128, Firefox 126) makes `getBoundingClientRect`
  return rendered px, which Katie's placement and the scroll math rely on; an older WebKit may stand her a few px
  off the card edge at "larger". The pane's own inline `-webkit-backdrop-filter` and the objects' literal blur are
  written for WebKit's var() limit.
- `?look=reset` in the address forgets the stored look (the way back from a look that cannot be read, when the
  Settings card itself is on it).

### 9.9 Changes after review (2026-11-02, two readers on the diff, no browser)

- The gradient card ring never painted on the KPI, chart, Latest calls and Callbacks cards: a 1 px ring drawn in the
  border area (`inset: -1px`) under `overflow: hidden`, which clips at the padding box. The ring is drawn just inside
  the padding box now, the card's own border goes clear and its fill stops at the padding box (9.5).
- Katie's summon and the forwarded wheel overshot by the zoom (9.6).
- The fallbacks' fills were beaten by the inline values (9.8); the objects' blur used `var()` inside a WebKit
  backdrop-filter; the dark tint lacked chip inks, the bevel, lit and glow variants and `color-scheme`; a bare `a`
  rule in the dark tint recoloured the rail's links (now `a:not([class])`).
- The store: slider values snapped to floating-point noise (0.35 x 0.01 arithmetic), so a preset could stop matching
  after a slider moved and back; a patch with a bad value fell back to the default look instead of the current one;
  `null`, `""`, `[]` and `"0x10"` in a stored value were coerced to numbers; a storage clear in another tab was
  ignored (key `null`); the resize handler rewrote the whole look each frame; the refraction switch showed on where it
  could not run. All fixed (9.7); the Settings copy was reworded in plain English and the card says when the look is
  edited away from a preset.
- The one-column collapse moved from the window to the page (9.6).

### 9.10 What to check with the lab open

1. The default look, Daylight, at 1440 x 900 next to the lab's "Less blur, gradient edges" preset: the pane reads as a sheet of
   glass over the colour field (the sun and the leaf soft under it, sharp beside it), the rim brightest at the
   top-left and bottom-right corners, a feathered light band inside the top and left edges, the cards a little
   whiter than the pane with no blur of their own, the KPI numbers at 34 px, the text crisp.
2. Settings > The glass: each control moves the page as it moves; "Original" is 8.13's glass at the 1 % margin (the
   fold check proves the geometry); "Dusk" is white ink on dark glass over the dusk photo with the rim bent
   at the edge in Chrome.
3. Nothing clips at 1440 x 900 or 1280 x 800 under the default look (the KPI labels, the fact lines, the Callbacks
   rows); no horizontal scroll; Katie still stands on the frame's inner bottom edge and walks in from its sides; the
   drawer floats inside the frame at both insets.

### 9.11 Tom's changes the same evening: names, and the margin pinned

Three asks on the shipped pass (2026-11-02, evening): "change the presets to better names", "make them all be set to
room around the edge 1%", and "remove that ability to edit that because it's super glitchy and no need for it".

- The presets are named for what you see, not for their settings: Daylight (`tweak`, the default), Frost (`recipe`),
  Dusk (`apple`) and Original (`shipped`); each button carries a one-line tooltip. The keys are unchanged, so a stored
  `{ preset: 'shipped' }` still means Original.
- The room around the pane is 1 % of each axis of the window, at least 16 px, on every look (`PANE_MARGIN_PCT`,
  `slabInsets(w, h)`, 9.2), and no longer part of the look: `margin` is gone from `Look`, the presets, `LOOK_RANGES`
  and `sanitizeLook` (a stored look that still carries one is read without it; 21 fields now), and the shipped px
  ladder of 8.2 went with it, so Original stands at the same inset as the rest. `:root` carries 16 px as the
  fallback. The "Room around the pane" slider is gone from the card: dragging it re-laid the whole page live (the
  pane, the frame, the container queries, Katie's floor) and read as a glitch, and nothing needed it.
- The fold under the 1 % margin (9.6): Daylight 3 / 5 / 9 Latest calls rows at 1280 x 800 / 1440 x 900 / 1920 x 1080
  (0 / 3 / 6 under the 8 %), Original 5 / 7 / 3 at 1280 x 800 / 1440 x 900 / 1280 x 720 (4 / 5 / 2 at its ladder);
  the slab's top is 16 at every size.
- The corner glass objects (a switch, on only in Original) were sized from the inset for a 28 to 64 px margin
  (`--obj-size`, `--obj-d`); at 16 px they are small tiles at the pane's rounded corners, A and B mostly under it,
  C 22 px. They read as a detail, not a fault, so the rule is unchanged.
