import { useLayoutEffect, useMemo, useRef } from 'react'
import { ButtonGroup } from '@vibe/core'

export interface PressedButtonGroupOption {
  value: string
  text: string
}

export interface PressedButtonGroupProps {
  /** The group's accessible name ("Range", "Katie's home"). */
  groupAriaLabel: string
  value: string
  options: readonly PressedButtonGroupOption[]
  onSelect: (value: string) => void
}

/**
 * Vibe's ButtonGroup (size small, its own look), with the selected option exposed to assistive
 * tech as aria-pressed="true" and the others "false" (WCAG 4.1.2, a11y-06). Vibe shows the
 * selection only as a class and does not forward a pressed state to its buttons, so the
 * attribute is set on the rendered buttons after every render; React leaves attributes it does
 * not manage alone.
 */
export function PressedButtonGroup({ groupAriaLabel, value, options, onSelect }: PressedButtonGroupProps) {
  const ref = useRef<HTMLDivElement>(null)
  const vibeOptions = useMemo(() => options.map((o) => ({ value: o.value, text: o.text })), [options])

  useLayoutEffect(() => {
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('[role="group"] button')
    if (!buttons || buttons.length !== options.length) return
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', options[i]?.value === value ? 'true' : 'false'))
  })

  return (
    <ButtonGroup
      ref={ref}
      // DESIGN-GLASS (fix L2): a glass segmented pill, styled in styles/glass.css.
      className="glass-segmented"
      size="small"
      groupAriaLabel={groupAriaLabel}
      value={value}
      options={vibeOptions}
      onSelect={(v) => onSelect(String(v))}
    />
  )
}
