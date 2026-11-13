import { Suspense, lazy, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Calendar, Check, Mobile } from '@vibe/icons'
import type { CallsRange } from '../api/queries'
import { startDashStream } from '../live/stream'
import { applyLook } from '../settings'
import { pageFor } from './pages'
import { Rail } from './Rail'
import { TopBar } from './TopBar'
import { useContentScroll } from './useContentScroll'
import styles from './Shell.module.css'

// Katie (her rig, motion and GSAP) is her own chunk, loaded after the shell renders. Nothing
// shows while it loads: she walks in from the right edge once it is there.
const KatieStage = lazy(() => import('../katie/stage/KatieStage'))

// The refraction map for the "bends the backdrop at the rim" switch (DESIGN-GLASS 9): a 640 x 400
// displacement image stretched over the pane. new URL(): the hashed asset URL without an import.
const LENS_MAP = new URL('../assets/lens.png', import.meta.url).href

export interface ShellProps {
  /** The page being shown (the background location while a drawer is open). */
  pagePath: string
  range: CallsRange
  onRangeChange: (r: CallsRange) => void
  /** The page (inside the content grid container). */
  children: ReactNode
  /** Layers above the page: the call drawer or the lead drawer. */
  overlay?: ReactNode
  /** A drawer is open: the tab title says this instead of the page ("Call", "Lead"). */
  drawerTitle?: string
}

/**
 * The tab title per route (WCAG 2.4.2): "Overview · Katie", and "Call · Katie" or "Lead · Katie"
 * while a drawer is open. Never a number or a name, masked or not: titles persist in browser
 * history.
 */
function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Katie`
  }, [title])
}

export function Shell({ pagePath, range, onRangeChange, children, overlay, drawerTitle }: ShellProps) {
  const qc = useQueryClient()
  // One live stream per tab, started here once.
  useEffect(() => startDashStream(qc), [qc])
  const page = pageFor(pagePath)
  useDocumentTitle(drawerTitle ?? page.title)
  // M1: the wheel and the scroll keys reach the content from the rail, the top bar and the margin.
  useContentScroll()
  // A new page opens at its top. The content scroller (not the window) would otherwise keep the
  // last page's position. A drawer and the range change leave pagePath alone, so they keep it.
  useLayoutEffect(() => {
    const content = document.getElementById('content')
    if (content) content.scrollTop = 0
  }, [pagePath])
  // The pane is mounted now: the look store writes its backdrop-filter inline (WebKit does not
  // resolve var() inside backdrop-filter) and composes the refraction filter when it is on.
  useLayoutEffect(() => {
    applyLook()
  }, [])

  return (
    <div className={styles.shell} data-shell="">
      {/* DESIGN-GLASS 9.1: behind the glass (the shipped room, the clearer room, the dusk photo
          or the colour field with its shapes), still. Glass objects A and B stand in it behind
          the pane's right-hand corners when the objects switch is on (8.4, 8.11). */}
      <div className="env" aria-hidden="true">
        <div className="field">
          <div className="field-sun" />
          <div className="field-win" />
          <div className="field-disc" />
          <div className="field-bar" />
          <div className="field-leaf" />
          <div className="field-leaf field-leaf-2" />
          <div className="field-leaf field-leaf-3" />
        </div>
        <div className="glass-object glass-object-a">
          <Mobile />
        </div>
        <div className="glass-object glass-object-b">
          <Calendar />
        </div>
      </div>
      {/* 9.2: the frosted pane, a sibling of the app frame, not its parent: an element with a
          backdrop-filter is a backdrop root, and anything inside it could only see the pane, never
          the room. The sheen and the grain live inside it. */}
      <div className="pane-glass" aria-hidden="true">
        <div className="pane-sheen" />
        <div className="pane-grain" />
      </div>
      {/* 9.3: the app frame, transparent, the same inset; the content scrolls inside it, never
          the window. data-katie-floor: Katie stands on its inner bottom edge and walks in from its
          sides. */}
      <div className={`slab ${styles.frame}`} data-katie-floor="">
        <Rail activePath={pagePath} />
        <div className={styles.main}>
          <TopBar page={page} range={range} onRangeChange={onRangeChange} />
          <main className={styles.content} id="content">
            <div className={styles.inner}>{children}</div>
          </main>
        </div>
      </div>
      {/* 9.4: the edge over the frame (a sibling: the frame is a grid, a pseudo-element would be
          a grid item): the ring per edge style, the lit hairlines, the inner glow and the edge
          gradient. Then object C in front of the bottom-left corner. Neither takes pointer
          events. */}
      <div className="rim" aria-hidden="true">
        <div className="rim-ring" />
        <div className="rim-lit" />
        <div className="rim-glow" />
        <div className="rim-edgeg" />
      </div>
      <div className="glass-object glass-object-c" aria-hidden="true">
        <Check />
      </div>
      {/* The refraction filter (9.2): an SVG displacement map the pane's backdrop-filter can name
          as url(#rimlens). Chromium renders it; WebKit and Firefox do not, so the look store only
          turns it on there. Zero-sized, out of the flow. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <filter id="rimlens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage href={LENS_MAP} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="-34" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <Suspense fallback={null}>
        <KatieStage />
      </Suspense>
      {overlay}
    </div>
  )
}
