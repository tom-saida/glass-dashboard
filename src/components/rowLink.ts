import { useCallback, type KeyboardEvent, type MouseEvent } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router'
import { rememberOpener } from '../shell/drawerState'
import styles from './RowLink.module.css'

export const rowLinkClass = styles.rowLink

export interface RowLinkProps {
  role: 'link'
  tabIndex: 0
  className: string
  onClick: (e: MouseEvent<HTMLElement>) => void
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}

/** Makes any element a link-like row: role link, tabIndex 0, click and Enter activate. */
export function linkRowProps(activate: (el: HTMLElement) => void, className?: string): RowLinkProps {
  return {
    role: 'link',
    tabIndex: 0,
    className: [styles.rowLink, className].filter(Boolean).join(' '),
    onClick: (e) => {
      // Let inner links/buttons do their own thing.
      if ((e.target as HTMLElement).closest('a,button') && e.target !== e.currentTarget) return
      activate(e.currentTarget)
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' && e.target === e.currentTarget) {
        e.preventDefault()
        activate(e.currentTarget)
      }
    },
  }
}

/**
 * Opens /calls/:id as a drawer over the current page (state.background), remembering the
 * element to return focus to on close.
 */
export function useOpenCall(): (callId: string, opener?: HTMLElement | null) => void {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(
    (callId: string, opener?: HTMLElement | null) => {
      rememberOpener(callId, opener ?? (document.activeElement as HTMLElement | null))
      const state = location.state as { background?: Location } | null
      const background = state?.background ?? location
      navigate(`/calls/${encodeURIComponent(callId)}`, { state: { background } })
    },
    [navigate, location],
  )
}

/**
 * Opens /leads/:id as a drawer over the current page (the Leads page), remembering the element
 * to return focus to on close.
 */
export function useOpenLead(): (leadId: string, opener?: HTMLElement | null) => void {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(
    (leadId: string, opener?: HTMLElement | null) => {
      rememberOpener(leadId, opener ?? (document.activeElement as HTMLElement | null), 'data-lead-row')
      const state = location.state as { background?: Location } | null
      const background = state?.background ?? location
      navigate(`/leads/${encodeURIComponent(leadId)}`, { state: { background } })
    },
    [navigate, location],
  )
}

/**
 * Props for a row that opens a call drawer. Spread on a <tr>/<div>:
 *   const callRow = useCallRowProps(); <div {...callRow(row.call_id)}>…</div>
 */
export function useCallRowProps(): (callId: string, className?: string) => RowLinkProps & { 'data-call-row': string } {
  const openCall = useOpenCall()
  return useCallback(
    (callId: string, className?: string) => ({
      ...linkRowProps((el) => openCall(callId, el), className),
      'data-call-row': callId,
    }),
    [openCall],
  )
}

/** Props for a row that navigates to a route (e.g. a KPI cell to /calls). */
export function useRouteRowProps(): (to: string, className?: string) => RowLinkProps {
  const navigate = useNavigate()
  return useCallback((to: string, className?: string) => linkRowProps(() => navigate(to), className), [navigate])
}
