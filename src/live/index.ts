import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { DashEvent, EventKind } from '../api/types'
import {
  getStreamState,
  onDashEvent,
  subscribeStreamState,
  type DashEventMeta,
  type StreamState,
} from './stream'

export { onDashEvent, startDashStream, getStreamState, subscribeStreamState } from './stream'
export type { DashEventMeta, StreamState } from './stream'

/** React wrapper over onDashEvent; the latest handler is always called, subscribed once. */
export function useDashEvent<K extends EventKind>(
  kind: K | '*',
  handler: (event: DashEvent<K>, meta: DashEventMeta) => void,
): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (kind === '*') return onDashEvent('*', (e, m) => ref.current(e as DashEvent<K>, m))
    return onDashEvent(kind, (e, m) => ref.current(e as DashEvent<K>, m))
  }, [kind])
}

/** 'connecting' | 'open' | 'waiting' (backing off) | 'stopped'. */
export function useStreamState(): StreamState {
  return useSyncExternalStore(subscribeStreamState, getStreamState, getStreamState)
}
