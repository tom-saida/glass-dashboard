// Which drawer is open (Katie walks home while one is) and where focus returns on close.
import { useSyncExternalStore } from 'react'

/** A call's transcript (/calls/:id) or a lead (/leads/:id). */
export type DrawerKind = 'call' | 'lead'

let open: { kind: DrawerKind; id: string } | null = null
const listeners = new Set<() => void>()

/** The id of the open drawer of any kind, or null. */
export function getDrawerOpenId(): string | null {
  return open?.id ?? null
}

export function setDrawerOpenId(id: string | null, kind: DrawerKind = 'call'): void {
  if (id === null ? open === null : open?.id === id && open.kind === kind) return
  open = id === null ? null : { kind, id }
  for (const l of listeners) l()
}

export function subscribeDrawer(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The id whose drawer is open, or null. With a kind: only that kind's id (the Calls page asks for
 * 'call', the Leads page for 'lead'); without: any drawer (Katie).
 */
export function useDrawerOpenId(kind?: DrawerKind): string | null {
  const get = () => (open && (!kind || open.kind === kind) ? open.id : null)
  return useSyncExternalStore(subscribeDrawer, get, get)
}

/** The attribute a row's keyboard link carries: its call id or its lead id. */
export type OpenerAttr = 'data-call-row' | 'data-lead-row'

let opener: { id: string; el: HTMLElement | null; attr: OpenerAttr } | null = null

/** Called when a row opens a drawer. */
export function rememberOpener(id: string, el: HTMLElement | null, attr: OpenerAttr = 'data-call-row'): void {
  opener = { id, el, attr }
}

/** Return focus to the row that opened the drawer (re-found by its row attribute if re-rendered). */
export function focusOpener(): void {
  const o = opener
  opener = null
  if (!o) return
  let el: HTMLElement | null = o.el && o.el.isConnected ? o.el : null
  // A connected element that now carries another row's id (reused DOM) is not the opener.
  const rowId = el?.closest<HTMLElement>(`[${o.attr}]`)?.getAttribute(o.attr)
  if (el && rowId != null && rowId !== o.id) el = null
  if (!el) {
    const sel = `[${o.attr}="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(o.id) : o.id}"]`
    el = document.querySelector<HTMLElement>(sel)
  }
  el?.focus({ preventScroll: true })
}
