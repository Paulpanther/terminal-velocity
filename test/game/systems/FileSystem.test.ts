import { describe, expect, it } from 'vitest'
import { FileSystem, type Resource } from '@/game/systems/FileSystem.ts'
import { Path } from '@/game/shell/files/Path.ts'
import { err, makeFs, makeRoot } from '@test/helpers/files.ts'

/*
 * Tests for the in-memory filesystem resolver.
 *
 * Paths built directly from `new Path(...)` are absolute-from-root; anything
 * exercising current-directory or relative resolution goes through `fs.path`.
 */

describe('FileSystem', () => {
  describe('createDir / exists / traverse', () => {
    it('creates a directory under the current dir', () => {
      const fs = makeFs()
      fs.createDir(new Path('foo'))
      expect(fs.currentDir.children.map((c) => c.name)).toEqual(['foo'])
    })

    it('creates intermediate directories for a nested path', () => {
      const fs = makeFs()
      fs.createDir(new Path('a', 'b', 'c'))
      expect(fs.exists(new Path('a', 'b', 'c'))).toBe(true)
    })

    it('reports a missing path as not existing', () => {
      expect(makeFs().exists(new Path('nope'))).toBe(false)
    })

    it('throws on traversing a missing path', () => {
      const e = err(() => makeFs().traverse(new Path('nope')))
      expect(e.msg.join(' ')).toContain('No such file or directory')
    })
  })

  describe('goto', () => {
    it('enters an existing directory', () => {
      const fs = makeFs()
      fs.createDir(new Path('d'))
      fs.goto(new Path('d'))
      expect(fs.currentDir.name).toBe('d')
    })

    it('throws when the target is missing', () => {
      const e = err(() => makeFs().goto(new Path('nope')))
      expect(e.msg.join(' ')).toContain('No such file or directory')
    })

    it('throws "Not a directory" when the target is a file', () => {
      const root = makeRoot()
      root.children.push({ name: 'f', parent: root, content: ['x'] })
      const fs = new FileSystem(root)
      const e = err(() => fs.goto(new Path('f')))
      expect(e.msg.join(' ')).toContain('Not a directory')
    })
  })

  describe('writeFile', () => {
    it('creates a new file that can be read back', () => {
      const fs = makeFs()
      fs.createDir(new Path('d'))
      fs.writeFile(new Path('d', 'f.txt'), ['hello'], false, true)
      const res = fs.traverse(new Path('d', 'f.txt'))
      expect(FileSystem.isFile(res)).toBe(true)
    })

    it('creates a file directly under the root', () => {
      const fs = makeFs()
      fs.writeFile(new Path('a.txt'), ['hi'], false, true)
      const res = fs.traverse(new Path('a.txt'))
      expect(FileSystem.isFile(res) && res.content).toEqual(['hi'])
    })

    it('appends to an existing file by default', () => {
      const root = makeRoot()
      const d = { name: 'd', parent: root, children: [] as Resource[] }
      const file = { name: 'f.txt', parent: d, content: ['a'] }
      d.children.push(file)
      root.children.push(d)
      const fs = new FileSystem(root)
      fs.writeFile(new Path('d', 'f.txt'), ['b'], false, true)
      expect(file.content).toEqual(['a', 'b'])
    })

    it('replaces content with the overwrite flag', () => {
      const root = makeRoot()
      const d = { name: 'd', parent: root, children: [] as Resource[] }
      const file = { name: 'f.txt', parent: d, content: ['a'] }
      d.children.push(file)
      root.children.push(d)
      const fs = new FileSystem(root)
      fs.writeFile(new Path('d', 'f.txt'), ['b'], true, false)
      expect(file.content).toEqual(['b'])
    })

    it('throws "Not a file" when writing over a directory', () => {
      const root = makeRoot()
      const p = { name: 'p', parent: root, children: [] as Resource[] }
      p.children.push({ name: 'd', parent: p, children: [] as Resource[] })
      root.children.push(p)
      const fs = new FileSystem(root)
      const e = err(() => fs.writeFile(new Path('p', 'd'), ['x'], false, true))
      expect(e.msg.join(' ')).toContain('Not a file')
    })
  })

  describe('current directory & relative resolution', () => {
    it('has a "/" currentPath at the root', () => {
      expect(makeFs().currentPath.toString()).toBe('/')
    })

    it('creates a relative directory directly under the root', () => {
      const fs = makeFs()
      fs.createDir(fs.path('foo'))
      expect(fs.currentDir.children.map((c) => c.name)).toEqual(['foo'])
    })

    it('stays at the root when going up from the root', () => {
      const fs = makeFs()
      expect(() => fs.goto(fs.path('..'))).not.toThrow()
      expect(fs.currentDir.name).toBe('')
    })

    it('returns to the parent after entering a subdirectory and going up', () => {
      const fs = makeFs()
      fs.createDir(fs.path('a'))
      fs.goto(fs.path('a'))
      fs.goto(fs.path('..'))
      expect(fs.currentDir.name).toBe('')
    })

    it('reflects the absolute path of the cwd after entering nested dirs', () => {
      const fs = makeFs()
      fs.createDir(new Path('a', 'b'))
      fs.goto(fs.path('a'))
      fs.goto(fs.path('b'))
      expect(fs.currentPath.toString()).toBe('/a/b')
    })

    it('resolves a relative path against the cwd', () => {
      const fs = makeFs()
      fs.createDir(new Path('a'))
      fs.goto(fs.path('a'))
      expect(fs.path('x').toString()).toBe('/a/x')
    })

    it('resolves absolute and relative paths consistently', () => {
      const fs = makeFs()
      fs.createDir(new Path('a'))
      fs.goto(fs.path('a'))
      // absolute ignores the cwd, relative is anchored to it
      expect(fs.path('/foo').toString()).toBe('/foo')
      expect(fs.path('foo').toString()).toBe('/a/foo')
    })
  })
})
