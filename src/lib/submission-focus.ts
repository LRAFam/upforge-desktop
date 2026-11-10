/** Optional player instructions belong to one submission, never a global/game-independent profile. */
export function submissionFocusAreas(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 3) throw new Error('Choose up to 3 focus areas.')
  if (!value.length) return undefined
  return value.map(item => {
    if (typeof item !== 'string' || !item.trim() || item.trim().length > 200) {
      throw new Error('Each focus area must be between 1 and 200 characters.')
    }
    return item.trim()
  })
}
