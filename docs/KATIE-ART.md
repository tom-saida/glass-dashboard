# Katie art: measurements, layers and rig geometry

The source of truth is `brief/assets/katie/`. Everything here is in **source pixels** of that
652 x 673 art, y down. The machine-readable copy of every number below is
`docs/katie-art/rig.json`, and the visual check is `docs/katie-art/proof.png`.

Regenerate:

```
node scripts/katie-assets.mjs          # layers + avatar + manifest, verifies itself, exits 1 on any mismatch
node docs/katie-art/render-proof.mjs   # proof.html + proof.png (Playwright headless Chromium, file://)
node docs/katie-art/trace-shading.mjs  # src/katie/traced.ts: sleeve shading + eyelid shapes traced from the art
```

The asset script is deterministic: two runs give byte-identical files.

## 1. What the two PNGs really are

- `katie-cutout.png` has **binary alpha** (0 or 255, no soft edge) and no ICC profile.
- `katie-master.png` is fully opaque and carries an embedded **monitor ICC profile, "PHL 221V8L"**
  (a Philips display profile, so the master is a screenshot). Its stored bytes equal the cutout's
  bytes everywhere inside the figure (0 of 207,649 interior pixels differ). The only differences
  are 1,651 silhouette rim pixels, all within 3 px of the transparent edge, where the cut-out tool
  replaced the grey anti-aliased background blend with near-black.
- A colour-managed viewer shows the master about 10 levels lighter than its bytes (scrub
  `#668bc1` stored, about `#7199ca` displayed). The layers ship the stored bytes with **no ICC**,
  exactly how the cutout renders in a browser, so **all SVG colours below are the stored-byte
  values** and the drawn parts will match the raster on screen.
- Rows 671-672 are a matting artefact (row 672 is a solid black line); the layers stop at row 670.

## 2. Outline

| | value | how it was measured |
|---|---|---|
| Ink colour | **`#1b1b1e`** | median of 5,875 "core" outline pixels (all 8 neighbours dark), face excluded; 18% of them are pure `#000000` speckle, the rest sit around `#16161a`-`#262428` |
| Silhouette stroke | **4.5 px** (4-5) | perpendicular dark run along the outer edge: median 4.2, mode 4-5; in the master the core is 4 px plus one AA pixel |
| Interior lines | **3 px** (3-4) | collar, pocket, hem folds: perpendicular run median 3.5 (p25 2.8, p75 4) |
| Fine seams | **2 px** (1-3) | the sleeve-to-body seams from the shoulder points down to y = 490 fade to 1-3 px |

SVG: `stroke="#1b1b1e"`, 4.5 on every drawn silhouette, 3 on interior lines (hem folds, laces,
sole line), round caps and joins.

## 3. Palette (stored bytes)

| role | hex | where sampled |
|---|---|---|
| outline / scrub seam and hem lines | `#1b1b1e` | outline cores (scrub-area line cores alone: `#110f13`) |
| scrub blue, lit | `#668bc1` | k-means over the torso, 46.8k px |
| scrub blue, shade | `#46699d` | lower torso band, 20.1k px; this is the colour across the raster's bottom row |
| scrub highlight | `#8db3dc` | shoulder tops and sleeve edges |
| skin, lit | `#fbaf85` | face and V-neck, 22.7k px |
| skin, shade | `#d78064` | jaw, nose side, neck shadow (neck: `#da8062`) |
| skin, blush | `#f39b7b` | cheeks |
| skin seen through the lens | `#f5c8b3` | inside the lens above the eye (the eyelid fill) |
| hair, lit | `#e1b068` | 13.7k px |
| hair, highlight | `#f9cf83` | |
| hair, shade | `#b27c43` | |
| hair, deep shade | `#906b43` | |
| brows | `#5f311f` | |
| glasses frame | `#2d2b2b` | frame ring; highlight on the frame `#4f4e51` |
| eye whites | `#fefefd` | |
| upper lash band | `#4e4f54` | the thick eyeliner band, lighter than the ink |
| iris / pupil | `#b28d6f` / `#5b5c5f` | |
| lips, upper / lower | `#ea6b5e` / `#ec7060` | lip highlight `#fba287`, teeth `#fdfdfd` |
| sneaker upper (proposed) | `#fdfdfd` | not in the art: same white as the teeth |
| sneaker shade (proposed) | `#d9dee6` | not in the art |
| sneaker sole (proposed) | `#eef0f4` | not in the art |

