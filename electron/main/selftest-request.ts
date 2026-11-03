/** Pure parsing of the self-test switch (no imports, so selftest-early can load it first). */
export const SELFTESTS = ['demo-worker'] as const
export type SelftestName = typeof SELFTESTS[number]

/** Both UPFORGE_SELFTEST=1 and `--selftest=<name>` are required. */
export function parseSelftestRequest(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): SelftestName | null {
  if (env.UPFORGE_SELFTEST !== '1') return null
  for (const arg of argv) {
    const m = /^--selftest=(.+)$/.exec(arg)
    if (m && (SELFTESTS as readonly string[]).includes(m[1]!)) return m[1] as SelftestName
  }
  return null
}
