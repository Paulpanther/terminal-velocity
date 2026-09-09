import { describe, expect, it } from 'vitest'
import { Path } from '@/game/shell/files/Path.ts'
import { err } from '@test/helpers/files.ts'

/*
 * Tests for the `Path` value object.
 *
 * Path model: every path is absolute and stringifies with a leading '/'. The
 * root path is the empty path (`new Path()`, `isRoot === true`, `toString()` is
 * '/'), and the root directory has an empty name.
 */

describe('Path', () => {
  describe('append', () => {
    it('appends a relative segment', () => {
      expect(new Path('a').append('b').toString()).toBe('/a/b')
    })

    it('resets from the top on an absolute path', () => {
      expect(new Path('a', 'b').append('/c/d').toString()).toBe('/c/d')
    })

    it('treats "." as a no-op', () => {
      expect(new Path('a', 'b').append('.').toString()).toBe('/a/b')
    })

    it('pops a segment on ".."', () => {
      expect(new Path('a', 'b').append('..').toString()).toBe('/a')
    })

    it('resolves "." and ".." embedded in an absolute path', () => {
      expect(new Path('x').append('/a/b/../c/./d').toString()).toBe('/a/c/d')
    })

    it('appends a relative segment onto the root path', () => {
      expect(new Path().append('foo').toString()).toBe('/foo')
    })
  })

  describe('normalize (boundaries)', () => {
    it('rejects a trailing slash', () => {
      // absolute append feeds the raw string straight to normalize
      const e = err(() => new Path('x').append('/a/'))
      expect(e.msg.join(' ')).toContain('must not end with')
    })

    it('rejects an embedded empty segment', () => {
      const e = err(() => new Path('x').append('/a//b'))
      expect(e.msg.join(' ')).toContain('empty resource name')
    })

    // invalid test, .. past the start will clamp to start
    // it('rejects ".." past the start of a plain path', () => {
    //   const e = err(() => new Path('x').append('/..'))
    //   expect(e.msg.join(' ')).toContain('Invalid path')
    // })
  })

  describe('parent / leaf / toString / iterator', () => {
    it('returns the parent path of a nested path', () => {
      expect(new Path('a', 'b', 'c').parent?.toString()).toBe('/a/b')
    })

    it('returns the leaf segment', () => {
      expect(new Path('a', 'b', 'c').leaf).toBe('c')
    })

    // A single-segment path's parent is the root path, so a top-level file's
    // parent resolves to the root directory.
    it('has the root path as the parent of a single-segment path', () => {
      const parent = new Path('x').parent
      expect(parent?.isRoot).toBe(true)
      expect(parent?.toString()).toBe('/')
    })

    it('has no parent for the root path', () => {
      expect(new Path().parent).toBeUndefined()
    })

    it('round-trips through toString', () => {
      expect(new Path('a', 'b').toString()).toBe('/a/b')
    })

    it('iterates its segments in order', () => {
      expect([...new Path('a', 'b', 'c')]).toEqual(['a', 'b', 'c'])
    })
  })

  describe('root & empty-path boundaries', () => {
    it('resolves "/" to the top', () => {
      expect(new Path('a', 'b').append('/').toString()).toBe('/')
    })

    it('clamps ".." at the top instead of throwing', () => {
      expect(new Path('a').append('../..').toString()).toBe('/')
    })

    it('reports isRoot for the empty path only', () => {
      expect(new Path().isRoot).toBe(true)
      expect(new Path('a').isRoot).toBe(false)
      expect(new Path('a', 'b').append('/').isRoot).toBe(true)
    })

    it('stringifies the root path as "/"', () => {
      expect(new Path().toString()).toBe('/')
    })
  })
})