Pants use the scrub lit / shade / highlight exactly.

## 4. Landmarks

| landmark | source px |
|---|---|
| top of hair (ponytail tip) | (376, 8) |
| top of skull (crown of the head silhouette, centre line) | (311, 22) |
| hairline at the centre | y 99 |
| chin (bottom of the chin outline) | (322, 326) |
| **head height H** (crown to chin) | **304** |
| eye centres (iris) | screen-left (267, 200), screen-right (360, 199) |
| eye box for lids (wing tip to inner corner, lid crest to lower lid) | sL x 232-292, y 180-213; sR x 335-396, y 180-213 |
| lens glass / outer ring | sL 231-295 x 173-229 / 222-300 x 168-234; sR 335-405 x 174-229 / 330-412 x 168-234 |
| bridge | 295-330 x 181-190 |
| brows | sL 231-292 x 155-170; sR 332-396 x 155-169 |
| nose tip | (312, 240) |
| mouth (lips) | 270-355 x 256-290, teeth 267-277 |
| ears | sL 201-228 x 182-245 (centre 214, 213); sR 405-431 x 180-244 (centre 418, 212) |
| neck at y 335 | outline 276-369, skin 281-365, centre x 322.5; neck meets shoulder lines at y 345 |
| collar, outer V | (243, 362) to bottom (288, 506) to (408, 362) |
| collar, inner V (skin edge) | (266, 355) to bottom (290, 462) to (368, 352); band about 25 px |
| shoulder points (top corner of each sleeve) | sL (156, 389), sR (498, 388) |
| **shoulder joint centres** (arm pivots) | **sL (170, 440), sR (482, 440)** |
| **armpit line** | **y 600** (hem meets body at sL (171, 600), sR (452, 603)) |
| sleeve hem bottom edge | sL (88, 558) to (171, 600); sR (567, 558) to (452, 603) |
| sleeve hem fold line (18 px band) | sL (98, 546) to (168, 583); sR (553, 546) to (463, 585) |
| pocket | x 330-432, y 509-619, flap line y 530 |
| torso edges at the armpit line (y 600) | sL 171, sR 450 (279 wide) |
| torso edges at the raster bottom (y 670) | sL 182, sR 437 (255 wide, centre 309.5) |
| visible arms below the hems (for widths) | sL 112-177 at y 610 (65), sR 464-544 (80): Katie is turned slightly, her left arm (screen-right) is nearer |

`sL` / `sR` mean screen-left / screen-right throughout; screen-left is Katie's own right side.
The source draws the forearms bent forward at about y 640-655 (elbow creases), with the hands
out of frame.

## 5. Crop and layer decisions

**Use the cutout, keep the stored bytes, no ICC.** Interior bytes equal the master's, the cutout's
re-matted rim composites without a grey halo, and no colour conversion is applied anywhere.

**Crop: keep the torso down to the raster bottom (y 670), cut the arms off at the armpits.** "At
the armpits" is applied to the arms: everything outside the two torso side lines is erased from
y 400 down, so the drawn arms start at the shoulder. The torso itself is kept to y 670 because a
horizontal cut at the armpit line (y 600) would run through the pocket (509-619) and force half a
pocket to be redrawn. At y 670 the raster is flat `#46699d` from side line to side line, so the
drawn lower top joins on one flat colour (see section 7).

