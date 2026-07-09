import type { Router } from 'vue-router'
import type { PrimaryGame } from './games'

export function accountLinkSettingsPath(game: PrimaryGame): { path: string; query: { tab: 'general'; link: PrimaryGame } } {
  return { path: '/settings', query: { tab: 'general', link: game } }
}

export async function openAccountLinkSettings(router: Router, game: PrimaryGame): Promise<void> {
  await router.push(accountLinkSettingsPath(game))
}
