import { expect, it, vi } from 'vitest'
import { resolveNotebookFootage } from './review-recovery'
import type { NotebookContext } from './review-notebook'
const context: NotebookContext = { version: 1, moments: [
  { source: { kind: 'analysis', id: '639', game: 'valorant', label: 'Summit' }, position: 371, start: 369, eventShift: -4 },
  { source: { kind: 'recording', id: 'local-1', game: 'valorant', label: 'Split' }, position: 20, start: 18, eventShift: 0 },
], linked: false, speed: 1, loop: { enabled: false, from: 0, to: 8 } }
it('reports the failed side without returning a partial replacement', async () => {
  const result = await resolveNotebookFootage(context, 'both', async ref => {
    if (ref.kind === 'recording') throw new Error('missing file')
    return { game: 'valorant', videoPath: 'https://fresh-playback' }
  })
  expect(result).toEqual({ failed: [1], loaded: [] })
})
it('reloads only the attached side and uses its newly resolved playback URL', async () => {
  const load = vi.fn().mockResolvedValue({ game: 'valorant', videoPath: 'https://fresh-playback' })
  const result = await resolveNotebookFootage(context, 'b', load)
  expect(load).toHaveBeenCalledExactlyOnceWith(context.moments[1].source)
  expect(result.loaded[0]).toMatchObject({ side: 1, key: 'recording:local-1', source: { videoPath: 'https://fresh-playback' } })
})
it('rejects wrong-game and missing-video responses', async () => {
  const result = await resolveNotebookFootage(context, 'both', async ref => ref.kind === 'analysis'
    ? { game: 'cs2', videoPath: 'video.mp4' } : { game: 'valorant', videoPath: null })
  expect(result).toEqual({ failed: [0, 1], loaded: [] })
})
