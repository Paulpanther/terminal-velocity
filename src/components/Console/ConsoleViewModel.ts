import { action, observable } from 'mobx'
import { shell } from '@/game/shell/Shell.ts'

export class ConsoleViewModel {
  @observable accessor lines: string[] = ['$ Console initialized']
  @observable accessor input: string = ''

  @action
  public submit() {
    if (!this.input) {
      return
    }

    const output = shell.process(this.input)

    this.lines.push(`> ${this.input}`)
    this.lines.push(`$ ${output}`)
    this.input = ''
  }
}
