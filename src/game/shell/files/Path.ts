import { StdErr } from '@/game/shell/Shell.ts'

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
