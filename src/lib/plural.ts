/** "1 analysis" / "2 analyses". Pass the plural form when it isn't singular + "s". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}
