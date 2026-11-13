// The mock stream's fan-out: every open FakeEventSource listens here, and both replays (the
// fixtures' timeline in ./server and the demo's sample call in ./demo/backend) broadcast here.
// Tiny and data-free, so the demo backend can share it without importing the fixtures.

import type { DashEvent } from '../api/types'

type Listener = (e: DashEvent) => void
const listeners = new Set<Listener>()

export function addStreamListener(l: Listener): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function broadcast(e: DashEvent): void {
  for (const l of [...listeners]) l(e)
}

export function streamListenerCount(): number {
  return listeners.size
}
