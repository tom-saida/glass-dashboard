// DESIGN 6.11: per-browser settings. No data-katie here (she never comes to Settings).
import { useEffect, useId, useState } from 'react'
import { TextField } from '@vibe/core'
import { Card, PressedButtonGroup } from '../components'
import { DEMO_BUILD } from '../mock/mode'
import { Col, PageGrid } from '../shell'
import { DEFAULT_API_BASE, useSettings, type KatieHome } from '../settings'
import { canManagePeople } from '../auth/helpers'
import { isCognitoMode, useAuthSession } from '../auth/session'
import { ActivityCard } from './settings/ActivityCard'
import { LookCard } from './settings/LookCard'
import { MascotRow } from './settings/MascotRow'
import { PeopleCard } from './settings/PeopleCard'
import { Row, ToggleRow } from './settings/rows'
import styles from './lists/Settings.module.css'

const HOME_OPTIONS = [
  { value: 'bottom-right', text: 'Bottom right' },
  { value: 'bottom-left', text: 'Bottom left' },
]

const KATIE_OPTIONS = [
  { value: 'occasional', text: 'Occasional' },
  { value: 'off', text: 'Off' },
]
const KATIE_HELPER =
  'Katie steps in for urgent callbacks, the day\'s first booking and a few other moments, then gets out of the way.'

export default function Settings() {
  const settings = useSettings()
  // People and Activity: cognito mode, owner and SAIDA support only (staff see neither).
  const role = useAuthSession().me?.role
  const manage = isCognitoMode() && canManagePeople(role)
  return (
    <PageGrid>
      <Col span={12}>
        <Card className={styles.card}>
          <div className={styles.rows}>
            <ToggleRow
              label="Show numbers"
              helper="Shows full phone numbers in this browser only. Off by default."
              value={settings.showNumbers}
              onChange={settings.setShowNumbers}
            />
            <KatieRow value={settings.katieEnabled} onChange={settings.setKatieEnabled} />
            <HomeRow value={settings.katieHome} onChange={settings.setKatieHome} />
            <MascotRow value={settings.mascot} onChange={settings.setMascot} />
            {/* A production build opened with ?mock (a demo): the way back to the practice's
                own data. The top bar says "Demo data" meanwhile. Not in the closers' demo build
                (DEMO_BUILD): it has no backend, so there is no "own data" to go back to (D7). */}
            {!import.meta.env.DEV && !DEMO_BUILD && settings.mock !== null && (
              <ToggleRow
                label="Demo data"
                helper="This tab shows made-up sample calls. Turn off to see the practice's own."
                value
                onChange={(on) => {
                  if (!on) settings.setMock(null)
                }}
              />
            )}
            {import.meta.env.DEV && (
              <>
                <div className={styles.group}>Development</div>
                <ApiBaseRow value={settings.apiBase} onCommit={settings.setApiBase} />
                <ToggleRow
                  label="Mock data"
                  helper="Serves the bundled fixtures instead of the API."
                  value={settings.mock !== null}
                  onChange={(on) => settings.setMock(on ? 'fixtures' : null)}
                />
              </>
            )}
          </div>
        </Card>
      </Col>
      {manage && (
        <>
          <Col span={12}>
            <PeopleCard />
          </Col>
          <Col span={12}>
            <ActivityCard />
          </Col>
        </>
      )}
      <Col span={12}>
        <LookCard />
      </Col>
    </PageGrid>
  )
}

/** Katie: Occasional / Off (the katie.enabled key, '0' = Off, so earlier choices survive). */
function KatieRow({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  const labelId = useId()
  return (
    <Row label="Katie" labelId={labelId} helper={value ? KATIE_HELPER : undefined}>
      <PressedButtonGroup
        groupAriaLabel="Katie"
        value={value ? 'occasional' : 'off'}
        options={KATIE_OPTIONS}
        onSelect={(v) => onChange(v !== 'off')}
      />
    </Row>
  )
}

function HomeRow({ value, onChange }: { value: KatieHome; onChange: (h: KatieHome) => void }) {
  const labelId = useId()
  return (
    <Row label="Katie's corner" labelId={labelId}>
      <PressedButtonGroup
        groupAriaLabel="Katie's corner"
        value={value}
        options={HOME_OPTIONS}
        onSelect={(v) => onChange(v === 'bottom-left' ? 'bottom-left' : 'bottom-right')}
      />
    </Row>
  )
}

function ApiBaseRow({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const v = draft.trim() || DEFAULT_API_BASE
    if (v !== value) onCommit(v)
    else setDraft(v)
  }
  return (
    <Row label="API base" htmlFor={id}>
      <TextField
        id={id}
        className={styles.field}
        size="small"
        value={draft}
        placeholder={DEFAULT_API_BASE}
        inputAriaLabel="API base"
        autoComplete="off"
        onChange={(v: string) => setDraft(v)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
    </Row>
  )
}
