// The glass, editable (DESIGN-GLASS 9.7): the four reference looks, then every ingredient from the
// Katie Glass Lab as a control. Per browser (settings/look.ts); each change applies as it is made.
import { useId } from 'react'
import { Card, PressedButtonGroup, TextButton } from '../../components'
import {
  DEFAULT_PRESET,
  LENS_SUPPORTED,
  LOOK_RANGES,
  useLook,
  type Backdrop,
  type EdgeStyle,
  type Look,
  type PresetName,
  type TextSize,
  type Tint,
} from '../../settings'
import { Row, ToggleRow } from './rows'
import rows from '../lists/Settings.module.css'
import styles from './look.module.css'

// Named for what you see, not for their settings (Tom, 2026-11-02). The hint is the button's tooltip.
const PRESET_OPTIONS: { value: PresetName; text: string; hint: string }[] = [
  { value: 'tweak', text: 'Daylight', hint: 'Light glass over a colour field, a soft lit edge. The default.' },
  { value: 'recipe', text: 'Frost', hint: 'The same glass with more blur and one crisp hairline edge.' },
  { value: 'apple', text: 'Dusk', hint: 'Dark glass over the office at dusk, white text.' },
  { value: 'shipped', text: 'Original', hint: 'The first glass: the office photo and a heavier, whiter pane.' },
]

const BACKDROP_OPTIONS: { value: Backdrop; text: string }[] = [
  { value: 'field', text: 'Colour field' },
  { value: 'room', text: 'Office, as shipped' },
  { value: 'room-clear', text: 'Office, clearer' },
  { value: 'photo', text: 'Dusk office photo' },
]

const TINT_OPTIONS: { value: Tint; text: string }[] = [
  { value: 'light', text: 'Light glass, dark text' },
  { value: 'dark', text: 'Dark glass, white text' },
]

const EDGE_OPTIONS: { value: EdgeStyle; text: string }[] = [
  { value: 'gradient', text: 'Gradient rim' },
  { value: 'crisp', text: 'One crisp hairline' },
  { value: 'shipped', text: 'Shipped 4 px soft ring' },
]

const TEXT_OPTIONS: { value: TextSize; text: string }[] = [
  { value: 'shipped', text: 'As shipped' },
  { value: 'larger', text: 'Larger' },
  { value: 'largest', text: 'Largest' },
]

type NumberKey = keyof typeof LOOK_RANGES

