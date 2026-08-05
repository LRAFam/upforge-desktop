import type { Router } from 'vue-router'
import type { PrimaryGame } from './games'

export function accountLinkSettingsPath(game: PrimaryGame): {
  path: string
  query: { tab: 'account'; link: PrimaryGame }
} {
  return { path: '/settings', query: { tab: 'account', link: game } }
}

export async function openAccountLinkSettings(router: Router, game: PrimaryGame): Promise<void> {
  await router.push(accountLinkSettingsPath(game))
}
