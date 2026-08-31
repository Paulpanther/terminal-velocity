import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so tests don't pull in the app's Babel
// decorator transform, which the shell code doesn't need. Vitest reuses Vite's
// resolver, so the project's `@/…/*.ts` explicit-extension imports just work.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: { environment: 'node' },
})
