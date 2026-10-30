import { ref } from 'vue'

/**
 * UI v3 (the rework) switch. On by default in development so the new screens are visible
 * while they are built; off in production until it is turned on per user.
 * Override with localStorage `uf.uiV3` = '1' | '0'.
 */
const STORAGE_KEY = 'uf.uiV3'

export function readUiV3(dev: boolean, storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    const v = storage?.getItem(STORAGE_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    // storage blocked: fall back to the default
  }
  return dev
}

export const uiV3 = ref(readUiV3(import.meta.env.DEV, typeof localStorage === 'undefined' ? null : localStorage))

export function setUiV3(on: boolean): void {
  uiV3.value = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    // ignore: the in-memory value still applies for this session
  }
}
