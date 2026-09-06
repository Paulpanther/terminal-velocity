import { Path } from '@/game/shell/files/Path.ts'
import { StdErr } from '@/game/shell/Shell.ts'
import { State } from '@/game/State.ts'

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

type NextChildFn = (
  dir: Directory,
  name: string,
  found?: Resource,
) => Resource | undefined

const root: Directory = {
  name: '',
  children: [],
}

export class FileSystem extends State {
  public currentDir: Directory
  public root: Directory

  public constructor(dir: Directory = root) {
    super('filesystem')
    this.root = dir
    this.currentDir = dir
  }

  public goto(path: Path) {
    const target = this.traverse(path)
    if (FileSystem.isDir(target)) {
      this.currentDir = target
      this.changed()
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
        this.changed()
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
    this.changed()
  }

  public path(raw: string): Path {
    this.observe()
    return this.currentPath.append(raw)
  }

  public get currentPath(): Path {
    this.observe()
    return FileSystem.path(this.currentDir)
  }

  public exists(path: Path) {
    this.observe()
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
    this.observe()
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
