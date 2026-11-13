/**
 * The zoom an element is rendered at (the look's text size puts `zoom` on the slab's grid items,
 * DESIGN-GLASS 9.3). getBoundingClientRect() is in viewport px, scrollBy() and offsetWidth in the
 * element's own px, so a viewport distance has to be divided by this before it is scrolled.
 * Element.currentCSSZoom is the exact value (Chromium 128, Firefox 126, WebKit since the zoom
 * standardisation); older engines get the product of the computed zoom up the ancestors.
 */
export function effectiveZoom(el: Element): number {
  const own = (el as Element & { currentCSSZoom?: number }).currentCSSZoom
  if (typeof own === 'number' && Number.isFinite(own) && own > 0) return own
  let z = 1
  for (let e: Element | null = el; e; e = e.parentElement) {
    const v = parseFloat(getComputedStyle(e).getPropertyValue('zoom'))
    if (Number.isFinite(v) && v > 0) z *= v
  }
  return z
}
