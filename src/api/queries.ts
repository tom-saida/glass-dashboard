// TanStack Query hooks for every endpoint. Keys all start with "dash"; every key whose request
// can carry reveal=1 holds `{ reveal }`, and turning Show numbers off removes every
// reveal:true query from the cache (bindRevealCleanup), so revealed numbers live only in memory
// and only while the toggle is on.

import { useRef, useState } from 'react'
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { api, isApiError, type ApiError } from './client'
import { mergeLeadAfterAction } from './leads'
import type {
  Booking,
  CallDetail,
  CallRow,
  LeadActionBody,
  LeadDetail,
  LeadRow,
  LeadsFilter,
  LeadsResponse,
  LeadsSummary,
  Note,
  Sms,
  StatsResponse,
  StatusResponse,
} from './types'
import { getSettings, subscribeSettings, useSettings } from '../settings'
import { getPracticeTz, localDayKey, setPracticeTz, zonedMidnight } from '../lib/time'
import { nowSec } from '../lib/clock'

// ------------------------------------------------------------------ keys

export type CallsRange = 'today' | '7d' | '30d'
export const RANGE_DAYS: Record<CallsRange, number> = { today: 1, '7d': 7, '30d': 30 }

export const qk = {
  all: ['dash'] as const,
  status: () => ['dash', 'status'] as const,
  stats: (days: number) => ['dash', 'stats', { days }] as const,
  /** Prefix for every calls list (invalidate this). */
  callsAll: () => ['dash', 'calls'] as const,
  callsRange: (range: CallsRange, from: number | undefined, reveal: boolean) =>
    ['dash', 'calls', { range, from, reveal }] as const,
  callsLatest: (limit: number, reveal: boolean) => ['dash', 'calls', { latest: limit, reveal }] as const,
  /** Prefix for one call's detail (invalidate this). */
  callAll: (id: string) => ['dash', 'call', id] as const,
  call: (id: string, reveal: boolean) => ['dash', 'call', id, { reveal }] as const,
  bookings: (limit?: number, reveal?: boolean) =>
    limit === undefined ? (['dash', 'bookings'] as const) : (['dash', 'bookings', { limit, reveal }] as const),
  notes: (limit?: number, reveal?: boolean) =>
    limit === undefined ? (['dash', 'notes'] as const) : (['dash', 'notes', { limit, reveal }] as const),
  sms: (limit?: number, reveal?: boolean) =>
    limit === undefined ? (['dash', 'sms'] as const) : (['dash', 'sms', { limit, reveal }] as const),
  /** Prefix for every leads list (invalidate this). */
  leadsAll: () => ['dash', 'leads'] as const,
  leads: (filter: LeadsFilter, limit: number, reveal: boolean) => ['dash', 'leads', { filter, limit, reveal }] as const,
  /** Prefix for one lead's detail (invalidate this). */
  leadAll: (id: string) => ['dash', 'lead', id] as const,
  lead: (id: string, reveal: boolean) => ['dash', 'lead', id, { reveal }] as const,
}

function hasReveal(q: { queryKey: readonly unknown[] }): boolean {
  return q.queryKey.some((part) => !!part && typeof part === 'object' && (part as { reveal?: unknown }).reveal === true)
}

// ------------------------------------------------------------------ client

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // DESIGN 6: three retries with backoff. A 404 is an answer, and a 401 needs the person to
        // sign in again (retrying would only re-open the browser's prompt): neither is retried.
        retry: (failureCount, error) =>
          !(isApiError(error) && (error.isNotFound || error.isUnauthorized || error.isForbidden)) && failureCount < 3,
        staleTime: 10_000,
        refetchOnWindowFocus: true,
      },
    },
  })
}

/** Drop every reveal:true query the moment Show numbers turns off. Returns unsubscribe. */
export function bindRevealCleanup(qc: QueryClient): () => void {
  let prev = getSettings().showNumbers
  return subscribeSettings(() => {
    const next = getSettings().showNumbers
    if (prev && !next) {
      qc.cancelQueries({ predicate: hasReveal })
      qc.removeQueries({ predicate: hasReveal })
    }
    prev = next
  })
}