function SliderRow({
  label,
  helper,
  field,
  look,
  format,
  onChange,
}: {
  label: string
  helper?: string
  field: NumberKey
  look: Look
  format: (v: number) => string
  onChange: (patch: Partial<Look>) => void
}) {
  const id = useId()
  const helperId = useId()
  const r = LOOK_RANGES[field]
  const v = look[field]
  return (
    <Row label={label} helper={helper} helperId={helperId} htmlFor={id}>
      <input
        id={id}
        className={styles.slider}
        aria-describedby={helper ? helperId : undefined}
        type="range"
        min={r.min}
        max={r.max}
        step={r.step}
        value={v}
        aria-valuetext={format(v)}
        onChange={(e) => onChange({ [field]: Number(e.currentTarget.value) } as Partial<Look>)}
      />
      <output htmlFor={id} className={styles.value} aria-live="off">
        {format(v)}
      </output>
    </Row>
  )
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const px = (v: number) => `${v} px`

export function LookCard() {
  const { look, preset, setLook, setPreset } = useLook()
  const presetsId = useId()
  return (
    <Card className={rows.card} title="The glass">
      <div className={rows.rows}>
        <Row
          label="Start from"
          helper={
            preset
              ? 'Four looks to start from; Daylight is the default. Pick one, then change anything below; the page follows as you move a control.'
              : 'Your own changes on top of one of these looks. Reset, at the bottom, puts Daylight back.'
          }
          labelId={presetsId}
          stacked
        >
          <div className={styles.presets} role="group" aria-labelledby={presetsId}>
            {PRESET_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={styles.preset}
                aria-pressed={preset === o.value}
                title={o.hint}
                onClick={() => setPreset(o.value)}
              >
                {o.text}
              </button>
            ))}
          </div>
        </Row>

        <div className={rows.group}>Behind the glass</div>
        <Row label="Backdrop" helper="What shows through the glass. The frost only shows against something with edges behind it." stacked>
          <PressedButtonGroup
            groupAriaLabel="Backdrop"
            value={look.backdrop}
            options={BACKDROP_OPTIONS}
            onSelect={(v) => setLook({ backdrop: v as Backdrop })}
          />
        </Row>
        <ToggleRow
          label="Corner glass objects"
          helper="The three tiles at the corners: a phone, a calendar and a check."
          value={look.objects}
          onChange={(on) => setLook({ objects: on })}
        />

        <div className={rows.group}>The pane</div>
        <Row label="Tint" stacked>
          <PressedButtonGroup
            groupAriaLabel="Tint"
            value={look.tint}
            options={TINT_OPTIONS}
            onSelect={(v) => setLook({ tint: v as Tint })}
          />
        </Row>
        <SliderRow label="Fill" helper="How solid the glass is. Lower is clearer; higher is closer to a white card." field="paneA" look={look} format={pct} onChange={setLook} />
        <SliderRow label="Blur" helper="How frosted the glass is. It only shows against something sharp behind it." field="blur" look={look} format={px} onChange={setLook} />
        <SliderRow label="Colour boost" helper="Brightens the colours behind the glass so the frost does not go grey." field="sat" look={look} format={(v) => v.toFixed(2)} onChange={setLook} />
        <SliderRow label="Corner radius" field="radius" look={look} format={px} onChange={setLook} />

        <div className={rows.group}>The edge</div>
        <Row label="Edge" stacked>
          <PressedButtonGroup
            groupAriaLabel="Edge"
            value={look.edge}
            options={EDGE_OPTIONS}
            onSelect={(v) => setLook({ edge: v as EdgeStyle })}
          />
        </Row>
        <SliderRow
          label="Edge gradient"
          helper="A soft band of light just inside the edge, bright at the top and left, shaded at the bottom. Bigger reads as thicker glass."
          field="edgeG"
          look={look}
          format={px}
          onChange={setLook}
        />
        <ToggleRow label="Light along the top edge" helper="A bright line along the top and left edges, a shaded one along the bottom." value={look.lit} onChange={(on) => setLook({ lit: on })} />
        <ToggleRow label="Sheen" helper="A soft diagonal highlight across the pane, like light on a window." value={look.sheen} onChange={(on) => setLook({ sheen: on })} />
        <ToggleRow label="Drop shadow" value={look.shadow} onChange={(on) => setLook({ shadow: on })} />
        <ToggleRow label="Inner glow" helper="A white haze just inside the edge, from the shipped look." value={look.glow} onChange={(on) => setLook({ glow: on })} />
        <ToggleRow label="Grain" helper="A faint speckle over the glass." value={look.grain} onChange={(on) => setLook({ grain: on })} />
        <ToggleRow
          label="Refraction at the rim"
          helper={
            LENS_SUPPORTED
              ? 'Bends what is behind the glass near the edge, the way Apple’s glass does. Chrome and Edge only.'
              : 'Chrome and Edge only; this browser cannot draw it, so it is off here.'
          }
          value={look.lens && LENS_SUPPORTED}
          disabled={!LENS_SUPPORTED}
          onChange={(on) => setLook({ lens: on })}
        />

        <div className={rows.group}>The cards</div>
        <SliderRow label="Card fill" field="cardA" look={look} format={pct} onChange={setLook} />
        <ToggleRow label="Card edge" helper="A one-pixel light edge on every card." value={look.cardEdge} onChange={(on) => setLook({ cardEdge: on })} />
        <ToggleRow
          label="Cards blur the glass behind them"
          helper="Each card frosts what is behind it too. Costs a little on slower machines."
          value={look.cardBlur}
          onChange={(on) => setLook({ cardBlur: on })}
        />
        <SliderRow label="Card corner radius" field="cardR" look={look} format={px} onChange={setLook} />

        <div className={rows.group}>The type</div>
        <Row label="Text size" helper="Everything inside the pane, and the big numbers with it." stacked>
          <PressedButtonGroup
            groupAriaLabel="Text size"
            value={look.textSize}
            options={TEXT_OPTIONS}
            onSelect={(v) => setLook({ textSize: v as TextSize })}
          />
        </Row>
        <ToggleRow
          label="Crisper text"
          helper="Draws text a little bolder, the way the system does by default. Easier to read on a 1080p screen."
          value={look.crispText}
          onChange={(on) => setLook({ crispText: on })}
        />

        <Row label="Back to the default" helper="Puts Daylight back, with everything as it was.">
          <TextButton onClick={() => setPreset(DEFAULT_PRESET)}>Reset</TextButton>
        </Row>
      </div>
    </Card>
  )
}
