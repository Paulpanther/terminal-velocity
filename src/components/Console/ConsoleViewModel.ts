import { action, computed, observable } from 'mobx'
import { type Completion, shell } from '@/game/shell/Shell.ts'
import { fileSystem } from '@/game/shell/files/FileSystem.ts'

export class ConsoleViewModel {
  @observable accessor lines: string[] = ['Console initialized']
  @observable accessor input: string = ''
  @observable accessor completions: Completion[] = []

  @action
  public async submit() {
    if (!this.input) {
      return
    }

    const output = await shell.process(this.input)

    this.lines.push(`> ${this.input}`)
    this.lines.push(...output)
    this.input = ''

    this.completions = shell.complete(this.input)
  }

  @action
  public onInputChange(value: string) {
    this.input = value
    this.completions = shell.complete(this.input)
  }

  @action
  public complete() {
    const complete = this.getBestCompletion()
    if (!complete) return

    this.input += complete
    this.completions = shell.complete(this.input)
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
  public get currentPath() {
    return fileSystem.currentPath.toString()
  }
}
