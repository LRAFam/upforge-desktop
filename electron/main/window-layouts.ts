/**
 * Per-route window size presets for the main BrowserWindow.
 * Renderer calls window:apply-layout on navigation; main process applies mins/sizes.
 */

import type { BrowserWindow } from 'electron'

export interface WindowLayout {
  width: number
  height: number
  minWidth: number
  minHeight: number
  /** Compact card-style routes snap to width×height on enter */
  compact?: boolean
  resizable?: boolean
}

export const LOGIN_LAYOUT: WindowLayout = {
  width: 780,
  height: 720,
  minWidth: 720,
  minHeight: 680,
  compact: true,
}

export const WELCOME_LAYOUT: WindowLayout = {
  width: 720,
  height: 600,
  minWidth: 640,
  minHeight: 540,
  compact: true,
}

export const DEFAULT_APP_LAYOUT: WindowLayout = {
  width: 1280,
  height: 800,
  minWidth: 980,
  minHeight: 660,
}

export const TRAINING_LAYOUT: WindowLayout = {
  width: 1280,
  height: 800,
  minWidth: 1000,
  minHeight: 680,
}

export const VOD_REVIEW_LAYOUT: WindowLayout = {
  width: 1280,
  height: 820,
  minWidth: 1100,
  minHeight: 720,
}

export const TRAINER_RESULTS_LAYOUT: WindowLayout = {
  width: 520,
  height: 720,
  minWidth: 440,
  minHeight: 580,
  compact: true,
}

export const POST_GAME_PREVIEW_LAYOUT: WindowLayout = {
  width: 420,
  height: 480,
  minWidth: 360,
  minHeight: 320,
  compact: true,
}

/** Exact path → layout. Unlisted authenticated routes use DEFAULT_APP_LAYOUT. */
export const ROUTE_LAYOUTS: Record<string, WindowLayout> = {
  '/login': LOGIN_LAYOUT,
  '/welcome': WELCOME_LAYOUT,
  '/training': TRAINING_LAYOUT,
  '/vod-review': VOD_REVIEW_LAYOUT,
  '/trainer-results': TRAINER_RESULTS_LAYOUT,
  '/post-game-preview': POST_GAME_PREVIEW_LAYOUT,
}

export function layoutForRoute(routePath: string): WindowLayout {
  const path = routePath.split('?')[0]?.replace(/\/+$/, '') || '/'
  if (ROUTE_LAYOUTS[path]) return ROUTE_LAYOUTS[path]!
  return DEFAULT_APP_LAYOUT
}

export interface ApplyLayoutOptions {
  /** After login — expand to app layout and maximize */
  maximize?: boolean
  /** Skip layout if sender is not the main window (e.g. post-game child) */
  force?: boolean
}

/**
 * Apply layout mins/sizes. Never shrinks a window that already exceeds the new minimum
 * (user keeps their larger size). Compact routes always snap to their target size.
 */
export function applyWindowLayout(
  win: BrowserWindow,
  layout: WindowLayout,
  options: ApplyLayoutOptions = {},
): void {
  if (win.isDestroyed()) return

  const resizable = layout.resizable !== false
  win.setResizable(resizable)
  win.setMinimumSize(layout.minWidth, layout.minHeight)

  if (options.maximize) {
    if (!win.isMaximized()) {
      const [w, h] = win.getSize()
      if (w < layout.minWidth || h < layout.minHeight) {
        win.setSize(
          Math.max(w, layout.width),
          Math.max(h, layout.height),
        )
      }
    }
    win.maximize()
    return
  }

  if (layout.compact) {
    if (!win.isMaximized()) {
      win.setSize(layout.width, layout.height)
      win.center()
    } else {
      win.unmaximize()
      win.setSize(layout.width, layout.height)
      win.center()
    }
    return
  }

  if (win.isMaximized()) return

  const [curW, curH] = win.getSize()
  if (curW < layout.minWidth || curH < layout.minHeight) {
    win.setSize(
      Math.max(curW, layout.minWidth),
      Math.max(curH, layout.minHeight),
    )
  }
}

export function applyLayoutForRoute(
  win: BrowserWindow,
  routePath: string,
  options?: ApplyLayoutOptions,
): void {
  applyWindowLayout(win, layoutForRoute(routePath), options)
}
