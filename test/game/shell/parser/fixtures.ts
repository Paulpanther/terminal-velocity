import type { Command, CommandInput } from '@/game/shell/ShellParser.ts'
import { ShellParser, StdErr } from '@/game/shell/ShellParser.ts'

/*
 * Tests for ShellParser.
 *
 * The parser resolves the root command from an injected `commands` list, then
 * consumes subcommands, then flags/params. These fixtures exercise every grammar
 * feature. Note that param values and command/subcommand names are all observable
 * channels:
 *   - param values → `result.params[i].value`
 *   - unknown root / subcommand tokens are echoed verbatim in the captured error,
 *     which is a convenient way to observe the tokenizer (spaces, quotes, escapes).
 *
 * API note: `parse()` does not return or throw. It populates the parser instance:
 *   - `parser.root`        → the parsed CommandInput tree (undefined on a hard error)
 *   - `parser.hadError`    → the captured StdErr (undefined on success)
 *   - `parser.completions` → tab-completion suggestions for the (partial) input
 * Tokenizer errors (unterminated quote/escape) are *captured but non-fatal*: parsing
 * continues, and a later hard error can overwrite `hadError`.
 */

export const noargs: Command = { name: 'noargs', description: 'no args' }

export const echo: Command = {
  name: 'echo',
  description: 'echo',
  params: [{ name: 'text', type: 'string' }],
}

export const add: Command = {
  name: 'add',
  description: 'add two numbers',
  params: [
    { name: 'a', type: 'number' },
    { name: 'b', type: 'number' },
  ],
}

export const mv: Command = {
  name: 'mv',
  description: 'move',
  params: [
    { name: 'src', type: 'string' },
    { name: 'dst', type: 'string' },
  ],
}

// Nested subs with a numeric leaf param so the happy path is reachable.
export const net: Command = {
  name: 'net',
  description: 'network',
  subs: [
    {
      name: 'route',
      description: 'route',
      subs: [
        {
          name: 'add',
          description: 'add route',
          params: [{ name: 'ip', type: 'number' }],
        },
        { name: 'list', description: 'list routes' },
      ],
    },
  ],
}

// Flags only, no required params: lets us reach parse success with just a flag.
export const opt: Command = {
  name: 'opt',
  description: 'options',
  flags: [{ name: 'verbose', description: 'verbose', params: [] }],
}

// Flag with a param + a trailing numeric param (flags interleaved with params).
export const cfg: Command = {
  name: 'cfg',
  description: 'config',
  flags: [
    { name: 'verbose', description: 'verbose', params: [] },
    {
      name: 'level',
      description: 'level',
      params: [{ name: 'n', type: 'number' }],
    },
  ],
  params: [{ name: 'id', type: 'number' }],
}

export const ALL: Command[] = [noargs, echo, add, mv, net, opt, cfg]

/** Run the parser and hand back the whole instance (root / hadError / completions). */
export function run(raw: string, cmds: Command[] = ALL): ShellParser {
  const parser = new ShellParser(raw, cmds)
  parser.parse()
  return parser
}

/** Parse the happy path, asserting a root was produced. */
export function parse(raw: string, cmds: Command[] = ALL): CommandInput {
  const { root } = run(raw, cmds)
  if (!root) {
    throw new Error(`expected parse(${JSON.stringify(raw)}) to produce a root`)
  }
  return root
}

/** The captured StdErr, failing if the parse recorded no error. */
export function parseErr(raw: string, cmds: Command[] = ALL): StdErr {
  const { hadError } = run(raw, cmds)
  if (!hadError) {
    throw new Error(`expected parse(${JSON.stringify(raw)}) to record a StdErr`)
  }
  return hadError
}

/** Flattened error text, for the many "message mentions X" assertions. */
export function errMsg(raw: string, cmds: Command[] = ALL): string {
  return parseErr(raw, cmds).msg.join('\n')
}

/** Completion names in order. */
export function completionNames(raw: string, cmds: Command[] = ALL): string[] {
  return run(raw, cmds).completions.map((c) => c.name)
}
