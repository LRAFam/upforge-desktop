import fs from 'fs'
import { DemoFile } from 'demofile'
import log from 'electron-log'
import { sanitizeDemoClientName, sanitizeDemoMapName } from './demo-text-sanitize'

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
      const mapName = sanitizeDemoMapName(header?.mapName)
      const clientName = sanitizeDemoClientName(header?.clientName)
      if (!mapName && !clientName && !header?.playbackTime) return null
      return {
        mapName,
        clientName,
        playbackTime: header?.playbackTime ?? null,
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
