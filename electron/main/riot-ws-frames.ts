/**
 * Riot client local WebSocket helpers: which WAMP event to subscribe to, a cheap
 * pre-parse filter, and an RFC 6455 frame reader that does not re-concatenate the
 * whole buffer on every TLS chunk.
 */

/**
 * The URIs RiotLocalApi handles (ares-mmr, ares-match-details, ares-core-game) all arrive
 * as Riot Messaging Service messages, e.g.
 * `/riot-messaging-service/v1/message/ares-core-game/core-game/v1/matches/{id}`.
 * Subscribing to this event instead of the catch-all `OnJsonApiEvent` drops presence,
 * chat, entitlements and every other local client event.
 */
export const RIOT_WS_SUBSCRIBE_EVENTS = ['OnJsonApiEvent_riot-messaging-service_v1_message'] as const

/** Substrings of the handled URIs — frames without one are skipped before JSON.parse. */
export const RIOT_WS_HANDLED_URI_MARKERS = [
  'ares-mmr/mmr/v1/players',
  'ares-match-details/match-details/v1/matches',
  '/core-game/v1/matches/',
] as const

const MARKER_BUFFERS = RIOT_WS_HANDLED_URI_MARKERS.map((m) => Buffer.from(m, 'utf8'))

/** True when a raw frame payload may contain a URI the handler uses (byte search, no decode). */
export function isRelevantRiotWsPayload(payload: Buffer): boolean {
  return MARKER_BUFFERS.some((marker) => payload.indexOf(marker) !== -1)
}

export interface WsFrame { opcode: number; payload: Buffer }

/** Incremental reader for unmasked server→client frames. */
export class WsFrameReader {
  private chunks: Buffer[] = []
  private length = 0

  push(chunk: Buffer): void {
    if (!chunk.length) return
    this.chunks.push(chunk)
    this.length += chunk.length
  }

  get bufferedBytes(): number { return this.length }

  /** Consume the HTTP upgrade response. False until the full header has arrived. */
  takeHandshake(): boolean {
    const buf = this.coalesce()
    if (!buf) return false
    const headerEnd = buf.indexOf('\r\n\r\n')
    if (headerEnd === -1) return false
    this.consume(headerEnd + 4)
    return true
  }

  /** Next complete frame, or null if more bytes are needed. A close frame is returned unconsumed. */
  next(): WsFrame | null {
    if (this.length < 2) return null
    // Header is at most 10 bytes; only merge chunks when it is split.
    let head = this.chunks[0]
    if (head.length < 10 && this.chunks.length > 1) head = this.coalesce()!
    const opcode = head[0] & 0x0f
    if (opcode === 8) return { opcode, payload: Buffer.alloc(0) }
    let payloadLen = head[1] & 0x7f
    let offset = 2
    if (payloadLen === 126) {
      if (head.length < 4) return null
      payloadLen = head.readUInt16BE(2); offset = 4
    } else if (payloadLen === 127) {
      if (head.length < 10) return null
      payloadLen = Number(head.readBigUInt64BE(2)); offset = 10
    }
    const total = offset + payloadLen
    // Wait for the whole frame without copying partial data.
    if (this.length < total) return null
    const buf = this.chunks[0].length >= total ? this.chunks[0] : this.coalesce()!
    const payload = buf.subarray(offset, total)
    this.consume(total)
    return { opcode, payload }
  }

  private coalesce(): Buffer | null {
    if (!this.chunks.length) return null
    if (this.chunks.length > 1) this.chunks = [Buffer.concat(this.chunks, this.length)]
    return this.chunks[0]
  }

  private consume(bytes: number): void {
    const buf = this.chunks[0].length >= bytes ? this.chunks[0] : this.coalesce()!
    const rest = buf.subarray(bytes)
    this.chunks.shift()
    if (rest.length) this.chunks.unshift(rest)
    this.length -= bytes
  }
}
