// Demo-mode events (reset, sample call start / end) and the sample call's state. Data-free and
// tiny: demoControl re-exports it for the shell, and the backend emits through it.

export type DemoEventType = 'reset' | 'sample-start' | 'sample-end'
export interface DemoEvent {
  type: DemoEventType
}
export type SampleCallState = 'idle' | 'playing' | 'done'

type Sub = (e: DemoEvent) => void
const subs = new Set<Sub>()
let sample: SampleCallState = 'idle'

export function emitDemo(e: DemoEvent): void {
  if (e.type === 'sample-start') sample = 'playing'
  else if (e.type === 'sample-end') sample = 'done'
  else sample = 'idle'
  for (const s of [...subs]) {
    try {
      s(e)
    } catch {
      // A broken subscriber must not stop the others.
      console.warn(`demo event handler failed for ${e.type}`)
    }
  }
}

export function subscribeDemo(fn: Sub): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

export function getSampleState(): SampleCallState {
  return sample
}
