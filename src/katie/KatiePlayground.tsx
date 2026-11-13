/**
 * /dash/_katie — the rig playground (full page, outside the shell). Katie at 600 px and 96 px on
 * the canvas colour, a slider per joint, the named presets, a facing switch, and (in development)
 * an overlay of the original master art at 50 % aligned to the raster layers, so drift shows.
 * The "States" section drives the motion layer (src/katie/motion) on the large figure and on a
 * mini stage with three fake cards; the sliders, presets and view controls stop any running
 * state and take over the rig again.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import gsap from 'gsap'
import { Button, ButtonGroup, Toggle } from '@vibe/core'
import Katie, { type KatieHandle } from './Katie'
import { createKatieMotion, type KatieMotion } from './motion/controller'
import MotionStage, { type MotionStageApi } from './motion/MotionStage'
import {
  JOINT_NAMES,
  JOINT_RANGE,
  OFFSET_RANGE,
  PRESETS,
  REST_POSE,
  type Facing,
  type JointName,
  type Pose,
} from './pose'
import { FEET, VIEW_H } from './rig'
import styles from './KatiePlayground.module.css'

const SMALL = 96
/** The large figure is 600 px; `?size=<px>` overrides it (1544 renders one rig unit per pixel). */
function bigSize(): number {
  try {
    const v = Number(new URLSearchParams(window.location.search).get('size'))
    return Number.isFinite(v) && v >= 96 && v <= 2400 ? v : 600
  } catch {
    return 600
  }
}
/** The master art is the 652 x 673 source; rig units are its pixels, so it sits at (0, 0). */
const MASTER = { w: 652, h: 673 }
// Served by the Vite dev server straight from brief/; never bundled into dist/.
const MASTER_HREF = import.meta.env.DEV ? `${import.meta.env.BASE_URL}brief/assets/katie/katie-master.png` : null

type PresetKey = keyof typeof PRESETS
type OffsetKey = keyof typeof OFFSET_RANGE

const JOINT_LABEL: Record<JointName, string> = {
  neck: 'Neck',
  shoulderL: 'Shoulder',
  elbowL: 'Elbow',
  wristL: 'Wrist',
  shoulderR: 'Shoulder',
  elbowR: 'Elbow',
  wristR: 'Wrist',
  hipL: 'Hip',
  kneeL: 'Knee',
  ankleL: 'Ankle',
  hipR: 'Hip',
  kneeR: 'Knee',
  ankleR: 'Ankle',
}
const OFFSET_LABEL: Record<OffsetKey, string> = {
  x: 'Body x',
  y: 'Body y',
  lean: 'Lean',
  hipsX: 'Hips x',
  chestY: 'Chest y',
}
const SECTIONS: { title: string; keys: (JointName | OffsetKey)[] }[] = [
  { title: 'Body', keys: ['x', 'y', 'lean', 'hipsX', 'chestY', 'neck'] },
  { title: 'Arm, screen left', keys: ['shoulderL', 'elbowL', 'wristL'] },
  { title: 'Arm, screen right (near)', keys: ['shoulderR', 'elbowR', 'wristR'] },
  { title: 'Leg, screen left', keys: ['hipL', 'kneeL', 'ankleL'] },
  { title: 'Leg, screen right (near)', keys: ['hipR', 'kneeR', 'ankleR'] },
]