**Sleeves are erased from the torso and belong to the arms.** The sleeves are the region outside
the seam lines, which run from each shoulder point down to the armpit. A raster sleeve that stays
put while a drawn arm rotates under it opens a gap at the hem on every swing, so each upper-arm
group carries its own drawn sleeve (traced outline and hem fold in `rig.json` -> `traces.sleeve`,
in rest coordinates, rotating with the shoulder). At rest the drawn sleeve covers the erased area
exactly; the traced torso side lines (`traces.torsoSide`) are what remains of the body edge.

**Split into a HEAD layer and a TORSO layer.**
- Seam: a straight cut through the neck skin at **y 352** for x 262-388 (flat skin, the neck
  outlines run vertically there, so a vertical shift or a small rotation does not show). Outside
  the neck the seam is the top edge of the scrub's shoulder outline, found per column; the
  outlines, including the ponytail's bottom line where it rests on the shoulder, stay with the
  torso.
- Head = hair, ponytail, face, ears, neck down to the seam. Torso = everything below the seam
  plus **12 source rows above it** (neck skin, and a sliver of ponytail hair at the shoulder), which
  the head covers at rest and which fills the gap when the head lifts or nods.
- Z-order: torso, then arms, then head. Pivot for the head: the neck pivot **(322, 352)**.
- Checked: head-over-torso at rest reproduces the cutout exactly (169,907 px, max channel
  difference 0). The proof sheet shows the seam with the head 3 px up, 3 px down and nodded
  plus or minus 4 degrees: no gap, no visible step. Keep nods within 5 degrees and
  head-versus-body offsets within 6 px (the overlap is 12).

## 6. Assets

| file | size (bytes) | rig position (x, y, w, h) |
|---|---|---|
| `src/katie/assets/katie-head.webp` (lossless) | 99,742 | 199, 8, 288 x 361 |
| `src/katie/assets/katie-torso.webp` (lossless) | 82,684 | 147, 333, 362 x 338 |
| `src/katie/assets/katie-avatar-20.png` | 1,370 | square 284 crop at (176, 60) of the head layer, lanczos3 |
| `src/katie/assets/katie-avatar-40.png` | 4,458 | same, 2x |
| `src/katie/assets/katie-avatar-60.png` | 9,006 | same, 3x |
| **total images** | **197,260** (192.6 KB) | 203 KB left of the 400 KB for the drawn parts |
| `src/katie/assets/manifest.ts` | 1,040 | generated: imports the five files (Vite hashes them), exports `KATIE_HEAD`, `KATIE_TORSO`, `KATIE_NECK_PIVOT`, `KATIE_AVATAR` |

