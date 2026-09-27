import type { RecordingTimeline, TimelineEvent } from '../composables/useVodReview'

export function buildReviewEvents(source: RecordingTimeline, me: string | null): TimelineEvent[] {
  // Build set of first-blood killers per round for badge display
  const firstBloodKeys = new Set(
    (source.firstBloods ?? []).map(fb => `${fb.round ?? 0}:${fb.killerPuuid ?? fb.killerName}`)
  )

  // Classify every kill event by comparing killer/victim to the local player.
  // playerKills contains ALL match kill events (not just the player's) so we
  // must inspect each event individually rather than assuming array = type.
  const classified: TimelineEvent[] = (source.kills ?? [])
    .filter(k => k.videoOffsetMs != null && !isNaN(k.videoOffsetMs))
    .map(k => {
      const isMyKill  = (me && k.killerPuuid === me) || k.killerName === 'You'
      const isMyDeath = (me && k.victimPuuid === me) || k.victimName === 'You'
      const type: TimelineEvent['type'] = isMyKill ? 'kill' : isMyDeath ? 'death' : 'neutral'
      return {
        ...k,
        type,
        isFirstBlood: firstBloodKeys.has(`${k.round ?? 0}:${k.killerPuuid ?? k.killerName}`)
      }
    })

  // Include any deaths from the deaths array that aren't already captured above
  // (guard against double-counting if both arrays have the same event)
  const seenOffsets = new Set(classified.map(e => e.videoOffsetMs))
  const extraDeaths: TimelineEvent[] = (source.deaths ?? [])
    .filter(d => d.videoOffsetMs != null && !isNaN(d.videoOffsetMs) && !seenOffsets.has(d.videoOffsetMs))
    .map(d => ({ ...d, type: 'death' as const }))

  const plants: TimelineEvent[] = (source.spikePlants ?? [])
    .filter(p => p.videoOffsetMs != null)
    .map(p => ({
      type: 'plant' as const,
      killerName: p.planter ?? '',
      victimName: '',
      planter: p.planter,
      site: p.site,
      videoOffsetMs: p.videoOffsetMs,
      round: p.round,
    }))
  const defuses: TimelineEvent[] = (source.spikeDefuses ?? [])
    .filter(d => d.videoOffsetMs != null)
    .map(d => ({
      type: 'defuse' as const,
      killerName: d.defuser ?? '',
      victimName: '',
      defuser: d.defuser,
      videoOffsetMs: d.videoOffsetMs,
      round: d.round,
    }))
  const detonations: TimelineEvent[] = (source.spikeDetonations ?? [])
    .filter(d => d.videoOffsetMs != null)
    .map(d => ({
      type: 'detonation' as const,
      killerName: '',
      victimName: '',
      videoOffsetMs: d.videoOffsetMs,
      round: d.round,
    }))

  const objectives: TimelineEvent[] = (source.objectives ?? [])
    .filter(o => o.videoOffsetMs != null && !isNaN(o.videoOffsetMs))
    .map(o => ({
      type: o.kind,
      killerName: o.killerName ?? '',
      victimName: '',
      detail: o.detail ?? null,
      stolen: o.stolen ?? false,
      team: o.team ?? null,
      videoOffsetMs: o.videoOffsetMs,
    }))

  return [...classified, ...extraDeaths, ...plants, ...defuses, ...detonations, ...objectives]
    .sort((a, b) => (a.videoOffsetMs ?? 0) - (b.videoOffsetMs ?? 0))
}