const isJoint = (k: string): k is JointName => (JOINT_NAMES as readonly string[]).includes(k)

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}) {
  const { label, value, min, max, step, unit, onChange } = props
  const digits = step < 1 ? 2 : 0
  return (
    <label className={styles.slider}>
      <span className={styles.sliderLabel}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output className={styles.readout}>
        {value.toFixed(digits)}
        {unit}
      </output>
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

type StateKey = 'idle' | 'walk' | 'hop' | 'present' | 'listen' | 'celebrate' | 'rest'
const STATE_LABEL: Record<StateKey, string> = {
  idle: 'Idle',
  walk: 'Walk',
  hop: 'Hop',
  present: 'Present',
  listen: 'Listen',
  celebrate: 'Celebrate',
  rest: 'Rest',
}
/** Toggle states stay on until pressed again; the others are one-shot. */
const TOGGLES: StateKey[] = ['idle', 'listen', 'rest']
/** Walk in place on the large figure: four cycles. */
const WALK_IN_PLACE_S = 4 * 0.55

const reducedByDefault = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export default function KatiePlayground() {
  const [BIG] = useState(bigSize)
  const [pose, setPose] = useState<Pose>({ ...REST_POSE })
  const [facing, setFacing] = useState<Facing>('right')
  const [eyes, setEyes] = useState(1)
  const [overlay, setOverlay] = useState(false)
  const [active, setActive] = useState<PresetKey | null>('rest')

  // ---- motion ----------------------------------------------------------------------------
  const bigRef = useRef<KatieHandle>(null)
  const bigWrapRef = useRef<HTMLDivElement>(null)
  const bigMotion = useRef<KatieMotion | null>(null)
  const stageApi = useRef<MotionStageApi | null>(null)
  const walkTimer = useRef<gsap.core.Tween | null>(null)
  const [on, setOn] = useState<Partial<Record<StateKey, boolean>>>({})
  const [reduced, setReduced] = useState(reducedByDefault)
  const motionActive = useRef(false)
  const nextCard = useRef(0)

  useEffect(() => {
    const handle = bigRef.current
    const wrap = bigWrapRef.current
    if (!handle || !wrap) return
    const m = createKatieMotion(handle, wrap, { heightPx: BIG, anchor: false, reducedMotion: reducedByDefault() })
    m.placeAt(0, 0)
    bigMotion.current = m
    return () => {
      m.destroy()
      bigMotion.current = null
    }
  }, [BIG])

  // development hook for the Playwright checks (scratchpad scripts): no data, only the rigs
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__katie = {
      gsap,
      big: () => ({ motion: bigMotion.current, handle: bigRef.current }),
      mini: () => stageApi.current,
    }
    return () => {
      delete w.__katie
    }
  }, [])

  const both = (fn: (m: KatieMotion) => void) => {
    if (bigMotion.current) fn(bigMotion.current)
    if (stageApi.current) fn(stageApi.current.motion)
  }

  /** Stop the large figure's motion and give the rig back to the sliders. */
  const stopStates = () => {
    if (!motionActive.current) return
    motionActive.current = false
    walkTimer.current?.kill()
    const m = bigMotion.current
    if (m) {
      m.reset()
      m.placeAt(0, 0)
    }
    setOn({})
  }

  /** The Stop button: the large figure back to the sliders, the mini stage back to idle at home. */
  const stopAll = () => {
    motionActive.current = true
    stopStates()
    const mini = stageApi.current?.motion
    if (mini) {
      mini.listen(false)
      mini.rest(false)
      void stageApi.current?.goHome()
    }
  }

  /** Before the first state: the large figure goes to rest, so the sliders and the motion agree. */
  const prepare = () => {
    if (motionActive.current) return
    flushSync(() => {
      setPose({ ...REST_POSE })
      setFacing('right')
      setEyes(1)
      setActive(null)
    })
    bigMotion.current?.reset()
    bigMotion.current?.placeAt(0, 0)
    motionActive.current = true
  }

  const runState = (k: StateKey) => {
    prepare()
    const big = bigMotion.current
    const api = stageApi.current
    const mini = api?.motion
    const next = TOGGLES.includes(k) ? !on[k] : false
    switch (k) {
      case 'idle':
        both((m) => (next ? m.startIdle() : m.stopIdle()))
        break
      case 'walk': {
        walkTimer.current?.kill()
        big?.walkInPlace(true)
        walkTimer.current = gsap.delayedCall(WALK_IN_PLACE_S, () => big?.walkInPlace(false))
        if (mini && api) {
          const st = mini.getState()
          const f = st.shelf
          // along her current shelf to its other end (on the floor: the far side and back home)
          const far = Math.abs(st.x - f.x0) > Math.abs(st.x - f.x1) ? f.x0 : f.x1
          void mini.walkTo(Math.max(f.x0, Math.min(f.x1, far)))
        }
        break
      }
      case 'hop':
        void big?.hopTo(0, 0)
        if (api) {
          const i = nextCard.current
          nextCard.current = (i + 1) % 3
          void api.goToCard(i)
        }
        break
      case 'present':
        both((m) => m.present('left'))
        break
      case 'listen':
        both((m) => m.listen(next))
        if (next) setOn((o) => ({ ...o, rest: false }))
        break
      case 'celebrate':
        both((m) => m.celebrate())
        break
      case 'rest':
        both((m) => m.rest(next))
        break
    }
    if (TOGGLES.includes(k)) setOn((o) => ({ ...o, [k]: next }))
  }

  const toggleReduced = (v: boolean) => {
    setReduced(v)
    both((m) => m.setReducedMotion(v))
  }

  const applyPreset = (key: PresetKey) => {
    stopStates()
    const p = PRESETS[key]
    setPose({ ...REST_POSE, ...p.pose })
    setFacing(p.facing)
    setEyes(p.eyes)
    setActive(key)
  }
  const setKey = (k: JointName | OffsetKey, v: number) => {
    stopStates()
    setPose((p) => ({ ...p, [k]: v }))
    setActive(null)
  }

  // the overlay follows the raster: body offset, chest offset and the facing flip
  const scale = BIG / VIEW_H
  const overlayStyle = useMemo(() => {
    const fx = FEET[0] * scale
    const flip = facing === 'left' ? `translateX(${fx}px) scaleX(-1) translateX(${-fx}px)` : ''
    return {
      width: MASTER.w * scale,
      height: MASTER.h * scale,
      transform: `translate(${pose.x * scale}px, ${(pose.y + pose.chestY) * scale}px) ${flip}`,
    }
  }, [facing, pose.x, pose.y, pose.chestY, scale])


  const changed = Object.entries(pose).filter(([, v]) => v !== 0)
  const poseText = changed.length
    ? `{ ${changed.map(([k, v]) => `${k}: ${Math.round(v * 10) / 10}`).join(', ')} }`
    : '{}'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Katie rig</h1>
        <p className={styles.note}>
          Static paper-doll rig. Joint angles are degrees relative to the parent joint; offsets are
          rig units, where 1544 is her height. Screen left and right are taken with her facing
          right.
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.stage}>
          <div className={styles.figures}>
            <figure className={styles.figure}>
              <div className={styles.big}>
                <div ref={bigWrapRef} style={{ willChange: 'transform' }}>
                  <Katie ref={bigRef} height={BIG} pose={pose} facing={facing} eyes={eyes} />
                </div>
                {overlay && MASTER_HREF && (
                  <img className={styles.overlay} src={MASTER_HREF} alt="" style={overlayStyle} />
                )}
              </div>
              <figcaption className={styles.caption}>{BIG} px</figcaption>
            </figure>
            <figure className={styles.figure}>
              <div className={styles.small}>
                <Katie height={SMALL} pose={pose} facing={facing} eyes={eyes} />
              </div>
              <figcaption className={styles.caption}>{SMALL} px</figcaption>
            </figure>
          </div>
          <code className={styles.poseText}>
            facing: {facing}, eyes: {eyes.toFixed(2)}, pose: {poseText}
          </code>
          <MotionStage
            onReady={(api) => {
              stageApi.current = api
              api?.motion.setReducedMotion(reduced)
            }}
          />
        </div>

        <aside className={styles.panel} aria-label="Rig controls">
          <Section title="Presets">
            <div className={styles.buttons}>
              {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                <Button
                  key={k}
                  size="small"
                  kind={active === k ? 'primary' : 'secondary'}
                  onClick={() => applyPreset(k)}
                >
                  {PRESETS[k].label}
                </Button>
              ))}
            </div>
          </Section>

          <Section title="View">
            <div className={styles.row}>
              <span className={styles.rowLabel}>Facing</span>
              <ButtonGroup
                size="small"
                groupAriaLabel="Facing"
                value={facing}
                onSelect={(v) => {
                  stopStates()
                  setFacing(v as Facing)
                  setActive(null)
                }}
                options={[
                  { value: 'right', text: 'Right' },
                  { value: 'left', text: 'Left' },
                ]}
              />
            </div>
            {MASTER_HREF && (
              <div className={styles.row}>
                <span className={styles.rowLabel}>Master art overlay, 50 %</span>
                <Toggle
                  size="small"
                  areLabelsHidden
                  aria-label="Master art overlay"
                  isSelected={overlay}
                  onChange={(v) => setOverlay(v)}
                />
              </div>
            )}
            <Slider
              label="Eyes"
              value={eyes}
              min={0}
              max={1}
              step={0.01}
              unit=""
              onChange={(v) => {
                stopStates()
                setEyes(v)
                setActive(null)
              }}
            />
          </Section>

          <Section title="States">
            <div className={styles.states} data-slot="katie-states">
              {(Object.keys(STATE_LABEL) as StateKey[]).map((k) => (
                <Button key={k} size="small" kind={on[k] ? 'primary' : 'secondary'} onClick={() => runState(k)}>
                  {STATE_LABEL[k]}
                </Button>
              ))}
              <Button size="small" kind="tertiary" onClick={stopAll}>
                Stop
              </Button>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Reduced motion</span>
              <Toggle
                size="small"
                areLabelsHidden
                aria-label="Reduced motion"
                isSelected={reduced}
                onChange={toggleReduced}
              />
            </div>
          </Section>

          {SECTIONS.map((sec) => (
            <Section key={sec.title} title={sec.title}>
              {sec.keys.map((k) => {
                const range = isJoint(k) ? JOINT_RANGE[k] : OFFSET_RANGE[k]
                return (
                  <Slider
                    key={k}
                    label={isJoint(k) ? JOINT_LABEL[k] : OFFSET_LABEL[k]}
                    value={pose[k]}
                    min={range[0]}
                    max={range[1]}
                    step={1}
                    unit={isJoint(k) || k === 'lean' ? '°' : ''}
                    onChange={(v) => setKey(k, v)}
                  />
                )
              })}
            </Section>
          ))}
        </aside>
      </div>
    </div>
  )
}
