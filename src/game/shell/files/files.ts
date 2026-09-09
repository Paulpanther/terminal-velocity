import { FileSystem, fileSystem } from '@/game/systems/FileSystem.ts'
import { type Command, ShellParser, StdErr } from '@/game/shell/ShellParser.ts'

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
          const path = ShellParser.getParam(args, 'path').value as string
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
          const path = ShellParser.getParam(args, 'path').value as string
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
          const path = ShellParser.getParam(args, 'path').value as string
          fs.createDir(fs.path(path))
          if (ShellParser.getFlag(args, 'go')) {
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
          const path = ShellParser.getParam(args, 'path').value as string
          const content = ShellParser.getParam(args, 'content').value as string
          const overwrite = !!ShellParser.getFlag(args, 'overwrite')

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
