const DEFAULT_SAVE_CLIP = 'F9'

/** Resolved save-clip hotkey from settings / main process. */
export async function loadSaveClipHotkey(): Promise<string> {
  try {
    const bindings = await window.api.clips.getHotkeys()
    return bindings?.['save-clip'] || DEFAULT_SAVE_CLIP
  } catch {
    return DEFAULT_SAVE_CLIP
  }
}
