import { action, computed, observable, reaction } from 'mobx'
import { shell } from '@/game/shell/Shell.ts'
import { fileSystem } from '@/game/shell/files/FileSystem.ts'

export class ConsoleViewModel {
  @observable accessor input: string = ''

  constructor() {
    reaction(
      () => this.input,
      () => shell.complete(this.input),
      { fireImmediately: true },
    )
  }

  @action
  public async submit() {
    if (!this.input) {
      return
    }

    await shell.process(this.input)
    this.input = ''
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
