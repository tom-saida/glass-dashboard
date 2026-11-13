import { Suspense, lazy, useId } from 'react'
import { Toggle, Tooltip } from '@vibe/core'
import { requestSummon } from '../katie/summon'
import type { CallsRange } from '../api/queries'
import { useStats } from '../api/queries'
import { PressedButtonGroup } from '../components/PressedButtonGroup'
import { formatTodayLong, formatTodayShort, getPracticeTz } from '../lib/time'
import { getMockScenario } from '../mock/mode'
import { isDemoMode } from '../mock/demoControl'
import { useNow } from '../lib/useNow'
import { useSettings } from '../settings'
import type { PageMeta } from './pages'
import { RANGE_OPTIONS } from './range'
import { AccountLine } from './AccountLine'
import { SessionLine } from './SessionLine'
import styles from './Shell.module.css'
import { useMascotAvatar } from '../katie/avatar'

/** The Show numbers switch (top bar and Settings share the one setting). */
export function ShowNumbersToggle({ label = 'Show numbers' }: { label?: string }) {
  const id = useId()
  const { showNumbers, setShowNumbers } = useSettings()
  return (
    <>
      <label htmlFor={id} className={styles.numbersLabel}>
        {label}
      </label>
      <Toggle
        id={id}
        size="small"
        areLabelsHidden
        isSelected={showNumbers}
        onChange={(v: boolean) => setShowNumbers(v)}
      />
    </>
  )
}

/**
 * "Today, Monday, October 12" from 1440 wide; "Monday, October 12" below, so at 1280 the date
 * ends before Katie's Line-tile spot (RV-2). CSS picks one; the other is display: none, which
 * also hides it from screen readers.
 */
function TodayLabel() {
  const tz = useStats(1).data?.range.tz ?? getPracticeTz()
  const now = useNow(60_000)
  return (
    <span className={styles.date}>
      <span className={styles.dateLong}>{formatTodayLong(now, tz)}</span>
      <span className={styles.dateShort}>{formatTodayShort(now, tz)}</span>
    </span>
  )
}

/**
 * Production builds opened with ?mock=1 (or another regression scenario): one plain line so
 * nobody mistakes the fixtures for the practice's calls. Settings has the way off. Development
 * builds keep their own controls (Settings > Development) and show nothing here. Demo mode
 * (?mock=demo) shows the Demo control instead (DemoMenu), which says the same thing.
 */
function DemoDataLine() {
  if (import.meta.env.DEV || !getMockScenario() || isDemoMode()) return null
  return <span className={styles.demo}>Demo data</span>
}

// The Demo control (P21) is its own chunk with Vibe's Menu: a practice's screen never loads it.
const DemoMenu = lazy(() => import('./DemoMenu'))

function DemoControl({ pagePath }: { pagePath: string }) {
  if (!isDemoMode()) return null
  return (
    <Suspense fallback={null}>
      <DemoMenu pagePath={pagePath} />
    </Suspense>
  )
}

const SUMMON_LABEL = 'Point out what needs attention'

/**
 * The one way to ask for Katie (docs/research/MONDAY-LLAMA-2026-10-13.md 3.6): her 24 px head in
 * a 36 px glass circle (DESIGN-GLASS 3.4).
 * She walks to the most pressing widget on the page, which also scrolls into view and takes
 * focus, so the button is useful with a keyboard or a screen reader too (her layer is
 * aria-hidden). Hidden when Katie is Off, below 1024 px (CSS) and on Settings (no widgets).
 */
function SummonButton() {
  const { katieEnabled } = useSettings()
  const avatar = useMascotAvatar()
  if (!katieEnabled) return null
  return (
    <Tooltip content={SUMMON_LABEL} position="bottom" className="glass-tooltip" tip={false} zIndex={30}>
      <button type="button" className={styles.summon} aria-label={SUMMON_LABEL} onClick={() => requestSummon()}>
        <img src={avatar.a40} srcSet={`${avatar.a40} 1.5x, ${avatar.a60} 2.5x`} width={24} height={24} alt="" />
      </button>
    </Tooltip>
  )
}

export interface TopBarProps {
  page: PageMeta
  range: CallsRange
  onRangeChange: (r: CallsRange) => void
}

export function TopBar({ page, range, onRangeChange }: TopBarProps) {
  return (
    // data-katie-avoid: Katie keeps her body and bubble clear of both groups (the page title
    // with its date or range, and the right-hand controls with Show numbers).
    <header className={styles.topbar}>
      <div className={styles.topLeft} data-katie-avoid="">
        <h1 className={styles.title}>{page.title}</h1>
        {page.range === 'today' && <TodayLabel />}
        {page.range === 'calls' && (
          <PressedButtonGroup
            groupAriaLabel="Range"
            value={range}
            options={RANGE_OPTIONS}
            onSelect={(v) => onRangeChange(v as CallsRange)}
          />
        )}
      </div>
      <div className={styles.topRight} data-katie-avoid="">
        <DemoDataLine />
        <DemoControl pagePath={page.path} />
        <SessionLine />
        <AccountLine />
        {page.numbers && (
          <span className={styles.pill}>
            <ShowNumbersToggle />
          </span>
        )}
        {page.path !== '/settings' && <SummonButton />}
      </div>
    </header>
  )
}
