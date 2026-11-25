/**
 * Roving tabindex for long lists (round log, match timeline): the list is one Tab stop; arrow keys move
 * inside it. Items are marked in the DOM with `data-rove="line"` (a row you move between with Up/Down)
 * or `data-rove="item"` (extra buttons on a row, reached with Left/Right), and `data-rove-group` (rows
 * and items of the same round share a group).
 */
export interface RoveItem {
  line: boolean
  group: string
}

/** Index to move focus to for this key, or null when the key isn't ours / there's nowhere to go. */
export function roveTarget(items: RoveItem[], current: number, key: string): number | null {
  if (!items.length || current < 0 || current >= items.length) return null
  const lines = items.map((it, i) => (it.line ? i : -1)).filter(i => i >= 0)
  const group = items[current].group
  switch (key) {
    case 'ArrowDown': return lines.find(i => i > current) ?? null
    case 'ArrowUp': {
      const before = lines.filter(i => i < current)
      return before.length ? before[before.length - 1] : null
    }
    case 'ArrowRight': {
      for (let i = current + 1; i < items.length; i++) if (items[i].group === group) return i
      return null
    }
    case 'ArrowLeft': {
      for (let i = current - 1; i >= 0; i--) if (items[i].group === group) return i
      return null
    }
    case 'Home': return lines[0] ?? null
    case 'End': return lines.length ? lines[lines.length - 1] : null
    default: return null
  }
}

/**
 * Which item keeps tabindex 0: the one focused last if it's still there, else the marked current one
 * (the round being watched), else the first line.
 */
export function roveStop(count: number, opts: { last?: number; current?: number; firstLine?: number }): number {
  if (count <= 0) return -1
  const ok = (n: number | undefined): n is number => n != null && n >= 0 && n < count
  if (ok(opts.last)) return opts.last
  if (ok(opts.current)) return opts.current
  if (ok(opts.firstLine)) return opts.firstLine
  return 0
}
