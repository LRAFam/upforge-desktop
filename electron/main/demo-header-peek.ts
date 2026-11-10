import fs from 'fs'
import { peekCs2DemoHeader } from './cs2-demo-parser'
import type { SourceGame } from './source-replay-finder'

export interface DemoHeaderPeek {
  mapName: string | null
  clientName: string | null
  playbackTime: number | null
}

/** Read map / client from demo header without a full timeline parse. */
export function peekDemoHeader(
  demoPath: string,
  game: SourceGame = 'cs2',
): Promise<DemoHeaderPeek | null> {
  if (!fs.existsSync(demoPath)) return Promise.resolve(null)

  if (game === 'cs2') {
    return Promise.resolve(peekCs2DemoHeader(demoPath))
  }

  // Deadlock Source-2 replay metadata comes from its cloud review, not a Source-1 parser.
  return Promise.resolve(null)
}
