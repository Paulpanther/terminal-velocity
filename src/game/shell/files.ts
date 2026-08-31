import type { Command } from '@/game/shell/Shell.ts'

interface File {
  name: string
  parent: Directory
  content: string
}

interface Directory {
  name: string
  parent?: Directory
  children: Resource[]
}

type Resource = File | Directory

const root: Directory = {
  name: 'root',
  children: [],
}

class FileSystem {
  public currentDir: Directory = root

  public goto(path: string) {
    const target = this.traverse(path)
    if (FileSystem.isDir(target)) {
      this.currentDir = target
    } else {
      throw new Error(`${path}: Not a directory`)
    }
  }

  public get path() {
    return FileSystem.path(this.currentDir)
  }

  private traverse(path: string): Resource {
    if (path.startsWith('/')) {
      return FileSystem.traverse(root, path.substring(1))
    } else {
      return FileSystem.traverse(root, path)
    }
  }

  private static traverse(dir: Directory, path: string): Resource {
    let current: Resource = dir

    for (const next of path.split('/')) {
      if (!this.isDir(current)) {
        throw new Error(`${this.path(current)}: Not a directory`)
      }

      if (next === '.') {
        // continue
      } else if (next === '..') {
        if (current.parent) {
          current = current.parent
        }
      } else {
        const res: Resource | undefined = current.children.find(
          (c) => c.name === next,
        )
        if (res) {
          current = res
        } else {
          throw new Error(
            `${this.path(current)}/${next}: No such file or directory`,
          )
        }
      }
    }

    return current
  }

  private static path(res: Resource): string {
    if (!res.parent) {
      return res.name
    }
    return `${this.path(res.parent)}/${res.name}`
  }

  private static isDir(res: Resource): res is Directory {
    return Object.hasOwn(res, 'children')
  }

  private static isFile(res: Resource): res is File {
    return Object.hasOwn(res, 'content')
  }
}

export const fileSystem = new FileSystem()

export const files: Command = {
  name: 'fs',
  description: 'Interact with the file system',
  subs: [
    {
      name: 'list',
      description: 'List files/folders in the current directory',
      handler: () => {
        const list = fileSystem.currentDir.children
        const names = list.map((l) => l.name)
        names.sort()
        return names
      },
    },
    {
      name: 'go',
      description: 'Go to a given directory',
      params: [
        {
          name: 'dir',
          type: 'string',
        },
      ],
      handler: (args) => {

      }
    },
  ],
}
