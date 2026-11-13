// The mascot's look, chosen per browser on Settings (settings key katie.mascot).
//
// Every look is Katie's own art: 'katie' is the original, the others are recoloured by
// scripts/mascot-looks.mjs (hair, skin and scrubs), which also writes the drawn parts' colours,
// so the arms, hands, legs and eyelids always match the head and torso. The rig, the motion and
// her moments are the same for every look; only the paint changes.
import { useSyncExternalStore, type CSSProperties } from 'react'
import { getSettings, subscribeSettings, type MascotId } from '../settings/store'
import { KATIE_HEAD, KATIE_TORSO } from './assets/manifest'
import katieAvatar20 from './assets/katie-avatar-20.png'
import katieAvatar40 from './assets/katie-avatar-40.png'
import katieAvatar60 from './assets/katie-avatar-60.png'
import { GENERATED_LOOKS, type GeneratedLook } from './looks.generated'
import { COLOR } from './rig'

export type MascotColors = GeneratedLook['colors']

export interface Mascot {
  id: MascotId
  /** Shown on Settings. */
  name: string
  head: string
  torso: string
  avatar20: string
  avatar40: string
  avatar60: string
  colors: MascotColors
}

const ORIGINAL: Mascot = {
  id: 'katie',
  name: 'Original',
  head: KATIE_HEAD.href,
  torso: KATIE_TORSO.href,
  avatar20: katieAvatar20,
  avatar40: katieAvatar40,
  avatar60: katieAvatar60,
  colors: {
    scrubLit: COLOR.scrubLit,
    scrubShade: COLOR.scrubShade,
    scrubHighlight: COLOR.scrubHighlight,
    skin: COLOR.skin,
    skinShade: COLOR.skinShade,
    skinLens: COLOR.skinLens,
  },
}

export const MASCOTS: readonly Mascot[] = [ORIGINAL, ...(GENERATED_LOOKS as readonly Mascot[])]

export function mascotById(id: MascotId): Mascot {
  return MASCOTS.find((m) => m.id === id) ?? ORIGINAL
}

/** The current look; follows Settings (and other tabs) live. */
export function useMascot(): Mascot {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings)
  return mascotById(settings.mascot)
}

/** The drawn parts read their colours from these custom properties (see FILL in Katie.tsx). */
export function mascotVars(m: Mascot): CSSProperties {
  const c = m.colors
  return {
    '--mascot-scrub-lit': c.scrubLit,
    '--mascot-scrub-shade': c.scrubShade,
    '--mascot-scrub-highlight': c.scrubHighlight,
    '--mascot-skin': c.skin,
    '--mascot-skin-shade': c.skinShade,
    '--mascot-skin-lens': c.skinLens,
  } as CSSProperties
}

/** The avatar's srcSet for a given CSS size (the shipped pattern: 1.5x and 2.5x steps). */
export function avatarSrcSet(m: Mascot, size: 20 | 24 | 40): { src: string; srcSet: string } {
  if (size === 20) return { src: m.avatar20, srcSet: `${m.avatar40} 2x, ${m.avatar60} 3x` }
  if (size === 24) return { src: m.avatar40, srcSet: `${m.avatar40} 1.5x, ${m.avatar60} 2.5x` }
  return { src: m.avatar40, srcSet: `${m.avatar60} 1.5x` }
}
