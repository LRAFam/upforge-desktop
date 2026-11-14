import { describe, expect, it } from 'vitest'
import {
  addBlockedLine, canAddFocus, focusGoal, focusOriginLabel, focusProgressLine, formatFocusValue, hasFocusLoop,
  matchCheckLine, optionLine, parseTargetInput, refusalText, sanitizeMatchChecks, targetInputValue,
  type FocusItem, type FocusOption,
} from './focuses'

function focus(over: Partial<FocusItem> = {}): FocusItem {
  return {
    id: 1, metric: 'opening_death_rate', label: 'Opening deaths', better: 'lower', baseline: 0.4, target: 0.24,
    unit: 'share_of_rounds', checks: [], status: 'active', origin: 'coach', started_at: null, completed_at: null,
    progress: { games_played: 0, hits: 0, games_required: 3, hits_required: 2, status: 'active' }, ...over,
  }
}
function option(over: Partial<FocusOption> = {}): FocusOption {
  return { metric: 'traded_death_rate', label: 'Deaths traded', better: 'higher', unit: 'share_of_deaths', current: 0.2, matches: 5,
    target: 0.35, target_text: 'Deaths traded: at least 35% of deaths over your next 3 games', ...over }
}

describe('formatFocusValue', () => {
  it('says shares as a percent and counts or rates as numbers', () => {
    expect(formatFocusValue(0.24, 'share_of_rounds')).toBe('24%')
    expect(formatFocusValue(0.4, 'share')).toBe('40%')
    expect(formatFocusValue(5.1, 'count')).toBe('5.1')
    expect(formatFocusValue(2, 'count')).toBe('2')
    expect(formatFocusValue(0.85, 'rate')).toBe('0.85')
    expect(formatFocusValue(null, 'count')).toBe('—')
  })
  it('reads a focus without a unit (older API) as a share when it is on a 0–1 scale', () => {
    expect(formatFocusValue(0.24, undefined)).toBe('24%')
    expect(formatFocusValue(5.1, null)).toBe('5.1')
  })
})

describe('focus wording', () => {
  it('states the goal in the unit the game uses', () => {
    expect(focusGoal(focus())).toBe('At most 24% of rounds')
    expect(focusGoal(focus({ better: 'higher', target: 0.35, unit: 'share_of_deaths' }))).toBe('At least 35% of deaths')
    expect(focusGoal(focus({ target: 5.1, unit: 'count' }))).toBe('At most 5.1')
  })
  it('says where a focus stands', () => {
    expect(focusProgressLine(focus())).toBe('Starts with your next ranked game · on target in 2 of 3 to pass')
    expect(focusProgressLine(focus({ progress: { games_played: 1, hits: 1, games_required: 3, hits_required: 2, status: 'active' } })))
      .toBe('On target in 1 of 1 so far · 2 games left')
    expect(focusProgressLine(focus({ progress: { games_played: 2, hits: 0, games_required: 3, hits_required: 2, status: 'active' } })))
      .toBe('On target in 0 of 2 so far · 1 game left')
  })
  it('says how a focus ended', () => {
    const done = { games_played: 3, hits: 2, games_required: 3, hits_required: 2 }
    expect(focusProgressLine(focus({ status: 'achieved', progress: { ...done, status: 'achieved' } }))).toBe('Done: on target in 2 of 3 games')
    expect(focusProgressLine(focus({ status: 'missed', progress: { ...done, hits: 0, games_played: 2, status: 'missed' } }))).toBe('Not this time: on target in 0 of 2 games')
    expect(focusProgressLine(focus({ status: 'replaced', progress: { ...done, games_played: 1, status: 'replaced' } }))).toBe('Dropped after 1 game')
    expect(focusProgressLine(focus({ status: 'replaced', progress: { ...done, games_played: 0, status: 'replaced' } }))).toBe('Dropped before a game counted')
  })
  it('says who chose it', () => {
    expect(focusOriginLabel(focus())).toBe('From your coach')
    expect(focusOriginLabel(focus({ origin: 'player' }))).toBe('Your pick')
  })
  it('describes an option by where the player is and the step asked', () => {
    expect(optionLine(option())).toBe('Now 20% of deaths, aim for at least 35%')
    expect(optionLine(option({ better: 'lower', unit: 'count', current: 6.4, target: 5.1 }))).toBe('Now 6.4, aim for at most 5.1')
  })
})

