export interface CoachingPreferences {
  mode: 'smart' | 'manual' | 'off'
  pregame_enabled: boolean
  postgame_enabled: boolean
  daily_limit: number
}

export function coachingSkipMessage(reason?: string): string {
  switch (reason) {
    case 'disabled': return 'Coaching briefs are off in Settings.'
    case 'manual_only': return 'Automatic briefs are off. Request one when you need it.'
    case 'daily_limit': return 'Your daily automatic brief limit has been reached.'
    case 'weekly_limit': return 'Your plan’s weekly debrief allowance has been reached.'
    case 'cooldown': return 'Keeping briefs quiet for 90 minutes after your last one.'
    case 'repeated_advice': return 'No new coaching focus to send today.'
    case 'no_new_evidence': return 'No new repeated pattern was found in the captured rounds.'
    case 'no_relevant_advice': return 'No relevant advice is available for this agent and map yet.'
    case 'missing_match_context': return 'Waiting for confirmed agent, map and match details.'
    case 'discord_not_linked': return 'Link Discord to receive pre-game briefs.'
    case 'delivery_failed': return 'Discord could not receive this brief. Check your DM settings.'
    case 'already_requested': return 'This match’s brief was already requested.'
    default: return 'No automatic brief was sent for this match.'
  }
}
