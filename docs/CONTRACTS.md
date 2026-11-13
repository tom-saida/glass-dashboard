# Contracts for the page and Katie agents

The foundation (shell, data, live stream, formatters, shared components) is built. Build pages and
Katie on these APIs; do not edit the files listed under "owned by foundation" (report gaps instead).
DESIGN.md is the spec; this page is the map.

## File map

| path | what | owner |
|---|---|---|
| `src/main.tsx`, `src/App.tsx` | QueryClient, BrowserRouter basename `/dash`, `/_katie` outside the shell | foundation |
| `src/shell/**` | rail, top bar (with the Katie button), content grid, background-location routes, drawer route | foundation |
| `src/components/**` | Card, SectionHeader, StatusChip, EmptyState, EmptyLine, ErrorLine, TextButton, skeletons, row links, Drawer frame | foundation |
| `src/shell/DemoMenu.tsx` | the top bar's Demo control (P21): lazy, **default export** `({ pagePath }) => …`, rendered only in demo mode; the R / P / K shortcuts | shell |
| `src/api/**` | wire types, fetch client, TanStack Query hooks | foundation |
| `src/live/**` | the SSE stream, invalidation, event bus | foundation |
| `src/lib/**` | formatters, text cleaning, chips, Katie sentence helpers, transcript model | foundation |
| `src/lib/reason.ts` | why someone called, in the owner's words (P7, P10, P18): `deriveReason`, `callName`, `isActionNote`, … (see below). Pure; **not** re-exported from `lib/index.ts` (its `displayName` clashes with `text.ts`'s): import from `'../lib/reason'` | overview |
| `src/settings/**` | Show numbers, Katie Occasional / Off, Katie's corner, dev API base and mock | foundation |
| `src/mock/**` | mock scenarios (`mode.ts`), mock server + FakeEventSource (`server.ts`), the stream fan-out both replays share (`hub.ts`); `fixtures/` read-only | foundation |
| `src/mock/demoControl.ts` | the demo controls' API (below); tiny, data-free | demo |
| `src/mock/demo/materialize.ts`, `backend.ts`, `events.ts` | the demo day on the real calendar (pure, node-runnable), every `/api/dash` endpoint for `?mock=demo` plus the sample-call replay and reveal, the demo event bus | demo |
| `src/mock/demo/{scenes.json,history.json,manifest.json,live-s36.txt,README.md}` | the demo dataset, **generated** by `node scripts/demo-data.mjs` from `docs/demo/scenes/*.json`; never edited by hand. Contract: `src/mock/demo/README.md` (`katie-demo/1`); overview: `docs/demo/DEMO-DATA.md` | generated |
| `src/pages/{Overview,Calls,Bookings,Leads,Callbacks,Texts,Settings}.tsx` | pages | page agents |
| `src/pages/leads/model.ts` | every word the Leads page derives (DESIGN 6.13), pure and node-runnable: filters and `?show=`, the four counts, stage chips, the exam / quote / last-touch lines, `nextStep` (the one reader of the reserved `next_text_*` / `call_now*` fields), `leadTaps`, `refusalSentence`, `historyLines`, `leadsTitle`, `leadsSentence` | leads |
| `src/pages/leads/LeadDrawer.tsx` | the lead drawer's content, default export `({ leadId }) => …`; mounted by `src/shell/LeadDrawerRoute.tsx` | leads |
| `src/mock/leadStore.ts` | the lead record for every mock (`?mock=1`, the demo day, `scripts/fake-api.mjs`): the three lead routes answered the way `voice-agent/dash_api.py` + `leads.py` answer them, in memory. Pure, explicit `.ts` imports | leads |
| `scripts/leads-fixtures.py` | writes `src/mock/fixtures/leads.json`, `leads-week.json` and `scripts/fixtures/leads-actions.json` by running the real backend modules (read-only import from `voice-agent/`) on an invented practice. Run it again when the backend's lead rules change | generated |
| `src/pages/overview/hours.ts` | `OPEN_HOUR` 7, `CLOSE_HOUR` 17 (Mon–Fri), `isAfterHours(ts, tz?)`: the chart landmarks and the "N after hours" fact until the API carries office hours | overview |
| `src/pages/lists/titles.ts` | the list cards' count sentences (P5): `callsTitle`, `bookingsTitle`, `callbacksTitle`, `textsTitle`, `actionNotesToday`. Pure | lists |
| `src/pages/lists/people.ts` | `namesByCall(bookings, notes)` (corrections first), `byCall(rows)`, `foldTexts(sms)` → `Conversation[]` (a reply folded into its text, P15) | lists |
| `src/pages/calls/document.ts` | the drawer as a document (P11), pure: `buildDocument(events, row, …)` → `{ header, outcome: OutcomeLine[], rows: DocRow[] }`, `outcomeFromLists` (a call with no transcript), `nameFromEvents`, `formatOffset` (`m:ss`) | lists |
| `src/pages/calls/CallDrawer.tsx` | drawer content, default export `({ callId }) => …` | drawer agent |
| `src/pages/overview/say.ts`, `src/pages/lists/sentences.ts`, `src/pages/calls/sentence.ts` | Katie's sentence templates (DESIGN 7.6), pure functions, tested by `check-lib.mjs` | page agents |
| `src/katie/**` except `stage/` | the rig (`Katie.tsx`, `parts.ts`, `geometry.ts`, `traced.ts`, `rig.ts`, `pose.ts`), `motion/` (controller, gait, path, timing), `summon.ts` (the Katie button's signal), the playground | Katie agent |
| `src/katie/stage/` | `KatieStage.tsx` (lazy, mounted once by the shell), `director.ts` (the appearance runner: show a moment, hold, exit, dismiss), `moments.ts` (pure: when she may appear, caps in storage), `placement.ts` (spots, avoid, bubble), `fitBubble.ts` (bubble width) | Katie agent |
| `scripts/check-lib.mjs` | self-check of `src/lib` (with `reason.ts`), every sentence template, `lists/titles.ts`, the demo materializer on many dates, plus `hopArc` / `planPath` | |
| `scripts/demo-data.mjs` | builds the demo dataset from `docs/demo/scenes/*.json` (`--validate` checks only) | |
| `netlify.toml` | publishes `dist-demo/` (the closers' static demo site) with the `/dash/*` rewrite, `noindex` and cache headers. Who added it was not reported by any builder | ? |
| `scripts/fake-api.mjs` | stand-in for the backend server (basic auth, `/api/dash/*`, SSE, optional `dist/` at `/dash/`) | |
| `scripts/katie-assets.mjs` | regenerates and verifies Katie's raster layers from `brief/assets/katie/` | |
| `scripts/verify.mjs` | regenerates the step-7 evidence pack, the demo day and the demo build included | |
| `docs/VERIFICATION.md`, `docs/screenshots/final/`, `docs/screenshots/occasional/`, `docs/lighthouse/`, `docs/perf/` (`katie-walk-trace.json.gz`, `results.json`, `console.json`) | `verify.mjs` outputs | generated |

Import from the barrels: `../api`, `../lib`, `../components`, `../shell`, `../live`, `../settings`.

## Pages: how a page renders

Each page's default export renders inside the shell's content container (padding 40/32/128, max 1376).
The top bar title, the Overview date, the Calls range control and the Show numbers toggle are already
in the shell; a page renders only its grid.

```tsx
import { PageGrid, Col } from '../shell'
import { Card } from '../components'
export default function Overview() {
  return (
    <PageGrid>
      <Col span={4}><Card katie={lineSentence}>…</Card></Col>
      <TodayNumbers />{/* four <Col span={2}> KPI cards, cols 5–12 (glass skin) */}
    </PageGrid>
  )
}
```

- **Glass skin (DESIGN-GLASS.md, 2026-10-26).** The content container is `#content` inside the
  slab, and **it, not the window, is the scroller**: use `document.getElementById('content')` for
  `scrollTo` / `scrollTop` / scroll listeners, and `scrollIntoView` as usual. Never set `overflow`
  on `html` / `body` back to visible. Pages render plain `Card`s; the glass comes from the tokens.
  The shell resets `#content.scrollTop` to 0 in a layout effect when the page path changes (DESIGN-GLASS 8.13);
  a drawer and the Calls range leave the path alone, so they keep the position. Pages do not scroll it themselves.
- `PageGrid` — 12 columns, 24 px column and row gaps (nothing may sit in a row gap: Katie stands there).
- `Col({ span, start?, stretch? })` — `<Col span={7}>`, `<Col span={5}>`; `stretch` makes cells in one row equal height. Below 1024 px every Col spans 12.
- `useCallsRange(): 'today' | '7d' | '30d'` — the Calls range from `?range=` (the top bar sets it). Calls owns `?outcome=` (use `useSearchParams`).
- `ShowNumbersToggle` — the same switch as the top bar, for Settings.
- `useDrawerOpenId(): string | null` — which call drawer is open (Katie does not appear while one is; an open drawer sends her away).
- `Shell({ …, drawerOpen? })` — `AppRoutes` passes `drawerOpen`; it sets the tab title to "Call · Katie"
  (otherwise "<Page> · Katie"). No number or name ever goes in the title.
- The top bar's two groups carry `data-katie-avoid`. In demo mode (`?mock=demo` or the demo build)
  the right group starts with the **Demo control** (`DemoMenu`, a button named "Demo controls");
  in a production build with another mock scenario it starts with "Demo data"; after a 401 it shows
  `SessionLine`.
- The right group ends with the **Katie button** (`SummonButton` in `src/shell/TopBar.tsx`;
  MONDAY-LLAMA 3.6): her 24 px head in a 32 px transparent button, hover background
  `--primary-background-hover-color`, the global `--focus-ring`, `aria-label` and a Vibe `Tooltip`
  "Point out what needs attention". It calls `requestSummon()` (`src/katie/summon.ts`); the stage
  listens with `onSummon(fn)`, brings her to the page's most pressing widget, scrolls it into view
  and focuses it. Hidden when Katie is Off, below 1024 px (CSS) and on Settings. Glass skin: a 36 px
  glass circle, and the tooltip is `className="glass-tooltip"`, `tip={false}`, `zIndex={30}` (without
  the z-index Vibe renders it under the slab). The Demo menu passes `dialogClassName="glass-menu"`.

### The slab and `data-katie-floor` (glass skin)

- The shell (`Shell.tsx`, DESIGN-GLASS 8) renders, in this order: `div.env` (the room,
  `aria-hidden`, painting `src/assets/scene.webp`; it holds glass objects A `div.glass-object.glass-object-a`
  (Vibe `Mobile`) and B `.glass-object-b` (`Calendar`) behind the slab's top-right and bottom-right corners); one
  `div.slab` (`src/styles/glass.css`, blurred, `backdrop-filter: blur(var(--glass-slab-blur)) saturate(1.25)`)
  carrying **`data-katie-floor`**, holding the rail, the top bar and `#content`; then **`div.rim`** (`aria-hidden`,
  `position: fixed; inset: var(--slab-inset)`, z 2, `pointer-events: none`), the slab's bright edge (the bevel on
  `.rim` itself, the 4 px gradient ring on `.rim::before`, DESIGN-GLASS 8.13), which must stay a sibling (the slab is
  a grid; a pseudo-element would become a grid item, so `.slab` has no `::before` / `::after`);
  then glass object C `div.glass-object.glass-object-c` (`Check`, `aria-hidden`, fixed, z 3, `pointer-events: none`)
  in front of the slab's bottom-left corner; then Katie's stage and the overlay. None of the three objects renders
  below 1024 px wide. Exactly one element on a page may carry `data-katie-floor`.
- `.slab`, `.rim` and `.glass-object-c` run the `slab-in` entrance once per page load (900 ms, fill `backwards`, so a
  finished entrance leaves `document.getAnimations()`); the shell mounts them once, so a route change never replays
  it. Katie's director waits for `[data-katie-floor]`'s animations (cap 1500 ms) before her first measurement, and
  `verify.mjs` / `contrast-probe.mjs` wait for `document.getAnimations().length === 0` before any geometry read.
- Katie's stage reads that element's **inner box** (its rect minus its border:
  `top + clientTop`, `left + clientLeft`, `+ clientWidth / clientHeight`) as her frame
  (`Viewport.frame` in `stage/placement.ts`): floor = its inner bottom, corners and side-edge
  entries from its inner left / right, the bubble kept inside it. It is read at a moment's start
  and on resize. With no such element the viewport is the frame (the `/_katie` playground).
- Her layer (`[data-katie-stage]`) is `position: fixed; inset: var(--slab-inset)` with the slab's
  radius and `overflow: hidden`; inside it a viewport-sized `space` div keeps every position in
  viewport px. Her wrapper is `[data-katie-stage] > div:last-child > div:last-child`.
- `--slab-inset` / `--slab-inset-y` are the slab's margin: 1 % of the window's width / height, at least 16 px, the
  same on every look (DESIGN-GLASS 9.11; the look store writes them from `slabInsets(w, h)`). `--float-inset` /
  `--float-inset-y` (inset + 12) place floating panels inside the slab (the drawer: 28 from the viewport at 1280 x
  800 and 1440 x 900). The glass objects' sizes and places are computed from `--slab-inset` (`--obj-size`, `--obj-d`,
  local to `.glass-object-*`).
- `useContentScroll()` (in `Shell`) forwards the wheel over the rail, the top bar and the margin,
  and the scroll keys when focus is outside `#content` on the page, a rail link or the top bar,
  to `#content`. It never moves focus and leaves inputs, menus, dialogs and the drawer alone.

## Data: `src/api`

Wire additions from the top-tier pass (`src/api/types.ts`): `Booking.new_patient?: boolean` (the
chart lookup found no record; the demo data carries it, the real API may not yet, and
`isNewPatientBooking` falls back to the reason) and `Sms.text?: string` (the message body: **demo
data only**; the real API never sends bodies, they are PHI).

All hooks are TanStack Query v5. Phone-bearing requests add `reveal=1` when Show numbers is on; their
keys contain `{ reveal }`, and turning Show numbers off removes every reveal:true query. List
placeholder data (`maskedPrevious` in useCalls and the limited lists) never moves revealed rows to a
reveal:false key. Never copy revealed numbers anywhere else (no storage, no URL, no console).

| hook | returns | example |
|---|---|---|
| `useStatus()` | `UseQueryResult<StatusResponse>`, refetch 15 s | `const line = useStatus().data?.line` |
| `useStats(days)` | `UseQueryResult<StatsResponse>`; records the practice tz | `useStats(1).data?.calls` |
| `useYesterday()` | `{calls, booked_calls, callbacks, sms_out} \| null` (conflict 8; null = show nothing) | `y && \`Yesterday ${y.calls}\`` |
| `useCalls(range)` | `UseQueryResult<CallRow[]>` paged with `before=` until `range.from`, filtered, newest first (conflict 11) | `useCalls(useCallsRange())` |
| `useLatestCalls(10)` | today's newest calls (Overview) | |
| `useCall(id)` | `UseQueryResult<CallDetail>`; 404 → `error.isNotFound` (no retries) | `isApiError(q.error) && q.error.isNotFound` |
| `useCallRow(id)` | the cached list row, for an instant drawer header | |
| `useBookings()` / `useNotes()` / `useSms()` | `{ query, rows, limit, canShowMore, showMore }` (limit 50, +50 up to 500, conflict 12) | `{l.canShowMore && <TextButton onClick={l.showMore}>Show more</TextButton>}` |
| `usePracticeTz()` | `stats.range.tz` or America/New_York | |
| `useLeads(filter)` | `{ query, rows, summary, limit, canShowMore, showMore }`: `GET /leads?stage=&limit=` (200, +200 up to 2,000), refetch every 60 s and on focus; `summary` is kept across a filter change; a new filter never shows the last filter's rows | `useLeads(parseLeadsFilter(location.search))` |
| `useLead(id)` | `UseQueryResult<LeadDetail>` (`{ lead, events }`, oldest event first), refetch every 60 s and on focus; 404 → `error.isNotFound` | |
| `useLeadRow(id)` | the cached list row, for an instant drawer header | |
| `useLeadAction(id)` | `UseMutationResult<LeadRow, ApiError, LeadActionBody>`: one `POST /leads/:id/action`, never retried. On success the answered lead is merged into every cached list and the open detail (`mergeLeadAfterAction`), then both are refetched; on an error both are refetched too. A 409's `error.detail` is the box's sentence | `act.mutate({ action: 'booked', slot_label: '2026-11-12T09:00' })` |
| `bindRevealCleanup(qc)` | `() => void`; removes reveal:true queries when Show numbers turns off (wired in `App.tsx`) | |
| `bindDayRollover(qc)` | `() => void`; invalidates `['dash']` once per change of the practice's local day (60 s check + a timer just after midnight; wired in `App.tsx`) | |

Client (`src/api/client.ts`, re-exported from `src/api`):

| export | what |
|---|---|
| `apiBase()` | `"/api/dash"` in production (a constant); in development the Settings value, already sanitised |
| `ApiError#isUnauthorized` | `kind === 'http' && status === 401`; never retried, and `useStatus` stops polling |
| `getAuthState(): 'ok' \| 'signed-out'`, `subscribeAuthState(fn): () => void` | 'signed-out' after any 401 until a request succeeds. Read with `useSyncExternalStore(subscribeAuthState, getAuthState, getAuthState)`; used by `SessionLine`, `ErrorLine` and the Line tile |

`sanitizeApiBase(v)` (`src/settings`): the dev API base must be a same-origin absolute path
(`/api/dash`); a full URL, `//host`, a relative path or one with whitespace, `\`, `?` or `#` falls
back to `/api/dash`. Production never reads the setting.

Types (`src/api/types.ts`): `StatusResponse`, `StatsResponse`, `CallRow` (no `summary`, ever),
`CallDetail { call, events: CallEvent[] }`, `Booking`, `Note`, `Sms`, `DashEvent<K>`, `EventDataMap`.
A live row has `status: 'live'`, `disposition: 'live'`, and `ended_at` / `duration_s` = `null`:
show elapsed time with `formatElapsed(row.started_at, useNow())`.
`ApiError { kind: 'http'|'network'|'parse'|'aborted', status, detail?, isNotFound, isUnauthorized, isForbidden }`.

Leads (`voice-agent/handoff/LEADS-PAGE-SPEC-2026-11-04.md`): `LeadStage`, `LeadsFilter`
(`'open' | 'missed_consult' | 'never_booked' | LeadStage | 'all'`), `LeadRow`, `LeadQuote`,
`LeadEvent`, `LeadDetail`, `LeadsSummary` (every field optional: the box may answer `{}`),
`LeadsResponse`, `LeadActionBody { action, note?, slot_label? }`. `api.leads` / `api.lead` /
`api.leadAction` are the only callers of the three routes; `api.leadAction` is the dashboard's
only write. The action route answers the stored row: phone masked whatever the page's reveal, and
no `open` / `pool` / `texts_stopped`; `mergeLeadAfterAction(existing, returned, now)`
(`src/api/leads.ts`) keeps the phone on screen and recomputes the three (`check-lib.mjs` proves
the merged row equals the refetched one for every tap). With `reveal=1` the lead routes send ten
raw digits, not a formatted number. `LeadRow` carries four optional fields the box does not send
yet, `next_text_at`, `next_text_label`, `call_now`, `call_now_reason`: read them only through
`nextStep` in `pages/leads/model.ts`.

## Sign-in: `src/auth`

Boot (`main.tsx`): `bootAuth(apiBase())` runs once before the first render. In a mock scenario it does
nothing unless `?auth=1` (then the mock provider, `MOCK_CONFIG`, `setMockAuth(true)`); otherwise it
fetches `GET {apiBase}/config` (public) and, for `auth: "cognito"`, lazy-loads `cognito.ts`
(Amplify configured at runtime from `user_pool_id` and `client_id`; the region comes from the pool id,
the config's `region` is not needed). Basic mode: nothing else happens, `phase` stays `'basic'`.

| file | what |
|---|---|
| `types.ts` | `AuthConfig`, `Me`, `Role`, `SignInResult` (`done`, `new-password`, `choose-code`, `setup-app`, `code`), `AuthProvider`, `Person`, `ActivityRow`, `AuthStepError` |
| `provider` contract | `currentUser()`, `signIn(email, password)`, `newPassword(pw)`, `chooseMfa('app'\|'email')`, `setUpTotp() -> {secret, uri}`, `verifyTotpSetup(code)`, `confirmCode(code)`, `switchCode(kind)` (the "email code instead" link: re-runs the password step from memory, cleared when the challenge ends), `rememberThisComputer()`, `forgetThisComputer()`, `signOut()` (local), `accessToken({forceRefresh})` |
| `cognito.ts` | the provider on `aws-amplify@6.22.2` (`signIn` with `USER_SRP_AUTH`, `confirmSignIn` for every challenge, `rememberDevice`, `forgetDevice`, `fetchAuthSession`). `Amplify.configure` is imported from `aws-amplify` (it is not exported from `aws-amplify/utils`). An email-MFA setup step is answered with the typed sign-in email. SMS and custom challenges are refused in plain words |
| `mock.ts`, `mockBackend.ts` | the invented people and the in-memory `/me /people /activity /support /session` API for `?mock=...&auth=1` and the verifier |
| `bridge.ts` | auth mode, the token source, `authHeaders()`, `parseUnauthorized(body)`, `notifyUnauthorized(reason)`; lets `api/client.ts` stay free of the session store |
| `session.ts` | the store (`useAuthSession()`: `phase` `basic\|signed-out\|challenge\|signed-in\|locked`, `step`, `me`, `error`, `notice`): `signIn`, `submitNewPassword`, `chooseCode`, `submitSetupCode`, `submitCode(code, remember)`, `switchCode`, `lock`, `signOut`, `cancelChallenge`; remembered-computer date (`katie.auth.rememberedAt`) and its expiry; `/session` events (`signed_in`, `signed_out`, `locked`, `unlocked`, with `remembered`) |
| `idle.ts` | `watchIdle(ms, onIdle)`: pointer, key, scroll, wheel, touch; timers only |
| `AuthGate.tsx` | inside the router: basic and signed-in render the routes, everything else renders the right screen, so nothing of the app is mounted while locked or signed out |
| `screens/*` | `SignIn`, `NewPassword`, `ChooseCode`, `SetUpApp` (QR from `qrcode@1.5.4`, lazy), `Code` (six boxes), `Locked`, `ForgotPassword`, `Frame` (the room + the glass pane), `CodeBoxes`; every screen's `<section>` carries `data-screen="sign-in\|forgot\|code\|choose-code\|new-password\|setup-app\|locked"` |
| `helpers.ts` | pure, tested in `scripts/check-lib.mjs`: `parseRememberedAt`, `rememberExpired`, `rememberDaysLeft`, `isRemembered`, `ROLE_ORDER`, `roleRank`, `sortPeople`, `canManagePeople`, `canToggleSupport`, `personActions`, labels, `newPasswordProblem`, `cleanCode`, `tsToSec`, `nameFromEmail`, `firstNameOf`, `activitySentence`, `activityPeople`, `filterActivity` |

API (`src/api/client.ts`, `authApi.ts`): `apiGet` / `apiPost` send `Authorization: Bearer <token>` in cognito mode (one
refresh and retry on a 401 `expired`); a 401 calls `notifyUnauthorized(reason)` (the store returns to the
sign-in screen, the route is the URL itself and stays), a 403 sets the API auth state `'not-allowed'`
(`ErrorLine` then says "Not allowed."). `ApiError.detail` holds the server's own `{"error": "..."}` words and
`isForbidden` the 403. Endpoints: `GET /config` (public), `GET /me`, `POST /session {event, remembered}`,
`GET /people`, `POST /people {email, name, role}`, `POST /people/{username}/{remove|reset-password|reset-code|resend}`,
`POST /support {enabled}`, `GET /activity?days=30`. The live stream: `src/live/sse.ts` (`createSseParser`,
`FetchEventSource`, same surface as `EventSource`) in cognito mode.

Test hooks (mock scenarios with `?auth=1` only): `window.__katieAuth` (`expire()`, `remembered()`, `state()`,
`setRememberedDaysAgo(n)`, `rememberedAt()`, `setServerRole(role|null)`) and `window.__katieAuthDebug.requests`
(`{method, url, authorization}` of each request the client built, with fake tokens).

## Live: `src/live`

The shell starts one stream per tab (`startDashStream`, reconnect backoff 1, 2, 4, 8, 16, 30 s) and
invalidates queries per DESIGN.md 5 (plus the open call's detail on every event of that call).

```ts
import { onDashEvent, useDashEvent } from '../live'
const off = onDashEvent('call.started', (e) => goToLineTile(e.data.caller))  // returns unsubscribe
onDashEvent('call.ended', async (e, { refreshed }) => { await refreshed; walkHome() })  // after data refetch
onDashEvent('booking', async (e, { refreshed }) => { await refreshed; checkMilestone() })
onDashEvent('*', (e) => {})            // every kind
useDashEvent('booking', handler)        // React wrapper
```

`useStreamState()` → `'connecting' | 'open' | 'waiting' | 'stopped'`.
`invalidateAllDashQueries()` (`stream.ts`) refetches every `['dash']` query; the demo's Reset uses it.

## Formatting and text: `src/lib`

All times take UNIX seconds and default to the practice tz.

| helper | example |
|---|---|
| `formatClock(ts)` | `5:35 PM` |
| `formatWhen(ts)` | `5:35 PM` / `Yesterday 5:35 PM` / `Sat 5:35 PM` / `Oct 1, 5:35 PM` |
| `formatDayHeader(ts)` | `Today` / `Yesterday` / `Sat, Oct 10` |
| `formatDateShort(ts)` | `Mon, Oct 12` |
| `formatTodayLong()` | `Today, Monday, October 12` |
| `formatTodayShort()` | `Monday, October 12` (the top bar below 1440 px) |
| `formatHourLabel(15)` | `3 PM` |
| `formatDuration(54.5)` | `0:55` (`h:mm:ss` from one hour, `''` for null) |
| `formatElapsed(startedAt, now)` | live ticker; `useNow(1000, isLive)` re-renders each second |
| `languageName('en')` | `English` |
| `expandSlot('Mon 3:20 PM')` | `Monday at 3:20 PM` (Katie only; tables show the slot as given) |
| `localHourMinute(ts)`, `localDayKey(ts)`, `zonedMidnight(ts, tz, daysBack)` | chart Now rule, day grouping |
| `nowSec()` | "now" (the fixtures' now in mock mode); never use `Date.now()` for display |
| `fixBotSpacing(t)`, `joinBotTexts(texts)` | `right now.Let me` → `right now. Let me` |
| `cleanReason(r)` | strips `[…]` and `URGENT:`, sentence-cases a leading ALL-CAPS run, ends with `.` |
| `displayIdentity(name, caller)` | name, else the masked number (never "unknown (") |
| `displayName(name)` | name or `null` → render `NOT_GIVEN` ("Not given") in secondary text |
| `insuranceLabel(v)` | value or `null` → "Not given" |
| `practiceName(status.practice)` | `{ name: 'Harborline Orthodontics', demo: true }` |
| `smsDirectionLabel`, `smsKindLabel` | `Sent` / `Received`; `Confirmation`, `Reply: yes` |
| `dispositionChip(d)`, `callChip(row)`, `noteChip(note)` | `{ label, tone }` per DESIGN 2.2 |
| `matchesOutcome(row, 'booked')` | Calls outcome filter (`all`, `booked`, `no-booking`, `live`, `dropped`) |
| `sortNotes(notes)`, `waitingNotes(notes, stats.range.from)` | urgent, callback, FYI; newest first |
| `bookedOnThisCall(note, calls)` | "· booked on this call" (conflict 19) |
| `buildTranscript(events, row)` | `[{type:'caller'\|'katie'\|'note', key, text, turn}]` per 6.8 (turn grouping, note copy, row duration) |
| `hasConversation(events)` | drawer empty state |
| `countWord(n)`, `count(n, 'call')`, `plural(n, 'note')` | `no` / `one`..`ten` / `11`; `eight calls` |
| `katieLine(s)` | final pass: collapse whitespace, tie `(656) ***-0150` and `5:35 PM` with U+00A0, capitalise, no `!`, ≤ `KATIE_MAX_CHARS` (140), `''` for nothing |
| `katieTargetProps(s)` | `{ 'data-katie', tabIndex: 0 }` for a target that is not a Card (KPI cells, which are route links and focusable anyway). The tabIndex and its doc comment ("keyboard focus counts as hover") are left from the always-on Katie; focus no longer summons her |

`src/lib/reason.ts` (pure; tested by `check-lib.mjs`):

| export | what |
|---|---|
| `deriveReason(call, bookings, notes)` | the booking reason first ("New-patient consult · Delta Dental"), then the cleaned note reason, then the cleaned first line; never the raw first utterance; ≤ `REASON_MAX` (48); a live call reads "In progress" |
| `callName(call, bookings, notes)` | a name correction made on the call (`correctedName`), then the booking's name, then the note's, then the greeted name |
| `correctedName(reason)` | the "now '<name>'" of a name-correction note |
| `isNewPatientBooking(b)` | `b.new_patient` when sent, else `/consult/i` on the reason |
| `isActionNote(n)` / `isInformationalNote(n)` | not FYI and not annotated "note is informational" (the KPI, the rail count, the Callbacks page) / the rest |
| `displayName({ name, caller })` | `{ primary, secondary? }`: name first, masked number second |
| `bookingLabel(b)`, `cleanNoteText(r)`, `cleanFirstLine(l)` | "New-patient consult"; a note without its "Existing patient X, DOB on file:" prefix; a first line without filler |

Sentence templates (DESIGN 7.6), every result through `katieLine`:

| module | exports |
|---|---|
| `src/pages/overview/say.ts` | `sayLine({ …, liveName? })`, `sayCallsCell(stats, yesterday, facts?)` ("… calls answered …", plus "Two came in after hours." / "Four were in Spanish."), `sayBookedCell(stats, confirmed?)`, `sayNewPatientCell(n, yesterday?)`, `sayCallbacksCell({ callbacks, urgent })` (fed the action-note count), `sayCallsByHour`, `sayLatestCalls(rows, nameOf?)`, `sayCallbacksWaiting`; `sayTextsCell` is no longer used (kept for check-lib) |
| `src/pages/lists/sentences.ts` | `bookingsSentence(bookings, sms, fromTs, counts?: { bookings })`, `callbacksSentence(notes, fromTs, …)` (counts action notes only: fixtures "Four callbacks are waiting, none of them urgent. Start with (656) ***-0150 from 5:36 PM."), `textsSentence` |
| `src/pages/calls/sentence.ts` | `callsSentence({ range, outcome, totals, filteredCount })` |

The Bookings and Callbacks pages pass `useStats(1).data` as `counts`; the count used is the larger of
stats and the list.

Self-check: `TZ=UTC node scripts/check-lib.mjs` (1,703 assertions, run twice: under TZ=UTC, then the
script respawns itself under TZ=Asia/Tokyo; Node 22.15 or later. Since the top-tier pass it also
covers `lib/reason.ts`, `lists/titles.ts` and the demo materializer (day 0 on several real dates,
both DST changes, the spoken-date rewrite and weekday shift, stats equal to the manifest), as well as
`src/lib`, every template, the variant cases, `hopArc` / `planPath`, and `moments.ts`: ranks, cooldown,
daily cap, urgent spacing and its 60 s exit gap, the exit-in-progress rule, quiet-moment and drawer
waits, milestones, the practice day and the cap storage).

## Components: `src/components`

| component | use |
|---|---|
| `Card({ title?, headerRight?, katie?, katieMoment?, focusable?, padded? })` | glass card (glass skin: `--glass-card`, `--glass-card-blur` 16 px backdrop blur with saturate 1.1, white edge, radius 16, card shadow + highlight); `title` renders the 56 px `SectionHeader`. `<Card title="Latest calls" headerRight={<Link to="/calls">All calls</Link>} katie={sentence}>` |
| `SectionHeader({ title, children })` | the header row alone |
| `StatusChip({ tone, children })`, `CallChip({ row })`, `DispositionChip`, `NoteChip({ note })` | chips |
| `EmptyState({ title?, hint?, rows?, filtered?, action?, className? })` | P20: every list's empty state. One sentence with a period, a hint under 14 words, a dashed 1px `--layout-border-color` box `rows` table rows tall (default 3). `filtered` (true or the filter's name) words it differently: "Nothing matches Booked." / "Change the filter to see more." Never Katie, never an illustration |
| `EmptyLine` | one secondary line; no longer used by the lists (kept in the barrel) |
| `ErrorLine({ onRetry })` | "Couldn't load this. Trying again." + Retry: `<ErrorLine onRetry={() => q.refetch()} />`. While signed out (401) the default copy is `ERROR_COPY_SIGNED_OUT`, "Couldn't load this." |
| `PressedButtonGroup` | Vibe `ButtonGroup` that sets `aria-pressed` on each button after every render (the Calls range, Katie's home) |
| `TextButton({ onClick })` | Show more |
| `SkeletonBar({ width, height })` | one Vibe skeleton at an exact size (`width` px or `"60%"`) |
| `SkeletonRows({ rows, columns: [{ width, bar, align? }], rowHeight?, barHeight? })` | table-shaped loading; same column widths as the table. `rowHeight` takes a number or a CSS string and defaults to `var(--row-height)` (44) |
| `useCallRowProps()` | `<div {...callRow(row.call_id)}>`: role link, tabIndex 0, Enter/click opens the drawer over this page, hover style, `--focus-ring-inset`, focus returns here on close (`data-call-row`). Put it on a div, never on a `tr`, `li` or `section` |
| `useOpenCall()` | `openCall(callId, el)`; the "View call" links are gone (P8): list rows open with `useRowOpen()` from `pages/lists/parts.tsx` |
| `useRouteRowProps()` / `linkRowProps(fn, className?)` | link-like rows to a route (KPI cell → `/calls`); the Calls table puts `linkRowProps` on a span in the time cell and keeps the `tr` a row |
| `Drawer`, `DrawerHeading`, `useDrawerClose()` | the frame is rendered by the shell route; inside `CallDrawer` put the caller in `<DrawerHeading>` (20/28 600, receives focus on open) and call `useDrawerClose()` if content needs to close it |

List page parts (`src/pages/lists/parts.tsx`): `useRowOpen()` (whole-row click and Enter, with
`data-call-row` for focus return), `ChevronCell` and `CHEVRON_COLUMN` (44px, the hover chevron),
`Identity({ primary, secondary?, tabularPrimary? })` (name over masked number), `CountTitle` (the
14/500 count sentence), `ListBelow({ …, emptyTitle, emptyHint })`, `NotGiven`. `ViewCallLink` is
removed. `groupByCaller(notes, from, names?)` lives in `pages/overview/CallbacksWaiting.tsx`.

### The data-katie rule

A Katie target is any element with a `data-katie` attribute holding its current sentence, or an empty
string when she should stand there silently. Use `Card`'s `katie` prop (`katie={sentence}` or
`katie={null}`), or `katieTargetProps(sentence)` on a cell. Hover and focus no longer summon her,
so being a target does not make a card focusable. `katieMoment` (or `katieMomentAttr(m)` on a cell)
sets `data-katie-moment` (`urgent`, `first-open`, `booking`, `summary`, space separated): the widget
each occasional moment goes to (MONDAY-LLAMA 3.10). Sentences are built from query data with the `lib/katie` helpers and pass through
`katieLine`. No `data-katie` on Settings, the drawer or the rail.

### The data-katie-avoid rule

`data-katie-avoid` (any value) marks a region Katie's body and bubble must keep clear of. The shell
sets it on both top-bar groups; keep it only on regions that must stay clear. Katie reads the rects
at commit and on resize only, never during a tween. If no clear spot exists she accepts the overlap
(DESIGN 7.2, 7.5).

### The KPI card (Overview, glass skin)

`TodayNumbers` returns four `<Col span={2} start={5|7|9|11} stretch>`, each a `Card` with
`styles.kpiCard` holding one route link `div` (class `kpiCell`, `data-kpi="calls|booked|consults|callbacks"`,
`data-katie` from `katieTargetProps`, `data-katie-moment` from `katieMomentAttr`: Calls answered
`first-open summary`, Appointments booked `booking`). Inside the link, in order: `.kpiHead` (the
`Tile`, an `aria-hidden` span `.kpiTile.tile_<blue|purple|green|orange>` with a 20 px Vibe icon,
`Mobile` / `Calendar` / `Person` / `Reply`, then `p.kpiLabel`), `p.kpiNumber.tabular` (28/32
700), `p.kpiSub` (the fact line, a non-breaking space when empty), and `Comparison` (`p.kpiDelta`,
`.kpiUp` when today is ahead): `↑ +N vs yesterday` / `↓ −N vs yesterday`, or a non-breaking space
when yesterday's count is unknown, zero or equal. The arrow is `aria-hidden`. The skeleton is the
same four cards with the real labels and tiles; a stats error is one card across cols 5–12.

## Katie: `src/katie`

| module | exports |
|---|---|
| `stage/placement.ts` | `spotFor(rect, vp, avoid?, span?)` → `{ x, y, shelf, onCard, side }` (on a card when `rect.top ≥ frame.top + 95` and `≤ frame.bottom − 8`; `vp` is `{ w, h, frame? }`, `frameOf(vp)` gives the slab's inner box or the viewport); `bubbleAt(feet, sizes[], side, vp, { reach?, avoid? })` → `{ left, top, side, size, clear }`; `figureBox`, `homeSpot`, constants `KATIE_H` 96, `SPOT_INSET` 36, `PRESENT_REACH` 44, `BUBBLE_GAP` 8, `AVOID_GAP` 8 |
| `stage/fitBubble.ts` | `fitBubble(el, minLines?)` → `{ w, h }`; `BUBBLE_LINE_CHARS = 79` |
| `motion/path.ts` | `planPath(from, shelf, target, { toFloor?, … })`; `hopArc(startY, endY, air, apexPx, minApexY?)` → `[apexY, riseTime]` |
| `motion/timing.ts` | every duration, ease and pose angle (`WALK`, `HOP`, `PRESENT`, `LISTEN`, `CELEBRATE`, `REST`, `IDLE`, `REDUCED`, `RISE`, `SINK`, `HOLD`, `holdSeconds(chars)`) |
| `stage/moments.ts` | pure: `decide(input)` (`DecideInput`: `kind, now, arrivedAt, arrivedHidden?, caps, day, reduced, drawerOpen, hidden, lastInputAt, onScreenRank, exiting?`) → `{ verdict: 'fire'\|'skip'\|'wait', reason, at? }`, `RANK`, caps (`COOLDOWN_MS`, `DAILY_CAP`, `URGENT_SPACING_MS`, …), `MILESTONES`, `practiceDay(nowSec, tz)`, `createCapStore(pickCapStorage(mock, window))` (localStorage; sessionStorage in mock mode) |
| `summon.ts` | `requestSummon()` (the top bar's Katie button) / `onSummon(fn)` (the stage) |
| `Katie.tsx`, `pose.ts`, `rig.ts`, `parts.ts`, `geometry.ts`, `traced.ts` | the rig; see `docs/KATIE-ART.md` 9 |

## Settings: `src/settings`

`useSettings()` → `{ showNumbers, katieEnabled, katieHome: 'bottom-right'|'bottom-left', apiBase, mock,
setShowNumbers, setKatieEnabled, setKatieHome, setApiBase, setMock }`. Stored in localStorage
`katie.showNumbers`, `katie.enabled`, `katie.home`, `katie.mascot` (the mascot look: `katie`, `plum`, `teal` or `rose`; see `src/katie/mascot.ts`), `katie.apiBase` (dev only), every access in
try/catch; only toggle state is stored. `setMock(scenario | null)` (dev) stores the scenario in
sessionStorage and reloads the tab. `getSettings()` / `subscribeSettings()` for non-React code.

The glass look (`src/settings/look.ts`, DESIGN-GLASS 9.7): `useLook()` → `{ look, preset, setLook, setPreset }`,
`getLook()` / `subscribeLook()` / `updateLook()` / `setLookPreset()` / `applyLook()` for non-React code. Stored
in localStorage `katie.look` as one JSON object of the 21 look fields only (the margin is not a field since
DESIGN-GLASS 9.11) (every access in try/catch; the
default preset is removed rather than stored; a stored `{ preset: name }` means that preset); `?look=reset` in
the address forgets it. `applyLook()` writes `data-look-*` attributes, the `--look-*` numbers and `--slab-inset`
/ `--slab-inset-y` on `<html>` and the pane's inline backdrop-filter; `src/styles/glass.css` reads them.

Katie's caps (`src/katie/stage/moments.ts`, `CAP_KEYS`; timestamps, counts and days only, never
event content; every access in try/catch with an in-memory fallback):

| key | value |
|---|---|
| `katie.lastExit` | ms of her last exit (any appearance; starts the 15-minute cooldown and the urgent 60 s exit gap). While her exit animation runs, `decide()` gets `exiting: true` and counts her as gone at that moment |
| `katie.lastUrgent` | ms of the last urgent appearance (or a first open that pointed at the urgent callbacks): the 10-minute urgent spacing |
| `katie.dayCount` | `<practice day>:<count>` of ordinary appearances (daily cap 6) |
| `katie.firstOpenDay` | practice day the first-open moment was used or passed over |

Where they live: **mock mode** (`?mock=…`) keeps them in **sessionStorage**, per tab, so a fresh demo tab
always shows the first open; **real mode** keeps them in **localStorage**, shared by every window
(`pickCapStorage(mock, window)`).

Cross-window claim (real mode only, `crossTab: !mock`): before she comes on screen a tab takes the
Web Lock `katie-appearance` with `ifAvailable` and holds it until she is off screen; a tab that
cannot get it adds nothing. Where Web Locks are missing (an insecure context) the fallback is
`katie.showing` in the same cap storage: the ms a tab put her on screen, read after a random
0-150 ms jitter and treated as stale after 20 s; the tab clears it when she leaves.

`StageStats` (what the stage reads from `/stats`, counts only): `{ calls, bookings, urgent, callbacks,
tz, day }`, where `day` is the practice day those counts belong to (`practiceDay(range.from, tz)`, or
null); booking milestones compare counts on the same practice day only.

## Mock scenarios

Open with a `mock` query param on first load (remembered for the tab), or `npm run dev:mock`:

| URL | what |
|---|---|
| `http://localhost:<port>/dash/?mock=1` | fixtures; one stream event every 2 s from `stream-sample.txt` (call CA294650154870, about 38 s), a 6 s pause, then call CA860072416005's events, then quiet. Katie is occasional: a fresh tab shows only the first-open moment (within 3 s; its sentence already names the urgent callbacks, so the replay's urgent note at about 14 s does not bring her back inside the 10-minute urgent spacing). The second call's booking does **not** make her celebrate: the fixture day is already at 6-7 bookings, so no milestone (1, 5, 10, 20, …) is crossed, and the 15-minute cooldown after the first open would skip it anyway. To see a booking moment, call `window.__katieStage.trigger('booking')` (after `resetCaps()` inside the cooldown). While a replayed call is live: `/status` line `on-call`, `live_calls` 1, the row is `status/disposition: 'live'`, `ended_at/duration_s: null`, and its detail returns only the events emitted so far |
| `?mock=empty` | no calls today: empty lists, zero stats, line idle, `last_call_at` null, no replay |
| `?mock=slow` | fixtures and replay with 1.5 s latency (skeletons) |
| `?mock=error` | every request fails with 500; the stream errors and backs off |
| `?mock=demo` | **the closers' demo day** (`src/mock/demo`, contract `src/mock/demo/README.md`, overview `docs/demo/DEMO-DATA.md`): Harborline Orthodontics on **today's real date** (America/New_York), NOW pinned to **9:10 PM** (the day is done, after-hours calls included), 35 calls today with full transcripts, 29 days of history (666 calls over 30 days), 0 requests to `/api/dash`. The showpiece call s36 (CA418009612779) is kept out of every list until **Play a sample call** replays `live-s36.txt` through the same live path. Spoken dates are rewritten from `manifest.date_phrases`; weekday slots stay, except that a call with a same-day or next-day slot or spoken date moves all its weekdays by business days. Day stats are computed from the rows (today 35 calls, 27 bookings, 17 new-patient consults, 12 callbacks waiting with 1 urgent) |
| `?mock=0` | mock off for this tab (also `false`, `off`) |

**Leads in mock mode.** `src/mock/leadStore.ts` holds the lead record in memory for the tab (a
reload starts over) and answers `GET /leads`, `GET /leads/:id` and `POST /leads/:id/action` rule
for rule like the box, the 422 / 409 / 404 sentences included. `?mock=1`, `slow` and `error` seed
it from `fixtures/leads.json` (14 leads as of the fixture clock: 11 open, 3 missed consults, 1
never booked); `?mock=empty` has none; `?mock=demo` and `scripts/fake-api.mjs` seed it from
`fixtures/leads-week.json`, the same story written for each weekday and moved by whole days onto
today (`seedForDate`), so every weekday, clock time and "Thu 9:00 AM" label is true on any date.
Both files are written by `scripts/leads-fixtures.py` from the real backend; never edit them by
hand. `check-lib.mjs` replays the backend's own recorded answers
(`scripts/fixtures/leads-actions.json`: every list, every reveal, 360 tap sequences) through the
store and fails when the two disagree.

Mock "now" is the fixtures' `status.now` (Mon Oct 12, 6:05 PM New York) advancing in real time.
Calls without a detail fixture return 404 (conflict 24). With `reveal=1` the mock unmasks
`(656) ***-0150` to `(656) 555-0150` (the reserved fictional range); nothing else is invented.
`window.__katieMock` exists in mock mode only, for Playwright checks: `get(path, query)` and
`post(path, body)` (both answer `{ status, body }` and are counted), `patchLead(id, fields)` (sets
fields on one mock lead, e.g. the reserved `call_now`), and the request / event counters in
`debug` (`debug.requests['/leads']`, `debug.requests['POST /leads/<id>/action']`).

Parsing: only `''`, `1`, `true`, `on`, `fixtures`, `empty`, `slow`, `error` and `demo` turn mock on; `0`,
`false` and `off` turn it off; anything else (`?mock=no`) is ignored. `VITE_MOCK` sets a build-time
default; the query param wins and is kept in sessionStorage (`katie.mock`) for the tab.

Production builds: `?mock=1` (and the other scenarios) still work, so a demo needs no dev server. The
top bar then shows "Demo data" (the Demo control for `?mock=demo`), and Settings offers a "Demo data"
toggle that turns it off for the tab. Dev builds keep the dev-only Mock data toggle.

**The demo build.** `VITE_DEMO_DEFAULT=1` (`npm run build:demo` → `dist-demo/`, git-ignored;
`npm run dev:demo`) makes `demo` the default **and the floor**: that build has no backend, so no
param, `?mock=0` and a stored "off" all stay in the demo, it never requests `/api/dash`, the Vite
dev proxy is off, and Settings hides its Demo data row. `?mock=1` and the other scenarios still
work there. `DEMO_BUILD` (`mode.ts`) is true in that build. It is never real mode.

**Demo controls** (`src/mock/demoControl.ts`; the Demo menu and the shortcuts call these, every one a
no-op outside demo mode):

| export | what |
|---|---|
| `isDemoMode()` | this tab runs `?mock=demo` |
| `resetDay(): Promise<void>` | re-materializes the day (the sample call gone, numbers as at open), clears Katie's caps, emits `reset` (the shell closes the drawer), then refetches every query |
| `playSampleCall({ speed?: 1 \| 2 }): Promise<void>` | replays s36 at its real pacing (about 130 s; 2 halves every gap, about 65 s): status on a call, a Live row, the transcript, the booking, the texts, hang-up. Resolves when it ends |
| `sampleCallState()` | `'idle' \| 'playing' \| 'done'` |
| `subscribeDemo(fn)` | `{ type: 'reset' \| 'sample-start' \| 'sample-end' }`; returns unsubscribe |

`window.__katieDemo` (demo mode only; functions and counters, never patient data) =
`{ playSampleCall, resetDay, sampleCallState, debug }`, for the console and Playwright.
Caps and the first open live in sessionStorage per tab, as for `?mock=1`.

Regenerate the dataset after editing a scene: `node scripts/demo-data.mjs` (`--validate` checks
only); it rewrites `src/mock/demo/*` and `docs/demo/DEMO-DATA.md`.

The replay runs on the mock clock: a replayed call's `started_at` is the mock time of its
`call.started`; each event's `ts` (and the drawer's copy) is when it went out; the row sorts to the
top of `/calls`; its `bookings` and `notes` counts follow the emitted events; after `call.ended` the
row keeps the replay's start, end and duration; `status.last_call_at` follows the replay. Known
(mock only): after the replay CA860072416005 shows 6:06 PM, but its booking and its desk note keep the
fixture's 5:15 PM.

## Test hooks `scripts/verify.mjs` depends on

Renaming any of these breaks the script.

- `window.__katieStage` (mock scenarios only; real-mode checks sample the DOM): `state()` (the
  director's debug view: `moment, phase, mode, dest, arrived, travelling, presenting, bubbleShown,
  listening, celebrating, offscreen, onCard, caps, waiting, log, day`, …), `trigger(kind)` (decides
  a moment through the caps with its trigger condition skipped; returns the decision), `caps()` and
  `resetCaps()`.
- `window.__katieMock.debug.events` reaching 66 when the replay ends.
- `[data-line-tile]`; `[data-call-row="<id>"]`; `nav[aria-label="Main"] a[href="/dash/<page>"]`.
- Leads (the `leads` step): `[data-lead-row="<id>"]` (the row's link), `[data-lead-count="<filter>"]`
  (the four count buttons, `aria-pressed`), `main select[aria-label="Show"]`, the list card as
  `main section:has(table)` with its `h2` title; in the drawer `[data-lead-id]`,
  `[data-lead-tap="<action>"]`, `[data-lead-ask="slot" | "lost"]`, `[data-lead-problem]`,
  `[data-lead-saved]` (the hidden status line after a tap), `[data-lead-slot-past]` (the Booked
  form's refusal of a time already behind the practice's clock), `[data-lead-note]`,
  `section[aria-label="Follow-up" | "Update" | "Quote" | "History"]`; the
  reserved slots `[data-call-now]` and `[data-next-text]`; `window.__katieMock.post` and
  `.patchLead`; the fixture lead ids in `verify.mjs`'s `LEAD`; `scripts/fake-api.mjs`'s counter
  key `POST /leads/:id/action`.
- `section[data-katie]` cards found by their h2/h3 title ("Calls by hour", "Latest calls",
  "Callbacks waiting"); KPI cards' links as `[data-katie][class*="kpiCell"]` (also `[data-kpi]`).
- `[data-katie-floor]` (the slab) and `#content` (the scroller); Katie's wrapper as
  `[data-katie-stage] > div:last-child > div:last-child`.
- The top bar's `header label` with the text "Show numbers" (its switch input is visually hidden:
  click the label, or dispatch a click on the input); the drawer as `aside[role="complementary"]`.
- `[data-line-tile]` carries `data-line-state` (`idle` / `live`); its second line is `[data-line-said]`.
- List cards' first line is their count sentence ("35 calls today · 26 booked"); Katie's
  destination on a list page is that card. KPI cells are found by their label ("Calls answered" …).
- Demo mode: `window.__katieDemo` (above); the top bar's button named "Demo controls"; menu items by
  role `menuitem` ("Play at 2x" …). Vibe menu items ignore a click unless the pointer has entered
  them: **hover, then click**. The rail's Callbacks count is the action-note count, not
  `stats.callbacks`, and the rail has no "Demo practice" line.
- The demo dataset's scene ids: s03 = `CA216253965107` (the Spanish new-patient consult), s32 =
  `CA528485723255` (the urgent bracket), s36 = `CA418009612779` (the sample call).

## CSS conventions

- CSS Modules next to the component (`Foo.module.css`), token variables only: spacing (`--space-*`) and
  motion come from `@vibe/core/tokens`; colors, radii and shadows from `src/styles/glass.css` (glass
  skin), which loads after the Vibe tokens and `global.css` and redefines the Vibe color variables the
  modules use. No hex values outside `src/katie` and `glass.css`.
- **`glass.css` tokens** (DESIGN-GLASS.md 2; values there and in the file): ink
  `--primary-text-color` #0f172a, `--secondary-text-color` #334155 (DESIGN-GLASS 8.3), `--icon-color`, `--nav-ink`;
  accent `--primary-color` #2563eb, `--primary-hover-color`, `--primary-selected-color`,
  `--primary-highlighted-color`, `--primary-background-hover-color` (white .55); status
  `--positive-color`, `--positive-color-hover`, `--negative-color` #dc2626, `--warning-color`; chips
  `--chip-positive-bg`, `--chip-primary-bg`, `--chip-live-bg` / `--chip-live-ink`,
  `--chip-neutral-bg` / `--chip-neutral-ink`; glass `--glass-slab`, `--glass-slab-blur`, `--glass-card`,
  `--glass-card-blur`, `--glass-strong`, `--glass-edge`, `--glass-rule`, `--glass-rule-strong`,
  `--glass-hover-on-strong`, `--glass-shadow-card`, `--glass-shadow-float`, `--glass-highlight`,
  `--glass-object-fill`, `--glass-object-blur`, `--nav-pill-shadow` (the second pass removed `--env-base`,
  `--env-edge`, `--env-shape-blur`, `--glass-slab-ring`, `--glass-edge-soft` and `--glass-shadow-slab`; the slab's
  edge and shadow are literal in `.slab` / `.rim`); radii `--radius-slab` 24, `--radius-card` 16,
  `--radius-pill` 999, `--radius-tile` 10; tiles `--tile-{blue,purple,green,orange}` and `-bg`;
  `--bar-open`, `--empty-edge`, `--empty-bg`, `--skeleton-bg`; layout `--slab-inset`,
  `--float-inset`. It also points `--layout-border-color`, `--ui-border-color`,
  `--allgrey-background-color` and `--secondary-background-color` at glass values, and holds the
  opaque fallbacks (`@supports not (backdrop-filter)`, `prefers-reduced-transparency`) and the
  global classes `.env`, `.slab`, `.rim`, `.glass-object` (+ `-a`, `-b`, `-c`), `.glass-menu`, `.glass-tooltip`,
  `.glass-segmented`, and the `slab-in` keyframes.
- `backdrop-filter` only on the slab (DESIGN-GLASS 8.2, Tom's call), the glass objects, cards, the drawer,
  `.glass-menu`, `.glass-tooltip` and Katie's bubble; never on rows, chips, buttons or tiles. Under
  `prefers-reduced-transparency: reduce` the slab, cards and objects drop it (`none`); the drawer, menu, tooltip and
  bubble keep theirs over a .96 fill (review R2-L4, open).
- Globals in `src/styles/global.css`: `--focus-ring`, `--focus-ring-inset` (rows, KPI cells, links
  that fill a card, the transcript scroller), `--katie-height` (96px), `--rail-width`,
  `--topbar-height`, `--drawer-width`, `--row-height` (44, P14), `--header-row-height` (32), the
  two chip tints `--chip-positive-bg` (#e6f3ed) and `--chip-negative-bg` (#fbebee, unused today):
  the only hex values outside `src/katie`; utility classes `.visually-hidden` (14px) and `.tabular`.
- Font sizes 12, 14, 16, 20, 28 only (28 = the KPI number; 13 inside Katie's bubble). Weights
  400/500/600/700. Never `letter-spacing`, `text-shadow`, or a gradient outside the environment. `@keyframes` only for one-shot opacity /
  transform motion that reduced motion turns off (today `lineIn`, `lcEnter`, `lcHold` in
  `overview.module.css`); the drawer uses transitions.
- Radii (glass skin): `--radius-slab`, `--radius-card` (cards), 20 (drawer), 12 (nav items, the
  bubble), `--radius-tile` (8 at 1280), `--radius-pill` (chips, pills, segmented choices), `50%`,
  `inherit` for an element that fills a card (`.lineInner`), and the chart bars' 4 px top.
- Text blocks: `max-width: 35em` (not `ch`), so lines stay under 80 characters.
- Table column widths include the cell padding.
- Shadows (glass skin): cards `--glass-shadow-card` + `--glass-highlight`; the slab its deep shadow, a
  white ring and highlights (literal in `.slab`, DESIGN-GLASS 8.2); the glass objects their own shadow; floating things `--glass-shadow-float`; the active nav pill
  `--nav-pill-shadow`; focus rings. Nothing else.
- The card's outer border is `--glass-edge`; every rule inside it is `--glass-rule`
  (`--layout-border-color` points there).
- Z order: environment 0 (with glass objects A and B inside it), slab 1 (rail, top bar and cards inside it), rim 2,
  glass object C 3, Vibe tooltips 30, Katie 50, drawer 100.
