import { Suspense, lazy } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router'
import { bindDayRollover, bindRevealCleanup, createQueryClient } from './api/queries'
import { AuthGate } from './auth/AuthGate'
import { bindAuthQueryClient } from './auth/session'
import { ShellRoutes } from './shell/AppRoutes'

// The rig playground is a development page: its own chunk, never loaded by the dashboard.
const KatiePlayground = lazy(() => import('./katie/KatiePlayground'))

const queryClient = createQueryClient()
bindRevealCleanup(queryClient)
// Sign-in: an idle lock, a sign-out or a 401 empties the cache, so nothing stays in memory.
bindAuthQueryClient(queryClient)
// At the practice's local midnight every "today" query refetches (DATA-3).
bindDayRollover(queryClient)

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/dash">
        <AuthGate>
        <Routes>
          {/* The rig playground is a full page, outside the shell. */}
          <Route
            path="_katie"
            element={
              <Suspense fallback={null}>
                <KatiePlayground />
              </Suspense>
            }
          />
          <Route path="*" element={<ShellRoutes />} />
        </Routes>
        </AuthGate>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
