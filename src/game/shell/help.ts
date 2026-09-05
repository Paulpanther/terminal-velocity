import type { Command } from '@/game/shell/Shell.ts'

export const help: Command = {
  name: 'help',
  description: 'Displays a list of available commands.',
  handler: async () => ['No help available'],
}
