import {
  action,
  computed,
  type IReactionDisposer,
  observable,
  reaction,
} from 'mobx'
import { shell } from '@/game/shell/Shell.ts'
import { fileSystem } from '@/game/shell/files/FileSystem.ts'
import type { Cursor } from '@/utils/cursor.ts'
import type { ViewModel } from '@/utils/types'
import { TextAnimator } from '@/components/Console/TextAnimator.ts'

export class ConsoleViewModel implements ViewModel {
  @observable accessor input: string = ''
  @observable accessor animator = new TextAnimator(() => this.lines)
  private completionReaction: IReactionDisposer | undefined

  public init() {
    this.completionReaction ??= reaction(
      () => this.input,
      () => shell.complete(this.input),
      { fireImmediately: true },
    )
  }

  public dispose() {
    this.completionReaction?.()
    this.completionReaction = undefined
  }

  @action
  public async submit() {
    if (!this.input) {
      return
    }

    const raw = this.input
    // The echoed `> raw` line is written by the shell and is not animated.
    const cursor: Cursor = { line: shell.lines.length + 1, offset: 0 }
    this.input = ''

    await shell.process(raw)
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
    return shell.completions
  }

  @computed
  public get lines() {
    return shell.lines
  }

  @computed
  public get currentPath() {
    return fileSystem.currentPath.toString()
  }
}
