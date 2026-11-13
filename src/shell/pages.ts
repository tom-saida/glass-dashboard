// Route table for the shell: title and what the top bar shows per page (DESIGN 5).
export interface PageMeta {
  path: string
  title: string
  /** 'today' = static "Today, Monday, October 12"; 'calls' = Today / 7 days / 30 days. */
  range: 'today' | 'calls' | null
  /** Show numbers toggle in the top bar's right end. */
  numbers: boolean
}

export const PAGES: PageMeta[] = [
  { path: '/', title: 'Overview', range: 'today', numbers: true },
  { path: '/calls', title: 'Calls', range: 'calls', numbers: true },
  { path: '/bookings', title: 'Bookings', range: null, numbers: true },
  { path: '/leads', title: 'Leads', range: null, numbers: true },
  { path: '/callbacks', title: 'Callbacks', range: null, numbers: true },
  { path: '/texts', title: 'Texts', range: null, numbers: true },
  { path: '/settings', title: 'Settings', range: null, numbers: false },
]

export function pageFor(pathname: string): PageMeta {
  const p = pathname.replace(/\/+$/, '') || '/'
  return PAGES.find((m) => m.path === p) ?? (PAGES[0] as PageMeta)
}
