import { describe, expect, it } from 'vitest'

import { parse, parseErr, errMsg } from '@test/game/shell/parser/fixtures.ts'

describe('ShellParser', () => {
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
})
