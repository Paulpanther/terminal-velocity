import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConsoleViewModel } from '@/components/Console/ConsoleViewModel.ts'
import { Shell, shell } from '@/game/systems/Shell.ts'
import { FileSystem, fileSystem } from '@/game/systems/FileSystem.ts'
import { buildFs } from '@/game/shell/files/files.ts'
import { makeRoot, makeSession } from '@test/helpers/console.ts'
import { fakeClock } from '@test/helpers/fakeClock.ts'

/*
 * Tests for the ViewModel that sits between the view and the shell.
 *
 * The ViewModel owns three things: the input string, the completion `reaction`
 * that keeps `shell.completions` in step with it, and the hand-off to the
 * animator on submit. Everything else it exposes (`lines`, `completions`,
 * `currentPath`) is a pass-through to the injected Shell / FileSystem.
 *
 * Each session gets a throwaway Shell and FileSystem (see `makeSession`), so
 * the scrollback starts empty; the app-wide singletons are append-only and
 * would otherwise bleed between tests.
 *
 * `init()` matters: the completion reaction is created there, so a ViewModel
 * that was never inited has no completions and `complete()` silently does
 * nothing. `makeSession` inits for you.
 */

const clock = { current: fakeClock() }

beforeEach(() => {
  clock.current = fakeClock()
})

afterEach(() => {
  clock.current.restore()
})

describe('submit', () => {
  it('ignores empty input without touching the shell', async () => {
    const { vm, shell } = makeSession()
    const process = vi.spyOn(shell, 'process')

    await vm.submit()

    expect(process).not.toHaveBeenCalled()
    expect(vm.lines).toEqual([])
    expect(clock.current.pendingFrames).toBe(0)
  })

  it('clears the input before the command resolves', async () => {
    const { vm } = makeSession()
    vm.onInputChange('fs list')

    const pending = vm.submit()
    // Anything typed while a slow command is in flight must survive, so the
    // input is cleared up front rather than after the await.
    expect(vm.input).toBe('')

    await pending
  })

  it('echoes the command and then its output', async () => {
    const { vm } = makeSession()
    vm.onInputChange('fs list')

    await vm.submit()

    expect(vm.lines).toEqual(['> fs list', '..'])
  })

  it('points the animation cursor just past the echo line', async () => {
    const { vm } = makeSession()
    vm.onInputChange('fs list')

    await vm.submit()

    // Line 1 is '..', the first line the shell actually produced. The echo on
    // line 0 is already on screen and must not be retyped.
    expect(vm.animator.animationCursor).toEqual({ line: 1, offset: 0 })
    expect(vm.animator.animatedLines).toEqual(['> fs list', ''])
  })

  it('keeps the cursor aligned on a later command', async () => {
    const { vm } = makeSession()
    vm.onInputChange('fs list')
    await vm.submit()
    clock.current.runToEnd()

    vm.onInputChange('fs mkdir a')
    await vm.submit()

    // Two lines were already on screen, plus the new echo.
    expect(vm.animator.animationCursor).toEqual({ line: 3, offset: 0 })
  })

  it('runs whitespace-only input through the shell but writes nothing', async () => {
    const { vm } = makeSession()
    vm.onInputChange('   ')

    await vm.submit()

    // `submit` guards on falsiness, so '   ' gets through; `Shell.process`
    // trims and bails, leaving the scrollback untouched.
    expect(vm.input).toBe('')
    expect(vm.lines).toEqual([])
    // The animation still starts, and terminates on its first frame.
    clock.current.flush()
    expect(clock.current.pendingFrames).toBe(0)
  })
})

