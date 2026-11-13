import { useCallback, useEffect, useRef } from 'react'
import { useNavigate, type Location } from 'react-router'
import { useCall, useCallRow } from '../api/queries'
import { Drawer } from '../components/Drawer'
import CallDrawer from '../pages/calls/CallDrawer'
import { focusOpener, setDrawerOpenId } from './drawerState'

/** /calls/:id: the drawer frame over the background page; content is pages/calls/CallDrawer. */
export function CallDrawerRoute({ callId, background }: { callId: string; background?: Location }) {
  const navigate = useNavigate()
  const row = useCallRow(callId)
  const detail = useCall(callId)
  const caller = row?.caller ?? detail.data?.call.caller

  useEffect(() => {
    setDrawerOpenId(callId, 'call')
  }, [callId])

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
      navigate('/calls')
    }
  }, [background, navigate])

  return (
    <Drawer label={caller ? `Call from ${caller}` : 'Call'} onClose={close} contentKey={callId}>
      <CallDrawer callId={callId} />
    </Drawer>
  )
}
