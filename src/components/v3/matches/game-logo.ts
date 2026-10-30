import valorantLogo from '../../../assets/games/valorant-logo.svg'
import cs2Logo from '../../../assets/games/cs2-icon.svg'
import deadlockLogo from '../../../assets/games/deadlock-icon.png'
import lolLogo from '../../../assets/games/lol-icon.webp'

const LOGOS: Record<string, string> = { valorant: valorantLogo, cs2: cs2Logo, deadlock: deadlockLogo, lol: lolLogo, league: lolLogo }

/** Logo for a recording/clip game id, or null for unknown games. */
export function gameLogo(game: string | null | undefined): string | null {
  return game ? LOGOS[game.toLowerCase()] ?? null : null
}
