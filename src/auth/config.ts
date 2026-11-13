// Boot configuration: GET /api/dash/config is public and says how this practice signs in. Nothing
// from it is baked into the build, so one bundle serves every practice.
import type { AuthConfig } from './types.ts'

export const MOCK_CONFIG: AuthConfig = {
  auth: 'cognito',
  idle_minutes: 15,
  remember_days: 30,
  support_email: 'support@example.com',
  practice: 'Harborline Orthodontics',
}

const num = (v: unknown, dflt: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt

/** Reads a config body defensively: unknown shapes mean "basic" (today's behaviour). */
export function parseConfig(body: unknown): AuthConfig {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const cognito =
    b.auth === 'cognito' && typeof b.user_pool_id === 'string' && typeof b.client_id === 'string' && !!b.user_pool_id && !!b.client_id
  const cfg: AuthConfig = {
    auth: cognito ? 'cognito' : 'basic',
    idle_minutes: num(b.idle_minutes, 15, 1, 24 * 60),
    remember_days: num(b.remember_days, 30, 1, 365),
    support_email: typeof b.support_email === 'string' ? b.support_email : '',
  }
  if (typeof b.practice === 'string' && b.practice) cfg.practice = b.practice
  if (cognito) {
    cfg.user_pool_id = b.user_pool_id as string
    cfg.client_id = b.client_id as string
    if (typeof b.region === 'string') cfg.region = b.region
  }
  return cfg
}

/** The public config. A missing endpoint (an older box) or a network error reads as basic. */
export async function fetchConfig(base: string, fetchImpl: typeof fetch = fetch): Promise<AuthConfig> {
  try {
    const res = await fetchImpl(`${base}/config`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return parseConfig(null)
    return parseConfig(await res.json())
  } catch {
    return parseConfig(null)
  }
}
