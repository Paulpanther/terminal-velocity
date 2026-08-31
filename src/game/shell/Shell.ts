import { help } from '@/game/shell/help.ts'
import { files } from '@/game/shell/files.ts'

type Output = string[]

type Value = string | number
type ValueType = 'string' | 'number'

interface Param {
  name: string
  type: ValueType
}

interface Flag {
  name: string
  description: string
  params: Param[]
}

export interface Command {
  name: string
  description: string
  subs?: Command[]
  flags?: Flag[]
  params?: Param[]
  handler?: (args: CommandInput) => Output
}

interface ParamInput {
  name: string
  type: Param
  value: string | number | boolean
}

interface FlagInput {
  name: string
  type: Flag
  params: ParamInput[]
}

export interface CommandInput {
  name: string
  type: Command
  sub?: CommandInput
  flags?: FlagInput[]
  params?: ParamInput[]
}

export class StdErr extends Error {
  public msg: Output
  public command?: Command

  constructor(msg: Output, command?: Command) {
    super((command?.name ? `${command.name}: ` : '') + msg.join('\n'))
    this.msg = msg
    this.command = command
    this.name = 'StdErr'
  }
}

export class Shell {
  public commands: Command[] = [help, files]

  public process(raw: string): Output {
    if (!raw.trim()) {
      return ['']
    }

    let root: CommandInput
    try {
      root = new ShellParser(raw, this.commands).parse()
    } catch (e) {
      if (e instanceof StdErr) {
        return this.error('Failed to parse', e.command, e.msg)
      } else {
        return this.error('Failed to parse', undefined, [(e as Error).message])
      }
    }
    const leaf = this.getLeaf(root)

    if (!leaf.type.handler) {
      return this.error('Command is not executable', root)
    }

    try {
      return leaf.type.handler(leaf)
    } catch (e) {
      if (e instanceof StdErr) {
        return this.error(undefined, e.command ?? root, e.msg)
      } else {
        return this.error(undefined, root, [(e as Error).message])
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
}

/**
 * input := command+ (param | (flag param*))*
 *
 * rules:
 * - last sub must be a leaf
 * - all params of the final sub command must be present
 * - all params of a flag must be present
 * - flags are optional
 * - params are parsed in-order
 * - flags can go in-between command params
 * - params of flags MUST directly follow its flags
 * - flags start with --
 */
export class ShellParser {
  private readonly input: string
  private readonly allCommands: Command[]
  private parts: string[] = []
  private index: number = 0
  private root?: CommandInput
  private command?: CommandInput
  private paramIndex = 0

  constructor(input: string, allCommands: Command[]) {
    this.input = input
    this.allCommands = allCommands
  }

  public parse(): CommandInput {
    this.scan()
    this.findRoot()

    // first all subs
    while (!this.isEnd && this.parseSub()) {
      //
    }

    // then all flags + params
    while (!this.isEnd) {
      this.parseFlagOrParam()
    }

    if (
      (this.command!.type.params?.length ?? 0) !==
      (this.command!.params?.length ?? 0)
    ) {
      const missing = this.command!.type.params!.slice(
        this.command!.params?.length,
      )
      throw this.error(
        `Missing param(s) ${missing.map((p) => p.name).join(', ')}`,
      )
    }

    if (!this.isEnd) {
      throw this.error('Unexpected input.')
    }

    return this.root!
  }

  /**
   * - (repeated) whitespace is ignored
   * - quoted input is scanned into single part
   * - escaped input is treated as non-signal character
   */
  private scan() {
    let currentPart = ''
    let lastWasQuote = false
    let quote = false
    let escaped = false

    for (let i = 0; i < this.input.length; i++) {
      const next = this.input[i]

      if (escaped) {
        escaped = false
        currentPart += next
        continue
      }

      if (next === '"') {
        if (quote) {
          lastWasQuote = true
        }
        quote = !quote
        continue
      } else if (!quote && [' ', '\t', '\n'].includes(next)) {
        if (currentPart || lastWasQuote) {
          this.parts.push(currentPart)
          currentPart = ''
        }
      } else if (next === '\\') {
        escaped = true
      } else {
        currentPart += next
      }

      lastWasQuote = false
    }

    if (quote) {
      throw this.error('Malformed input: Unterminated quote.')
    }

    if (escaped) {
      throw this.error('Malformed input: Unterminated escape.')
    }

    if (currentPart || lastWasQuote) {
      this.parts.push(currentPart)
    }
  }

  private findRoot() {
    if (!this.parts.length) {
      // shell should handle empty whitespace before this happens
      throw this.error('Malformed input: Command missing.')
    }

    const found = this.allCommands.find((c) => c.name === this.parts[0])
    if (!found) {
      throw this.error(
        `Unknown command ${this.parts[0]}.`,
        'Press tab for a list of available commands.',
      )
    }

    this.root = {
      name: found.name,
      type: found,
    }
    this.command = this.root

    this.advance()
  }

  private parseFlagOrParam() {
    const next = this.advance()
    if (next.startsWith('--')) {
      this.parseFlag()
    } else {
      this.parseParam()
    }
  }

  private parseFlag() {
    const input = this.previous.substring(2) // strip dashes
    const found = this.command!.type.flags?.find((f) => f.name === input)
    if (!found) {
      throw this.error(`Unexpected flag --${input}.`)
    }

    // flags MUST be followed by their params, so we can eagerly parse params
    const flag: FlagInput = {
      name: found.name,
      type: found,
      params: found.params?.map((p) => this.parseFlagParam(p)),
    }

    if (!this.command!.flags) {
      this.command!.flags = []
    }
    this.command!.flags.push(flag)
  }

  /**
   * @return true if it parsed a sub, false if it stopped parsing subs
   */
  private parseSub(): boolean {
    const input = this.current

    if (input.startsWith('--') || this.command!.type.params) {
      // stop parsing subs, start parsing flags and params
      return false
    }
    this.advance()

    const found = this.command!.type.subs?.find((s) => s.name === input)
    if (!found) {
      throw this.error(`Unexpected subcommand ${input}.`)
    }

    const sub: CommandInput = {
      name: found.name,
      type: found,
    }

    this.command!.sub = sub
    this.command = sub

    return true
  }

  private parseParam() {
    const input = this.previous

    const currentParam = this.command!.type.params?.[this.paramIndex]
    if (!currentParam) {
      throw this.error(`Unexpected param ${input}.`)
    }

    if (!this.command!.params) {
      this.command!.params = []
    }

    this.command!.params?.push({
      name: currentParam.name,
      type: currentParam,
      value: this.parseParamValue(currentParam),
    })

    this.paramIndex++
  }

  private parseFlagParam(param: Param): ParamInput {
    this.advance()

    return {
      name: param.name,
      type: param,
      value: this.parseParamValue(param),
    }
  }

  private parseParamValue(param: Param): Value {
    if (param.type === 'number') {
      const value = Number(this.previous)
      if (isNaN(value)) {
        throw this.error(
          `Invalid type for param ${param.name} with value ${this.previous}. Expected ${param.type}`,
        )
      }
      return value
    } else {
      return this.previous
    }
  }

  private get previous() {
    return this.parts[this.index - 1]
  }

  private advance() {
    if (this.isEnd) {
      throw this.error(`Unexpected EOL at ${this.previous}.`)
    }

    return this.parts[this.index++]
  }

  private get current() {
    if (this.isEnd) {
      throw this.error(`Unexpected EOL at ${this.previous}.`)
    }

    return this.parts[this.index]
  }

  private get isEnd() {
    return this.index === this.parts.length
  }

  private error(...msg: string[]) {
    const parsedParts = this.parts.slice(0, this.index + 1)
    // TODO this will be replaced later with propper index indicator
    return new StdErr([...msg, `at: ${parsedParts.join(' ')}`], this.root?.type)
  }
}

export const shell = new Shell()
