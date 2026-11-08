import { dialog, type BrowserWindow } from 'electron'
import { QUIT_BUTTONS, QUIT_CANCEL_INDEX, choiceFromButton, type QuitChoice, type QuitDecision } from './quit-guard'

/** Ask the user whether to interrupt in-progress work. Cancel is the default. */
export async function askQuitChoice(
  decision: Extract<QuitDecision, { action: 'confirm' }>,
  parent?: BrowserWindow | null,
): Promise<QuitChoice> {
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: 'Quit UpForge?',
    message: decision.message,
    detail: decision.detail,
    buttons: [...QUIT_BUTTONS],
    defaultId: QUIT_CANCEL_INDEX,
    cancelId: QUIT_CANCEL_INDEX,
    noLink: true,
  }
  const usable = parent && !parent.isDestroyed() && parent.isVisible() ? parent : null
  const { response } = usable
    ? await dialog.showMessageBox(usable, options)
    : await dialog.showMessageBox(options)
  return choiceFromButton(response)
}
