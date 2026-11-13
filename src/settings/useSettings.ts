import { useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  getMockScenario,
  getSettings,
  setMockScenario,
  subscribeSettings,
  updateSettings,
  type KatieHome,
  type MascotId,
  type MockScenario,
  type Settings,
} from './store'

export interface UseSettings extends Settings {
  setShowNumbers: (on: boolean) => void
  setKatieEnabled: (on: boolean) => void
  setKatieHome: (home: KatieHome) => void
  setMascot: (id: MascotId) => void
  /** Dev only. */
  setApiBase: (base: string) => void
  /** Active mock scenario for this tab, or null. */
  mock: MockScenario | null
  /** Switches scenario and reloads the tab (dev controls; in production only to turn a demo off). */
  setMock: (s: MockScenario | null) => void
}

/** Reactive settings. Works when storage throws (defaults apply). */
export function useSettings(): UseSettings {
  const s = useSyncExternalStore(subscribeSettings, getSettings, getSettings)
  const setShowNumbers = useCallback((on: boolean) => updateSettings({ showNumbers: on }), [])
  const setKatieEnabled = useCallback((on: boolean) => updateSettings({ katieEnabled: on }), [])
  const setKatieHome = useCallback((home: KatieHome) => updateSettings({ katieHome: home }), [])
  const setMascot = useCallback((id: MascotId) => updateSettings({ mascot: id }), [])
  const setApiBase = useCallback((base: string) => updateSettings({ apiBase: base }), [])
  return useMemo(
    () => ({
      ...s,
      setShowNumbers,
      setKatieEnabled,
      setKatieHome,
      setMascot,
      setApiBase,
      mock: getMockScenario(),
      setMock: setMockScenario,
    }),
    [s, setShowNumbers, setKatieEnabled, setKatieHome, setMascot, setApiBase],
  )
}
