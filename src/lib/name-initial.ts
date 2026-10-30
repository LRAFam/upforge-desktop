/** First letter of a name for avatar fallbacks, or '?'. */
export function initial(name: string | null | undefined): string {
  return (name ?? '').trim().charAt(0).toUpperCase() || '?'
}