function useReveal(): boolean {
  return useSettings().showNumbers
}

/**
 * placeholderData for lists that keep their rows on screen while a new key loads (a range or
 * limit change): the previous rows, except never a reveal:true query's rows under a masked key.
 * After Show numbers turns off the masked request shows its skeleton, not the revealed rows it
 * replaces (DATA-1); TanStack's keepPreviousData would pass the removed query's data through.
 */
function maskedPrevious<T>(reveal: boolean, prev: T | undefined, prevQuery: { queryKey: readonly unknown[] } | undefined): T | undefined {
  return !reveal && prevQuery && hasReveal(prevQuery) ? undefined : prev
}

/**
 * "Today" ends at the practice's local midnight. A tab left open overnight would keep showing
 * yesterday's counts and rows as today's (nothing else refetches stats at the day change), so
 * when the local day changes every dash query is invalidated: stats bring the new range.from,
 * and every list keyed or filtered by it follows. A 60 s check (survives sleep, unlike one long
 * timeout) plus a timeout for the exact minute. Returns cleanup.
 */
export function bindDayRollover(qc: QueryClient): () => void {
  let tz = getPracticeTz()
  let day = localDayKey(nowSec(), tz)
  let exact: number | undefined

  const scheduleExact = () => {
    window.clearTimeout(exact)
    const now = nowSec()
    const nextMidnight = zonedMidnight(now, tz, -1)
    exact = window.setTimeout(
      () => {
        check()
        scheduleExact()
      },
      Math.max(1_000, (nextMidnight - now) * 1000 + 1_000),
    )
  }

  const check = () => {
    const nextTz = getPracticeTz()
    const nextDay = localDayKey(nowSec(), nextTz)
    if (nextTz !== tz) {
      // The practice tz arrived with the first stats: re-base, nothing to refresh.
      tz = nextTz
      day = nextDay
      scheduleExact()
      return
    }
    if (nextDay === day) return
    day = nextDay
    scheduleExact()
    void qc.invalidateQueries({ queryKey: qk.all })
  }

  const interval = window.setInterval(check, 60_000)
  scheduleExact()
  return () => {
    window.clearInterval(interval)
    window.clearTimeout(exact)
  }
}

// ------------------------------------------------------------------ status / stats

/** Line state; refetches every 15 s and on call.started / call.ended. */
export function useStatus(): UseQueryResult<StatusResponse> {
  return useQuery({
    queryKey: qk.status(),
    queryFn: ({ signal }) => api.status(signal),
    // Paused while signed out; focus or a reload asks again.
    refetchInterval: (query) => (isApiError(query.state.error) && (query.state.error.isUnauthorized || query.state.error.isForbidden) ? false : 15_000),
    staleTime: 5_000,
  })
}

/** Counts for the last `days` local days (1-90). Records the practice tz for formatters. */
export function useStats(days: number): UseQueryResult<StatsResponse> {
  return useQuery({
    queryKey: qk.stats(days),
    queryFn: async ({ signal }) => {
      const s = await api.stats(days, signal)
      setPracticeTz(s.range.tz)
      return s
    },
  })
}

/** The practice timezone: stats.range.tz, America/New_York until stats has loaded. */
export function usePracticeTz(): string {
  const s = useStats(1)
  return s.data?.range.tz ?? getPracticeTz()
}

export interface YesterdayCounts {
  calls: number
  booked_calls: number
  callbacks: number
  sms_out: number
}

/**
 * Conflict 8: yesterday = stats(days=2) - stats(days=1), valid only when d2.range.days === 2
 * and d1.from - d2.from is 82,800..90,000 s (DST-safe). null when invalid, loading or failed.
 */
export function useYesterday(): YesterdayCounts | null {
  const d1 = useStats(1).data
  const d2 = useStats(2).data
  return yesterdayFrom(d1, d2)
}

