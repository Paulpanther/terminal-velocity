import { describe, expect, it } from 'vitest'
import { buildFs, FileSystem, Path, type Resource } from '@/game/shell/files.ts'
import { Shell, StdErr } from '@/game/shell/Shell.ts'

/*
 * Tests for the in-memory filesystem: the `Path` value object, the `FileSystem`
 * resolver, and the `fs` shell command (built via `buildFs`).
 *
 * Path model: every path is absolute and stringifies with a leading '/'. The
 * root path is the empty path (`new Path()`, `isRoot === true`, `toString()` is
 * '/'), and the root directory has an empty name.
 *
 * Some tests exercise the resolver mechanics with `Path`s built directly (paths
 * that are absolute-from-root); tests for the current-directory / relative
 * resolution go through `fs.path` / `currentPath` / the shell command.
 */

// Fresh, isolated state per test — `traverse` resolves from `currentDir`, so a
// brand-new root dir gives each test its own tree.
const makeRoot = () => ({ name: '', children: [] as Resource[] })
const makeFs = () => new FileSystem(makeRoot())

// A throwaway shell wired only to this fs's command, for end-to-end tests.
const makeShell = (fs: FileSystem) => {
  const s = new Shell()
  s.commands = [buildFs(fs)]
  return s
}

/** Run a call and return the thrown StdErr, failing if nothing (or something else) is thrown. */
function err(fn: () => unknown): StdErr {
  try {
    fn()
  } catch (e) {
    if (e instanceof StdErr) return e
    throw e
  }
  throw new Error('expected call to throw StdErr')
}

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

describe('fs command (integration)', () => {
  it('lists just ".." for an empty root', () => {
    const s = makeShell(makeFs())
    expect(s.process('fs list')).toEqual(['..'])
  })

  it('shows a newly created directory in the listing', () => {
    const s = makeShell(makeFs())
    s.process('fs mkdir foo')
    const out = s.process('fs list')
    expect(out).toContain('foo')
  })

  it('moves into a directory created with --go', () => {
    const fs = makeFs()
    const s = makeShell(fs)
    s.process('fs mkdir foo --go')
    expect(fs.currentDir.name).toBe('foo')
  })

  it('reads back a file that was written', () => {
    const s = makeShell(makeFs())
    s.process('fs write a.txt hello')
    expect(s.process('fs read a.txt')).toEqual(['hello'])
  })

  it('appends to a file by default on repeated writes', () => {
    const s = makeShell(makeFs())
    s.process('fs write a.txt one')
    s.process('fs write a.txt two')
    expect(s.process('fs read a.txt')).toEqual(['one', 'two'])
  })

  it('overwrites content with --overwrite', () => {
    const s = makeShell(makeFs())
    s.process('fs write a.txt one')
    s.process('fs write a.txt two --overwrite')
    expect(s.process('fs read a.txt')).toEqual(['two'])
  })

  it('splits multi-line content into separate lines', () => {
    const s = makeShell(makeFs())
    s.process('fs write a.txt "line1\nline2"')
    expect(s.process('fs read a.txt')).toEqual(['line1', 'line2'])
  })

  it('navigates with an absolute path', () => {
    const s = makeShell(makeFs())
    s.process('fs mkdir a/b')
    s.process('fs go /a/b')
    s.process('fs mkdir c')
    expect(s.process('fs list')).toContain('c')
  })

  it('errors "Not a file" when reading a directory', () => {
    const s = makeShell(makeFs())
    s.process('fs mkdir d')
    expect(s.process('fs read d').join(' ')).toContain('Not a file')
  })

  it('errors "No such file or directory" when going to a missing path', () => {
    const s = makeShell(makeFs())
    expect(s.process('fs go nope').join(' ')).toContain(
      'No such file or directory',
    )
  })

  it('does not crash going up from the root', () => {
    const s = makeShell(makeFs())
    expect(s.process('fs go ..')).toEqual([])
  })

  it('goes to the root with an absolute "/"', () => {
    const s = makeShell(makeFs())
    expect(s.process('fs go /')).toEqual([])
  })
})
