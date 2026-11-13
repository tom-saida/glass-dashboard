// The dashboard's notion of "now". Real mode: the browser clock. Mock mode: the fixtures'
// `status.now` plus the time elapsed since the page loaded, so "today" and elapsed timers
// match the fixtures on any day. Pure module (no Vite APIs) so node can run it.

let offsetMs = 0

/** Milliseconds since the epoch, shifted in mock mode. */
export function nowMs(): number {
  return Date.now() + offsetMs
}

/** Seconds since the epoch (the API's unit). */
export function nowSec(): number {
  return nowMs() / 1000
}

/** Mock only: make nowSec() read `fixtureNowSec` at this instant and advance from there. */
export function setClockTo(fixtureNowSec: number): void {
  offsetMs = fixtureNowSec * 1000 - Date.now()
}
