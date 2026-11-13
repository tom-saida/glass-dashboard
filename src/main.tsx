import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@vibe/core/tokens'
import './styles/global.css'
import './styles/glass.css'
// The glass look writes its attributes and variables onto <html> as it loads, before the first
// render (settings/look.ts), so the stored look paints first, never the default.
import './settings/look'
import App from './App'
import { apiBase } from './api/client'
import { bootAuth } from './auth/session'
import { getMockScenario } from './mock/mode'

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// Mock mode (?mock=1 / VITE_MOCK=1): load the fixture server first so the clock reads the
// fixtures' "now" from the first render. The chunk is not loaded otherwise. Then sign-in boots:
// it asks GET /api/dash/config how this practice signs in (basic: nothing changes; cognito: the
// screens), before the first render so the app never flashes data a person may not see.
const boot = () => bootAuth(apiBase()).catch(() => undefined)
if (getMockScenario()) {
  import('./mock/server')
    .then((m) => m.installMock())
    .catch(() => undefined)
    .then(boot)
    .finally(render)
} else {
  boot().finally(render)
}
