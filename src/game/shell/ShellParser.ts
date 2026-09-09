import { type Resource } from '@/game/systems/FileSystem.ts'
import * as strings from '@/utils/strings.ts'
import fuzzysort from 'fuzzysort'
import { isEqual, uniqWith } from 'lodash'

export type Output = string[]

export type Value = string | number | Resource
export type ValueType = 'string' | 'number' | 'resource'

export interface Param {
  name: string
  type: ValueType
}

export interface Flag {
  name: string
  description: string
  params?: Param[]
}

export interface Command {
  name: string
  description: string
  subs?: Command[]
  flags?: Flag[]
  params?: Param[]
  handler?: (args: CommandInput) => Promise<Output>
}

export interface ParamInput {
  name: string
  type: Param
  value: Value
}

export interface FlagInput {
  name: string
  type: Flag
  params?: ParamInput[]
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

export interface Completion {
  name: string
  addition?: string
  description: string
  complete?: string
  command?: Command
  flag?: Flag
  param?: Param
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
  private command?: CommandInput
  private paramIndex = 0
  private incomplete = false

  public root?: CommandInput
  public hadError?: StdErr
  public completions: Completion[] = []

  constructor(input: string, allCommands: Command[]) {
    this.input = input
    this.allCommands = allCommands
  }

  public parse() {
    try {
      this._parse()
    } catch (e) {
      // StdErrs are already captured
      if (e! instanceof StdErr && !this.hadError) {
        this.hadError = this.error((e as Error).message)
      }
    }

    if (this.command && !this.incomplete) {
      // greedy add all possibilities here (might be duplicate)
      this.completions = [
        ...this.completions,
        ...(this.command!.type.subs?.map((c) => this.commandToCompletion(c)) ??
          []),
        ...(this.command!.type.flags?.map((f) => this.flagToCompletion(f)) ??
          []),
        ...(this.command!.type.params?.map((p) => this.paramToCompletion(p)) ??
          []),
      ]

      // remove already used flags/params
      this.removeCompletions(
        (this.command!.params ?? []).map((p) => this.paramToCompletion(p.type)),
      )
      this.removeCompletions(
        (this.command!.flags ?? []).map((p) => this.flagToCompletion(p.type)),
      )
    }

    this.completions = uniqWith(this.completions, isEqual)
  }

  private _parse() {
    this.scan()
    this.findRoot()

    // first all subs
    while (!this.isEnd && this.parseSub()) {
      // empty
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
      // don't throw, only capture
      this.error('Malformed input: Unterminated quote.')
    }

    if (escaped) {
      // don't throw, only capture
      this.error('Malformed input: Unterminated escape.')
    }

    if (currentPart || lastWasQuote) {
      this.parts.push(currentPart)
    }
  }

  private findRoot() {
    if (!this.parts.length) {
      // shell should handle empty whitespace before this happens
      this.completions = [
        ...this.completions,
        ...this.allCommands.map((c) => this.commandToCompletion(c)),
      ]
      throw this.error('Malformed input: Command missing.')
    }

    const found = this.allCommands.find((c) =>
      strings.equalsIgnoreCase(c.name, this.parts[0]),
    )
    if (!found) {
      this.addCompletionsFromCommands(this.parts[0], this.allCommands)
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
    if (next.startsWith('-')) {
      this.parseFlag()
    } else {
      this.parseParam()
    }
  }

  private parseFlag() {
    const full = this.previous.startsWith('--')
    if (!full) {
      this.addCompletionsFromFlags(
        this.previous.substring(1),
        this.command!.type.flags ?? [],
        '-',
      )
      this.incomplete = true
      throw this.error(`Incomplete flag`)
    }

    const input = this.previous.substring(2) // strip dashes
    const found = this.command!.type.flags?.find((f) =>
      strings.equalsIgnoreCase(f.name, input),
    )
    if (!found) {
      this.addCompletionsFromFlags(input, this.command!.type.flags ?? [])
      this.incomplete = true
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

    const found = this.command!.type.subs?.find((s) =>
      strings.equalsIgnoreCase(s.name, input),
    )
    if (!found) {
      this.addCompletionsFromCommands(input, this.command!.type.subs ?? [])
      this.incomplete = true
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
      this.addCompletionsFromParams(input, this.command!.type.params ?? [])
      this.incomplete = true
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
      this.error(`Unexpected EOL at ${this.previous}.`)
    }

    return this.parts[this.index]
  }

  private get isEnd() {
    return this.index === this.parts.length
  }

  private addCompletionsFromCommands(input: string, commands: Command[]) {
    this.addCompletionsFromOptions(
      input,
      commands.map((c) => [c.name, this.commandToCompletion(c)]),
    )
  }

  private commandToCompletion(command: Flag): Completion {
    return {
      name: command.name,
      description: command.description,
      command,
    }
  }

  private addCompletionsFromFlags(
    input: string,
    flags: Flag[],
    prefix?: string,
  ) {
    this.addCompletionsFromOptions(
      input,
      flags.map((f) => [f.name, this.flagToCompletion(f)]),
      prefix,
    )
  }

  private flagToCompletion(flag: Flag): Completion {
    return {
      name: flag.name,
      description: flag.description,
      flag,
    }
  }

  private addCompletionsFromParams(input: string, params: Param[]) {
    this.addCompletionsFromOptions(
      input,
      params.map((p) => [p.name, this.paramToCompletion(p)]),
    )
  }

  private paramToCompletion(param: Param): Completion {
    return {
      name: param.name,
      description: `<${param.type}>`,
      param,
    }
  }

  private addCompletionsFromOptions(
    input: string,
    options: [string, Completion][],
    prefix?: string,
  ) {
    const results = fuzzysort.go(input, options, {
      key: (option) => option[0],
    })
    this.completions = [
      ...this.completions,
      ...results.map((result) => {
        const completion = result.obj[1]
        const complete =
          !completion.param && completion.name.startsWith(input)
            ? (prefix ?? '') + completion.name.substring(input.length)
            : undefined
        return {
          ...completion,
          complete,
        }
      }),
    ]
  }

  private removeCompletions(completions: Completion[]) {
    this.completions = this.completions.filter(
      (c) => !completions.some((r) => isEqual(c, r)),
    )
  }

  private error(...msg: string[]) {
    const parsedParts = this.parts.slice(0, this.index + 1)
    // TODO this will be replaced later with propper index indicator
    const err = new StdErr(
      [...msg, `at: ${parsedParts.join(' ')}`],
      this.root?.type,
    )
    if (!this.hadError) {
      this.hadError = err
    }
    return err
  }

  public static getParam(
    commandOrFlag: CommandInput | FlagInput,
    name: string,
  ): ParamInput {
    return commandOrFlag.params!.find((p) =>
      strings.equalsIgnoreCase(p.name, name),
    )!
  }

  public static getFlag(
    command: CommandInput,
    name: string,
  ): FlagInput | undefined {
    return command.flags?.find((p) => strings.equalsIgnoreCase(p.name, name))
  }
}