Verification run by the script (it exits 1 if any is not exact):
- every opaque pixel of both layers vs the cutout: 172,085 px, **max channel difference 0**;
- composite at rest vs the cutout: 169,907 px, **0**;
- face box 196-470 x 18-351 vs the master's stored bytes: 73,989 px, **max channel difference 0**
  (3,090 silhouette-rim pixels within 3 px of transparency skipped, the cutout's re-matte);
- total under 300 KB.

The avatar is head-only (from the head layer, so no shoulders), transparent around the hair,
eyes at 49% of its height; the top of the hair bun and the ponytail run off the square, which
reads correctly at 20 px and inside a circle.

## 7. Rig geometry: five heads tall

One coordinate system: **SVG `viewBox="0 0 652 1544"`**, the raster layers at their native
positions (manifest), `overflow: visible` for arms that reach past the edges, **feet on
y = 1544**. With the crown at 22 and H = 304, 1544 is 5.0 H from the crown. On screen at 96 px
tall the scale is 0.062, so the 4.5 px stroke is about 0.3 px, matching the raster's line.

### Joints (rest pose)

| joint | screen-left (Katie's right) | screen-right (Katie's left) | head units from crown |
|---|---|---|---|
| neck / head pivot | (322, 352) | | 1.09 |
| shoulder | (170, 440) | (482, 440) | 1.38 |
| elbow | (143, 655) | (506, 655) | 2.08 |
| wrist | (150, 845) | (500, 845) | 2.71 |
| hip line | y 800 | | 2.56 |
| hip joint | (250, 800) | (370, 800) | 2.56 |
| knee | (250, 1150) | (370, 1150) | 3.71 |
| ankle | (250, 1478) | (370, 1478) | 4.79 |
| ground | y 1544 | | 5.00 |

The elbows sit where the source draws its elbow creases, the shoulder pivots sit inside the
sleeve caps on the line from the visible upper arm up to the shoulder, and the legs are centred
under the torso (centre x 310).

### Limbs (outer widths include the 4.5 px outline)

| part | length | width | notes |
|---|---|---|---|
| sleeve (upper-arm group) | 194, shoulder point to hem centre | hem opening sL 93 / sR 118, band 18 | draw from `traces.sleeve`; overlap the torso shoulder by about 12 px so the cap never uncovers the seam corner when it swings |
| upper arm (skin below the hem) | 216, shoulder to elbow | sL 60 / sR 68 at the hem, 56 / 62 at the elbow | |
| forearm | 190 | 54 / 60 at the elbow, 44 / 48 at the wrist | |
| hand | 104 | 54 / 58 | fingertips at y 949, mid-thigh |
| lower scrub top (drawn) | y 640 (behind the raster) to hem 772, centre 776 | sides (182, 670) to (178, 772) and (437, 670) to (442, 772) | fill `#46699d` to meet the raster's bottom row; hem fold 18 px above the hem; outline sides and hem only |
| pelvis / pants top | y 740 (hidden) to crotch 842 | 262 | scrub blue |
| thigh (pants) | 350 | 124 at the hip, 100 at the knee | the two thighs overlap 4 px at the centre |
| shin (pants) | 328 to the ankle | 96 at the knee, 92 at the hem | straight scrub leg, hem at y 1470 over the shoe collar |
| sneaker | ankle to ground 66 | profile 156 long (heel 40 behind the ankle, toe 116 ahead), 72 tall, sole 16; front view 92 wide | white with the proposed shade, laces as 3 px ink |

### Pose notes

- Angles are SVG degrees (positive = clockwise on screen), each relative to its parent; the rig
  faces right and flips with `scaleX(-1)`.
- Walk contact: hips -25 / +25 (negative swings the foot forward, to +x), trailing knee +20,
  arms counter-swing +15 / -15. Checked in the proof: nothing detaches at the extremes.
- Listen (hand to ear, near arm): shoulder sR -120, elbow sR -128 puts the palm on the screen-right
  ear at about (430, 215), elbow out at about (655, 311). **During listen the sR arm group must
  draw above the head layer**, otherwise the ponytail covers the hand.
- Present: rotate the near shoulder toward the card (about -60 to -80) with a slight elbow bend.
- Blink / rest eyes: fill each eye box with `#f5c8b3` (an almond following the lid crest at
  y 181) and draw a 4 px ink lash line across its lower third; the lenses and frames stay on top
  visually because they are outside the boxes.
- The torso's sides between the shoulder points and y 490 are only the 1-3 px seam (it was an
  interior line). The drawn sleeve covers it at rest; if an arm swings outward more than about
  10 degrees, draw a 4.5 px ink stroke along `traces.torsoSide` (from y 390 to 600) above the
  torso and below the arms so the body keeps a full-weight silhouette.

## 8. Files

- `scripts/katie-assets.mjs`: asset generator and verifier.
- `src/katie/assets/`: the five images and `manifest.ts`.
- `docs/katie-art/rig.json`: every measurement, joint, width, trace and pose above.
- `docs/katie-art/render-proof.mjs`, `proof.html`, `proof.png`: the proof sheet (layers on a
  checkerboard, avatar sizes, seam under motion, landmark overlay, palette, and the five-head
  stand-in figure at rest, walk contact and listen). The drawn parts in the proof are capsule
  stand-ins for checking proportions, not the final drawing.
