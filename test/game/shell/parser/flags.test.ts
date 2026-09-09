import { describe, expect, it } from 'vitest'

import { run, parse, errMsg } from '@test/game/shell/parser/fixtures.ts'

describe('ShellParser', () => {
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
})
