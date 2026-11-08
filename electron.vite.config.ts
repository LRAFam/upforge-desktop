import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'))

/**
 * Build-time constants for the main process. The packaged app has no
 * VITE_ERROR_REPORTING_KEY env at runtime, so CI's key must be inlined here
 * (see electron/main/error-reporting-key.ts).
 */
export const mainDefine = {
  __UPFORGE_ERROR_REPORTING_KEY__: JSON.stringify(process.env['VITE_ERROR_REPORTING_KEY'] ?? '')
}

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve('electron/main/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin()],
    define: mainDefine
  },
  preload: {
    build: {
      lib: {
        entry: resolve('electron/preload/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: resolve('index.html')
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src')
      }
    },
    plugins: [vue(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    }
  }
})
