import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import '@/index.scss'
import { persist } from '@/game/State.ts'
import { fileSystem } from '@/game/shell/files/FileSystem.ts'

// Storage is wired up here, at the composition root, rather than where the
// systems are defined — importing a system must not touch localStorage, so the
// game modules stay importable from the (node-environment) test suite.
persist(fileSystem)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