- `docs/katie-art/trace-shading.mjs`: traces the sleeve highlight / shade regions and the eye
  almonds from the cutout into `src/katie/traced.ts` (generated, deterministic).
- `docs/katie-art/rig-vs-art.png`: the finished rig at rest at one rig unit per pixel next to the
  art and a difference heat map (section 9).
- `src/katie/`: the rig itself (section 9). `docs/screenshots/katie-rig/`: every preset at 600 px
  and 96 px.

## 9. The rig: `<Katie />`

`src/katie/Katie.tsx` is the whole figure as one React component: one
`<svg viewBox="0 0 652 1544" overflow="visible">` with the two raster layers (`<image>` hrefs from
`assets/manifest.ts`) and every other part as inline SVG paths built once at module load from
`rig.ts` / `parts.ts`. Static and fully posable; it animates nothing itself.

```tsx
<Katie
  height?: number | string     // CSS height of the 652 x 1544 box, feet on its bottom edge; default 96
  pose?: Partial<Pose>         // degrees per joint + body offsets; default rest
  facing?: 'left' | 'right'    // the rig faces right; 'left' = scaleX(-1) about the feet centre (310, 1544)
  eyes?: number                // 0 closed .. 1 open; default 1
  ref?: Ref<KatieHandle>
/>
```

**Pose** (`src/katie/pose.ts`): `neck`, `shoulderL/R`, `elbowL/R`, `wristL/R`, `hipL/R`,
`kneeL/R`, `ankleL/R` in SVG degrees (positive = clockwise), each relative to its parent; plus
`x`, `y` (whole body, screen sense), `lean` (rotation about the feet), `hipsX` (pelvis + legs,
weight shift) and `chestY` (torso + head + arms, breath and shoulder drop), in rig units. `L` / `R`
are screen left / right with the rig facing right (rig.json `sL` / `sR`).

**Handle** (forwardRef), every member a `<g>` for GSAP: `body`, `facing`, `hips`, `pelvis`,
`lowerTop`, `torso`, `head`, `shoulderL/R`, `elbowL/R`, `wristL/R`, `hipL/R`, `kneeL/R`,
`ankleL/R`, `lidL/R`, `sideL/R`, `tabL/R`, plus `svg`, `setPose(pose, facing?)`, `setEyes(v)`
and `syncSides()`. Every joint group gets its `svgOrigin` (`PIVOT` in pose.ts) with `gsap.set`
on mount, so `gsap.to(handle.elbowR, { rotation: -20 })` turns about the elbow. Lids are
`scaleY` 0 (open) .. 1 (closed) about the lid crest; drive them with `setEyes` in an `onUpdate`.
After tweening a shoulder, call `syncSides()` (or do it in `onUpdate`): it fades the torso side
stroke in and the sleeve-cap overlap tab out once that sleeve swings outward past about 10°
(`sideOpacity()`), the two things only one of which may show at a time.

**Layer order** (DESIGN.md 7.1): far leg (L), near leg (R), pelvis, lower top, torso raster
(clipped, see below), torso side strokes, arm L, head (+ lids), arm R. The R arm always draws
above the head, so the listen hand covers the ponytail.

**Parts and how each one continues the drawing**

