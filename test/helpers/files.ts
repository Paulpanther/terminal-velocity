import { buildFs } from '@/game/shell/files/files.ts'
import { FileSystem, type Resource } from '@/game/systems/FileSystem.ts'
import { Shell } from '@/game/systems/Shell.ts'
import { StdErr } from '@/game/shell/ShellParser.ts'

// Fresh, isolated state per test — `traverse` resolves from `currentDir`, so a
// brand-new root dir gives each test its own tree.
export const makeRoot = () => ({ name: '', children: [] as Resource[] })
export const makeFs = () => new FileSystem(makeRoot())

// A throwaway shell wired only to this fs's command, for end-to-end tests.
export const makeShell = (fs: FileSystem) => {
  return new Shell([buildFs(fs)])
}

/**
 * Runs a command and returns just the lines it produced.
 *
 * `Shell.process` appends to the shell's scrollback rather than returning the
 * output, and writes a `> raw` echo line before the handler's output — so the
 * lines a command contributed are everything after the echo. `lines` hands back
 * the live internal array, hence the length snapshot before the call.
 */
export const run = async (s: Shell, command: string) => {
  const before = s.lines.length
  await s.process(command)
  return s.lines.slice(before + 1)
}

/** Run a call and return the thrown StdErr, failing if nothing (or something else) is thrown. */
export function err(fn: () => unknown): StdErr {
  try {
    fn()
  } catch (e) {
    if (e instanceof StdErr) return e
    throw e
  }
  throw new Error('expected call to throw StdErr')
}
