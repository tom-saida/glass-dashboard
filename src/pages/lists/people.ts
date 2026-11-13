// Who a call, booking, note or text belongs to (P7/P10): the lists carry names, the call rows
// and texts do not, so they are joined by call_id. Pure module.

import type { Booking, Note, Sms } from '../../api/types'
import { correctedName } from '../../lib/reason'
import { isUnknownName } from '../../lib/text'

/**
 * call_id -> the first real name its bookings (first) or notes carry; a name correction made on
 * the call wins (lib/reason callName does the same), so one patient has one spelling.
 */
export function namesByCall(bookings: readonly Booking[] | undefined, notes: readonly Note[] | undefined): Map<string, string> {
  const out = new Map<string, string>()
  for (const n of notes ?? []) {
    const fixed = correctedName(n.reason)
    if (fixed && !out.has(n.call_id)) out.set(n.call_id, fixed)
  }
  // Oldest first, so a call with two bookings shows the first patient booked.
  for (const b of [...(bookings ?? [])].sort((a, z) => a.ts - z.ts || a.id - z.id)) {
    if (!out.has(b.call_id) && !isUnknownName(b.name)) out.set(b.call_id, b.name.trim())
  }
  for (const n of [...(notes ?? [])].sort((a, z) => a.ts - z.ts || a.id - z.id)) {
    if (!out.has(n.call_id) && !isUnknownName(n.name)) out.set(n.call_id, n.name.trim())
  }
  return out
}

/** call_id -> rows of that call, in time order. */
export function byCall<T extends { call_id: string; ts: number; id: number }>(rows: readonly T[] | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of [...(rows ?? [])].sort((a, z) => a.ts - z.ts || a.id - z.id)) {
    const list = out.get(r.call_id)
    if (list) list.push(r)
    else out.set(r.call_id, [r])
  }
  return out
}

/** A confirmation text with its reply folded in (P15). */
export interface Conversation {
  key: string
  /** The row's time: the text that went out, or the reply when nothing went out. */
  ts: number
  call_id: string
  phone: string
  out?: Sms
  reply?: Sms
}

/**
 * Folds each reply into the latest text that went out to the same call before it (match by
 * call_id); a reply with no text out in the list stands on its own row. Newest first.
 */
export function foldTexts(sms: readonly Sms[]): Conversation[] {
  const asc = [...sms].sort((a, z) => a.ts - z.ts || a.id - z.id)
  const convs: Conversation[] = []
  const openByCall = new Map<string, Conversation>()
  for (const s of asc) {
    if (s.direction === 'out') {
      const c: Conversation = { key: `o${s.id}`, ts: s.ts, call_id: s.call_id, phone: s.phone, out: s }
      convs.push(c)
      openByCall.set(s.call_id, c)
    } else {
      const c = openByCall.get(s.call_id)
      if (c && !c.reply) c.reply = s
      else convs.push({ key: `i${s.id}`, ts: s.ts, call_id: s.call_id, phone: s.phone, reply: s })
    }
  }
  return convs.sort((a, z) => z.ts - a.ts || z.key.localeCompare(a.key))
}
