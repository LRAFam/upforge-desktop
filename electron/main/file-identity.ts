import fs from 'fs'

const CHUNK_BYTES = 1024 * 1024

/**
 * True only when both paths are regular files with the same size and the same bytes.
 * Streams in chunks on the libuv thread pool so large recordings never block the main thread.
 * Any read error returns false: when identity cannot be proven, the caller must keep both files.
 */
export async function filesHaveIdenticalBytes(a: string, b: string): Promise<boolean> {
  let ha: fs.promises.FileHandle | null = null
  let hb: fs.promises.FileHandle | null = null
  try {
    const [sa, sb] = await Promise.all([fs.promises.stat(a), fs.promises.stat(b)])
    if (!sa.isFile() || !sb.isFile() || sa.size !== sb.size) return false
    if (sa.dev === sb.dev && sa.ino === sb.ino && sa.ino !== 0) return false // same file, not a copy
    ha = await fs.promises.open(a, 'r')
    hb = await fs.promises.open(b, 'r')
    const bufA = Buffer.alloc(CHUNK_BYTES)
    const bufB = Buffer.alloc(CHUNK_BYTES)
    let offset = 0
    while (offset < sa.size) {
      const len = Math.min(CHUNK_BYTES, sa.size - offset)
      const [ra, rb] = await Promise.all([
        ha.read(bufA, 0, len, offset),
        hb.read(bufB, 0, len, offset),
      ])
      if (ra.bytesRead !== len || rb.bytesRead !== len) return false
      if (!bufA.subarray(0, len).equals(bufB.subarray(0, len))) return false
      offset += len
    }
    return true
  } catch {
    return false
  } finally {
    await ha?.close().catch(() => {})
    await hb?.close().catch(() => {})
  }
}
