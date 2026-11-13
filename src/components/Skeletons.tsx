import { Skeleton } from '@vibe/core'
import type { CSSProperties } from 'react'
import styles from './Skeletons.module.css'

export interface SkeletonBarProps {
  /** px number, or any CSS width ("60%"). */
  width: number | string
  height: number
  className?: string
  style?: CSSProperties
}

/** One Vibe skeleton rectangle at an exact size (DESIGN: skeletons match the content box). */
export function SkeletonBar({ width, height, className, style }: SkeletonBarProps) {
  if (typeof width === 'number') {
    return (
      <span className={[styles.bar, className].filter(Boolean).join(' ')} style={style} aria-hidden="true">
        <Skeleton type="rectangle" size="custom" width={width} height={height} />
      </span>
    )
  }
  return (
    <span className={[styles.bar, className].filter(Boolean).join(' ')} style={{ width, ...style }} aria-hidden="true">
      <Skeleton type="rectangle" size="custom" height={height} fullWidth />
    </span>
  )
}

export interface SkeletonColumn {
  /** Column width as in the real table: px number, or CSS ("1fr" for the flex column). */
  width: number | string
  /** Bar width inside the cell, e.g. "60%". */
  bar: number | string
  /** Right-align the bar (numeric columns). */
  align?: 'left' | 'right'
}

export interface SkeletonRowsProps {
  rows: number
  columns: SkeletonColumn[]
  /** Row height: px, or CSS. Default var(--row-height) (44). */
  rowHeight?: number | string
  /** Bar height, default 12. */
  barHeight?: number
  className?: string
}

/** Table-shaped loading block: `rows` ruled rows with one bar per column. */
export function SkeletonRows({ rows, columns, rowHeight = 'var(--row-height)', barHeight = 12, className }: SkeletonRowsProps) {
  return (
    <div className={[styles.rows, className].filter(Boolean).join(' ')} role="group" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={styles.row} style={{ height: rowHeight }}>
          {columns.map((c, i) => (
            <div
              key={i}
              className={styles.cell}
              style={{
                width: typeof c.width === 'number' ? c.width : undefined,
                flex: typeof c.width === 'number' ? 'none' : '1 1 0',
                justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
              }}
            >
              <SkeletonBar width={c.bar} height={barHeight} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
