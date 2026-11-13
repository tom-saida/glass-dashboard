/**
 * Mini stage for /dash/_katie: three fake cards on the canvas colour and the 96 px Katie.
 * Clicking a card sends her along the L-shaped route (walk the current shelf, hop, step) to
 * stand on its top edge at the right end and present toward its centre; clicking the canvas
 * sends her home (bottom right). Card rectangles are read once per click, never in a tween.
 * The sentences are the fixture examples from DESIGN.md 7.6.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Katie, { type KatieHandle } from '../Katie'
import { createKatieMotion, type KatieMotion } from './controller'
import type { Shelf } from './path'
import { fitBubble } from '../stage/fitBubble'
import styles from './MotionStage.module.css'

const HEIGHT = 96
/** Feet-centre inset from a card's right edge (DESIGN.md 7.2): 16 + 20. */
const SPOT_INSET = 36
/** Feet-centre inset from a shelf's ends; she keeps both feet on the card. */
const SHELF_INSET = 20
const HOME_INSET = 44
const GAP = 8

const CARDS = [
  {
    id: 'a',
    cls: styles.cardA,
    title: 'Line',
    text: 'Open. Last call 5:35 PM',
    say: 'The line is quiet. The last call came in at 5:35 PM.',
  },
  {
    id: 'b',
    cls: styles.cardB,
    title: 'Today',
    text: '8 calls, 6 booked, 7 callbacks waiting, 6 texts sent',
    say: 'Eight calls so far today, six of them booked. The average call ran 2:03.',
  },
  {
    id: 'c',
    cls: styles.cardC,
    title: 'Callbacks waiting',
    text: "(656) ***-0150, daughter's bracket came off this morning",
    say: "Start with (656) ***-0150 from 5:35 PM. Daughter's bracket came off this morning, needs to be seen as soon as possible.",
  },
] as const

export interface MotionStageApi {
  motion: KatieMotion
  handle: KatieHandle
  /** Send her to a card by index (0..2) and present, as a click would. */
  goToCard: (i: number) => Promise<boolean>
  goHome: () => Promise<boolean>
}

export default function MotionStage({ onReady }: { onReady?: (api: MotionStageApi | null) => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const katieRef = useRef<KatieHandle>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const motionRef = useRef<KatieMotion | null>(null)
  // where the bubble goes: beside her head at feet x, top at her crown (DESIGN.md 7.5)
  const [bubble, setBubble] = useState<{ text: string; x: number; top: number } | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    const stage = stageRef.current
    const wrap = wrapRef.current
    const handle = katieRef.current
    if (!stage || !wrap || !handle) return
    // the layer fills the stage's padding box, so sizes and offsets are taken inside the border
    const size = () => ({ w: stage.clientWidth, h: stage.clientHeight })
    const floorOf = (): Shelf => {
      const { w, h } = size()
      return { y: h, x0: SHELF_INSET, x1: w - SHELF_INSET }
    }
    const m = createKatieMotion(handle, wrap, { heightPx: HEIGHT, bubble: bubbleRef.current, floor: floorOf() })
    motionRef.current = m
    const { w, h } = size()
    void m.enterFromRight(w - HOME_INSET, h, w + 40)
    m.startIdle()

    const goToCard = (i: number) => {
      const card = cardRefs.current[i]
      const spec = CARDS[i]
      if (!card || !spec) return Promise.resolve(false)
      // read layout once, at commit time
      const s = stage.getBoundingClientRect()
      const r = card.getBoundingClientRect()
      const ox = s.left + stage.clientLeft
      const oy = s.top + stage.clientTop
      const top = r.top - oy
      const left = r.left - ox
      const right = r.right - ox
      const x = right - SPOT_INSET
      const shelf: Shelf = { y: top, x0: left + SHELF_INSET, x1: right - SHELF_INSET }
      // bubble beside her head, on the card-centre side (her left), top at her crown
      setBubble({ text: spec.say, x, top: Math.max(GAP, top - HEIGHT) })
      return m.goTo(x, shelf).then((ok) => {
        if (ok) m.present('left')
        return ok
      })
    }
    const goHome = () => {
      m.unpresent()
      const f = floorOf()
      m.setFloor(f)
      return m.goTo(size().w - HOME_INSET, f)
    }
    onReadyRef.current?.({ motion: m, handle, goToCard, goHome })
    apiRef.current = { goToCard, goHome }

    let raf = 0
    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const st = m.getState()
        const f = floorOf()
        m.setFloor(f)
        if (!st.travelling && Math.abs(st.y - st.shelf.y) < 1 && st.shelf.y === f.y) m.placeAt(Math.min(st.x, f.x1 - 24), f.y, f)
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf)
      onReadyRef.current?.(null)
      apiRef.current = null
      m.destroy()
      motionRef.current = null
    }
  }, [])

  // static placement (left / top set once before she shows it; only opacity and y animate):
  // on her left, toward the card centre; flipped to her right if it would leave the stage
  useLayoutEffect(() => {
    const el = bubbleRef.current
    const stage = stageRef.current
    if (!el || !stage || !bubble) return
    const half = (HEIGHT * 652) / 1544 / 2
    const w = fitBubble(el).w
    const sw = stage.clientWidth
    let left = bubble.x - half - GAP - w
    if (left < 16) left = bubble.x + half + GAP
    left = Math.max(16, Math.min(sw - 16 - w, left))
    el.style.left = `${left}px`
    el.style.top = `${bubble.top}px`
  }, [bubble])

  const apiRef = useRef<{ goToCard: (i: number) => Promise<boolean>; goHome: () => Promise<boolean> } | null>(null)

  return (
    <div>
      <div
        ref={stageRef}
        className={styles.stage}
        onClick={(e) => {
          if (e.target === e.currentTarget) void apiRef.current?.goHome()
        }}
      >
        {CARDS.map((c, i) => (
          <button
            key={c.id}
            ref={(el) => {
              cardRefs.current[i] = el
            }}
            type="button"
            className={`${styles.card} ${c.cls}`}
            onClick={() => void apiRef.current?.goToCard(i)}
          >
            <span className={styles.cardTitle}>{c.title}</span>
            <span className={styles.cardText}>{c.text}</span>
          </button>
        ))}
        <div className={styles.layer} aria-hidden="true">
          <div
            ref={bubbleRef}
            className={styles.bubble}
          >
            {bubble?.text}
          </div>
          <div ref={wrapRef} className={styles.wrapper}>
            <Katie ref={katieRef} height={HEIGHT} />
          </div>
        </div>
      </div>
      <p className={styles.caption}>
        Mini stage, 96 px. Click a card: she walks along her shelf, hops onto its top edge, steps
        to its right end and presents. Click the canvas to send her home. Click again while she
        moves to retarget from where she is.
      </p>
    </div>
  )
}
