import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import { standardDecorators } from './config/standardDecorators.ts'

// The decorator transform is shared with vite.config.ts rather than skipped:
// the ViewModel and TextAnimator use MobX's `@observable accessor`, which oxc
// passes through untouched and no runtime can execute. `@vitejs/plugin-react`
// is deliberately *not* pulled in — oxc already handles JSX, and the plugin
// would inject its React Refresh preamble into every test file.
//
// Vitest reuses Vite's resolver, so the project's `@/…/*.ts` explicit-extension
// imports just work.
export default defineConfig({
  plugins: [standardDecorators()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@test': fileURLToPath(new URL('./test', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    unstubGlobals: true,
    include: ['test/**/*.test.ts'],
  },
})
