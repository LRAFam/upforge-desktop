import type { NotebookContext, NotebookSource } from './review-notebook'
import type { ComparisonSide } from './review-comparison'

/** Resolve all requested sides before the caller changes either player. */
export async function resolveNotebookFootage<T extends { game: string; videoPath: string | null }>(
  context: NotebookContext,
  attachment: 'a' | 'b' | 'both',
  load: (source: NotebookSource) => Promise<T | null>,
): Promise<{ failed: ComparisonSide[]; loaded: Array<{ side: ComparisonSide; source: T; key: string }> }> {
  const sides: ComparisonSide[] = attachment === 'both' ? [0, 1] : attachment === 'a' ? [0] : [1]
  const results = await Promise.allSettled(sides.map(async side => {
    const ref = context.moments[side].source
    const source = await load(ref)
    if (!source?.videoPath || source.game !== ref.game) throw new Error('Source unavailable')
    return { side, source, key: `${ref.kind}:${ref.id}` }
  }))
  const failed = sides.filter((_side, index) => results[index].status === 'rejected')
  return { failed, loaded: failed.length ? [] : results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []) }
}
