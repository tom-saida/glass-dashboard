/**
 * The top bar's Katie button (docs/research/MONDAY-LLAMA-2026-10-13.md 3.6) asks the lazy stage
 * to bring her in. A tiny module in the main chunk: the button calls requestSummon(), the stage
 * (once loaded) listens with onSummon(). No GSAP, no rig.
 */
const listeners = new Set<() => void>()

export function requestSummon(): void {
  for (const l of [...listeners]) l()
}

export function onSummon(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