describe('parseTargetInput', () => {
  it('reads a share typed as a percent', () => {
    expect(parseTargetInput('30', option())).toBe(0.3)
    expect(parseTargetInput(' 30% ', option())).toBe(0.3)
  })
  it('reads counts and rates as typed', () => {
    expect(parseTargetInput('4', option({ better: 'lower', unit: 'count', current: 6.4 }))).toBe(4)
    expect(parseTargetInput('4,5', option({ better: 'lower', unit: 'count', current: 6.4 }))).toBe(4.5)
  })
  it('refuses anything that is not an improvement or not a number', () => {
    expect(parseTargetInput('15', option())).toBeNull() // lower than now on a higher-is-better habit
    expect(parseTargetInput('20', option())).toBeNull() // same as now
    expect(parseTargetInput('120', option())).toBeNull() // more than 100%
    expect(parseTargetInput('7', option({ better: 'lower', unit: 'count', current: 6.4 }))).toBeNull()
    expect(parseTargetInput('', option())).toBeNull()
    expect(parseTargetInput('-3', option())).toBeNull()
    expect(parseTargetInput('abc', option())).toBeNull()
    expect(parseTargetInput('1e3', option())).toBeNull()
  })
  it('prefills the box in the unit the player types', () => {
    expect(targetInputValue(option())).toBe('35')
    expect(targetInputValue(option({ unit: 'count', target: 5.1 }))).toBe('5.1')
  })
})

describe('adding a focus', () => {
  const state = { focuses: [focus()], max_active: 3, options: [option()] }
  it('is possible below the limit when there is something to add', () => {
    expect(canAddFocus(state)).toBe(true)
    expect(addBlockedLine(state)).toBeNull()
  })
  it('explains the limit, an empty list, and a new player with no data', () => {
    expect(addBlockedLine({ ...state, focuses: [focus(), focus({ id: 2 }), focus({ id: 3 })] })).toBe('You can work on 3 at once. Drop one to add another.')
    expect(addBlockedLine({ ...state, options: [] })).toBe('Nothing else to add right now.')
    expect(addBlockedLine({ focuses: [], max_active: 3, options: [] })).toBe('Play a few ranked matches and your choices appear here.')
    expect(canAddFocus(null)).toBe(false)
  })
  it('turns refusal codes into plain words', () => {
    expect(refusalText('limit_reached')).toMatch(/Drop one first/)
    expect(refusalText('invalid_target')).toMatch(/not an improvement/)
    expect(refusalText('not_found')).toBe('That focus has already ended.')
    expect(refusalText('anything else')).toMatch(/Check your connection/)
  })
  it('knows which games have a focus loop', () => {
    expect(hasFocusLoop('valorant')).toBe(true)
    expect(hasFocusLoop('deadlock')).toBe(true)
    expect(hasFocusLoop('cs2')).toBe(false)
    expect(hasFocusLoop(null)).toBe(false)
  })
})

describe('match focus checks', () => {
  const check = { focus_id: 1, metric: 'opening_death_rate', label: 'Opening deaths', better: 'lower' as const, unit: 'share_of_rounds', target: 0.24, value: 0.1, hit: true, status: 'active' }
  it('says the match value against the target', () => {
    expect(matchCheckLine(check)).toEqual({ label: 'Opening deaths', detail: '10% of rounds · target at most 24%', hit: true })
    expect(matchCheckLine({ ...check, label: 'Deaths per game', unit: 'count', value: 7, target: 5.1, hit: false }))
      .toEqual({ label: 'Deaths per game', detail: '7 · target at most 5.1', hit: false })
  })
  it('keeps only well-formed rows from the API', () => {
    expect(sanitizeMatchChecks([check, { label: 'x' }, null, { ...check, better: 'sideways' }])).toEqual([check])
    expect(sanitizeMatchChecks(undefined)).toEqual([])
    expect(sanitizeMatchChecks('nope')).toEqual([])
  })
})
