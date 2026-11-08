import { describe, expect, it } from 'vitest'
import { lolRankEmblemUrl } from './lol'

describe('lolRankEmblemUrl', () => {
  it('uses the CommunityDragon mini crests (the old ranked-emblems path is 404)', () => {
    expect(lolRankEmblemUrl('Gold II')).toBe(
      'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/gold.svg',
    )
    expect(lolRankEmblemUrl('Grandmaster')).toMatch(/\/grandmaster\.svg$/)
    expect(lolRankEmblemUrl(null)).toMatch(/\/unranked\.svg$/)
  })
})
