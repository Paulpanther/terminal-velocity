import { describe, expect, it } from 'vitest'

import {
  parse,
  parseErr,
  errMsg,
  noargs,
} from '@test/game/shell/parser/fixtures.ts'

describe('ShellParser', () => {
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
})
