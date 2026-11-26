/** Publish refusals carry a readable message (e.g. unverified_clip, publish_limit_reached); show that, not the code. */
export function publishError(err: unknown): { ok: false; error: string; code?: string } {
  const e = err as { message?: unknown; code?: unknown; data?: { message?: unknown } } | null
  const message = typeof e?.data?.message === 'string' && e.data.message
    ? e.data.message
    : typeof e?.message === 'string' ? e.message : String(err)
  return { ok: false, error: message, ...(typeof e?.code === 'string' ? { code: e.code } : {}) }
}
