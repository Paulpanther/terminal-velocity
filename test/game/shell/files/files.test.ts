import { describe, expect, it } from 'vitest'
import { makeFs, makeShell, run } from '@test/helpers/files.ts'

/*
 * End-to-end tests for the `fs` shell command (built via `buildFs`), driven
 * through a throwaway Shell. Assertions read the lines a command wrote to the
 * scrollback — see `run` — because `Shell.process` returns nothing.
 */

describe('fs command (integration)', () => {
  it('lists just ".." for an empty root', async () => {
    const s = makeShell(makeFs())
    expect(await run(s, 'fs list')).toEqual(['..'])
  })

  it('shows a newly created directory in the listing', async () => {
    const s = makeShell(makeFs())
    await run(s, 'fs mkdir foo')
    expect(await run(s, 'fs list')).toContain('foo')
  })

  it('moves into a directory created with --go', async () => {
    const fs = makeFs()
    const s = makeShell(fs)
    await s.process('fs mkdir foo --go')
    expect(fs.currentDir.name).toBe('foo')
  })

  it('reads back a file that was written', async () => {
    const s = makeShell(makeFs())
    await run(s, 'fs write a.txt hello')
    expect(await run(s, 'fs read a.txt')).toEqual(['hello'])
  })

  it('appends to a file by default on repeated writes', async () => {
    const s = makeShell(makeFs())
    await run(s, 'fs write a.txt one')
    await run(s, 'fs write a.txt two')
    expect(await run(s, 'fs read a.txt')).toEqual(['one', 'two'])
  })

  it('overwrites content with --overwrite', async () => {
    const s = makeShell(makeFs())
    await run(s, 'fs write a.txt one')
    await run(s, 'fs write a.txt two --overwrite')
    expect(await run(s, 'fs read a.txt')).toEqual(['two'])
  })

  it('splits multi-line content into separate lines', async () => {
    const s = makeShell(makeFs())
    await run(s, 'fs write a.txt "line1\nline2"')
    expect(await run(s, 'fs read a.txt')).toEqual(['line1', 'line2'])
  })

  it('navigates with an absolute path', async () => {
    const s = makeShell(makeFs())
    await run(s, 'fs mkdir a/b')
    await run(s, 'fs go /a/b')
    await run(s, 'fs mkdir c')
    expect(await run(s, 'fs list')).toContain('c')
  })

  it('errors "Not a file" when reading a directory', async () => {
    const s = makeShell(makeFs())
    await run(s, 'fs mkdir d')
    expect((await run(s, 'fs read d')).join(' ')).toContain('Not a file')
  })

  it('errors "No such file or directory" when going to a missing path', async () => {
    const s = makeShell(makeFs())
    expect((await run(s, 'fs go nope')).join(' ')).toContain(
      'No such file or directory',
    )
  })

  it('does not crash going up from the root', async () => {
    const s = makeShell(makeFs())
    expect(await run(s, 'fs go ..')).toEqual([])
  })

  it('goes to the root with an absolute "/"', async () => {
    const s = makeShell(makeFs())
    expect(await run(s, 'fs go /')).toEqual([])
  })
})
