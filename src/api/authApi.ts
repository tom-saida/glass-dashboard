// The sign-in layer's endpoints: who I am, the People card, the Activity card, session events.
// Plain functions over apiGet / apiPost; TanStack hooks for the two cards live beside them.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from './client'
import type { ActivityRow, Me, PeopleResponse, Person } from '../auth/types'

export type SessionEvent = 'signed_in' | 'signed_out' | 'locked' | 'unlocked'

export const authApi = {
  me: (signal?: AbortSignal) => apiGet<Me>('/me', {}, { signal }),
  /** Best effort: a failed log call never blocks signing in or out. */
  session: (event: SessionEvent, remembered: boolean) =>
    apiPost<{ ok: boolean }>('/session', { event, remembered }).catch(() => undefined),
  people: (signal?: AbortSignal) => apiGet<PeopleResponse>('/people', {}, { signal }),
  addPerson: (b: { email: string; name: string; role: 'owner' | 'staff' }) =>
    apiPost<{ ok: boolean; person: Person }>('/people', b),
  personAction: (username: string, action: 'remove' | 'reset-password' | 'reset-code' | 'resend') =>
    apiPost<{ ok: boolean }>(`/people/${encodeURIComponent(username)}/${action}`),
  setSupport: (enabled: boolean) => apiPost<{ ok: boolean; support_enabled: boolean }>('/support', { enabled }),
  activity: (days: number, signal?: AbortSignal) =>
    apiGet<{ activity: ActivityRow[] }>('/activity', { days }, { signal }),
}

export const authKeys = {
  people: ['dash', 'people'] as const,
  activity: (days: number) => ['dash', 'activity', { days }] as const,
}

export function usePeople() {
  return useQuery({ queryKey: authKeys.people, queryFn: ({ signal }) => authApi.people(signal), staleTime: 5_000 })
}

export function useActivity(days = 30) {
  return useQuery({
    queryKey: authKeys.activity(days),
    queryFn: ({ signal }) => authApi.activity(days, signal).then((r) => r.activity),
    staleTime: 5_000,
  })
}

/** Refetch both cards after a People action (an action also adds an Activity row). */
export function useRefreshPeople() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: authKeys.people }), qc.invalidateQueries({ queryKey: ['dash', 'activity'] })])
}
