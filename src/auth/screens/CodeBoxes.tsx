import { useEffect, useRef } from 'react'
import { cleanCode } from '../helpers'
import styles from './auth.module.css'

/** Six single-digit boxes: typing moves on, backspace moves back, a pasted code fills them all. */
export function CodeBoxes({
  value,
  onChange,
  disabled,
  groupLabel,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  groupLabel: string
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const focus = (i: number) => refs.current[Math.max(0, Math.min(5, i))]?.focus()
  // On mount and whenever the boxes empty (a wrong code), start again at the first box.
  useEffect(() => {
    if (value === '') focus(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const cells = Array.from({ length: 6 }, (_, i) => value[i] ?? '')

  const put = (i: number, raw: string) => {
    const d = cleanCode(raw)
    const next = [...cells]
    if (d === '') {
      next[i] = ''
      onChange(next.join('').slice(0, 6))
      return
    }
    for (let k = 0; k < d.length && i + k < 6; k++) next[i + k] = d[k] as string
    onChange(next.join(''))
    focus(i + d.length)
  }

  return (
    <div className={styles.code} role="group" aria-label={groupLabel}>
      {cells.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className={styles.digit}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1} of 6`}
          value={c}
          disabled={disabled}
          onChange={(e) => put(i, e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !c) {
              e.preventDefault()
              const next = [...cells]
              next[Math.max(0, i - 1)] = ''
              onChange(next.join('').replace(/\s+$/, ''))
              focus(i - 1)
            } else if (e.key === 'ArrowLeft') focus(i - 1)
            else if (e.key === 'ArrowRight') focus(i + 1)
          }}
          onPaste={(e) => {
            e.preventDefault()
            put(0, e.clipboardData.getData('text'))
          }}
        />
      ))}
    </div>
  )
}
