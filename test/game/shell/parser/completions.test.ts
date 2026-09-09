import { describe, expect, it } from 'vitest'

import {
  run,
  completionNames,
  net,
  opt,
  ALL,
} from '@test/game/shell/parser/fixtures.ts'

describe('ShellParser', () => {
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
})
