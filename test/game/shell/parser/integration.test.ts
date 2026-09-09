import { describe, expect, it } from 'vitest'

import { run, parse, errMsg } from '@test/game/shell/parser/fixtures.ts'

describe('ShellParser', () => {
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