export function yesterdayFrom(d1: StatsResponse | undefined, d2: StatsResponse | undefined): YesterdayCounts | null {
  if (!d1 || !d2 || d2.range.days !== 2) return null
  const gap = d1.range.from - d2.range.from
  if (gap < 82_800 || gap > 90_000) return null
  const y = {
    calls: d2.calls - d1.calls,
    booked_calls: d2.booked_calls - d1.booked_calls,
    callbacks: d2.callbacks - d1.callbacks,
    sms_out: d2.sms_out - d1.sms_out,
  }
  return Object.values(y).some((v) => v < 0) ? null : y
}

// ------------------------------------------------------------------ calls

/**
 * Local midnight that starts the range, from stats. Computed locally as soon as the first stats
 * attempt fails (not after all of stats' retries), so a failing API shows the calls error line
 * as quickly as the other pages. With real data stats' range.from is that same local midnight,
 * so the calls key normally does not change when stats later succeeds.
 */
function useRangeFrom(days: number): number | undefined {
  const s = useStats(days)
  if (s.data) return s.data.range.from
  if (s.isError || s.failureCount > 0) return zonedMidnight(nowSec(), getPracticeTz(), days - 1)
  return undefined
}

/**
 * Calls in a range (conflict 11): pages /calls?limit=50&before=<oldest started_at> until the
 * oldest row is older than range.from (max 20 pages), then keeps started_at >= range.from.
 * Newest first. Totals for sentences come from useStats(RANGE_DAYS[range]).
 */
export function useCalls(range: CallsRange): UseQueryResult<CallRow[]> {
  const reveal = useReveal()
  const from = useRangeFrom(RANGE_DAYS[range])
  return useQuery({
    queryKey: qk.callsRange(range, from, reveal),
    enabled: from !== undefined,
    placeholderData: (prev, prevQuery) => maskedPrevious(reveal, prev, prevQuery),
    queryFn: async ({ signal }) => {
      const seen = new Set<string>()
      const out: CallRow[] = []
      let before: number | undefined
      for (let page = 0; page < 20; page++) {
        const rows = await api.calls({ limit: 50, before }, reveal, signal)
        for (const r of rows) {
          if (!seen.has(r.call_id)) {
            seen.add(r.call_id)
            out.push(r)
          }
        }
        const oldest = rows[rows.length - 1]
        if (rows.length < 50 || !oldest || oldest.started_at < (from as number)) break
        before = oldest.started_at
      }
      return out.filter((r) => r.started_at >= (from as number))
    },
  })
}

/** Overview "Latest calls": /calls?limit=N, keeping today's (started_at >= stats(1).range.from). */
export function useLatestCalls(limit = 10): UseQueryResult<CallRow[]> {
  const reveal = useReveal()
  const from = useStats(1).data?.range.from ?? zonedMidnight(nowSec(), getPracticeTz(), 0)
  return useQuery({
    queryKey: qk.callsLatest(limit, reveal),
    queryFn: ({ signal }) => api.calls({ limit }, reveal, signal),
    select: (rows) => rows.filter((r) => r.started_at >= from),
  })
}

/** One call with all its events. 404 -> error with `isNotFound` (no retries). */
export function useCall(id: string | undefined): UseQueryResult<CallDetail> {
  const reveal = useReveal()
  return useQuery({
    queryKey: qk.call(id ?? '', reveal),
    enabled: !!id,
    queryFn: ({ signal }) => api.call(id as string, reveal, signal),
  })
}

/** The list row for a call from any cached calls list (instant drawer header), or undefined. */
export function useCallRow(id: string | undefined): CallRow | undefined {
  const qc = useQueryClient()
  const reveal = useReveal()
  if (!id) return undefined
  for (const [key, data] of qc.getQueriesData<CallRow[]>({ queryKey: qk.callsAll() })) {
    const params = key[2] as { reveal?: boolean } | undefined
    if (!Array.isArray(data) || (params && params.reveal !== reveal)) continue
    const row = data.find((r) => r.call_id === id)
    if (row) return row
  }
  return undefined
}

