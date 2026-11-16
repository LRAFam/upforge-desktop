import { readonly, ref } from 'vue'

/**
 * UI v3 is the only design. The classic design and its Settings › App switch were retired;
 * `uiV3` stays as an always-true flag so the remaining `v-if="uiV3"` branches keep rendering
 * until they are flattened.
 */
export const LEGACY_UI_V3_STORAGE_KEY = 'uf.uiV3'

/** Drop the retired classic-design choice (`uf.uiV3` = '0' or '1') so it can never apply again. */
export function clearLegacyUiPreference(storage: Pick<Storage, 'removeItem'> | null): void {
  try {
    storage?.removeItem(LEGACY_UI_V3_STORAGE_KEY)
  } catch {
    // storage blocked: nothing saved to clear
  }
}

clearLegacyUiPreference(typeof localStorage === 'undefined' ? null : localStorage)

export const uiV3 = readonly(ref(true))
