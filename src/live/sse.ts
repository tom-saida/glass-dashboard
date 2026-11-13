// Server-Sent Events over fetch. EventSource cannot send an Authorization header, and a token must
// never go in a URL, so in cognito mode the stream is a fetch whose body is read as it arrives and
// parsed as text/event-stream. FetchEventSource has the same small surface the stream code uses
// from EventSource (readyState, onopen, onerror, addEventListener, close), so reconnect, backoff
// and the event bus stay exactly as they are.

export interface SseMessage {
  event: string
  data: string
}

/**
 * An incremental text/event-stream parser: push decoded text in any chunking, get whole messages
 * out. Handles \n, \r\n and \r line ends, ": comment" lines, multi-line data, "event:" names, one
 * optional space after the colon, and ignores "id:" and "retry:".
 */
export function createSseParser(onMessage: (m: SseMessage) => void): { push(chunk: string): void } {
  let buf = ''
  let event = ''
  let data: string[] = []
  let skipLf = false

  const line = (l: string) => {
    if (l === '') {
      if (data.length > 0) onMessage({ event: event || 'message', data: data.join('\n') })
      event = ''
      data = []
      return
    }
    if (l.startsWith(':')) return
    const i = l.indexOf(':')
    const field = i === -1 ? l : l.slice(0, i)
    let value = i === -1 ? '' : l.slice(i + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }

  return {
    push(chunk: string) {
      let text = chunk
      if (skipLf && text.startsWith('\n')) text = text.slice(1)
      skipLf = false
      buf += text
      let start = 0
      for (let i = 0; i < buf.length; i++) {
        const c = buf[i]
        if (c === '\n' || c === '\r') {
          line(buf.slice(start, i))
          if (c === '\r') {
            if (buf[i + 1] === '\n') i++
            else if (i + 1 === buf.length) skipLf = true
          }
          start = i + 1
        }
      }
      buf = buf.slice(start)
    },
  }
}

export interface FetchEventSourceOptions {
  /** Headers for each connection (the Authorization header in cognito mode). */
  headers: () => Promise<Record<string, string>>
  /** Called with the status when the server answers something other than 200 (a 401 matters). */
  onStatus?: (status: number, body: unknown) => void
  fetchImpl?: typeof fetch
}

type Listener = (ev: MessageEvent) => void

/** CONNECTING = 0, OPEN = 1, CLOSED = 2, like EventSource. */
export class FetchEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  readyState = 0
  onopen: ((ev: Event) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  private listeners = new Map<string, Set<Listener>>()
  private abort = new AbortController()
  private readonly url: string
  private readonly opts: FetchEventSourceOptions

  // Plain fields, not constructor parameter properties: scripts/check-lib.mjs loads this file with
  // Node's type stripping, which only erases types.
  constructor(url: string, opts: FetchEventSourceOptions) {
    this.url = url
    this.opts = opts
    void this.run()
  }

  addEventListener(type: string, handler: Listener): void {
    let set = this.listeners.get(type)
    if (!set) this.listeners.set(type, (set = new Set()))
    set.add(handler)
  }

  close(): void {
    this.readyState = 2
    this.abort.abort()
  }

  private fail(): void {
    if (this.readyState === 2) return
    this.readyState = 2
    this.onerror?.(new Event('error'))
  }

  private async run(): Promise<void> {
    const f = this.opts.fetchImpl ?? fetch
    try {
      const res = await f(this.url, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'text/event-stream', ...(await this.opts.headers()) },
        signal: this.abort.signal,
      })
      if (this.readyState === 2) return
      if (res.status !== 200 || !res.body) {
        let body: unknown = null
        try {
          body = await res.json()
        } catch {
          /* no body */
        }
        this.opts.onStatus?.(res.status, body)
        return this.fail()
      }
      this.readyState = 1
      this.onopen?.(new Event('open'))
      const parser = createSseParser((m) => {
        for (const h of [...(this.listeners.get(m.event) ?? [])]) h(new MessageEvent(m.event, { data: m.data }))
      })
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(dec.decode(value, { stream: true }))
      }
      this.fail() // the server ended the stream: reconnect like a dropped EventSource
    } catch {
      if (this.readyState !== 2 || !this.abort.signal.aborted) this.fail()
    }
  }
}
