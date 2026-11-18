import { describe, expect, it } from 'vitest'

// The app shows what it measured. Number-with-unit promises like "a warm-up routine can reduce your
// reaction time by 15–20ms" have no source and nothing in the app measures them.
describe('no unsourced number-with-unit promises in the app', () => {
  const BLOCKED = [/\b(reduce|cut|improve|lower|boost)s? your [a-z -]+ by (up to )?\d/i, /\bby \d+\s*[–-]\s*\d+\s*ms\b/i]
  it('src/ and electron/ contain none of the blocked phrases', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join, relative } = await import('node:path')
    const root = join(__dirname, '..', '..')
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const p = join(dir, name)
      return statSync(p).isDirectory() ? walk(p) : /\.(vue|ts)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : []
    })
    const hits: string[] = []
    for (const file of [...walk(join(root, 'src')), ...walk(join(root, 'electron'))]) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\/?\*)/.test(line)) return
        if (BLOCKED.some(re => re.test(line))) hits.push(`${relative(root, file)}:${i + 1}`)
      })
    }
    expect(hits).toEqual([])
  })
})