// ------------------------------------------------------------------ limit-only lists

export interface LimitedList<T> {
  query: UseQueryResult<T[]>
  /** Rows (newest first as the server sends them), or undefined while loading. */
  rows: T[] | undefined
  limit: number
  /** Conflict 12: true when the last answer filled the limit and the limit is below 500. */
  canShowMore: boolean
  /** Re-requests with limit + 50 (max 500); the current rows stay on screen meanwhile. */
  showMore: () => void
}

const LIST_STEP = 50
const LIST_MAX = 500

function useLimited<T>(
  key: (limit: number, reveal: boolean) => readonly unknown[],
  fetcher: (limit: number, reveal: boolean, signal: AbortSignal) => Promise<T[]>,
): LimitedList<T> {
  const reveal = useReveal()
  const [limit, setLimit] = useState(LIST_STEP)
  const query = useQuery({
    queryKey: key(limit, reveal),
    queryFn: ({ signal }) => fetcher(limit, reveal, signal),
    placeholderData: (prev, prevQuery) => maskedPrevious(reveal, prev, prevQuery),
  })
  const n = query.data?.length ?? 0
  return {
    query,
    rows: query.data,
    limit,
    canShowMore: n >= limit && limit < LIST_MAX,
    showMore: () => setLimit((l) => Math.min(LIST_MAX, l + LIST_STEP)),
  }
}

export function useBookings(): LimitedList<Booking> {
  return useLimited<Booking>((l, r) => qk.bookings(l, r), api.bookings)
}

/** Desk notes = callbacks. Sort with lib/chips sortNotes / waitingNotes. */
export function useNotes(): LimitedList<Note> {
  return useLimited<Note>((l, r) => qk.notes(l, r), api.notes)
}

export function useSms(): LimitedList<Sms> {
  return useLimited<Sms>((l, r) => qk.sms(l, r), api.sms)
}

// ------------------------------------------------------------------ leads

/** No lead.* events on /stream yet: the list and an open lead refetch every 60 s and on focus. */
const LEADS_REFETCH_MS = 60_000
const LEADS_STEP = 200
const LEADS_MAX = 2000

/** Polling stops while signed out or not allowed; focus or a reload asks again. */
function pollUnlessSignedOut(ms: number) {
  return (query: { state: { error: Error | null } }): number | false => {
    const e = query.state.error
    return isApiError(e) && (e.isUnauthorized || e.isForbidden) ? false : ms
  }
}

export interface LeadsList {
  query: UseQueryResult<LeadsResponse>
  /** Newest stage change first, as served; undefined while loading. */
  rows: LeadRow[] | undefined
  /** Counts over every lead (not only this filter). Kept across a filter change. */
  summary: LeadsSummary | undefined
  limit: number
  canShowMore: boolean
  showMore: () => void
}

/**
 * GET /leads?stage=<filter>&limit=. A new filter shows its skeleton (the last filter's rows under
 * the new filter's name would be a lie); Show more and a refetch keep the rows on screen.
 */
export function useLeads(filter: LeadsFilter): LeadsList {
  const reveal = useReveal()
  const [limits, setLimits] = useState<Partial<Record<LeadsFilter, number>>>({})
  const limit = limits[filter] ?? LEADS_STEP
  const query = useQuery({
    queryKey: qk.leads(filter, limit, reveal),
    queryFn: ({ signal }) => api.leads(filter, limit, reveal, signal),
    placeholderData: (prev: LeadsResponse | undefined, prevQuery) => {
      const params = prevQuery?.queryKey[2] as { filter?: LeadsFilter } | undefined
      return params?.filter === filter ? maskedPrevious(reveal, prev, prevQuery) : undefined
    },
    refetchInterval: pollUnlessSignedOut(LEADS_REFETCH_MS),
    refetchOnWindowFocus: true,
  })
  const lastSummary = useRef<LeadsSummary | undefined>(undefined)
  if (query.data?.summary) lastSummary.current = query.data.summary
  const n = query.data?.leads.length ?? 0
  return {
    query,
    rows: query.data?.leads,
    summary: query.data?.summary ?? lastSummary.current,
    limit,
    canShowMore: n >= limit && limit < LEADS_MAX,
    showMore: () => setLimits((l) => ({ ...l, [filter]: Math.min(LEADS_MAX, (l[filter] ?? LEADS_STEP) + LEADS_STEP) })),
  }
}

