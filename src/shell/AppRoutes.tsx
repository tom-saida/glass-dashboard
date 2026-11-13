import { Suspense, lazy, useCallback, useEffect } from 'react'
import { Navigate, Route, Routes, matchPath, useLocation, useNavigate, type Location } from 'react-router'
import type { CallsRange } from '../api/queries'
import Overview from '../pages/Overview'
import Bookings from '../pages/Bookings'
import Leads from '../pages/Leads'
import Callbacks from '../pages/Callbacks'
import Texts from '../pages/Texts'
import { CallDrawerRoute } from './CallDrawerRoute'
import { LeadDrawerRoute } from './LeadDrawerRoute'
import { parseRange } from './range'
import { Shell } from './Shell'

// Code splitting: the two pages that pull in heavy Vibe components (Calls: Dropdown, which
// brings downshift and the floating dialog; Settings: TextField) are their own chunks. Both are
// fetched when the browser is idle after the first render, so navigating to them is instant;
// router navigations run in a transition, so the old page stays up until the chunk is there.
const loadCalls = () => import('../pages/Calls')
const loadSettings = () => import('../pages/Settings')
const Calls = lazy(loadCalls)
const Settings = lazy(loadSettings)

function usePrefetchPages(): void {
  useEffect(() => {
    const run = () => {
      void loadCalls().catch(() => undefined)
      void loadSettings().catch(() => undefined)
    }
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 3000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(run, 1500)
    return () => window.clearTimeout(t)
  }, [])
}

/**
 * Background-location pattern: /calls/:id renders the call drawer over whatever page the row was
 * clicked on (location.state.background), or over Calls when loaded directly. /leads/:id does
 * the same for a lead, over the Leads page.
 */
export function ShellRoutes() {
  const location = useLocation()
  const navigate = useNavigate()
  const callDrawer = matchPath('/calls/:id', location.pathname)
  const leadDrawer = callDrawer ? null : matchPath('/leads/:id', location.pathname)
  const drawer = callDrawer ?? leadDrawer
  const home = callDrawer ? '/calls' : '/leads'
  const background = (location.state as { background?: Location } | null)?.background
  const pageLocation: Location = drawer
    ? (background ?? { ...location, pathname: home, search: '', hash: '', state: null, key: `${home.slice(1)}-direct` })
    : location
  const range = parseRange(pageLocation.search)

  const setRange = useCallback(
    (r: CallsRange) => {
      const params = new URLSearchParams(pageLocation.search)
      if (r === 'today') params.delete('range')
      else params.set('range', r)
      const qs = params.toString()
      const search = qs ? `?${qs}` : ''
      if (drawer) {
        navigate(location.pathname, { replace: true, state: { background: { ...pageLocation, search } } })
      } else {
        navigate({ pathname: pageLocation.pathname, search }, { replace: true })
      }
    },
    [drawer, location.pathname, navigate, pageLocation],
  )

  usePrefetchPages()
  const callId = callDrawer?.params.id
  const leadId = leadDrawer?.params.id
  return (
    <Shell
      pagePath={pageLocation.pathname}
      range={range}
      onRangeChange={setRange}
      drawerTitle={callId ? 'Call' : leadId ? 'Lead' : undefined}
      overlay={
        callId ? (
          <CallDrawerRoute callId={decodeURIComponent(callId)} background={background} />
        ) : leadId ? (
          <LeadDrawerRoute leadId={decodeURIComponent(leadId)} background={background} />
        ) : null
      }
    >
      <Suspense fallback={null}>
        <Routes location={pageLocation}>
          <Route index element={<Overview />} />
          <Route path="calls" element={<Calls />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="leads" element={<Leads />} />
          <Route path="callbacks" element={<Callbacks />} />
          <Route path="texts" element={<Texts />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  )
}
