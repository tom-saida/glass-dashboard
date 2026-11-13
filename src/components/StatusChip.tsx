import { callChip, dispositionChip, noteChip, type Chip, type ChipTone } from '../lib/chips'
import styles from './StatusChip.module.css'

export interface StatusChipProps {
  tone: ChipTone
  children: string
  className?: string
}

/** One status chip: Booked / No booking / Live / Dropped / Callback / Urgent / FYI. */
export function StatusChip({ tone, children, className }: StatusChipProps) {
  return <span className={[styles.chip, styles[tone], className].filter(Boolean).join(' ')}>{children}</span>
}

/** Renders a Chip from lib/chips. */
export function ChipView({ chip, className }: { chip: Chip; className?: string }) {
  return (
    <StatusChip tone={chip.tone} className={className}>
      {chip.label}
    </StatusChip>
  )
}

/** A call row's outcome (status "live" wins). */
export function CallChip({ row, className }: { row: { status?: string; disposition: string }; className?: string }) {
  return <ChipView chip={callChip(row)} className={className} />
}

export function DispositionChip({ disposition, className }: { disposition: string; className?: string }) {
  return <ChipView chip={dispositionChip(disposition)} className={className} />
}

/** A desk note's priority: Urgent / Callback / FYI. */
export function NoteChip({ note, className }: { note: { urgent: boolean; fyi: boolean }; className?: string }) {
  return <ChipView chip={noteChip(note)} className={className} />
}
