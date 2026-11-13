/**
 * <Katie /> — the full-body paper-doll rig, static and fully posable (no animation here).
 *
 * API
 *   <Katie
 *     height?: number | string   // CSS height of the 652 x 1544 box, feet on its bottom edge; default 96
 *     pose?: Partial<Pose>       // degrees per joint + body offsets (src/katie/pose.ts); default rest
 *     facing?: 'left' | 'right'  // the rig faces right; 'left' mirrors it about the feet centre
 *     eyes?: number              // 0 closed .. 1 open (eyelids); default 1
 *     className?, style?
 *     ref?: Ref<KatieHandle>
 *   />
 *
 * Geometry: one <svg viewBox="0 0 652 1544" overflow="visible">, rig units = source pixels of
 * brief/assets/katie (see docs/KATIE-ART.md), feet on y = 1544, feet centre x = 310. The head
 * and torso are the two raster layers from src/katie/assets; everything else is inline SVG.
 *
 * Handle (forwardRef), for GSAP:
 *   svg                                   the <svg> element
 *   body                                  whole figure; x / y offsets, lean about the feet (FEET)
 *   facing                                scaleX(-1) about the feet centre for 'left'
 *   hips                                  pelvis + both legs (weight shift: x)
 *   pelvis, lowerTop                      the pants top and the drawn lower scrub top
 *   torso                                 torso raster + side strokes + arms + head (breath: y)
 *   head                                  head raster + lids, pivot PIVOT.neck
 *   shoulderL/R, elbowL/R, wristL/R       arm joints, pivots PIVOT.*
 *   hipL/R, kneeL/R, ankleL/R             leg joints, pivots PIVOT.*
 *   lidL, lidR                            eyelids: scaleY 0 (open) .. 1 (closed) about the lid crest
 *   sideL, sideR                          torso side strokes, shown when a sleeve swings outward
 *   tabL, tabR                            sleeve-cap overlap tabs (inside the shoulder groups),
 *                                         shown otherwise; both follow sideOpacity() in pose.ts
 *   setPose(pose, facing?)                gsap.set a whole pose (missing joints go to rest;
 *                                         facing is left alone when omitted)
 *   setEyes(v)                            0 closed .. 1 open, sets the lids
 *   syncSides()                           re-derive the side strokes from the current shoulder angles
 *
 * Every joint group already carries its svgOrigin (set on mount), so a tween can be just
 * `gsap.to(handle.shoulderR, { rotation: -70 })`; pass `svgOrigin: svgOrigin(PIVOT.shoulderR)`
 * if you prefer to be explicit. L / R are screen left / right with the rig facing right.
 * Tweening a shoulder: call handle.syncSides() in onUpdate (it sets sideX and tabX opacity).
 * Layer order (DESIGN.md 7.1): far leg, near leg, pelvis, lower top, torso raster, side
 * strokes, arm L, head (+ lids), arm R. The `pose` prop is applied with gsap.set whenever its
 * values change; while GSAP drives the rig, leave `pose` unchanged (or unset).
 * Tweening the eyes: tween a number and call handle.setEyes(v) in onUpdate.
 */
