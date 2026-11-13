// Which mock scenario (if any) this tab runs. Eagerly imported and tiny; the mock server and
// fixtures live in a separate chunk (./server) loaded only when a scenario is on.
//
//   ?mock=1      fixtures + live replay of stream-sample.txt, then call CA860072416005
//   ?mock=empty  no calls today: empty lists, zero stats, line idle
//   ?mock=slow   fixtures (and replay) with 1.5 s latency on every request (skeletons)
//   ?mock=error  every request fails (error lines, stream reconnect backoff)
//   ?mock=demo   the closers' demo: a made-up practice day on today's date (src/mock/demo,
//                docs/demo/DEMO-DATA.md), NOW pinned to 9:10 PM, a sample call on demand
//   ?mock=0      turn mock off for this tab (also false / off)
//   any other value is ignored (?mock=no does not turn the fixtures on)
//
// VITE_MOCK=1 (or a scenario name) turns it on at build/dev time. The query param wins and is
// remembered in sessionStorage for the tab, because router navigation drops the query string.
//
// VITE_DEMO_DEFAULT=1 (npm run build:demo, the closers' static site) makes "demo" the default
// and the floor: that build has no backend, so mock can never be turned off there (?mock=0 and
// the Settings toggle fall back to the demo) and it never requests /api/dash.

export type MockScenario = 'fixtures' | 'empty' | 'slow' | 'error' | 'demo'

/** True in the closers' static demo build. */
export const DEMO_BUILD = import.meta.env.VITE_DEMO_DEFAULT === '1'

const SESSION_KEY = 'katie.mock'

function parse(v: string | null | undefined): MockScenario | null | undefined {
  if (v == null) return undefined
  const s = v.trim().toLowerCase()
  if (s === '' || s === '1' || s === 'true' || s === 'fixtures' || s === 'on') return 'fixtures'
  if (s === 'empty' || s === 'slow' || s === 'error' || s === 'demo') return s
  if (s === '0' || s === 'false' || s === 'off') return null
  // Unknown values are ignored: a stray ?mock=no must never put invented calls on a live
  // practice's screen.
  return undefined
}

function readSession(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function writeSession(v: string | null): void {
  try {
    if (v === null) window.sessionStorage.removeItem(SESSION_KEY)
    else window.sessionStorage.setItem(SESSION_KEY, v)
  } catch {
    /* blocked storage: the scenario lasts until the next navigation drops the param */
  }
}

let resolved: MockScenario | null | undefined

/** The scenario for this tab, decided once on first call. */
export function getMockScenario(): MockScenario | null {
  if (resolved !== undefined) return resolved
  resolved = resolve()
  // The demo build has no API behind it: never real mode.
  if (DEMO_BUILD && resolved === null) resolved = 'demo'
  return resolved
}

function resolve(): MockScenario | null {
  let fromParam: MockScenario | null | undefined
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('mock')) fromParam = parse(params.get('mock'))
  } catch {
    fromParam = undefined
  }
  if (fromParam !== undefined) {
    writeSession(fromParam === null ? 'off' : fromParam)
    return fromParam
  }
  const session = readSession()
  if (session !== null) return session === 'off' ? null : (parse(session) ?? null)
  if (DEMO_BUILD) return 'demo'
  const env = import.meta.env.VITE_MOCK
  return env ? (parse(env) ?? null) : null
}

/** Settings' dev toggle: remember for the tab and reload so every module starts clean. */
export function setMockScenario(s: MockScenario | null): void {
  writeSession(s === null ? 'off' : s)
  const url = new URL(window.location.href)
  url.searchParams.delete('mock')
  window.location.replace(url.toString())
}
