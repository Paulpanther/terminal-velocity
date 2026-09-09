import { transformAsync, type PluginItem } from '@babel/core'
import type { Plugin } from 'vite'

/**
 * Transforms standard (TC39 / Stage 3) decorators via Babel.
 *
 * Neither Vite 8's transformer nor Vitest's (both oxc) transform standard
 * decorators — they pass `@observable accessor` through untouched, which no
 * runtime can execute. This runs Babel's decorator transform on the source
 * files that use them, before oxc handles JSX and strips TS types.
 *
 * Required for MobX 7, which mandates modern decorators (`@observable accessor`).
 *
 * Shared by `vite.config.ts` and `vitest.config.ts`: the tests import the
 * ViewModel and the animator, so they need the same transform the app does.
 */
export function standardDecorators(): Plugin {
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
