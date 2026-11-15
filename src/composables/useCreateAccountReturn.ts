import { getCurrentInstance, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** Web sign-up page. The app opens it in the system browser (no in-app registration yet). */
export const REGISTER_URL = 'https://upforge.gg/register'
export const CREATE_ACCOUNT_STORAGE_KEY = 'upforge:create-account-pending'
/** After this long the "verify, then sign in" hint is stale and is dropped. */
export const CREATE_ACCOUNT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const CREATE_ACCOUNT_RETURN_NOTE = 'Verify your email, then sign in here.'

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type FocusTarget = { addEventListener(type: 'focus', fn: () => void): void; removeEventListener(type: 'focus', fn: () => void): void }

export interface CreateAccountReturnDeps {
  storage?: KeyValueStorage | null
  openUrl?: (url: string) => Promise<{ ok: boolean }> | void
  focusTarget?: FocusTarget | null
  now?: () => number
}

interface PendingSignup { email: string; at: number }

function defaultStorage(): KeyValueStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

async function defaultOpenUrl(url: string): Promise<{ ok: boolean }> {
  const bridge = typeof window === 'undefined' ? undefined : window.api?.app?.openUrl
  if (bridge) {
    const res = await bridge(url).catch(() => ({ ok: false }))
    if (res?.ok) return res
  }
  if (typeof window !== 'undefined') window.open(url, '_blank')
  return { ok: true }
}

export function readPendingSignup(storage: KeyValueStorage | null, now: number): PendingSignup | null {
  if (!storage) return null
  let raw: string | null = null
  try { raw = storage.getItem(CREATE_ACCOUNT_STORAGE_KEY) } catch { return null }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PendingSignup>
    const at = typeof parsed.at === 'number' ? parsed.at : NaN
    if (!Number.isFinite(at) || now - at > CREATE_ACCOUNT_MAX_AGE_MS || at - now > 60_000) throw new Error('stale')
    return { email: typeof parsed.email === 'string' ? parsed.email.trim() : '', at }
  } catch {
    try { storage.removeItem(CREATE_ACCOUNT_STORAGE_KEY) } catch { /* storage blocked */ }
    return null
  }
}

/**
 * Sign-in screens: "Create account" opens web sign-up in the system browser and remembers the typed
 * email on this device. When the app regains focus (or reopens) it shows "Verify your email, then sign
 * in here" with that email pre-filled. Deep-link handoff back to a signed-in app is a later step.
 */
export function useCreateAccountReturn(email: Ref<string>, deps: CreateAccountReturnDeps = {}) {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage
  const openUrl = deps.openUrl ?? defaultOpenUrl
  const focusTarget = deps.focusTarget === undefined ? (typeof window === 'undefined' ? null : window) : deps.focusTarget
  const now = deps.now ?? Date.now

  const showReturnNote = ref(false)

  /** Show the hint and pre-fill the email if a sign-up was started from this app. */
  function checkReturn() {
    const pending = readPendingSignup(storage, now())
    if (!pending) return
    if (pending.email && !email.value.trim()) email.value = pending.email
    showReturnNote.value = true
  }

  async function openCreateAccount() {
    const record: PendingSignup = { email: email.value.trim(), at: now() }
    try { storage?.setItem(CREATE_ACCOUNT_STORAGE_KEY, JSON.stringify(record)) } catch { /* storage blocked: still open */ }
    await openUrl(REGISTER_URL)
  }

  /** Call after a successful sign-in: the round trip is done. */
  function clearPendingSignup() {
    showReturnNote.value = false
    try { storage?.removeItem(CREATE_ACCOUNT_STORAGE_KEY) } catch { /* storage blocked */ }
  }

  function start() {
    checkReturn()
    focusTarget?.addEventListener('focus', checkReturn)
  }
  function stop() {
    focusTarget?.removeEventListener('focus', checkReturn)
  }

  if (getCurrentInstance()) {
    onMounted(start)
    onBeforeUnmount(stop)
  }

  return { showReturnNote, returnNote: CREATE_ACCOUNT_RETURN_NOTE, openCreateAccount, clearPendingSignup, checkReturn, start, stop }
}
