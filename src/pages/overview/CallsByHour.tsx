import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Tooltip } from '@vibe/core'
import { useCalls, useStats, type HourBucket } from '../../api'
import { Card, ErrorLine, SkeletonBar } from '../../components'
import { formatClock, formatHourLabel, localHourMinute, useNow } from '../../lib'
import { CLOSE_HOUR, OPEN_HOUR } from './hours'
import { sayCallsByHour } from './say'
import styles from './overview.module.css'

// P4 geometry, in px of the SVG (height 96). The card is 176 tall in every state: a 60px header
// (title + legend line), the 96px chart, 20px under it.
const HEIGHT = 96
const BASELINE = 72
const MAX_BAR = 56
const LABEL_Y = 88
const NOW_TOP = 8
const BAR_RATIO = 0.56
/** DESIGN-GLASS 4: 4 px top radius (clamped to the bar's size). */
const RADIUS = 4
/** Three faint gridlines, a third of the tallest bar apart. */
const GRIDLINES = [1, 2, 3].map((k) => BASELINE - Math.round((MAX_BAR * k) / 3) + 0.5)
const NOW_FLIP = 120
/** Below this slot width the axis labels every other hour (the landmarks always show). */
const LABEL_EVERY_SLOT = 44

function hourTip(b: HourBucket): string {
  return `${formatHourLabel(b.hour)}: ${b.calls} ${b.calls === 1 ? 'call' : 'calls'}, ${b.booked} booked`
}

/** Card inner width via ResizeObserver (the chart is drawn in px, never stretched). */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.floor(el.clientWidth))
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/**
 * The hours the chart spans: from min(first call hour, open, now) to max(last call hour, close,
 * now) + 1, so the practice day is always on screen and nothing at 6 AM or 9 PM falls off.
 */
export function hourSpan(byHour: HourBucket[], nowHour: number): { lo: number; hi: number } {
  const busy = byHour.filter((b) => b.calls > 0).map((b) => b.hour)
  const lo = Math.min(OPEN_HOUR, nowHour, ...busy)
  const hi = Math.min(24, Math.max(CLOSE_HOUR, nowHour, ...busy) + 1)
  return { lo, hi }
}

/** A bar with its top corners rounded (r clamps to the bar's size). */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h))
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

function Chart({ byHour, width, now }: { byHour: HourBucket[]; width: number; now: number }) {
  const { hour, minute } = localHourMinute(now)
  const { lo, hi } = hourSpan(byHour, hour)
  const slot = width / (hi - lo)
  const bar = Math.round(slot * BAR_RATIO)
  const scale = Math.max(3, ...byHour.map((b) => b.calls))
  const unit = MAX_BAR / scale
  const nowX = Math.round((hour + minute / 60 - lo) * slot) + 0.5
  const nowLabel = `Now ${formatClock(now)}`
  const flip = nowX > width - NOW_FLIP
  const every = slot >= LABEL_EVERY_SLOT ? 1 : 2
  const hours = Array.from({ length: hi - lo }, (_, i) => lo + i)

  return (
    <svg
      className={styles.chartSvg}
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-labelledby="calls-by-hour-title"
    >
      <title id="calls-by-hour-title">Calls by hour, today</title>
      {GRIDLINES.map((y) => (
        <line key={y} className={styles.gridline} x1={0} x2={width} y1={y} y2={y} />
      ))}
      {byHour.map((b) => {
        if (b.calls <= 0 || b.hour < lo || b.hour >= hi) return null
        const x = Math.round((b.hour - lo) * slot + (slot - bar) / 2)
        const booked = Math.min(b.booked, b.calls)
        const hB = Math.round(booked * unit)
        const hT = Math.round(b.calls * unit)
        const top = BASELINE - hT
        return (
          <g key={b.hour}>
            {/* The whole bar in the tint, then the booked part over its bottom in the accent. */}
            <path className={booked < b.calls ? styles.barOpen : styles.barBooked} d={topRounded(x, top, bar, hT, RADIUS)} />
            {hB > 0 && booked < b.calls && (
              <rect className={styles.barBooked} x={x} y={BASELINE - hB} width={bar} height={hB} />
            )}
            <text className={styles.chartValue} x={x + bar / 2} y={top - 4} textAnchor="middle">
              {b.calls}
            </text>
          </g>
        )
      })}
      <line className={styles.baseline} x1={0} x2={width} y1={BASELINE + 0.5} y2={BASELINE + 0.5} />
      {hours.map((h) => {
        const landmark = h === OPEN_HOUR || h === CLOSE_HOUR
        if (!landmark && (h - lo) % every !== 0) return null
        // A plain label right next to a landmark would collide with it: the landmark wins.
        if (!landmark && every > 1 && (Math.abs(h - OPEN_HOUR) === 1 || Math.abs(h - CLOSE_HOUR) === 1)) return null
        return (
          <text
            key={h}
            className={landmark ? styles.chartLandmark : styles.chartText}
            x={(h - lo) * slot + slot / 2}
            y={LABEL_Y}
            textAnchor="middle"
            data-landmark={landmark ? '' : undefined}
          >
            {formatHourLabel(h)}
          </text>
        )
      })}
      <line className={styles.nowRule} x1={nowX} x2={nowX} y1={NOW_TOP} y2={BASELINE} />
      <text
        className={styles.chartText}
        x={flip ? nowX - 4 : nowX + 4}
        y={NOW_TOP + 10}
        textAnchor={flip ? 'end' : 'start'}
        data-now-label=""
      >
        {nowLabel}
      </text>
    </svg>
  )
}

