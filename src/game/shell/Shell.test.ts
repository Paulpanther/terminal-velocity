import { describe, expect, it } from 'vitest'
import type { Command } from '@/game/shell/Shell.ts'
import { ShellParser, StdErr } from '@/game/shell/Shell.ts'

/*
 * Tests for ShellParser.
 *
 * The parser resolves the root command from an injected `commands` list, then
 * consumes subcommands, then flags/params. These fixtures exercise every grammar
 * feature. Note that param values and command/subcommand names are all observable
 * channels:
 *   - param values → `result.params[i].value`
 *   - unknown root / subcommand tokens are echoed verbatim in the thrown error,
 *     which is a convenient way to observe the tokenizer (spaces, quotes, escapes).
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

function parse(raw: string, cmds: Command[] = ALL) {
  return new ShellParser(raw, cmds).parse()
}

/** Parse and return the thrown StdErr, failing if nothing (or something else) is thrown. */
function parseErr(raw: string, cmds: Command[] = ALL): StdErr {
  try {
    parse(raw, cmds)
  } catch (e) {
    if (e instanceof StdErr) return e
    throw e
  }
  throw new Error(`expected parse(${JSON.stringify(raw)}) to throw StdErr`)
}

describe('ShellParser', () => {
  describe('tokenizer (scan)', () => {
    it('collapses repeated spaces between tokens', () => {
      // If collapse failed we would see an empty subcommand token instead.
      expect(() => parse('net      bad')).toThrow('Unexpected subcommand bad.')
    })

    it('treats tabs and newlines as separators', () => {
      expect(() => parse('net\tbad')).toThrow('Unexpected subcommand bad.')
      expect(() => parse('net\nbad')).toThrow('Unexpected subcommand bad.')
      expect(() => parse('net \t\n bad')).toThrow('Unexpected subcommand bad.')
    })

    it('ignores leading and trailing whitespace', () => {
      expect(() => parse('   net bad   ')).toThrow('Unexpected subcommand bad.')
    })

    it('keeps spaces inside double quotes as a single token', () => {
      expect(() => parse('net "foo bar"')).toThrow(
        'Unexpected subcommand foo bar.',
      )
    })

    it('produces an empty-string token from empty quotes', () => {
      expect(() => parse('net ""')).toThrow('Unexpected subcommand .')
    })

    it('joins a quoted fragment with adjacent unquoted text', () => {
      // Bash-like: `a"b c"d` is one token `ab cd`, not two.
      expect(() => parse('net a"b c"d')).toThrow('Unexpected subcommand ab cd.')
    })

    it('escapes a space with a backslash', () => {
      expect(() => parse('net foo\\ bar')).toThrow(
        'Unexpected subcommand foo bar.',
      )
    })

    it('escapes a double quote with a backslash', () => {
      expect(() => parse('net \\"x')).toThrow('Unexpected subcommand "x.')
    })

    it('honors backslash escapes inside quotes', () => {
      expect(() => parse('net "a\\"b"')).toThrow('Unexpected subcommand a"b.')
    })

    it('treats shell metacharacters as ordinary characters', () => {
      for (const token of ['a|b', 'a;b', 'a&&b', '$HOME', 'a*b', "a'b", '#c']) {
        expect(() => parse(`net ${token}`)).toThrow(
          `Unexpected subcommand ${token}.`,
        )
      }
    })

    it('throws on an unterminated quote', () => {
      const err = parseErr('net "foo')
      expect(err).toBeInstanceOf(StdErr)
      expect(err.msg[0]).toBe('Malformed input: Unterminated quote.')
    })

    it('throws on a trailing (unterminated) escape', () => {
      const err = parseErr('net foo\\')
      expect(err.msg[0]).toBe('Malformed input: Unterminated escape.')
    })
  })

  describe('root resolution (findRoot)', () => {
    it('resolves a known root command', () => {
      const result = parse('noargs')
      expect(result.name).toBe('noargs')
      expect(result.type).toBe(noargs)
    })

    it('throws with the tab hint on an unknown command', () => {
      const err = parseErr('bogus')
      expect(err.msg[0]).toBe('Unknown command bogus.')
      expect(err.msg).toContain('Press tab for a list of available commands.')
    })

    it('resolves against the injected command list, not a global', () => {
      // `echo` exists in ALL but not in this scoped list, so it is unknown here.
      expect(() => parse('echo hi', [noargs])).toThrow('Unknown command echo.')
      expect(parse('noargs', [noargs]).name).toBe('noargs')
    })

    it('rejects empty input as an unknown command', () => {
      // Shell.process guards blank input; the parser itself has no command to find.
      expect(() => parse('')).toThrow('Unknown command')
    })
  })

  describe('subcommands (parseSub)', () => {
    it('navigates a single subcommand level', () => {
      const result = parse('net route list')
      expect(result.name).toBe('net')
      expect(result.sub?.name).toBe('route')
      expect(result.sub?.sub?.name).toBe('list')
    })

    it('throws on an unknown subcommand', () => {
      expect(() => parse('net route bogus')).toThrow(
        'Unexpected subcommand bogus.',
      )
    })

    it('stops parsing subs when a flag token appears', () => {
      // net has no flags; reaching the flag parser (not the sub parser) proves the
      // transition out of sub-parsing.
      expect(() => parse('net --verbose')).toThrow('Unexpected flag --verbose.')
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

    it('throws on a non-numeric value for a number param', () => {
      expect(() => parse('add x 3')).toThrow(
        'Invalid type for param a with value x. Expected number',
      )
    })

    it('throws on too many params', () => {
      expect(() => parse('add 1 2 3')).toThrow('Unexpected param 3.')
    })

    it('throws when a required param is missing', () => {
      expect(() => parse('add 2')).toThrow('Missing param(s)')
    })

    it('throws when all params are missing', () => {
      expect(() => parse('add')).toThrow('Missing param(s)')
    })

    it('names the missing param in the error message', () => {
      const err = parseErr('add 2')
      expect(err.msg.join(' ')).toContain('b')
      expect(err.msg.join(' ')).not.toContain('[object Object]')
    })
  })

  describe('flags (parseFlag / parseFlagParam)', () => {
    it('accepts a known flag with no params', () => {
      expect(() => parse('opt --verbose')).not.toThrow()
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

    it('throws on an unknown flag', () => {
      expect(() => parse('opt --bogus')).toThrow('Unexpected flag --bogus.')
    })

    it('throws on end-of-input while reading a flag param', () => {
      expect(() => parse('cfg --level')).toThrow('Unexpected EOL at --level.')
    })

    it('throws on an unexpected trailing param after a flag', () => {
      // opt defines no params, so `extra` cannot be bound.
      expect(() => parse('opt --verbose extra')).toThrow(
        'Unexpected param extra.',
      )
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
      expect(() => parse('cfg --verbose --level 2 9')).not.toThrow()
      const result = parse('cfg --verbose --level 2 9')
      expect(result.params?.[0].value).toBe(9)
    })

    it('surfaces an EOL error when input ends mid-parse', () => {
      expect(() => parse('cfg --level')).toThrow('Unexpected EOL')
    })
  })
})
