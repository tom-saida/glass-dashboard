// Idle lock: after `ms` with no pointer, key, scroll or wheel activity, call `onIdle` once.
// Timers only (no Date.now), so the verifier's fake clock drives it.

const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'wheel', 'touchstart'] as const

export function watchIdle(ms: number, onIdle: () => void): () => void {
  let timer: number | undefined
  const arm = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(onIdle, ms)
  }
  const opts: AddEventListenerOptions = { capture: true, passive: true }
  for (const e of EVENTS) window.addEventListener(e, arm, opts)
  arm()
  return () => {
    window.clearTimeout(timer)
    for (const e of EVENTS) window.removeEventListener(e, arm, opts)
  }
}
