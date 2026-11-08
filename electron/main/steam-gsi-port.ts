/**
 * Port selection for the CS2 GSI server. If the usual port is taken (another app, a dev server),
 * try the next few instead of silently losing CS2 match detection.
 */

import type { Server } from 'net'

/** How many ports (base, base+1, …) the GSI server may use. Small so the cfg stays predictable. */
export const GSI_PORT_RANGE_SIZE = 10

const isValidPort = (p: unknown): p is number =>
  typeof p === 'number' && Number.isInteger(p) && p > 0 && p < 65_536

/** Configured port first (when valid), then the rest of base..base+size-1. */
export function gsiPortCandidates(
  preferred: number | undefined,
  base: number,
  size: number = GSI_PORT_RANGE_SIZE,
): number[] {
  const range: number[] = []
  for (let p = base; p < base + size && p < 65_536; p++) range.push(p)
  if (!isValidPort(preferred)) return range
  return [preferred, ...range.filter((p) => p !== preferred)]
}

function tryListen(server: Server, port: number, host: string): Promise<NodeJS.ErrnoException | null> {
  return new Promise((resolve) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      server.off('listening', onListening)
      resolve(err)
    }
    const onListening = (): void => {
      server.off('error', onError)
      resolve(null)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

/**
 * Listen on the first candidate port that is free. Returns the bound port, or null when every
 * candidate is in use. Other listen errors (e.g. EACCES) are thrown.
 */
export async function listenOnFirstFreePort(
  server: Server,
  candidates: number[],
  host: string,
): Promise<number | null> {
  for (const port of candidates) {
    const err = await tryListen(server, port, host)
    if (!err) {
      const addr = server.address()
      return addr && typeof addr === 'object' ? addr.port : port
    }
    if (err.code !== 'EADDRINUSE') throw err
  }
  return null
}