/** 6.3 Calls by hour (P4): today across the practice day, a hand-drawn SVG bar per hour. */
export function CallsByHour() {
  const stats = useStats(1)
  const today = useCalls('today')
  const now = useNow(60_000)
  const [ref, width] = useWidth<HTMLDivElement>()
  const titleId = useId()

  const s = stats.data
  const byHour = s?.by_hour ?? []
  const firstCallAt = today.data?.length ? Math.min(...today.data.map((r) => r.started_at)) : undefined
  const sentence = s ? sayCallsByHour(byHour, firstCallAt) : ''
  const { lo, hi } = hourSpan(byHour, localHourMinute(now).hour)
  const slot = width / (hi - lo)
  const nonzero = byHour.filter((b) => b.calls > 0 && b.hour >= lo && b.hour < hi)

  let body
  if (!s && stats.isError) {
    body = <ErrorLine className={styles.chartError} onRetry={() => void stats.refetch()} />
  } else if (!s) {
    body = <SkeletonBar width="100%" height={HEIGHT} />
  } else {
    body = (
      <>
        {width > 0 && <Chart byHour={byHour} width={width} now={now} />}
        {width > 0 && (
          <div className={styles.hitLayer}>
            {nonzero.map((b) => (
              <Tooltip key={b.hour} content={hourTip(b)} position="top" className="glass-tooltip" tip={false} zIndex={30}>
                <div
                  className={styles.hit}
                  style={{ left: (b.hour - lo) * slot, width: slot }}
                  aria-hidden="true"
                />
              </Tooltip>
            ))}
          </div>
        )}
        <table className="visually-hidden">
          <caption>Calls by hour, today</caption>
          <thead>
            <tr>
              <th scope="col">Hour</th>
              <th scope="col">Calls</th>
              <th scope="col">Booked</th>
            </tr>
          </thead>
          <tbody>
            {nonzero.map((b) => (
              <tr key={b.hour}>
                <td>{formatHourLabel(b.hour)}</td>
                <td>{b.calls}</td>
                <td>{b.booked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )
  }

  // The header is drawn here, not by Card: the legend sits on its own 12px line under the title.
  return (
    <Card katie={sentence} className={styles.chartCard} aria-labelledby={titleId}>
      <div className={styles.chartHead}>
        <h2 id={titleId} className={styles.chartTitle}>
          Calls by hour
        </h2>
        <p className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.legendBooked}`} aria-hidden="true" />
            Booked
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.legendOpen}`} aria-hidden="true" />
            No booking
          </span>
        </p>
      </div>
      <div ref={ref} className={styles.chartBody}>
        {body}
      </div>
    </Card>
  )
}
