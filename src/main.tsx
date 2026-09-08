import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import '@/index.scss'
import { persist } from '@/game/State.ts'
import { fileSystem } from '@/game/shell/files/FileSystem.ts'
import { shell } from '@/game/shell/Shell.ts'

persist(fileSystem)
persist(shell)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
