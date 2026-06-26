/**
 * Map server analysis failure strings to honest, user-facing copy.
 * Credits are refunded server-side when these failures occur.
 */
export function formatAnalysisFailureMessage(rawError: string): string {
  const err = rawError.trim()
  const lower = err.toLowerCase()

  if (/timed? ?out|curl error 28|operation timed/i.test(err)) {
    return 'Analysis timed out on the server. Your coaching credit was refunded — try again from the dashboard.'
  }

  if (/insufficient duel observations|not generated from reviewed video/i.test(lower)) {
    return 'We could not produce reliable coaching from your duel clips (recording may have started late or moments were unclear). Your credit was refunded.'
  }

  if (/no actionable coaching|ai coach returned no/i.test(lower)) {
    return 'AI coaching could not be generated for this match. Your credit was refunded — try again when match stats have finished syncing.'
  }

  if (/duel_moments|duel moments manifest/i.test(lower)) {
    return 'No reviewable duel moments were found for this recording. Your credit was refunded.'
  }

  if (/match_data|match data|kill events/i.test(lower)) {
    return 'Match stats were not ready when analysis ran. Your credit was refunded — wait a moment after the game ends and analyse again from the dashboard.'
  }

  if (/integrity|coaching integrity/i.test(lower)) {
    return 'Coaching did not meet our quality bar for this match. Your credit was refunded.'
  }

  if (/credit.*refund|refunded/i.test(lower)) {
    return err
  }

  return `${err} Your coaching credit was refunded.`
}
