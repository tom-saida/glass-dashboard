/**
 * Bubble width (DESIGN.md 7.5): one or two lines, under 80 characters a line. Used by the
 * dashboard's director and the /dash/_katie motion stage. DOM only, no imports.
 */

/** Most characters on one line of the bubble (the brief: text blocks under 80 per line). */
export const BUBBLE_LINE_CHARS = 79

/**
 * Sizes the bubble (DESIGN 7.5: one or two lines, under 80 characters a line). A sentence that
 * wraps at the CSS max-width, or that is longer than BUBBLE_LINE_CHARS on one line, gets the
 * narrowest width that keeps it to ceil(length / BUBBLE_LINE_CHARS) lines (at least the lines it
 * already takes): its lines come out balanced and the box covers as little as it can. With
 * katieLine's 140-character cap that is two lines of about 70 at most. `minLines` 2 asks for two
 * lines even for a short sentence (a narrower box, when the one-line box has no clear place). A
 * few layout reads of the bubble alone, at commit or text change only, never in a tween.
 */
export function fitBubble(b: HTMLElement, minLines = 1): { w: number; h: number } {
  b.style.width = ''
  const w0 = b.offsetWidth
  const h0 = b.offsetHeight
  const cs = getComputedStyle(b)
  const line = parseFloat(cs.lineHeight) || 18
  const chrome =
    (parseFloat(cs.paddingTop) || 0) +
    (parseFloat(cs.paddingBottom) || 0) +
    (parseFloat(cs.borderTopWidth) || 0) +
    (parseFloat(cs.borderBottomWidth) || 0)
  const lines0 = Math.max(1, Math.round((h0 - chrome) / line))
  const text = b.textContent ?? ''
  const words = text.split(' ').length
  const lines = Math.max(lines0, Math.ceil(text.length / BUBBLE_LINE_CHARS), Math.min(minLines, words))
  if (lines < 2) return { w: w0, h: h0 }
  const fits = (h: number) => h <= chrome + lines * line + 1
  let lo = Math.floor(w0 / lines)
  let hi = w0
  while (hi - lo > 2) {
    const mid = Math.floor((lo + hi) / 2)
    b.style.width = `${mid}px`
    if (fits(b.offsetHeight)) hi = mid
    else lo = mid
  }
  b.style.width = `${hi}px`
  return { w: b.offsetWidth, h: b.offsetHeight }
}