| part | built from | notes |
|---|---|---|
| sleeves | rig.json `traces.sleeve`, stroke centre 2.25 inside the traced silhouette | lit fill + the art's own highlight and shade regions (traced.ts), hem fold 3, seam 2 above y 490, 4.5 elsewhere. A lit overlap tab with the shoulder highlight band reaches about 14 units into the torso under each cap, for inward swings |
| upper arm | top along the sleeve hem (hidden under it), to a round elbow cap | skin, one shade shape (the sleeve's cast shadow under the hem + the inner side), clipped to the arm |
| elbow, knee | a stroked disc under both segments | gives the outer side of a bend its outline; invisible when straight |
| forearm, hand | tapered limb to the wrist; one hand drawing (three fingers and a thumb, thumb toward the body), mirrored for L | the hand sits under the forearm's wrist cap |
| lower top | the raster's side-line centres sampled at y 620-671, then out to the hem at y 772 (centre 778) | flat scrub shade, the colour of the raster's bottom rows; hem fold 18 above the hem; drawn behind the raster from y 620 (50 units of overlap for breathing) |
| pelvis | covers above the hip line plus a crotch gusset | each thigh carries a full disc of its hip width around the hip joint, so swinging legs never open a gap; cast shadow under the top's hem |
| thigh, shin | tapered limbs, 124 -> 100 -> 94 wide | lit + one inner shade strip each (clipped), pants hem band with a fold line at y 1452, hem at 1470 |
| sneaker | profile, toe toward the facing direction, heel 40 behind / toe 112 ahead of the ankle | white upper, heel-counter shade, sole band with a 3 px line, three lace dashes |
| eyelids | the eye almond traced from the art (traced.ts) | skin-through-lens fill, 4 px ink lash line along the lower lid; at rest (eyes 0) they read as closed lids |
| side strokes | rig.json `traces.torsoSide` from the shoulder corner to y 510 | 4.5 ink on the raster's thin seam; only shown on outward swings |

**Torso clip.** The torso layer still holds a few rows of the original sleeves under each shoulder
corner (the asset erases outside the side lines only from y 400 down). The rig clips the torso
image along the seam there (rows 383-402), so a sleeve swinging away shows a clean shoulder
corner; at rest the drawn sleeve covers those pixels anyway. The raster files themselves are
untouched.

**Values tuned against the art** (rig.json is unchanged; these live in `src/katie/rig.ts`):
- arm widths: elbow 64 / 70, wrist 46 / 50 outer, set from the art's arms below the hems (skin
  116-175 and 471-540 at y 618) instead of rig.json's thinner 52-58 / 40-44; hands 110 / 114 long;
- sneaker toe 112 ahead of the ankle (rig.json 116);
- listen: shoulder R -122, elbow R -136, wrist R 55, neck 3 (DESIGN.md's -120 / -128 put the
  fingers across the glasses; these put the palm on the ear with the fingers up into the hair);
- walk contact: rig.json's values with the trailing knee 16 and ankle 6 (not 20 / 0) and the
  leading ankle 12, plus `y = groundOffset(pose)`, so the leading heel and trailing toe both touch
  the ground.

**Presets** (`PRESETS` in pose.ts, used by the playground): rest; walk contact A and B; present
toward left (facing left, shoulder R -70, elbow R -20, wrist R -25, neck -2); listen; eyes closed
(eyes 0, chest down 32 = 2 px at 96 px). `groundOffset(pose)` returns how far to move the body down
so the lowest sole point touches y 1544.

**Checks** (2026-10-12):
- At rest the composite against the cutout, one rig unit per pixel
  (`docs/katie-art/rig-vs-art.png`): face 0.00 mean channel difference, torso 0.63, sleeves 7.9 /
  10.4 (all on the 1-2 px anti-aliased outline edges), the arms below the hems differ by design
  (the art's forearms bend toward the viewer and are cut off; the rig's hang straight).
- The built raster files are byte-identical to `src/katie/assets` (cmp). Assets total 197,260
  bytes; the drawn parts add no files (inline SVG). The rig module (unminified lib build) is 8.3 KB gzipped without
  GSAP, 37.9 KB with it.
- Playground `/dash/_katie`: no console errors or warnings; the master-art overlay is served
  from `brief/` by the dev server only and never enters `dist/`.
