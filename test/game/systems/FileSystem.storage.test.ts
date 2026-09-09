import { describe, expect, it } from 'vitest'
import { FileSystem, type Resource } from '@/game/systems/FileSystem.ts'
import { persist } from '@/game/State.ts'

/*
 * Tests for save/load round-tripping of the filesystem, and for how `persist`
 * treats a save it cannot fully apply.
 *
 * A snapshot is the plain, acyclic form of the tree: `parent` back-pointers are
 * dropped on the way out and rebuilt on the way in, and the current directory
 * travels as a path string rather than a node reference.
 */

const makeRoot = () => ({ name: '', children: [] as Resource[] })
const makeFs = () => new FileSystem(makeRoot())

// In-memory stand-in for localStorage; the test environment is `node`, so there
// is no DOM Storage to borrow.
const makeStorage = (seed: Record<string, string> = {}) => {
  const map = new Map(Object.entries(seed))
  const storage: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  }
  return storage
}

// A save holding `/foo` and `/foo/a.txt`, with the current directory
// parameterised so tests can point it at a resource that no longer exists.
const savedTree = (currentPath: string) =>
  JSON.stringify({
    root: {
      name: '',
      children: [
        { name: 'foo', children: [{ name: 'a.txt', content: ['hi'] }] },
      ],
    },
    currentPath,
  })

describe('filesystem persistence', () => {
  it('restores the tree and the current directory', () => {
    const fs = makeFs()
    persist(fs, makeStorage({ 'tv:filesystem': savedTree('/foo') }))

    expect(fs.root.children.map((c) => c.name)).toEqual(['foo'])
    expect(fs.currentPath.toString()).toBe('/foo')
  })

  it('gives the restored root no parent, like a freshly built one', () => {
    const fs = makeFs()
    persist(fs, makeStorage({ 'tv:filesystem': savedTree('/foo') }))

    // `FileSystem.path` identifies the root by the absence of a parent, so a
    // restored root carrying one breaks the invariant every path walk relies on.
    expect(fs.root.parent).toBeUndefined()
  })

  describe('when the saved current directory no longer exists', () => {
    it('still restores the tree, falling back to the root', () => {
      const fs = makeFs()

      expect(() => fs.load(JSON.parse(savedTree('/deleted')))).not.toThrow()
      expect(fs.root.children.map((c) => c.name)).toEqual(['foo'])
      expect(fs.currentPath.toString()).toBe('/')
    })

    it('keeps the save rather than discarding it as corrupt', () => {
      const storage = makeStorage({ 'tv:filesystem': savedTree('/deleted') })
      persist(makeFs(), storage)

      // A current directory that has gone missing is recoverable — only the cwd
      // is unusable, not the tree — so the save must survive the load.
      expect(storage.getItem('tv:filesystem')).not.toBeNull()
    })
  })
})
