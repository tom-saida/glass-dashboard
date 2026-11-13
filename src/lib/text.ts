// Text cleaning for what the backend sends (DESIGN.md conflicts 16-20, 25, 33).
// Pure module: node runs it in scripts/check-lib.mjs.

/** "Not given": the one copy for a missing name or insurance (render in secondary text). */
export const NOT_GIVEN = 'Not given'

/** First letter upper case, the rest untouched. */
export function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/**
 * Conflict 16: bot sentences arrive glued ("right now.Let me"). Adds the missing space.
 * "U.S." and "Dr. Reyes" are untouched.
 */
export function fixBotSpacing(text: string): string {
  return text.replace(/([a-z0-9)'"’][.?!])(?=[A-Z])/g, '$1 ')
}

/** All `turn.bot` texts of one turn, fixed and joined with one space into one block. */
export function joinBotTexts(texts: readonly string[]): string {
  return texts
    .map((t) => fixBotSpacing(t).trim())
    .filter(Boolean)
    .join(' ')
}

/**
 * Conflict 17, in order: drop every [annotation]; drop a leading "URGENT:" (the chip says it);
 * a leading run of 2+ ALL-CAPS words becomes sentence case; collapse whitespace; end with ".".
 */
export function cleanReason(reason: string | null | undefined): string {
  if (!reason) return ''
  let s = reason.replace(/\s*\[[^\]]*\]/g, '')
  s = s.replace(/^\s*URGENT:\s*/i, '')
  s = s.replace(/^\s*([A-Z][A-Z'’-]+(?:\s+[A-Z][A-Z'’-]+)+)(?=$|[\s:,.;])/, (_m, run: string) =>
    capitalizeFirst(run.toLowerCase()),
  )
  s = s.replace(/\s+/g, ' ').trim()
  if (s && !/[.?!]$/.test(s)) s += '.'
  return capitalizeFirst(s)
}

/** Conflict 18: "", "unknown (name to follow if given)" and friends are not names. */
export function isUnknownName(name: string | null | undefined): boolean {
  return !name || !name.trim() || /^unknown\b/i.test(name.trim())
}

/** A real name, or null (render "Not given" where a Number column also exists). */
export function displayName(name: string | null | undefined): string | null {
  return isUnknownName(name) ? null : (name as string).trim()
}

/** Single identity slot (Overview callbacks, Katie): the name, else the masked number. */
export function displayIdentity(name: string | null | undefined, caller: string): string {
  return displayName(name) ?? caller
}

/** Insurance per conflict 33: "" and "not provided" -> null (render "Not given"). */
export function insuranceLabel(insurance: string | null | undefined): string | null {
  const v = (insurance ?? '').trim()
  if (!v || /^not provided$/i.test(v)) return null
  return v
}

/** `status.practice` per conflict 25: "Harborline Orthodontics (DEMO practice - fictional)". */
export function practiceName(practice: string | null | undefined): { name: string; demo: boolean } {
  const p = (practice ?? '').trim()
  const i = p.indexOf(' (')
  if (i < 0) return { name: p, demo: false }
  return { name: p.slice(0, i).trim(), demo: /demo/i.test(p.slice(i)) }
}

/** "phone-transferred" -> "Transferred"; "follow_up" -> "Follow up". */
export function humanizeCode(code: string): string {
  return capitalizeFirst(code.replace(/^phone-/, '').replace(/[-_]+/g, ' ').trim().toLowerCase())
}

/** Texts page Direction column. */
export function smsDirectionLabel(direction: 'in' | 'out'): string {
  return direction === 'out' ? 'Sent' : 'Received'
}

/** Texts page Kind column (6.10). */
export function smsKindLabel(direction: 'in' | 'out', kind: string): string {
  if (kind === 'confirmation') return 'Confirmation'
  if (direction === 'in' && kind === 'yes') return 'Reply: yes'
  return humanizeCode(kind)
}

/**
 * Cut at the last word boundary so the result (with "…") is at most `max` characters.
 * Trailing punctuation before the cut is dropped.
 */
export function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, Math.max(0, max - 1))
  const sp = cut.lastIndexOf(' ')
  const base = (sp > 0 ? cut.slice(0, sp) : cut).replace(/[\s,;:.—-]+$/, '')
  return base + '…'
}
