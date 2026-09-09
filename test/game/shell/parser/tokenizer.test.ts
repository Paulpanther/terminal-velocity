import { describe, expect, it } from 'vitest'
import { StdErr } from '@/game/shell/ShellParser.ts'
import { run, errMsg } from '@test/game/shell/parser/fixtures.ts'

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
})
