import { useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  getLook,
  presetOf,
  setLookPreset,
  subscribeLook,
  updateLook,
  type Look,
  type PresetName,
} from './look'

export interface UseLook {
  look: Look
  /** The preset the look equals, or null once any control has moved. */
  preset: PresetName | null
  setLook: (patch: Partial<Look>) => void
  setPreset: (name: PresetName) => void
}

/** The glass look, reactive. Works when storage throws (the default applies). */
export function useLook(): UseLook {
  const look = useSyncExternalStore(subscribeLook, getLook, getLook)
  const setLook = useCallback((patch: Partial<Look>) => updateLook(patch), [])
  const setPreset = useCallback((name: PresetName) => setLookPreset(name), [])
  return useMemo(() => ({ look, preset: presetOf(look), setLook, setPreset }), [look, setLook, setPreset])
}
