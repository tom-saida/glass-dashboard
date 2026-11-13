import { useCallback, useEffect, useRef } from 'react'
import { useNavigate, type Location } from 'react-router'
import { useLead, useLeadRow } from '../api/queries'
import { Drawer } from '../components/Drawer'
import LeadDrawer from '../pages/leads/LeadDrawer'
import { focusOpener, setDrawerOpenId } from './drawerState'

/** /leads/:id: the drawer frame over the Leads page; content is pages/leads/LeadDrawer. */
export function LeadDrawerRoute({ leadId, background }: { leadId: string; background?: Location }) {
  const navigate = useNavigate()
  const row = useLeadRow(leadId)
  const detail = useLead(leadId)
  const name = (row?.first_name ?? detail.data?.lead.first_name ?? '').trim()

  useEffect(() => {
    setDrawerOpenId(leadId, 'lead')
  }, [leadId])

  // On unmount, after the route change has rendered the page again, focus goes back to the row.
  // The timer is cancelled on a remount, so StrictMode's rehearsal unmount in development does
  // not return focus (and spend the remembered opener) while the drawer is still open.
  const focusTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (focusTimer.current !== undefined) {
      window.clearTimeout(focusTimer.current)
      focusTimer.current = undefined
    }
    return () => {
      setDrawerOpenId(null)
      focusTimer.current = window.setTimeout(focusOpener, 0)
    }
  }, [])

  const close = useCallback(() => {
    if (background) {
      navigate(
        { pathname: background.pathname, search: background.search, hash: background.hash },
        { state: background.state },
      )
    } else {
      navigate('/leads')
    }
  }, [background, navigate])

  return (
    <Drawer label={name ? `Lead: ${name}` : 'Lead'} onClose={close} contentKey={leadId}>
      <LeadDrawer leadId={leadId} />
    </Drawer>
  )
}
