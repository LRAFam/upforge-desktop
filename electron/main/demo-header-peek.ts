import fs from 'fs'
import { DemoFile } from 'demofile'
import log from 'electron-log'

export interface DemoHeaderPeek {
  mapName: string | null
  clientName: string | null
  playbackTime: number | null
}

/** Read map / client from demo header without a full timeline parse. */
export function peekDemoHeader(demoPath: string): Promise<DemoHeaderPeek | null> {
  if (!fs.existsSync(demoPath)) return Promise.resolve(null)

  return new Promise((resolve) => {
    const demo = new DemoFile()
    let settled = false

    const finish = (value: DemoHeaderPeek | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const fromHeader = (): DemoHeaderPeek | null => {
      const header = demo.header
      if (!header?.mapName && !header?.clientName) return null
      return {
        mapName: header.mapName?.trim() || null,
        clientName: header.clientName?.trim() || null,
        playbackTime: header.playbackTime ?? null,
      }
    }

    demo.on('end', () => finish(fromHeader()))
    demo.on('error', (err: Error) => {
      log.debug('[DemoHeaderPeek] Parse error (may still have header):', err.message)
      finish(fromHeader())
    })

    try {
      const stream = fs.createReadStream(demoPath)
      demo.parseStream(stream)
    } catch (err) {
      log.warn('[DemoHeaderPeek] Failed to open:', (err as Error).message)
      finish(null)
    }
  })
}
