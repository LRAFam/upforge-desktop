export function isPostGameWindowRoute(path: string): boolean {
  return path === '/post-game' || path === '/post-game-preview'
}

/** Auxiliary post-game windows render their own view without starting the main app shell. */
export function shouldInitializeFullAppShell(path: string): boolean {
  return !isPostGameWindowRoute(path)
}
