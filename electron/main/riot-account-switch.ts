export type RiotSwitchDecision =
  | { action: 'continue' }
  | { action: 'activate'; accountId: number }
  | { action: 'prompt_link'; name: string; tag: string }
  | { action: 'prompt_manage'; name: string; tag: string }
  | { action: 'block_wrong_linked'; name: string; tag: string }

export type RiotAccountSwitchInput = {
  inGameName: string | null
  inGameTag: string | null
  accounts: Array<{ id: number; riot_name: string; riot_tag: string; is_active: boolean }>
  maxAccounts: number
}

function normalizeNameTag(name: string, tag: string): string {
  return `${name.trim().toLowerCase()}#${tag.trim().toLowerCase()}`
}

function accountMatches(
  account: { riot_name: string; riot_tag: string },
  name: string,
  tag: string,
): boolean {
  return normalizeNameTag(account.riot_name, account.riot_tag) === normalizeNameTag(name, tag)
}

export function decideRiotAccountSwitch(input: RiotAccountSwitchInput): RiotSwitchDecision {
  const name = input.inGameName?.trim() ?? ''
  const tag = input.inGameTag?.trim() ?? ''

  if (!name || !tag) {
    return { action: 'continue' }
  }

  const active = input.accounts.find((account) => account.is_active)
  if (active && accountMatches(active, name, tag)) {
    return { action: 'continue' }
  }

  const linked = input.accounts.find((account) => accountMatches(account, name, tag))
  if (linked) {
    return { action: 'activate', accountId: linked.id }
  }

  const identity = { name, tag }
  if (input.accounts.length < input.maxAccounts) {
    return { action: 'prompt_link', ...identity }
  }

  return { action: 'prompt_manage', ...identity }
}
