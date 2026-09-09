import { ConsoleViewModel } from '@/components/Console/ConsoleViewModel.ts'
import { Shell } from '@/game/systems/Shell.ts'
import type { Command } from '@/game/shell/ShellParser.ts'
import { FileSystem, type Resource } from '@/game/systems/FileSystem.ts'
import { buildFs } from '@/game/shell/files/files.ts'
import { help } from '@/game/shell/help.ts'
import { track } from '@/game/shell/track.ts'
import { time } from '@/game/shell/time.ts'

/** A fresh, empty root — every session gets its own tree. */
export const makeRoot = () => ({ name: '', children: [] as Resource[] })

/**
 * A ViewModel wired to a throwaway Shell and FileSystem, so a session starts
 * from an empty scrollback and an empty filesystem rather than the app-wide
 * singletons (whose `_lines` is append-only and would bleed between tests).
 *
 * `ai` is deliberately left out of the command set: it reads `import.meta.env`
 * at module scope and its handler calls the real `fetch`.
 */
export function makeSession(commands?: (fs: FileSystem) => Command[]) {
  const fileSystem = new FileSystem(makeRoot())
  const shell = new Shell(
    commands?.(fileSystem) ?? [buildFs(fileSystem), help, track, time],
  )
  const vm = new ConsoleViewModel(shell, fileSystem)
  vm.init()
  return { vm, shell, fileSystem }
}
