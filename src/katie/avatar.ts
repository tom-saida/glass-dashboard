// The mascot's round avatar (top bar, rail, sign-in, call transcript) for the current look.
// new URL(): the asset URLs without importing the asset modules the lazy Katie chunk imports
// (a module shared by the entry and a lazy chunk would get a chunk of its own).
import { useSyncExternalStore } from 'react'
import { getSettings, subscribeSettings, type MascotId } from '../settings/store'

interface AvatarSet {
  a20: string
  a40: string
  a60: string
}

const AVATARS: Record<MascotId, AvatarSet> = {
  katie: {
    a20: new URL('./assets/katie-avatar-20.png', import.meta.url).href,
    a40: new URL('./assets/katie-avatar-40.png', import.meta.url).href,
    a60: new URL('./assets/katie-avatar-60.png', import.meta.url).href,
  },
  plum: {
    a20: new URL('./assets/looks/plum-avatar-20.png', import.meta.url).href,
    a40: new URL('./assets/looks/plum-avatar-40.png', import.meta.url).href,
    a60: new URL('./assets/looks/plum-avatar-60.png', import.meta.url).href,
  },
  teal: {
    a20: new URL('./assets/looks/teal-avatar-20.png', import.meta.url).href,
    a40: new URL('./assets/looks/teal-avatar-40.png', import.meta.url).href,
    a60: new URL('./assets/looks/teal-avatar-60.png', import.meta.url).href,
  },
  rose: {
    a20: new URL('./assets/looks/rose-avatar-20.png', import.meta.url).href,
    a40: new URL('./assets/looks/rose-avatar-40.png', import.meta.url).href,
    a60: new URL('./assets/looks/rose-avatar-60.png', import.meta.url).href,
  },
}

export function avatarFor(id: MascotId): AvatarSet {
  return AVATARS[id] ?? AVATARS.katie
}

/** The current look's avatar; follows Settings (and other tabs) live. */
export function useMascotAvatar(): AvatarSet {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings)
  return avatarFor(settings.mascot)
}