import {
  forwardRef,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react'
import gsap from 'gsap'
import { KATIE_HEAD, KATIE_TORSO } from './assets/manifest'
import { HAND, handTransform, PARTS } from './parts'
import { applyPose, sideOpacity, svgOrigin, type Facing, type Pose } from './pose'
import { mascotVars, useMascot } from './mascot'
import { COLOR, INK, SW, SW_IN, SW_SEAM, VIEW_H, VIEW_W, type Side } from './rig'

/**
 * The paint for the drawn parts: each reads the current look's custom property (set on the <svg>
 * from src/katie/mascot.ts) and falls back to Katie's own colour.
 */
const FILL = {
  scrubLit: { fill: 'var(--mascot-scrub-lit, ' + COLOR.scrubLit + ')' },
  scrubShade: { fill: 'var(--mascot-scrub-shade, ' + COLOR.scrubShade + ')' },
  scrubHighlight: { fill: 'var(--mascot-scrub-highlight, ' + COLOR.scrubHighlight + ')' },
  skin: { fill: 'var(--mascot-skin, ' + COLOR.skin + ')' },
  skinShade: { fill: 'var(--mascot-skin-shade, ' + COLOR.skinShade + ')' },
  skinLens: { fill: 'var(--mascot-skin-lens, ' + COLOR.skinLens + ')' },
} as const satisfies Record<string, CSSProperties>

export type { Pose, Facing } from './pose'

const GROUPS = [
  'body',
  'facing',
  'hips',
  'pelvis',
  'lowerTop',
  'torso',
  'sideL',
  'sideR',
  'tabL',
  'tabR',
  'head',
  'lidL',
  'lidR',
  'shoulderL',
  'elbowL',
  'wristL',
  'shoulderR',
  'elbowR',
  'wristR',
  'hipL',
  'kneeL',
  'ankleL',
  'hipR',
  'kneeR',
  'ankleR',
] as const
export type KatieGroup = (typeof GROUPS)[number]

export type KatieHandle = { svg: SVGSVGElement } & Record<KatieGroup, SVGGElement> & {
    setPose: (pose: Partial<Pose>, facing?: Facing) => void
    setEyes: (open: number) => void
    syncSides: () => void
  }

export interface KatieProps {
  height?: number | string
  pose?: Partial<Pose>
  facing?: Facing
  eyes?: number
  className?: string
  style?: CSSProperties
}

type RefSetters = Record<KatieGroup, (el: SVGGElement | null) => void>

const ink = (width: number) => ({ stroke: INK, strokeWidth: width, fill: 'none' })

function setLids(lidL: SVGGElement, lidR: SVGGElement, open: number) {
  const v = Math.max(0, Math.min(1, open))
  for (const [el, lid] of [
    [lidL, PARTS.lid.L],
    [lidR, PARTS.lid.R],
  ] as const) {
    gsap.set(el, {
      scaleY: Math.max(0.001, 1 - v),
      autoAlpha: v >= 0.999 ? 0 : 1,
      svgOrigin: svgOrigin(lid.origin),
    })
  }
}

/** Side strokes and overlap tabs follow the current shoulder rotations. */
function syncSides(g: Record<KatieGroup, SVGGElement>) {
  for (const s of ['L', 'R'] as const) {
    const o = sideOpacity(s, Number(gsap.getProperty(g[`shoulder${s}`], 'rotation')))
    gsap.set(g[`side${s}`], { opacity: o })
    gsap.set(g[`tab${s}`], { opacity: 1 - o })
  }
}

function Arm({ side, r, clip }: { side: Side; r: RefSetters; clip: (name: string) => string }) {
  const a = PARTS.arm[side]
  const s = PARTS.sleeve[side]
  return (
    <g ref={r[`shoulder${side}`]} data-part={`arm${side}`}>
      <g ref={r[`elbow${side}`]}>
        <circle cx={a.elbowDisc.cx} cy={a.elbowDisc.cy} r={a.elbowDisc.r} style={FILL.skin} stroke={INK} strokeWidth={SW} />
        <g ref={r[`wrist${side}`]}>
          <g transform={handTransform(side)}>
            <path d={HAND.palm} style={FILL.skin} />
            <path d={HAND.shade} style={FILL.skinShade} clipPath={clip('palm')} />
            <path d={HAND.palm} {...ink(SW)} />
            <path d={HAND.fingers} {...ink(SW_IN)} />
            <path d={HAND.thumbFill} style={FILL.skin} />
            <path d={HAND.thumbLine} {...ink(SW)} />
          </g>
        </g>
        <path d={a.foreFill} style={FILL.skin} />
        <path d={a.foreShade} style={FILL.skinShade} clipPath={clip(`fore${side}`)} />
        <path d={a.foreOuter + a.foreInner} {...ink(SW)} />
        <path d={a.crease} {...ink(SW_IN)} />
      </g>
      <path d={a.upperFill} style={FILL.skin} />
      <path d={a.upperShade} style={FILL.skinShade} clipPath={clip(`upper${side}`)} />
      <path d={a.upperOuter + a.upperInner} {...ink(SW)} />
      {/* overlap tab under the sleeve cap; fades out on outward swings (see sideOpacity) */}
      <g ref={r[`tab${side}`]}>
        <path d={s.tab} style={FILL.scrubLit} />
        <path d={s.tabHighlight} style={FILL.scrubHighlight} />
      </g>
      <path d={s.fill} style={FILL.scrubLit} />
      <path d={s.shade} style={FILL.scrubShade} />
      <path d={s.highlight} style={FILL.scrubHighlight} />
      <path d={s.fold} {...ink(SW_IN)} />
      <path d={s.seam} {...ink(SW_SEAM)} />
      <path d={s.outline} {...ink(SW)} />
    </g>
  )
}

function Leg({ side, r, clip }: { side: Side; r: RefSetters; clip: (name: string) => string }) {
  const l = PARTS.leg[side]
  const sh = PARTS.shoe[side]
  return (
    <g ref={r[`hip${side}`]} data-part={`leg${side}`}>
      <g ref={r[`knee${side}`]}>
        <circle cx={l.kneeDisc.cx} cy={l.kneeDisc.cy} r={l.kneeDisc.r} style={FILL.scrubLit} stroke={INK} strokeWidth={SW} />
        <g ref={r[`ankle${side}`]}>
          <g transform={sh.transform}>
            <path d={sh.body} fill={COLOR.shoe} />
            <path d={sh.shade} fill={COLOR.shoeShade} />
            <path d={sh.soleFill} fill={COLOR.sole} />
            <path d={sh.soleLine + sh.laces} {...ink(SW_IN)} />
            <path d={sh.body} {...ink(SW)} />
          </g>
        </g>
        <path d={l.shinFill} style={FILL.scrubLit} />
        <path d={l.shinShade} style={FILL.scrubShade} clipPath={clip(`shin${side}`)} />
        <path d={l.shinFold} {...ink(SW_IN)} />
        <path d={l.shinSides} {...ink(SW)} />
      </g>
      <path d={l.thighFill} style={FILL.scrubLit} />
      <path d={l.thighShade} style={FILL.scrubShade} clipPath={clip(`thigh${side}`)} />
      <path d={l.thighLine} {...ink(SW)} />
    </g>
  )
}

/** Clip paths in rest coordinates (userSpaceOnUse resolves in each referencing group's frame). */
const CLIPS: Record<string, string> = {
  torso: PARTS.torsoClip,
  pelvis: PARTS.pelvis.clip,
  palm: HAND.palm,
  upperL: PARTS.arm.L.upperFill,
  upperR: PARTS.arm.R.upperFill,
  foreL: PARTS.arm.L.foreFill,
  foreR: PARTS.arm.R.foreFill,
  thighL: PARTS.leg.L.thighFill,
  thighR: PARTS.leg.R.thighFill,
  shinL: PARTS.leg.L.shinFill,
  shinR: PARTS.leg.R.shinFill,
}

const Katie = forwardRef<KatieHandle, KatieProps>(function Katie(
  { height = 96, pose, facing = 'right', eyes = 1, className, style },
  ref,
) {
  const mascot = useMascot()
  const svgRef = useRef<SVGSVGElement>(null)
  const uid = 'katie' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const clip = (name: string) => `url(#${uid}-${name})`
  const groups = useRef<Partial<Record<KatieGroup, SVGGElement>>>({})
  const r = useMemo(
    () =>
      Object.fromEntries(
        GROUPS.map((name) => [
          name,
          (el: SVGGElement | null) => {
            if (el) groups.current[name] = el
            else delete groups.current[name]
          },
        ]),
      ) as RefSetters,
    [],
  )

  useImperativeHandle(
    ref,
    () => {
      const g = groups.current as Record<KatieGroup, SVGGElement>
      const handle = {
        svg: svgRef.current as SVGSVGElement,
        ...g,
        setPose: (p: Partial<Pose>, f?: Facing) => applyPose(g, p, f),
        setEyes: (open: number) => setLids(g.lidL, g.lidR, open),
        syncSides: () => syncSides(g),
      }
      return handle
    },
    [],
  )

  const poseKey = JSON.stringify(pose ?? {})
  useLayoutEffect(() => {
    applyPose(groups.current as Record<KatieGroup, SVGGElement>, JSON.parse(poseKey) as Partial<Pose>, facing)
  }, [poseKey, facing])

  useLayoutEffect(() => {
    const g = groups.current
    if (g.lidL && g.lidR) setLids(g.lidL, g.lidR, eyes)
  }, [eyes])

  const lt = PARTS.lowerTop
  const pe = PARTS.pelvis
  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      overflow="visible"
      aria-hidden="true"
      focusable="false"
      style={{
        display: 'block',
        height,
        width: 'auto',
        aspectRatio: `${VIEW_W} / ${VIEW_H}`,
        overflow: 'visible',
        ...mascotVars(mascot),
        ...style,
      }}
    >
      <defs>
        {Object.entries(CLIPS).map(([name, d]) => (
          <clipPath key={name} id={`${uid}-${name}`}>
            <path d={d} />
          </clipPath>
        ))}
      </defs>
      <g ref={r.body} strokeLinecap="round" strokeLinejoin="round">
        <g ref={r.facing}>
          <g ref={r.hips}>
            <Leg side="L" r={r} clip={clip} />
            <Leg side="R" r={r} clip={clip} />
            <g ref={r.pelvis} data-part="pelvis">
              <path d={pe.fill} style={FILL.scrubLit} />
              <path d={pe.shade} style={FILL.scrubShade} clipPath={clip('pelvis')} />
              <path d={pe.sides} {...ink(SW)} />
              <path d={pe.crotch} {...ink(SW_IN)} />
            </g>
          </g>
          <g ref={r.lowerTop} data-part="lowerTop">
            <path d={lt.fill} style={FILL.scrubShade} />
            <path d={lt.fold} {...ink(SW_IN)} />
            <path d={lt.sideL + lt.sideR + lt.hem} {...ink(SW)} />
          </g>
          <g ref={r.torso}>
            <image
              clipPath={clip('torso')}
              href={mascot.torso}
              x={KATIE_TORSO.x}
              y={KATIE_TORSO.y}
              width={KATIE_TORSO.width}
              height={KATIE_TORSO.height}
            />
            <g ref={r.sideL} opacity={0}>
              <path d={PARTS.side.L} {...ink(SW)} />
            </g>
            <g ref={r.sideR} opacity={0}>
              <path d={PARTS.side.R} {...ink(SW)} />
            </g>
            <Arm side="L" r={r} clip={clip} />
            <g ref={r.head}>
              <image
                href={mascot.head}
                x={KATIE_HEAD.x}
                y={KATIE_HEAD.y}
                width={KATIE_HEAD.width}
                height={KATIE_HEAD.height}
              />
              {(['L', 'R'] as const).map((s) => (
                <g key={s} ref={r[`lid${s}`]} visibility="hidden">
                  <path d={PARTS.lid[s].fill} style={FILL.skinLens} />
                  <path d={PARTS.lid[s].lash} {...ink(4)} />
                </g>
              ))}
            </g>
            {/* the near arm draws above the head so the hand-to-ear pose covers the ponytail */}
            <Arm side="R" r={r} clip={clip} />
          </g>
        </g>
      </g>
    </svg>
  )
})

export default Katie
