import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ConsoleViewModel } from '@/components/Console/ConsoleViewModel.ts'
import { makeSession } from '@test/helpers/console.ts'
import { fakeClock } from '@test/helpers/fakeClock.ts'

/*
 * End-to-end tests for a terminal session, driven through the ViewModel the
 * way the view drives it: type, submit, let the typewriter finish, read the
 * screen. The Shell, the parser and the FileSystem are all real — only the
 * clock and `requestAnimationFrame` are stubbed.
 *
 * These are the tests that catch regressions *between* the layers: parser
 * changes that alter output, filesystem state that fails to survive a command,
 * and the cursor arithmetic in `submit` that assumes the shell writes exactly
 * one echo line before its output.
 *
 * Assertions read `animator.animatedLines` rather than `lines` on purpose —
 * that is what the view renders, so it covers the hand-off to the animator too.
 */

const clock = { current: fakeClock() }

beforeEach(() => {
  clock.current = fakeClock()
})

afterEach(() => {
  clock.current.restore()
})

/** Types a command, submits it, and lets the typewriter catch up. */
async function run(vm: ConsoleViewModel, command: string) {
  vm.onInputChange(command)
  await vm.submit()
  clock.current.runToEnd()
  // Snapshot: with no animation running, `animatedLines` hands back the shell's
  // live `_lines` array, which the next command appends to in place.
  return [...vm.animator.animatedLines]
}

describe('a terminal session', () => {
  it('creates a directory, moves into it and lists it', async () => {
    const { vm } = makeSession()

    await run(vm, 'fs mkdir project')
    expect(vm.currentPath).toBe('/')

    await run(vm, 'fs go project')
    expect(vm.currentPath).toBe('/project')

    expect(await run(vm, 'fs list')).toEqual([
      '> fs mkdir project',
      '> fs go project',
      '> fs list',
      '..',
    ])
  })

  it('reads back a file it wrote', async () => {
    const { vm } = makeSession()

    await run(vm, 'fs write notes.txt "hello there"')

    expect(await run(vm, 'fs read notes.txt')).toEqual([
      '> fs write notes.txt "hello there"',
      '> fs read notes.txt',
      'hello there',
    ])
  })

  it('splits multi-line content across lines on screen', async () => {
    const { vm } = makeSession()
    await run(vm, 'fs write log.txt "first\nsecond"')

    const screen = await run(vm, 'fs read log.txt')

    expect(screen.slice(-2)).toEqual(['first', 'second'])
  })

  it('keeps the session usable after an error', async () => {
    const { vm } = makeSession()

    const failed = await run(vm, 'fs read missing.txt')
    const errorLine = failed.at(-1)!
    expect(errorLine).toContain('No such file or directory')

    // The shell recovers: the next command still runs and still lands on screen.
    expect(await run(vm, 'fs mkdir after')).toEqual([
      '> fs read missing.txt',
      errorLine,
      '> fs mkdir after',
    ])
  })

  it('reports an unknown command without touching the filesystem', async () => {
    const { vm } = makeSession()

    const screen = await run(vm, 'nope')

    expect(screen[0]).toBe('> nope')
    expect(screen.join(' ')).toContain('Failed to parse')
    expect(vm.currentPath).toBe('/')
  })

  it('types out a command completed with Tab', async () => {
    const { vm } = makeSession()
    // What pressing Tab twice does: 'fs' inline, then the first subcommand.
    vm.onInputChange('f')
    vm.complete()
    expect(vm.input).toBe('fs')
    vm.complete()
    expect(vm.input).toBe('fs go')

    vm.onInputChange('fs list')
    expect(await run(vm, 'fs list')).toEqual(['> fs list', '..'])
  })
})

describe('the typewriter over a session', () => {
  it('reveals output a character at a time, leaving earlier lines alone', async () => {
    const { vm } = makeSession()
    await run(vm, 'fs mkdir a')

    vm.onInputChange('fs list')
    await vm.submit()

    // The echo and everything before it are on screen immediately.
    expect(vm.animator.animatedLines).toEqual(['> fs mkdir a', '> fs list', ''])

    clock.current.advance(50)
    expect(vm.animator.animatedLines).toEqual([
      '> fs mkdir a',
      '> fs list',
      '.',
    ])

    clock.current.runToEnd()
    expect(vm.animator.animatedLines).toEqual([
      '> fs mkdir a',
      '> fs list',
      '..',
      'a',
    ])
  })

  it("hands back the shell's live line array once it has caught up", async () => {
    // Not a copy: with no animation in flight `animatedLines` returns the very
    // array the shell appends to. Callers holding on to it see it change.
    const { vm } = makeSession()
    await run(vm, 'fs list')

    expect(vm.animator.animatedLines).toBe(vm.lines)
  })

  it('settles on the full scrollback once every command has finished', async () => {
    const { vm } = makeSession()
    await run(vm, 'fs mkdir a')
    await run(vm, 'fs mkdir b')
    await run(vm, 'fs list')

    expect(vm.animator.animatedLines).toEqual(vm.lines)
    expect(vm.animator.animationCursor).toBeUndefined()
    expect(clock.current.pendingFrames).toBe(0)
  })
})
