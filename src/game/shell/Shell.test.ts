import { describe, expect, it } from 'vitest'
import type { Command, CommandInput } from '@/game/shell/Shell.ts'
import { ShellParser, StdErr } from '@/game/shell/Shell.ts'

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

const noargs: Command = { name: 'noargs', description: 'no args' }

const echo: Command = {
  name: 'echo',
  description: 'echo',
  params: [{ name: 'text', type: 'string' }],
}

const add: Command = {
  name: 'add',
  description: 'add two numbers',
  params: [
    { name: 'a', type: 'number' },
    { name: 'b', type: 'number' },
  ],
}

const mv: Command = {
  name: 'mv',
  description: 'move',
  params: [
    { name: 'src', type: 'string' },
    { name: 'dst', type: 'string' },
  ],
}

// Nested subs with a numeric leaf param so the happy path is reachable.
const net: Command = {
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
const opt: Command = {
  name: 'opt',
  description: 'options',
  flags: [{ name: 'verbose', description: 'verbose', params: [] }],
}

// Flag with a param + a trailing numeric param (flags interleaved with params).
const cfg: Command = {
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

const ALL: Command[] = [noargs, echo, add, mv, net, opt, cfg]

/** Run the parser and hand back the whole instance (root / hadError / completions). */
function run(raw: string, cmds: Command[] = ALL): ShellParser {
  const parser = new ShellParser(raw, cmds)
  parser.parse()
  return parser
}

/** Parse the happy path, asserting a root was produced. */
function parse(raw: string, cmds: Command[] = ALL): CommandInput {
  const { root } = run(raw, cmds)
  if (!root) {
    throw new Error(`expected parse(${JSON.stringify(raw)}) to produce a root`)
  }
  return root
}

/** The captured StdErr, failing if the parse recorded no error. */
function parseErr(raw: string, cmds: Command[] = ALL): StdErr {
  const { hadError } = run(raw, cmds)
  if (!hadError) {
    throw new Error(`expected parse(${JSON.stringify(raw)}) to record a StdErr`)
  }
  return hadError
}

/** Flattened error text, for the many "message mentions X" assertions. */
function errMsg(raw: string, cmds: Command[] = ALL): string {
  return parseErr(raw, cmds).msg.join('\n')
}

/** Completion names in order. */
function completionNames(raw: string, cmds: Command[] = ALL): string[] {
  return run(raw, cmds).completions.map((c) => c.name)
}

describe('ShellParser', () => {
  describe('tokenizer (scan)', () => {
    it('collapses repeated spaces between tokens', () => {
      // If collapse failed we would see an empty subcommand token instead.
      expect(errMsg('net      bad')).toContain('Unexpected subcommand bad.')
    })

    it('treats tabs and newlines as separators', () => {
      expect(errMsg('net\tbad')).toContain('Unexpected subcommand bad.')
      expect(errMsg('net\nbad')).toContain('Unexpected subcommand bad.')
      expect(errMsg('net \t\n bad')).toContain('Unexpected subcommand bad.')
    })

    it('ignores leading and trailing whitespace', () => {
      expect(errMsg('   net bad   ')).toContain('Unexpected subcommand bad.')
    })

    it('keeps spaces inside double quotes as a single token', () => {
      expect(errMsg('net "foo bar"')).toContain(
        'Unexpected subcommand foo bar.',
      )
    })

    it('produces an empty-string token from empty quotes', () => {
      expect(errMsg('net ""')).toContain('Unexpected subcommand .')
    })

    it('joins a quoted fragment with adjacent unquoted text', () => {
      // Bash-like: `a"b c"d` is one token `ab cd`, not two.
      expect(errMsg('net a"b c"d')).toContain('Unexpected subcommand ab cd.')
    })

    it('escapes a space with a backslash', () => {
      expect(errMsg('net foo\\ bar')).toContain(
        'Unexpected subcommand foo bar.',
      )
    })

    it('escapes a double quote with a backslash', () => {
      expect(errMsg('net \\"x')).toContain('Unexpected subcommand "x.')
    })

    it('honors backslash escapes inside quotes', () => {
      expect(errMsg('net "a\\"b"')).toContain('Unexpected subcommand a"b.')
    })

    it('treats shell metacharacters as ordinary characters', () => {
      for (const token of ['a|b', 'a;b', 'a&&b', '$HOME', 'a*b', "a'b", '#c']) {
        expect(errMsg(`net ${token}`)).toContain(
          `Unexpected subcommand ${token}.`,
        )
      }
    })

    it('captures an unterminated quote without aborting the parse', () => {
      // `echo` takes a param, so the token after the quote binds cleanly and
      // nothing overwrites the captured tokenizer error.
      const parser = run('echo "foo')
      expect(parser.hadError).toBeInstanceOf(StdErr)
      expect(parser.hadError?.msg[0]).toBe(
        'Malformed input: Unterminated quote.',
      )
      // Non-fatal: the root still resolves and the token still binds.
      expect(parser.root?.name).toBe('echo')
      expect(parser.root?.params?.[0].value).toBe('foo')
    })

    it('captures a trailing (unterminated) escape without aborting the parse', () => {
      const parser = run('echo foo\\')
      expect(parser.hadError?.msg[0]).toBe(
        'Malformed input: Unterminated escape.',
      )
      expect(parser.root?.params?.[0].value).toBe('foo')
    })

    it('keeps the first (tokenizer) error when a later hard error follows', () => {
      // `net` has no params, so `foo` is an (invalid) subcommand. But the
      // unterminated-quote error is captured first, and `error()` keeps the
      // earliest capture, so that is what surfaces.
      expect(errMsg('net "foo')).toContain(
        'Malformed input: Unterminated quote.',
      )
    })
  })

  describe('root resolution (findRoot)', () => {
    it('resolves a known root command', () => {
      const result = parse('noargs')
      expect(result.name).toBe('noargs')
      expect(result.type).toBe(noargs)
    })

    it('records the tab hint on an unknown command', () => {
      const err = parseErr('bogus')
      expect(err.msg[0]).toBe('Unknown command bogus.')
      expect(err.msg).toContain('Press tab for a list of available commands.')
    })

    it('resolves against the injected command list, not a global', () => {
      // `echo` exists in ALL but not in this scoped list, so it is unknown here.
      expect(errMsg('echo hi', [noargs])).toContain('Unknown command echo.')
      expect(parse('noargs', [noargs]).name).toBe('noargs')
    })

    it('rejects empty input as a missing command', () => {
      // Shell.process guards blank input; the parser itself has no command to find.
      expect(errMsg('')).toContain('Malformed input: Command missing.')
    })

    it('matches command names case-insensitively', () => {
      expect(parse('NoArgs').name).toBe('noargs')
      expect(parse('ADD 2 3').name).toBe('add')
    })
  })

  describe('subcommands (parseSub)', () => {
    it('navigates a single subcommand level', () => {
      const result = parse('net route list')
      expect(result.name).toBe('net')
      expect(result.sub?.name).toBe('route')
      expect(result.sub?.sub?.name).toBe('list')
    })

    it('matches subcommand names case-insensitively', () => {
      const result = parse('net ROUTE List')
      expect(result.sub?.name).toBe('route')
      expect(result.sub?.sub?.name).toBe('list')
    })

    it('records an error on an unknown subcommand', () => {
      expect(errMsg('net route bogus')).toContain(
        'Unexpected subcommand bogus.',
      )
    })

    it('stops parsing subs when a flag token appears', () => {
      // net has no flags; reaching the flag parser (not the sub parser) proves the
      // transition out of sub-parsing.
      expect(errMsg('net --verbose')).toContain('Unexpected flag --verbose.')
    })

    it('stops parsing subs once the command has params', () => {
      // `add` has params, so `2`/`3` are parsed as params, not subs.
      const result = parse('add 2 3')
      expect(result.sub).toBeUndefined()
      expect(result.params).toHaveLength(2)
    })
  })

  describe('params (parseParam / parseParamValue)', () => {
    it('coerces number params to numbers, in order', () => {
      const result = parse('add 2 3')
      expect(result.params?.[0]).toMatchObject({ name: 'a', value: 2 })
      expect(result.params?.[1]).toMatchObject({ name: 'b', value: 3 })
      expect(typeof result.params?.[0].value).toBe('number')
    })

    it('parses negative and decimal numbers', () => {
      const result = parse('add -2 3.5')
      expect(result.params?.[0].value).toBe(-2)
      expect(result.params?.[1].value).toBe(3.5)
    })

    it('binds a string param to its own token', () => {
      const result = parse('echo hello')
      expect(result.params?.[0]).toMatchObject({ name: 'text', value: 'hello' })
    })

    it('binds multiple string params in order', () => {
      const result = parse('mv from to')
      expect(result.params?.[0].value).toBe('from')
      expect(result.params?.[1].value).toBe('to')
    })

    it('binds an empty-quote token as an empty-string value', () => {
      const result = parse('echo ""')
      expect(result.params?.[0]).toMatchObject({ name: 'text', value: '' })
    })

    it('records an error on a non-numeric value for a number param', () => {
      expect(errMsg('add x 3')).toContain(
        'Invalid type for param a with value x. Expected number',
      )
    })

    it('records an error on too many params', () => {
      expect(errMsg('add 1 2 3')).toContain('Unexpected param 3.')
    })

    it('records an error when a required param is missing', () => {
      expect(errMsg('add 2')).toContain('Missing param(s)')
    })

    it('records an error when all params are missing', () => {
      expect(errMsg('add')).toContain('Missing param(s)')
    })

    it('names the missing param in the error message', () => {
      const err = parseErr('add 2')
      expect(err.msg.join(' ')).toContain('b')
      expect(err.msg.join(' ')).not.toContain('[object Object]')
    })
  })

  describe('flags (parseFlag / parseFlagParam)', () => {
    it('accepts a known flag with no params', () => {
      expect(run('opt --verbose').hadError).toBeUndefined()
      expect(parse('opt --verbose').name).toBe('opt')
    })

    it('attaches parsed flags to the result', () => {
      const result = parse('opt --verbose')
      expect(result.flags?.some((f) => f.name === 'verbose')).toBe(true)
    })

    it('accepts a known flag with a param followed by a command param', () => {
      const result = parse('cfg --level 3 7')
      expect(result.params?.[0]).toMatchObject({ name: 'id', value: 7 })
    })

    it('attaches flag params to the result', () => {
      const result = parse('cfg --level 3 7')
      const level = result.flags?.find((f) => f.name === 'level')
      expect(level?.params?.[0].value).toBe(3)
    })

    it('matches flag names case-insensitively', () => {
      const result = parse('opt --VERBOSE')
      expect(result.flags?.some((f) => f.name === 'verbose')).toBe(true)
    })

    it('records an error on an unknown flag', () => {
      expect(errMsg('opt --bogus')).toContain('Unexpected flag --bogus.')
    })

    it('records an error on end-of-input while reading a flag param', () => {
      expect(errMsg('cfg --level')).toContain('Unexpected EOL at --level.')
    })

    it('records an error on an unexpected trailing param after a flag', () => {
      // opt defines no params, so `extra` cannot be bound.
      expect(errMsg('opt --verbose extra')).toContain('Unexpected param extra.')
    })

    // FAILING ON PURPOSE: repeated flags are currently accepted silently. This
    // pins the desired behavior — supplying a flag twice should be rejected — and
    // goes green once parseFlag guards against a flag already in command.flags.
    it('rejects a flag supplied more than once', () => {
      // opt has no required params, so the only reason to error is the repeat.
      expect(run('opt --verbose --verbose').hadError).toBeDefined()
    })
  })

  describe('completions', () => {
    it('suggests every root command for empty input', () => {
      const completions = run('').completions
      expect(completionNames('').sort()).toEqual(ALL.map((c) => c.name).sort())
      // All are command-kind suggestions.
      expect(completions.every((c) => c.command)).toBe(true)
    })

    it('fuzzy-filters root commands by the typed prefix', () => {
      // Only `net` is a fuzzy match for "ne".
      expect(completionNames('ne')).toEqual(['net'])
    })

    it('offers no suggestions when nothing fuzzy-matches the root', () => {
      expect(run('bogus').completions).toHaveLength(0)
    })

    it('does not descend into a partially-typed root command', () => {
      // "ne" suggests the command `net`, not net's subcommands.
      const completions = run('ne').completions
      expect(completions[0]).toMatchObject({ name: 'net', command: net })
      expect(completionNames('ne')).not.toContain('route')
    })

    it('suggests subcommands once the root resolves', () => {
      expect(completionNames('net')).toEqual(['route'])
      expect(run('net').completions[0]).toMatchObject({
        name: 'route',
        description: 'route',
        command: net.subs?.[0],
      })
    })

    it('suggests subcommands after a trailing space', () => {
      expect(completionNames('net ')).toEqual(['route'])
    })

    it('fuzzy-filters and re-suggests a partially-typed subcommand', () => {
      expect(completionNames('net rou')).toEqual(['route'])
    })

    it('descends into nested subcommands', () => {
      expect(completionNames('net route').sort()).toEqual(['add', 'list'])
    })

    it('suggests params for a command that takes params', () => {
      const completions = run('add').completions
      expect(completions.map((c) => c.name).sort()).toEqual(['a', 'b'])
      expect(completions[0]).toMatchObject({
        name: 'a',
        description: '<number>',
        param: { name: 'a', type: 'number' },
      })
      expect(completions.every((c) => c.param)).toBe(true)
    })

    it('drops already-consumed params even on an arg-count error', () => {
      // `1`/`2` fill both params, so neither is re-suggested; the extra `3` errors.
      expect(run('add 1 2 3').completions).toHaveLength(0)
    })

    it('suggests flags and params together', () => {
      const completions = run('cfg').completions
      expect(completions.map((c) => c.name).sort()).toEqual([
        'id',
        'level',
        'verbose',
      ])
      expect(completions.find((c) => c.name === 'verbose')?.flag).toBeDefined()
      expect(completions.find((c) => c.name === 'level')?.flag).toBeDefined()
      expect(completions.find((c) => c.name === 'id')?.param).toBeDefined()
    })

    it('suggests flags for a bare or partial flag token', () => {
      expect(completionNames('opt --')).toEqual(['verbose'])
      expect(completionNames('opt --verb')).toEqual(['verbose'])
      expect(run('opt --verb').completions[0]).toMatchObject({
        name: 'verbose',
        description: 'verbose',
        flag: opt.flags?.[0],
      })
    })

    it('re-adds all of a command’s flags/params after a bad flag token', () => {
      // The fuzzy match on the bad token contributes `level`; the resolved-command
      // dump then adds the rest (verbose, id), all deduped into one list.
      expect(completionNames('cfg --lev').sort()).toEqual([
        'id',
        'level',
        'verbose',
      ])
    })

    it('dedups a suggestion contributed by two code paths', () => {
      // `route` is added both by the failed-subcommand fuzzy match and by the
      // resolved-command dump, yet appears exactly once.
      expect(run('net rou').completions).toHaveLength(1)
    })

    it('drops a flag once it has been supplied', () => {
      // `verbose` is used, so only the remaining flag and param are suggested.
      expect(completionNames('cfg --verbose').sort()).toEqual(['id', 'level'])
    })

    it('drops a param once it has been supplied', () => {
      // `add` needs two params; after `1` fills `a`, only `b` remains.
      expect(completionNames('add 1')).toEqual(['b'])
    })

    it('drops a used flag along with its own param, keeping the rest', () => {
      // `--level 2` consumes the `level` flag; `9` consumes the `id` param.
      expect(completionNames('cfg --level 2 9')).toEqual(['verbose'])
    })

    it('suggests nothing once every flag and param is supplied', () => {
      // `--verbose` and `5` consume the verbose flag and id param; only level is left.
      expect(completionNames('cfg --verbose 5')).toEqual(['level'])
      // add has only params, and both are now used.
      expect(run('add 1 2').completions).toHaveLength(0)
    })

  })

  describe('integration', () => {
    it('parses nested subcommands down to a leaf param', () => {
      const result = parse('net route add 5')
      expect(result.name).toBe('net')
      expect(result.sub?.name).toBe('route')
      expect(result.sub?.sub?.name).toBe('add')
      expect(result.sub?.sub?.params?.[0]).toMatchObject({
        name: 'ip',
        value: 5,
      })
    })

    it('parses flags interleaved around a param', () => {
      const parser = run('cfg --verbose --level 2 9')
      expect(parser.hadError).toBeUndefined()
      expect(parser.root?.params?.[0].value).toBe(9)
    })

    it('surfaces an EOL error when input ends mid-parse', () => {
      expect(errMsg('cfg --level')).toContain('Unexpected EOL')
    })
  })
})
