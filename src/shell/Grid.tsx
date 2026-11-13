import type { CSSProperties, ReactNode } from 'react'
import styles from './Grid.module.css'

/** The page grid: 12 columns, 24px gaps. Children are <Col>s. */
export function PageGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[styles.grid, className].filter(Boolean).join(' ')}>{children}</div>
}

export interface ColProps {
  /** Columns to span (1-12). */
  span: number
  /** First column (1-12); omit to flow. */
  start?: number
  /** Stretch to the row height (cards in one row the same height). */
  stretch?: boolean
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/** A grid cell: <Col span={4}> is the Line tile, <Col span={8}> the KPI card, and so on. */
export function Col({ span, start, stretch, children, className, style }: ColProps) {
  const gridColumn = start ? `${start} / span ${span}` : `span ${span}`
  return (
    <div
      className={[styles.col, className].filter(Boolean).join(' ')}
      style={{ gridColumn, alignSelf: stretch ? 'stretch' : undefined, display: stretch ? 'grid' : undefined, ...style }}
    >
      {children}
    </div>
  )
}
