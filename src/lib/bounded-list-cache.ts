export class ListLoadContractError extends Error {
  constructor() {
    super('List loader returned a non-array response')
    this.name = 'ListLoadContractError'
  }
}

type CacheEntry<T> = {
  items: T[]
  limit: number
  loadedAt: number
}

type InFlightEntry<T> = {
  limit: number
  promise: Promise<T[]>
}

export class BoundedListCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>()
  private readonly inFlight = new Map<string, InFlightEntry<T>>()

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async load(key: string, limit: number, loader: (limit: number) => Promise<T[]>): Promise<T[]> {
    const cached = this.entries.get(key)
    if (cached && this.now() - cached.loadedAt < this.ttlMs && cached.limit >= limit) {
      return cached.items.slice(0, limit)
    }

    const active = this.inFlight.get(key)
    if (active && active.limit >= limit) {
      return active.promise.then(items => items.slice(0, limit))
    }

    const promise = loader(limit).then((items) => {
      if (!Array.isArray(items)) throw new ListLoadContractError()
      const existing = this.entries.get(key)
      if (!existing || existing.limit <= limit || this.now() - existing.loadedAt >= this.ttlMs) {
        this.entries.set(key, { items, limit, loadedAt: this.now() })
      }
      return items
    }).finally(() => {
      if (this.inFlight.get(key)?.promise === promise) this.inFlight.delete(key)
    })

    this.inFlight.set(key, { limit, promise })
    return promise.then(items => items.slice(0, limit))
  }

  invalidate(key?: string): void {
    if (key) this.entries.delete(key)
    else this.entries.clear()
  }
}
