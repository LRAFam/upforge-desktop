/** Whether a title-bar game switch should update the account's primary game on the API. */
export function shouldSyncPrimaryGame(isDev: boolean, envFlag: string | undefined): boolean {
  return !isDev || envFlag === '1'
}
