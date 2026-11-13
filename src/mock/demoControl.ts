// The demo controls (mock=demo): the shell's Demo menu and the closer's shortcuts call these.
// Tiny and data-free; the demo backend (and the dataset) load on first use, from the chunk the
// mock server already loaded at startup.
//
//   isDemoMode()        this tab runs the closers' demo
//   resetDay()          the day as it was at open: sample call gone, Katie's caps cleared, every
//                       query refetched, then a 'reset' event (the shell closes the drawer)
//   playSampleCall()    replays the showpiece call through the live path (status on a call,
//                       a Live row, the transcript, the booking, the texts, hang-up); resolves
//                       when it ends. { speed: 2 } halves every gap.
//   sampleCallState()   'idle' | 'playing' | 'done'
//   subscribeDemo(fn)   'reset' | 'sample-start' | 'sample-end'

import { getMockScenario } from './mode'
import { emitDemo, getSampleState, subscribeDemo, type DemoEvent, type SampleCallState } from './demo/events'
import { invalidateAllDashQueries } from '../live/stream'

export type { DemoEvent, SampleCallState }
export { subscribeDemo }

export function isDemoMode(): boolean {
  return getMockScenario() === 'demo'
}

export async function resetDay(): Promise<void> {
  if (!isDemoMode()) return
  const { loadDemoBackend } = await import('./server')
  const backend = await loadDemoBackend()
  backend.resetDemoDay()
  try {
    ;(window as unknown as { __katieStage?: { resetCaps?: () => void } }).__katieStage?.resetCaps?.()
  } catch {
    /* Katie's stage not mounted: nothing to clear */
  }
  // First the event (the shell closes the drawer, so no query refetches a call that is gone),
  // then every query refetches.
  emitDemo({ type: 'reset' })
  await invalidateAllDashQueries()
}

export async function playSampleCall(opts?: { speed?: 1 | 2 }): Promise<void> {
  if (!isDemoMode()) return
  const { loadDemoBackend } = await import('./server')
  const backend = await loadDemoBackend()
  await backend.playSample(opts?.speed === 2 ? 2 : 1)
}

export function sampleCallState(): SampleCallState {
  return getSampleState()
}
