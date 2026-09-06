import { type Command, Shell, StdErr } from '@/game/shell/Shell.ts'

interface File {
  name: string
  parent: Directory
  content: string[]
}

interface Directory {
  name: string
  parent?: Directory
  children: Resource[]
}

export type Resource = File | Directory

export class Path {
  private readonly values: string[]

  constructor(...values: string[]) {
    this.values = values
  }

  public get isRoot() {
    return this.values.length === 0
  }

  public append(path: string): Path {
    if (path.startsWith('/')) {
      return Path.normalize(path)
    } else if (this.isRoot) {
      return Path.normalize('/' + path)
    } else {
      return Path.normalize(this + '/' + path)
    }
  }

  private static normalize(path: string): Path {
    if (path.length > 1 && path.endsWith('/')) {
      throw new StdErr([`${path}: Invalid path, must not end with /.`])
    }
    if (!path.startsWith('/')) {
      // shouldn't happen in prod
      throw new StdErr([`${path}: Invalid path, must be absolute.`])
    }
    if (path.length === 1) {
      return new Path()
    }

    let parts: string[] = []

    for (const next of path.slice(1).split('/')) {
      if (next === '.') {
        // continue
      } else if (next === '..') {
        if (parts.length) {
          parts = parts.slice(0, -1)
        }
        // else clamp to top
      } else if (next === '') {
        throw new StdErr([`${path}: Invalid path, empty resource name`])
      } else {
        parts.push(next)
      }
    }

    return new Path(...parts)
  }

  public get parent(): Path | undefined {
    if (this.values.length === 0) {
      return undefined
    }
    if (this.values.length === 1) {
      return new Path()
    }
    return new Path(...this.values.slice(0, -1))
  }

  public get leaf(): string {
    return this.values[this.values.length - 1]
  }

  [Symbol.iterator]() {
    let index = -1

    return {
      next: () => ({
        value: this.values[++index],
        done: !(index in this.values),
      }),
    }
  }

  public toString() {
    return '/' + this.values.join('/')
  }
}

type NextChildFn = (
  dir: Directory,
  name: string,
  found?: Resource,
) => Resource | undefined

const root: Directory = {
  name: '',
  children: [],
}

export class FileSystem {
  public currentDir: Directory
  public root: Directory

  public constructor(dir: Directory = root) {
    this.root = dir
    this.currentDir = dir
  }

  public goto(path: Path) {
    const target = this.traverse(path)
    if (FileSystem.isDir(target)) {
      this.currentDir = target
    } else {
      throw new StdErr([`${path}: Not a directory`])
    }
  }

  public createDir(path: Path) {
    this.traverse(path, (dir, name, found) => {
      if (!found) {
        const next: Directory = {
          children: [],
          parent: dir,
          name,
        }
        dir.children.push(next)
        return next
      }
    })
  }

  public writeFile(
    path: Path,
    content: string[] = [],
    overwrite: boolean,
    append: boolean,
  ) {
    const parent = path.parent
    const fileName = path.leaf

    if (!parent) {
      throw new StdErr([`${path}: Not a directory`])
    }

    const dir = this.traverse(parent)
    if (!FileSystem.isDir(dir)) {
      throw new StdErr([`${path}: Not a directory`])
    }
    const found = dir.children.find((c) => c.name === fileName)
    if (found) {
      if (!FileSystem.isFile(found)) {
        throw new StdErr([`${path}: Not a file`])
      }

      if (overwrite) {
        found.content = content
      } else if (append) {
        found.content = [...found.content, ...content]
      }
    } else {
      dir.children.push({
        name: fileName,
        parent: dir,
        content,
      } as File)
    }
  }

  public path(raw: string): Path {
    return this.currentPath.append(raw)
  }

  public get currentPath(): Path {
    return FileSystem.path(this.currentDir)
  }

  public exists(path: Path) {
    let valid = true
    this.traverse(path, undefined, () => {
      valid = false
    })
    return valid
  }

