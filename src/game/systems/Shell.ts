import { help } from '@/game/shell/help.ts'
import { fs } from '@/game/shell/files/files.ts'
import { ai } from '@/game/shell/ai.ts'
import { track } from '@/game/shell/track.ts'
import { time } from '@/game/shell/time.ts'
import { State } from '@/game/State.ts'
import {
  type Command,
  type CommandInput,
  type Completion,
  type Output,
  ShellParser,
  StdErr,
} from '@/game/shell/ShellParser.ts'

interface ShellSnapshot {
  lines?: string[]
}

export class Shell extends State {
  public readonly commands: Command[]

  private _lines: string[] = []
  private _completions: Completion[] = []

  // Defaults to the real command set; tests pass a throwaway set instead of
  // reassigning `commands`, which is readonly.
  public constructor(commands: Command[] = [help, fs, ai, track, time]) {
    super('shell')
    this.commands = commands
  }

  private write(output: Output): void {
    this._lines.push(...output)
    this.changed()
  }

  public complete(raw: string) {
    const parser = new ShellParser(raw, this.commands)
    parser.parse()
    const { completions } = parser

    completions.sort((a, b) => {
      if (a.command && !b.command) return -1
      else if (!a.command && b.command) return 1
      else if (a.param && !b.param) return -1
      else if (!a.param && b.param) return 1
      else return a.name.localeCompare(b.name)
    })
    this._completions = completions
    this.changed()
  }

  public async process(raw: string): Promise<void> {
    if (!raw.trim()) {
      return
    }
    this.write([`> ${raw}`])

    const parser = new ShellParser(raw, this.commands)
    parser.parse()
    const { root, hadError } = parser
    if (!root) {
      return this.write(
        this.error('Failed to parse', hadError?.command, hadError?.msg),
      )
    }

    const leaf = this.getLeaf(root)

    if (!leaf.type.handler) {
      return this.write(this.error('Command is not executable', root))
    }

    try {
      return this.write(await leaf.type.handler(leaf))
    } catch (e) {
      if (e instanceof StdErr) {
        return this.write(this.error(undefined, e.command ?? root, e.msg))
      } else {
        return this.write(this.error(undefined, root, [(e as Error).message]))
      }
    }
  }

  private getLeaf(command: CommandInput): CommandInput {
    return command.sub ? this.getLeaf(command.sub) : command
  }

  private error(
    msg?: string,
    command?: Command | CommandInput,
    additional?: Output,
  ): Output {
    const firstLine = msg ?? additional?.[0] ?? 'Error'
    return [
      (command ? command.name + ': ' : '') + firstLine,
      ...(additional?.slice(msg === undefined ? 1 : 0) ?? []),
    ]
  }

  public get lines() {
    this.observe()
    return this._lines
  }

  public get completions() {
    this.observe()
    return this._completions
  }

  protected _save(): object {
    return {
      lines: this._lines,
    } as ShellSnapshot
  }

  public load(data: object): void {
    const snap = data as ShellSnapshot
    if (snap.lines) {
      this._lines = snap.lines
    }
  }
}

export const shell = new Shell()
