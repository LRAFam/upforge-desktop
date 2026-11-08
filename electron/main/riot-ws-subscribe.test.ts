import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const sockets: FakeSocket[] = []
class FakeSocket extends EventEmitter {
  written: Buffer[] = []
  write(data: string | Buffer) { this.written.push(Buffer.from(data)); return true }
  destroy() { this.emit('close') }
}
vi.mock('tls', () => ({
  default: {
    connect: (_opts: unknown, onConnect: () => void) => {
      const socket = new FakeSocket()
      sockets.push(socket)
      queueMicrotask(onConnect)
      return socket
    },
  },
}))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))

import { RiotLocalApi } from './riot-local-api'
import { WsFrameReader, isRelevantRiotWsPayload } from './riot-ws-frames'

const PUUID = '11111111-2222-3333-4444-555555555555'
const MATCH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function frame(payload: string): Buffer {
  const data = Buffer.from(payload, 'utf8')
  if (data.length < 126) return Buffer.concat([Buffer.from([0x81, data.length]), data])
  if (data.length < 65536) {
    const h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(data.length, 2)
    return Buffer.concat([h, data])
  }
  const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(data.length), 2)
  return Buffer.concat([h, data])
}

/** Decode a masked client→server text frame. */
function unmask(buf: Buffer): string {
  let len = buf[1] & 0x7f
  let offset = 2
  if (len === 126) { len = buf.readUInt16BE(2); offset = 4 }
  const mask = buf.subarray(offset, offset + 4)
  const data = buf.subarray(offset + 4, offset + 4 + len)
  return Buffer.from(data.map((b, i) => b ^ mask[i % 4])).toString('utf8')
}

const rms = (uri: string, data: unknown) =>
  JSON.stringify([8, 'OnJsonApiEvent_riot-messaging-service_v1_message', { uri, data, eventType: 'Create' }])

async function connect() {
  const api = new RiotLocalApi()
  const internals = api as unknown as Record<string, unknown> & { _connectWebSocket(): void }
  internals.lockfileData = { port: 1234, password: 'pw', protocol: 'https' }
  internals.ownPuuid = PUUID
  internals.matchData = { agent: null, matchId: null }
  internals._connectWebSocket()
  await Promise.resolve()
  const socket = sockets.at(-1)!
  socket.emit('data', Buffer.from('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\n'))
  return { api, internals, socket }
}

describe('Riot local WebSocket subscription', () => {
  afterEach(() => { sockets.length = 0; vi.restoreAllMocks() })

  it('subscribes only to Riot Messaging Service events, not every OnJsonApiEvent', async () => {
    const { socket } = await connect()
    const sent = socket.written.slice(1).map(unmask)
    expect(sent).toEqual([JSON.stringify([5, 'OnJsonApiEvent_riot-messaging-service_v1_message'])])
    expect(sent).not.toContain(JSON.stringify([5, 'OnJsonApiEvent']))
  })

  it('still handles match-details, core-game and ares-mmr URIs', async () => {
    const { api, internals, socket } = await connect()
    const mmr = vi.fn()
    api.setMmrChangedListener(mmr)
    socket.emit('data', frame(rms(`/riot-messaging-service/v1/message/ares-core-game/core-game/v1/matches/${MATCH}`, {
      Players: [{ Subject: PUUID, CharacterID: 'add6443a-41bd-e414-f6ad-e58d267f4e95' }],
    })))
    expect(internals.currentMatchId).toBe(MATCH)
    socket.emit('data', frame(rms('/riot-messaging-service/v1/message/ares-match-details/match-details/v1/matches', {
      payload: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
    })))
    expect(internals.currentMatchId).toBe('bbbbbbbb-cccc-dddd-eeee-ffffffffffff')
    socket.emit('data', frame(rms(`/riot-messaging-service/v1/message/ares-mmr/mmr/v1/players/${PUUID}`, {})))
    expect(mmr).toHaveBeenCalledOnce()
  })

  it('skips JSON.parse for unrelated events', async () => {
    const { internals, socket } = await connect()
    const parse = vi.spyOn(JSON, 'parse')
    for (let i = 0; i < 50; i++) {
      socket.emit('data', frame(rms('/riot-messaging-service/v1/message/ares-party/parties/v1/parties/x', { i })))
    }
    socket.emit('data', frame(rms(`/riot-messaging-service/v1/message/ares-core-game/core-game/v1/matches/${MATCH}`, {})))
    expect(parse).toHaveBeenCalledTimes(1)
    expect(internals._wsParsedFrames).toBe(1)
  })

  it('reassembles a frame split across many chunks', async () => {
    const { internals, socket } = await connect()
    const big = frame(rms(`/riot-messaging-service/v1/message/ares-core-game/core-game/v1/matches/${MATCH}`, {
      filler: 'x'.repeat(200_000),
    }))
    for (let i = 0; i < big.length; i += 1_000) socket.emit('data', big.subarray(i, i + 1_000))
    expect(internals.currentMatchId).toBe(MATCH)
  })
})

describe('WsFrameReader', () => {
  it('reads 7-bit, 16-bit and 64-bit length frames, back-to-back in one chunk', () => {
    const reader = new WsFrameReader()
    const a = 'a'.repeat(10); const b = 'b'.repeat(300); const c = 'c'.repeat(70_000)
    reader.push(Buffer.concat([frame(a), frame(b), frame(c)]))
    expect(reader.next()?.payload.toString()).toBe(a)
    expect(reader.next()?.payload.toString()).toBe(b)
    expect(reader.next()?.payload.toString()).toBe(c)
    expect(reader.next()).toBeNull()
    expect(reader.bufferedBytes).toBe(0)
  })

  it('does not copy the buffer per chunk while a large frame is incomplete', () => {
    const reader = new WsFrameReader()
    const big = frame('z'.repeat(500_000))
    const concat = vi.spyOn(Buffer, 'concat')
    let frames = 0
    for (let i = 0; i < big.length; i += 1_000) {
      reader.push(big.subarray(i, i + 1_000))
      while (reader.next()) frames++
    }
    expect(frames).toBe(1)
    // One merge for the split header + one for the completed frame — not one per chunk (~500).
    expect(concat.mock.calls.length).toBeLessThanOrEqual(2)
    concat.mockRestore()
  })

  it('handles a header split across chunks and a pending handshake', () => {
    const reader = new WsFrameReader()
    reader.push(Buffer.from('HTTP/1.1 101\r\n'))
    expect(reader.takeHandshake()).toBe(false)
    const f = frame('hello')
    reader.push(Buffer.concat([Buffer.from('\r\n'), f.subarray(0, 1)]))
    expect(reader.takeHandshake()).toBe(true)
    expect(reader.next()).toBeNull()
    reader.push(f.subarray(1))
    expect(reader.next()?.payload.toString()).toBe('hello')
  })

  it('prefilter matches handled URIs only', () => {
    expect(isRelevantRiotWsPayload(Buffer.from('"/riot-messaging-service/v1/message/ares-mmr/mmr/v1/players/x"'))).toBe(true)
    expect(isRelevantRiotWsPayload(Buffer.from('"/chat/v4/presences"'))).toBe(false)
  })
})