  public traverse(
    path: Path,
    nextChild: NextChildFn = () => {},
    onMissing?: () => void,
  ): Resource {
    return FileSystem.traverse(this.root, path, nextChild, onMissing)
  }

  private static traverse(
    dir: Directory,
    path: Path,
    nextChild: NextChildFn = () => {},
    onMissing?: () => void,
  ): Resource {
    let current: Resource = dir

    for (const next of path) {
      if (!this.isDir(current)) {
        throw new StdErr([`${this.path(current)}: Not a directory`])
      }

      let res: Resource | undefined = current.children.find(
        (c) => c.name === next,
      )
      res = nextChild(current, next, res) ?? res

      if (res) {
        current = res
      } else {
        if (onMissing) {
          onMissing()
          return current
        } else {
          throw new StdErr([
            `${this.path(current)}/${next}: No such file or directory`,
          ])
        }
      }
    }

    return current
  }

  private static path(res: Resource): Path {
    if (!res.parent) {
      // ignore res.name for root, as root path must be empty
      return new Path()
    }
    return this.path(res.parent).append(res.name)
  }

  public static isDir(res: Resource): res is Directory {
    return Object.hasOwn(res, 'children')
  }

  public static isFile(res: Resource): res is File {
    return Object.hasOwn(res, 'content')
  }
}

export const fileSystem = new FileSystem()

export const buildFs = (fs: FileSystem) =>
  ({
    name: 'fs',
    description: 'Interact with the file system',
    subs: [
      {
        name: 'list',
        description: 'List files/folders in the current directory',
        handler: async () => {
          const list = fs.currentDir.children
          const files = list.filter((r) => FileSystem.isFile(r))
          const dirs = list.filter((r) => FileSystem.isDir(r))
          const fileNames = files.map((l) => l.name)
          fileNames.sort()
          const dirNames = dirs.map((l) => l.name)
          dirNames.sort()
          return [
            '..',
            ...dirNames,
            ...(fileNames.length && dirNames.length ? ['---'] : []),
            ...fileNames,
          ]
        },
      },
      {
        name: 'go',
        description: 'Go to a given directory',
        params: [
          {
            name: 'path',
            type: 'string',
          },
        ],
        handler: async (args) => {
          const path = Shell.getParam(args, 'path').value as string
          fs.goto(fs.path(path))
          return []
        },
      },
      {
        name: 'read',
        description: 'Read a file',
        params: [
          {
            name: 'path',
            type: 'string',
          },
        ],
        handler: async (args) => {
          const path = Shell.getParam(args, 'path').value as string
          const res = fs.traverse(fs.path(path))
          if (FileSystem.isFile(res)) {
            return res.content
          } else {
            throw new StdErr([`${path}: Not a file`])
          }
        },
      },
      {
        name: 'mkdir',
        description: 'Create a directory',
        params: [
          {
            name: 'path',
            type: 'string',
          },
        ],
        flags: [
          {
            name: 'go',
            description: 'Go to the directory',
          },
        ],
        handler: async (args) => {
          const path = Shell.getParam(args, 'path').value as string
          fs.createDir(fs.path(path))
          if (Shell.getFlag(args, 'go')) {
            fs.goto(fs.path(path))
          }
          return []
        },
      },
      {
        name: 'write',
        description:
          'Write a file. Creates a new one if the file is not present. Appends by default.',
        params: [
          {
            name: 'path',
            type: 'string',
          },
          {
            name: 'content',
            type: 'string',
          },
        ],
        flags: [
          {
            name: 'overwrite',
            description: 'Overwrite content',
          },
        ],
        handler: async (args) => {
          const path = Shell.getParam(args, 'path').value as string
          const content = Shell.getParam(args, 'content').value as string
          const overwrite = !!Shell.getFlag(args, 'overwrite')

          fs.writeFile(
            fs.path(path),
            content.split('\n'),
            overwrite,
            !overwrite,
          )
          return []
        },
      },
    ],
  }) as Command

export const fs = buildFs(fileSystem)
