import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import { Menu, MenuButton, MenuDivider, MenuItem } from '@vibe/core'
import { DropdownChevronDown } from '@vibe/icons'
import { requestSummon } from '../katie/summon'
import { playSampleCall, resetDay, sampleCallState, subscribeDemo } from '../mock/demoControl'
import { useSettings } from '../settings'
import styles from './Shell.module.css'

type SampleState = ReturnType<typeof sampleCallState>

function subscribeSample(cb: () => void): () => void {
  return subscribeDemo(() => cb())
}

function useSampleState(): SampleState {
  return useSyncExternalStore(subscribeSample, sampleCallState, sampleCallState)
}

/**
 * The trigger's content: "Demo" and a 16 px chevron. Passed as MenuButton's `component` rather
 * than `text`: with `text`, Vibe renders aria-label="false" (its `!text && label`), which would
 * make the button's accessible name "false". The button's name is aria-label "Demo controls",
 * which contains the visible word (WCAG 2.5.3).
 */
function DemoTrigger() {
  return (
    <>
      <span className={styles.demoText}>Demo</span>
      <DropdownChevronDown size="16" aria-hidden className={styles.demoChevron} />
    </>
  )
}

/** A key hint in a menu item's right slot (rendered by Vibe's Icon as an svg-type component). */
function keyHint(key: string) {
  function KeyHint(props: { className?: string }) {
    return (
      <kbd className={[styles.kbd, props.className].filter(Boolean).join(' ')} aria-hidden>
        {key}
      </kbd>
    )
  }
  return KeyHint
}
const HINT_R = keyHint('R')
const HINT_P = keyHint('P')
const HINT_K = keyHint('K')

/**
 * Focus is somewhere the closer types: inputs, selects, textareas, contenteditable, and the
 * combobox / textbox roles (Vibe's Dropdown). Shortcuts never fire there.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  const els = [target instanceof Element ? target : null, document.activeElement]
  for (const el of els) {
    if (!el) continue
    if ((el as HTMLElement).isContentEditable) return true
    if (el.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="searchbox"]')) {
      return true
    }
  }
  return false
}

export interface DemoActions {
  reset: () => void
  play: (speed: 1 | 2) => void
  summon: () => void
  canSummon: boolean
  playing: boolean
}

function useDemoActions(pagePath: string): DemoActions {
  const navigate = useNavigate()
  const { katieEnabled } = useSettings()
  const sample = useSampleState()
  const playing = sample === 'playing'
  const canSummon = katieEnabled && pagePath !== '/settings'

  const reset = useCallback(() => {
    // Re-materialize the day, then go to the page's root: the drawer (if open) closes and the
    // range goes back to Today.
    void resetDay()
      .catch(() => undefined)
      .finally(() => navigate(pagePath))
  }, [navigate, pagePath])

  const play = useCallback(
    (speed: 1 | 2) => {
      if (sampleCallState() === 'playing') return
      void playSampleCall({ speed }).catch(() => undefined)
    },
    [],
  )

  const summon = useCallback(() => {
    if (canSummon) requestSummon()
  }, [canSummon])

  return { reset, play, summon, canSummon, playing }
}

/** R / P / K for the closer (FINDINGS 5c.3). Never while typing, never with a modifier. */
function useDemoShortcuts(actions: DemoActions): void {
  const ref = useRef(actions)
  ref.current = actions
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing) return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (isTypingTarget(e.target)) return
      const k = e.key.toLowerCase()
      const a = ref.current
      if (k === 'r') a.reset()
      else if (k === 'p') a.play(1)
      else if (k === 'k') a.summon()
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * P21: the top bar's Demo control, only in demo mode (?mock=demo or VITE_DEMO_DEFAULT). A quiet
 * text button that opens one menu: reset the day, replay the sample call, bring Katie in, show
 * numbers; R / P / K as shortcuts. ?mock=1 keeps the plain "Demo data" line instead.
 * Lazy (TopBar): Vibe's Menu and MenuButton load only in demo mode, never for a practice.
 */
export default function DemoMenu({ pagePath }: { pagePath: string }) {
  const actions = useDemoActions(pagePath)
  const { showNumbers, setShowNumbers } = useSettings()
  useDemoShortcuts(actions)
  const { reset, play, summon, canSummon, playing } = actions
  // Vibe's own open state paints the trigger --primary-selected-color (light blue); the open
  // trigger here is the whiter glass pill instead (one accent, P9).
  const [open, setOpen] = useState(false)

  return (
    <MenuButton
      className={[styles.demoButton, open ? styles.demoButtonOpen : ''].filter(Boolean).join(' ')}
      component={DemoTrigger}
      size="small"
      active={false}
      aria-label="Demo controls"
      closeMenuOnItemClick
      dialogPosition="bottom-end"
      dialogClassName="glass-menu"
      zIndex={30}
      onMenuShow={() => setOpen(true)}
      onMenuHide={() => setOpen(false)}
    >
      <Menu id="demo-menu" size="medium" aria-label="Demo controls">
        <MenuItem title="Reset the day" rightIcon={HINT_R} onClick={reset} />
        <MenuDivider />
        <MenuItem
          title={playing ? 'Playing…' : 'Play a sample call'}
          rightIcon={playing ? undefined : HINT_P}
          disabled={playing}
          onClick={() => play(1)}
        />
        <MenuItem title="Play at 2x" disabled={playing} onClick={() => play(2)} />
        <MenuDivider />
        <MenuItem
          title="Bring Katie in"
          rightIcon={HINT_K}
          disabled={!canSummon}
          disableReason={canSummon ? undefined : pagePath === '/settings' ? 'Not on Settings.' : 'Katie is Off in Settings.'}
          onClick={summon}
        />
        <MenuItem title={showNumbers ? 'Hide numbers' : 'Show numbers'} onClick={() => setShowNumbers(!showNumbers)} />
      </Menu>
    </MenuButton>
  )
}
