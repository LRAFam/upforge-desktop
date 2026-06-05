/** Plus (premium), Pro, founder, and admin can click heatmap events to seek VOD. */
export function canSpatialVodSeek(tier: string | null | undefined): boolean {
  const t = (tier ?? 'free').toLowerCase()
  return t === 'premium' || t === 'pro' || t === 'founder' || t === 'admin'
}
