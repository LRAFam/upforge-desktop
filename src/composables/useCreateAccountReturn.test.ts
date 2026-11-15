import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  CREATE_ACCOUNT_MAX_AGE_MS,
  CREATE_ACCOUNT_STORAGE_KEY,
  REGISTER_URL,
  useCreateAccountReturn,
} from './useCreateAccountReturn'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
  }
}

function focusTarget() {
  const listeners = new Set<() => void>()
  return {
    listeners,
    addEventListener: (_: 'focus', fn: () => void) => { listeners.add(fn) },
    removeEventListener: (_: 'focus', fn: () => void) => { listeners.delete(fn) },
    fire: () => listeners.forEach(fn => fn()),
  }
}

function setup(initialEmail = '', now = 1_000_000) {
  const storage = memoryStorage()
  const target = focusTarget()
  const openUrl = vi.fn(async () => ({ ok: true }))
  let clock = now
  const email = ref(initialEmail)
  const flow = useCreateAccountReturn(email, { storage, focusTarget: target, openUrl, now: () => clock })
  return { storage, target, openUrl, email, flow, tick: (ms: number) => { clock += ms } }
}

describe('useCreateAccountReturn', () => {
  it('opens web sign-up through the bridge and remembers the typed email', async () => {
    const { flow, openUrl, storage } = setup('  new@player.gg ')
    await flow.openCreateAccount()
    expect(openUrl).toHaveBeenCalledWith(REGISTER_URL)
    expect(JSON.parse(storage.map.get(CREATE_ACCOUNT_STORAGE_KEY)!)).toMatchObject({ email: 'new@player.gg' })
  })

  it('shows the verify hint and pre-fills the email when the app regains focus', async () => {
    const { flow, target, email } = setup('new@player.gg')
    flow.start()
    expect(flow.showReturnNote.value).toBe(false)
    await flow.openCreateAccount()
    email.value = ''
    target.fire()
    expect(flow.showReturnNote.value).toBe(true)
    expect(flow.returnNote).toBe('Verify your email, then sign in here.')
    expect(email.value).toBe('new@player.gg')
  })

  it('does not overwrite an email the player has typed since', async () => {
    const { flow, target, email } = setup('first@player.gg')
    flow.start()
    await flow.openCreateAccount()
    email.value = 'other@player.gg'
    target.fire()
    expect(email.value).toBe('other@player.gg')
    expect(flow.showReturnNote.value).toBe(true)
  })

  it('still shows the hint when no email was typed', async () => {
    const { flow, target, email } = setup('')
    flow.start()
    await flow.openCreateAccount()
    target.fire()
    expect(flow.showReturnNote.value).toBe(true)
    expect(email.value).toBe('')
  })

  it('shows the hint on a fresh start (app reopened after sign-up)', () => {
    const { storage, target } = setup()
    storage.setItem(CREATE_ACCOUNT_STORAGE_KEY, JSON.stringify({ email: 'back@player.gg', at: 1_000_000 }))
    const email = ref('')
    const flow = useCreateAccountReturn(email, { storage, focusTarget: target, openUrl: vi.fn(), now: () => 1_000_500 })
    flow.start()
    expect(flow.showReturnNote.value).toBe(true)
    expect(email.value).toBe('back@player.gg')
  })

  it('drops a stale or corrupt record', () => {
    const { storage, target } = setup()
    storage.setItem(CREATE_ACCOUNT_STORAGE_KEY, JSON.stringify({ email: 'old@player.gg', at: 0 }))
    const email = ref('')
    const flow = useCreateAccountReturn(email, { storage, focusTarget: target, openUrl: vi.fn(), now: () => CREATE_ACCOUNT_MAX_AGE_MS + 1 })
    flow.start()
    expect(flow.showReturnNote.value).toBe(false)
    expect(storage.map.has(CREATE_ACCOUNT_STORAGE_KEY)).toBe(false)

    storage.setItem(CREATE_ACCOUNT_STORAGE_KEY, 'not json')
    flow.checkReturn()
    expect(flow.showReturnNote.value).toBe(false)
    expect(storage.map.has(CREATE_ACCOUNT_STORAGE_KEY)).toBe(false)
  })

  it('clears the hint and record after a successful sign-in', async () => {
    const { flow, target, storage } = setup('new@player.gg')
    flow.start()
    await flow.openCreateAccount()
    target.fire()
    flow.clearPendingSignup()
    expect(flow.showReturnNote.value).toBe(false)
    expect(storage.map.has(CREATE_ACCOUNT_STORAGE_KEY)).toBe(false)
    target.fire()
    expect(flow.showReturnNote.value).toBe(false)
  })

  it('stops listening on unmount', () => {
    const { flow, target } = setup()
    flow.start()
    expect(target.listeners.size).toBe(1)
    flow.stop()
    expect(target.listeners.size).toBe(0)
  })

  it('still opens sign-up when storage is blocked', async () => {
    const openUrl = vi.fn(async () => ({ ok: true }))
    const blocked = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    const flow = useCreateAccountReturn(ref('a@b.gg'), { storage: blocked, focusTarget: null, openUrl })
    await flow.openCreateAccount()
    expect(openUrl).toHaveBeenCalledWith(REGISTER_URL)
    flow.start()
    expect(flow.showReturnNote.value).toBe(false)
  })
})
