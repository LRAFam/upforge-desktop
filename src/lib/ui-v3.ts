import { ref } from 'vue'

/**
 * UI v3 (the rework) switch. On by default everywhere since 2.16.0; a player can switch back to
 * the classic design in Settings › App (stored as localStorage `uf.uiV3` = '0', '1' turns it on again).
 */
const STORAGE_KEY = 'uf.uiV3'

export function readUiV3(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    const v = storage?.getItem(STORAGE_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    // storage blocked: fall back to the default
  }
  return true
}

export const uiV3 = ref(readUiV3(typeof localStorage === 'undefined' ? null : localStorage))

export function setUiV3(on: boolean): void {
  uiV3.value = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    // ignore: the in-memory value still applies for this session
  }
}