describe('completions', () => {
  it('completes once at init, before any typing', () => {
    const { vm } = makeSession()
    // `fireImmediately` means the full command list is offered on an empty line.
    expect(vm.completions.map((c) => c.name)).toContain('fs')
  })

  it('recomputes as the input changes', () => {
    const { vm } = makeSession()

    vm.onInputChange('f')

    expect(vm.completions.map((c) => c.name)).toEqual(['fs'])
  })

  it('stops recomputing after dispose', () => {
    const { vm, shell } = makeSession()
    const complete = vi.spyOn(shell, 'complete')

    vm.dispose()
    vm.onInputChange('f')

    expect(complete).not.toHaveBeenCalled()
  })

  it('resubscribes when init follows dispose', () => {
    // StrictMode mounts, unmounts and remounts the same instance, so `init`
    // has to be able to follow a `dispose`.
    const { vm } = makeSession()
    vm.dispose()

    vm.init()
    vm.onInputChange('f')

    expect(vm.completions.map((c) => c.name)).toEqual(['fs'])
  })

  it('creates only one reaction when init runs twice', () => {
    const { vm, shell } = makeSession()
    const complete = vi.spyOn(shell, 'complete')

    vm.init()
    vm.onInputChange('f')

    // The `??=` guard: a second init must not double-subscribe.
    expect(complete).toHaveBeenCalledTimes(1)
  })
})

describe('complete', () => {
  it('appends the inline completion for a partially typed command', () => {
    const { vm } = makeSession()
    vm.onInputChange('f')

    vm.complete()

    expect(vm.input).toBe('fs')
  })

  it('separates a fresh suggestion from the typed text with a space', () => {
    const { vm } = makeSession()
    vm.onInputChange('fs')

    vm.complete()

    expect(vm.input).toBe('fs go')
  })

  it('does not double the space when the input already ends with one', () => {
    const { vm } = makeSession()
    vm.onInputChange('fs ')

    vm.complete()

    expect(vm.input).toBe('fs go')
  })

  it('leaves the input alone when nothing matches', () => {
    const { vm } = makeSession()
    vm.onInputChange('zzz')

    vm.complete()

    expect(vm.input).toBe('zzz')
  })

  it('does nothing on a view model that was never inited', () => {
    // No reaction means nothing ever asked the shell to compute completions.
    const fileSystem = new FileSystem(makeRoot())
    const vm = new ConsoleViewModel(
      new Shell([buildFs(fileSystem)]),
      fileSystem,
    )
    vm.onInputChange('f')

    vm.complete()

    expect(vm.completions).toEqual([])
    expect(vm.input).toBe('f')
  })

  it('reuses the last computed completions after dispose', () => {
    // `dispose` stops the reaction but does not clear `shell.completions`, so
    // a Tab arriving after unmount completes against stale suggestions.
    const { vm } = makeSession()
    vm.dispose()
    vm.onInputChange('f')

    vm.complete()

    expect(vm.input).toBe('f fs')
  })
})

describe('pass-throughs', () => {
  it('falls back to the app-wide singletons when constructed bare', () => {
    // How `useViewModel(ConsoleViewModel)` builds it: no arguments at all.
    // Read-only assertions — the singletons are shared, so this must not write.
    const vm = new ConsoleViewModel()

    expect(vm.lines).toBe(shell.lines)
    expect(vm.completions).toBe(shell.completions)
    expect(vm.currentPath).toBe(fileSystem.currentPath.toString())
  })

  it('reports the filesystem path', async () => {
    const { vm } = makeSession()
    expect(vm.currentPath).toBe('/')

    vm.onInputChange('fs mkdir a')
    await vm.submit()
    vm.onInputChange('fs go a')
    await vm.submit()

    expect(vm.currentPath).toBe('/a')
  })
})

describe('lifecycle', () => {
  it('cancels a running animation on dispose', async () => {
    const { vm } = makeSession()
    vm.onInputChange('fs list')
    await vm.submit()
    expect(clock.current.pendingFrames).toBe(1)

    vm.dispose()

    expect(clock.current.pendingFrames).toBe(0)
  })

  it('resumes a mid-flight animation on the next init', async () => {
    const { vm } = makeSession()
    vm.onInputChange('fs list')
    await vm.submit()
    vm.dispose()

    vm.init()

    expect(clock.current.pendingFrames).toBe(1)
    clock.current.runToEnd()
    expect(vm.animator.animatedLines).toEqual(['> fs list', '..'])
  })
})
