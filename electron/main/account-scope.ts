/**
 * Account ownership for long-running work (cloud saves that wait for a match to end, bulk
 * backups). Work snapshots the owner when admitted; every awaited boundary rechecks it so a
 * task started by account A can never continue — upload, catalogue write or local delete —
 * after sign-out or under account B.
 */

let generation = 0

/** Call on every sign-out / account switch. Invalidates all outstanding owner snapshots. */
export function bumpAccountScope(): void {
  generation++
}

export function currentAccountScope(): number {
  return generation
}

export interface AccountOwnerSnapshot {
  readonly userId: number | null
  /** True while the same signed-in account (and sign-in session) is still active. */
  stillOwned(): boolean
}

export function snapshotAccountOwner(getActiveUserId: () => number | null): AccountOwnerSnapshot {
  const userId = getActiveUserId()
  const scope = generation
  return {
    userId,
    stillOwned: () => userId != null && scope === generation && getActiveUserId() === userId,
  }
}

export class AccountChangedError extends Error {
  constructor() {
    super('Signed out before this cloud save started. Sign back in to save it.')
    this.name = 'AccountChangedError'
  }
}
