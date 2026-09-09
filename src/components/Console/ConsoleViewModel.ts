import {
  action,
  computed,
  type IReactionDisposer,
  observable,
  reaction,
} from 'mobx'
import { Shell, shell as defaultShell } from '@/game/systems/Shell.ts'
import {
  FileSystem,
  fileSystem as defaultFileSystem,
} from '@/game/systems/FileSystem.ts'
import type { Cursor } from '@/utils/cursor.ts'
import type { ViewModel } from '@/utils/types'
import { TextAnimator } from '@/components/Console/TextAnimator.ts'

export class ConsoleViewModel implements ViewModel {
  @observable accessor input: string = ''
  @observable accessor animator = new TextAnimator(() => this.lines)

  // Defaults to the app-wide singletons; tests pass throwaway instances so a
  // session starts from an empty scrollback and an empty filesystem. Both
  // params are optional, so `Constructor<T>` (and `useViewModel`) still fit.
  private readonly shell: Shell
  private readonly fileSystem: FileSystem

  private completionReaction: IReactionDisposer | undefined

  constructor(
    shell: Shell = defaultShell,
    fileSystem: FileSystem = defaultFileSystem,
  ) {
    this.shell = shell
    this.fileSystem = fileSystem
  }

  public init() {
    this.completionReaction ??= reaction(
      () => this.input,
      () => this.shell.complete(this.input),
      { fireImmediately: true },
    )
    this.animator.init()
  }

  public dispose() {
    this.completionReaction?.()
    this.completionReaction = undefined
    this.animator.dispose()
  }

  @action
  public async submit() {
    if (!this.input) {
      return
    }

    const raw = this.input
    // The echoed `> raw` line is written by the shell and is not animated.
    const cursor: Cursor = { line: this.shell.lines.length + 1, offset: 0 }
    this.input = ''

    await this.shell.process(raw)
    this.animator.startAnimation(cursor)
  }

  @action
  public onInputChange(value: string) {
    this.input = value
  }

  @action
  public complete() {
    const complete = this.getBestCompletion()
    if (!complete) return

    this.input += complete
  }

  private getBestCompletion(): string | undefined {
    if (!this.completions.length) {
      return undefined
    }

    const inline = this.completions.find((c) => c.complete)
    if (inline) {
      return inline.complete
    }

    const completion = this.completions.filter((c) => !c.param)?.[0]
    if (!completion) return undefined

    if (this.input.endsWith(' ')) {
      return completion.name
    } else {
      return ' ' + completion.name
    }
  }

  @computed
  public get completions() {
    return this.shell.completions
  }

  @computed
  public get lines() {
    return this.shell.lines
  }

  @computed
  public get currentPath() {
    return this.fileSystem.currentPath.toString()
  }
}
