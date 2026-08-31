import { fileURLToPath, URL } from 'node:url'
import { transformAsync, type PluginItem } from '@babel/core'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Transforms standard (TC39 / Stage 3) decorators via Babel.
 *
 * Vite 8's transformer (oxc, via @vitejs/plugin-react v6) does not transform
 * standard decorators — it passes `@observable accessor` through untouched,
 * which no browser can execute. This runs Babel's decorator transform on the
 * source files that use them, before oxc handles JSX and strips TS types.
 *
 * Required for MobX 7, which mandates modern decorators (`@observable accessor`).
 */
function standardDecorators(): Plugin {
  const hasDecorator = /(^|\s)@[\w.]+[\s(]/
  const decoratorsPlugin: PluginItem = [
    '@babel/plugin-proposal-decorators',
    { version: '2023-11' },
  ]
  return {
    name: 'standard-decorators',
    enforce: 'pre',
    async transform(code, id) {
      const [filepath] = id.split('?')
      if (!/\.tsx?$/.test(filepath) || filepath.includes('/node_modules/')) {
        return
      }
      if (!hasDecorator.test(code)) {
        return
      }
      const result = await transformAsync(code, {
        filename: filepath,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        // Parse TS + JSX so decorators can be transformed while JSX and type
        // annotations pass through for oxc to handle downstream. The decorator
        // plugin enables its own parser support.
        parserOpts: { plugins: ['typescript', 'jsx'] },
        plugins: [decoratorsPlugin],
      })
      if (result?.code == null) {
        return
      }
      // Vite accepts a JSON-string source map, sidestepping Babel/Rollup map type mismatches.
      return {
        code: result.code,
        map: result.map ? JSON.stringify(result.map) : null,
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [standardDecorators(), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