/** One lead with its history. 404 -> error with `isNotFound` (no retries). */
export function useLead(id: string | undefined): UseQueryResult<LeadDetail> {
  const reveal = useReveal()
  return useQuery({
    queryKey: qk.lead(id ?? '', reveal),
    enabled: !!id,
    queryFn: ({ signal }) => api.lead(id as string, reveal, signal),
    refetchInterval: pollUnlessSignedOut(LEADS_REFETCH_MS),
    refetchOnWindowFocus: true,
  })
}

/** The list row for a lead from any cached leads list (instant drawer header), or undefined. */
export function useLeadRow(id: string | undefined): LeadRow | undefined {
  const qc = useQueryClient()
  const reveal = useReveal()
  if (!id) return undefined
  // The most recently answered list first: a list left behind by an earlier filter may hold the
  // lead at a stage it has since left.
  const lists = qc
    .getQueryCache()
    .findAll({ queryKey: qk.leadsAll() })
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
  for (const q of lists) {
    const params = q.queryKey[2] as { reveal?: boolean } | undefined
    const data = q.state.data as LeadsResponse | undefined
    if (!data || !Array.isArray(data.leads) || (params && params.reveal !== reveal)) continue
    const row = data.leads.find((r) => r.lead_id === id)
    if (row) return row
  }
  return undefined
}

/** Puts the lead a tap answered with into every cached list and detail that holds it. */
function applyLeadAnswer(qc: QueryClient, returned: LeadRow): void {
  const now = nowSec()
  qc.setQueriesData<LeadsResponse>({ queryKey: qk.leadsAll() }, (old) => {
    if (!old || !Array.isArray(old.leads) || !old.leads.some((l) => l.lead_id === returned.lead_id)) return old
    return { ...old, leads: old.leads.map((l) => (l.lead_id === returned.lead_id ? mergeLeadAfterAction(l, returned, now) : l)) }
  })
  qc.setQueriesData<LeadDetail>({ queryKey: qk.leadAll(returned.lead_id) }, (old) =>
    old ? { ...old, lead: mergeLeadAfterAction(old.lead, returned, now) } : old,
  )
}

/**
 * A coordinator's tap on one lead: one POST, never retried. The answered lead replaces the row
 * at once (every cached list and the open detail), then the lists (order, counts) and the
 * detail (history) are fetched again. A refused move rejects with the ApiError whose `detail` is
 * the server's sentence, and the lists and the detail are fetched again too.
 */
export function useLeadAction(leadId: string): UseMutationResult<LeadRow, ApiError, LeadActionBody> {
  const qc = useQueryClient()
  return useMutation<LeadRow, ApiError, LeadActionBody>({
    mutationFn: async (body) => (await api.leadAction(leadId, body)).lead,
    retry: false,
    onSuccess: (lead) => {
      applyLeadAnswer(qc, lead)
      void qc.invalidateQueries({ queryKey: qk.leadsAll() })
      void qc.invalidateQueries({ queryKey: qk.leadAll(leadId) })
    },
    // A refused tap (409) or a lead that is gone (404) means the page is behind the box: ask
    // again at once, so the drawer shows the stage the sentence is about.
    onError: () => {
      void qc.invalidateQueries({ queryKey: qk.leadsAll() })
      void qc.invalidateQueries({ queryKey: qk.leadAll(leadId) })
    },
  })
}
