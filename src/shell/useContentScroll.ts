import { useEffect } from 'react'
import { effectiveZoom } from '../lib'

/**
 * Fix M1 (glass skin): the content scrolls inside the slab (#content), not the window, so the
 * browser's own scrolling only reaches it when the pointer or the focus is inside it. This hands
 * #content the two inputs that used to scroll the window from anywhere:
 *
 * - the wheel over the rail, the top bar, the slab's edge or the environment around the slab;
 * - the scroll keys (Page Up/Down, Space, Shift+Space, arrows, Home/End) when focus is on the page
 *   itself or on something outside #content that does not use the key (a rail link, the top bar).
 *
 * It never moves focus (so it cannot fight the drawer's focus return or Katie's summon focus), and
 * it leaves alone anything inside #content, the drawer, menus, Katie's layer and form controls,
 * where the browser already does the right thing.
 */

const KEYS = new Set(['PageDown', 'PageUp', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'])
const LINE = 40

function scroller(): HTMLElement | null {
  return document.getElementById('content')
}

/** The places whose wheel and keys belong to #content: the slab outside #content, and the page. */
function forwards(target: EventTarget | null, content: HTMLElement): boolean {
  if (!(target instanceof Element)) return true
  if (target === document.body || target === document.documentElement) return true
  if (content.contains(target)) return false
  // the environment and the shell's own box (the margin around the slab)
  if (target.closest('.env') || target.matches('#root, [data-shell]')) return true
  const slab = target.closest('[data-katie-floor]')
  return !!slab && slab.contains(content)
}

/** A focused control that uses the key itself (typing, toggles, menus, buttons on Space). */
function usesKey(el: Element, key: string): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLElement && el.isContentEditable) return true
  if (el.closest('[role=menu],[role=listbox],[role=combobox],[role=slider],[role=tablist],[role=radiogroup],[role=dialog]')) return true
  if (el.getAttribute('aria-haspopup') && el.getAttribute('aria-haspopup') !== 'false') return true
  if (key === ' ' && (el instanceof HTMLButtonElement || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'switch')) return true
  return false
}

function behavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export function useContentScroll(): void {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.defaultPrevented) return
      const content = scroller()
      if (!content || !forwards(e.target, content)) return
      // Pixel deltas are viewport px and the scroller scrolls in its own px (the look's text size
      // zooms it, DESIGN-GLASS 9.3); lines and pages are already the scroller's own.
      const unit = e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? content.clientHeight : 1 / effectiveZoom(content)
      const top = e.deltaY * unit
      if (top) content.scrollBy({ top, behavior: 'instant' as ScrollBehavior })
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !KEYS.has(e.key)) return
      const content = scroller()
      if (!content) return
      const active = document.activeElement
      const target = active && active !== document.body ? active : e.target
      if (!forwards(target, content)) return
      if (target instanceof Element && target !== document.body && usesKey(target, e.key)) return
      const page = Math.max(LINE, content.clientHeight - LINE)
      const max = content.scrollHeight - content.clientHeight
      let top: number
      switch (e.key) {
        case 'PageDown':
          top = content.scrollTop + page
          break
        case 'PageUp':
          top = content.scrollTop - page
          break
        case ' ':
          top = content.scrollTop + (e.shiftKey ? -page : page)
          break
        case 'ArrowDown':
          top = content.scrollTop + LINE
          break
        case 'ArrowUp':
          top = content.scrollTop - LINE
          break
        case 'Home':
          top = 0
          break
        default:
          top = max
      }
      e.preventDefault()
      content.scrollTo({ top: Math.max(0, Math.min(max, top)), behavior: behavior() })
    }

    // Bubble phase, after Katie's capture listeners (they still see every input) and after the
    // drawer's and the Demo menu's own key handling.
    document.addEventListener('wheel', onWheel, { passive: true })
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('wheel', onWheel)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
}
