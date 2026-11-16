/**
 * League match result. API 16 Nov 2026+ sends `result` ('win' | 'loss' | 'remake' | null) and
 * `remake`; older builds send only `win`. Remakes and unknown results are never a loss and are
 * left out of W/L, win rate and averages.
 */
export type LolResult = 'win' | 'loss' | 'remake' | 'unknown'

export interface LolResultFields {
  win?: boolean | null
  result?: 'win' | 'loss' | 'remake' | null
  remake?: boolean | null
}

export function lolResult(m: LolResultFields): LolResult {
  if (m.remake === true || m.result === 'remake') return 'remake'
  if (m.result === 'win' || m.result === 'loss') return m.result
  if (m.result === null) return 'unknown'
  if (typeof m.win === 'boolean') return m.win ? 'win' : 'loss'
  return 'unknown'
}

/** True for a counted game (a real win or loss). */
export const lolIsDecided = (m: LolResultFields): boolean => {
  const r = lolResult(m)
  return r === 'win' || r === 'loss'
}

/** Win flag for form squares: null when remake or unknown. */
export const lolWon = (m: LolResultFields): boolean | null => {
  const r = lolResult(m)
  return r === 'win' ? true : r === 'loss' ? false : null
}

/** Single-letter label: W, L, R (remake) or – (unknown). */
export const lolResultLetter = (m: LolResultFields): string => {
  const r = lolResult(m)
  return r === 'win' ? 'W' : r === 'loss' ? 'L' : r === 'remake' ? 'R' : '–'
}

/** Word label: Won, Lost, Remake, or a neutral dash. */
export const lolResultWord = (m: LolResultFields): string => {
  const r = lolResult(m)
  return r === 'win' ? 'Won' : r === 'loss' ? 'Lost' : r === 'remake' ? 'Remake' : 'No result'
}
