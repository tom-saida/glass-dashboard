// Lead helpers the query layer and the mock both need. Pure module (node runs it in
// scripts/check-lib.mjs).

import type { LeadRow, LeadStage } from './types.ts'

/** The stages still in play: a lead here has not started, been lost or been paused. */
export const OPEN_LEAD_STAGES: readonly LeadStage[] = ['quoted', 'consult_booked', 'consult_missed', 'consult_happened']

/** A quoted lead with no exam joins the never-booked pool after this long (the backend's default). */
const NEVER_BOOKED_SECS = 7 * 86_400

/**
 * The row to show right after a tap. POST /leads/:id/action answers with the stored lead: its
 * phone is always masked and it carries no `open`, `pool` or `texts_stopped` (the list and detail
 * routes derive those). So the phone on screen is kept (masked or revealed, as it was loaded) and
 * the three derived fields are worked out here; the refetch that follows every tap confirms them.
 */
export function mergeLeadAfterAction(existing: LeadRow | undefined, returned: LeadRow, now: number): LeadRow {
  const stage = returned.stage
  const pool: LeadRow['pool'] =
    stage === 'consult_missed'
      ? 'missed_consult'
      : stage === 'quoted' && now - (returned.quoted_at ?? returned.created_at) >= NEVER_BOOKED_SECS
        ? 'never_booked'
        : ''
  return {
    ...existing,
    ...returned,
    phone: existing?.phone ?? returned.phone,
    open: OPEN_LEAD_STAGES.includes(stage),
    pool,
    texts_stopped: !!returned.sms_stopped_at,
  }
}
