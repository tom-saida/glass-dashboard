// Settings > Mascot: pick Katie's look (src/katie/mascot.ts). Per browser, like every setting here.
import { useId } from 'react'
import { avatarFor } from '../../katie/avatar'
import { MASCOT_IDS, type MascotId } from '../../settings'
import { Row } from './rows'
import styles from './MascotRow.module.css'

const NAMES: Record<MascotId, string> = { katie: 'Original', plum: 'Plum', teal: 'Teal', rose: 'Rose' }
const HELPER = 'How Katie looks everywhere she appears: her hair, skin tone and scrubs.'

export function MascotRow({ value, onChange }: { value: MascotId; onChange: (id: MascotId) => void }) {
  const labelId = useId()
  const helperId = useId()
  return (
    <Row label="Mascot" labelId={labelId} helper={HELPER} helperId={helperId}>
      <div className={styles.options} role="group" aria-labelledby={labelId} aria-describedby={helperId}>
        {MASCOT_IDS.map((id) => {
          const a = avatarFor(id)
          const on = id === value
          return (
            <button
              key={id}
              type="button"
              className={on ? `${styles.option} ${styles.on}` : styles.option}
              aria-pressed={on}
              onClick={() => onChange(id)}
            >
              <img src={a.a40} srcSet={`${a.a60} 1.5x`} width={40} height={40} alt="" />
              <span>{NAMES[id]}</span>
            </button>
          )
        })}
      </div>
    </Row>
  )
}
