import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { standardDecorators } from './config/standardDecorators.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [standardDecorators(), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
