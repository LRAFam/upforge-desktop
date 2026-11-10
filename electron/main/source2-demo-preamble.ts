import fs from 'fs'

const MAGIC = Buffer.from('PBDEMS2\0', 'latin1')

/** Reject unsupported/truncated input before the native parser can read its 16-byte preamble. */
export function hasSource2DemoPreambleBytes(bytes: Buffer): boolean {
  return bytes.length >= 16 && bytes.subarray(0, MAGIC.length).equals(MAGIC)
}

export function hasSource2DemoPreamble(demoPath: string): boolean {
  let fd: number | undefined
  try {
    fd = fs.openSync(demoPath, 'r')
    const bytes = Buffer.alloc(16)
    const read = fs.readSync(fd, bytes, 0, bytes.length, 0)
    return read === bytes.length && hasSource2DemoPreambleBytes(bytes)
  } catch {
    return false
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}
