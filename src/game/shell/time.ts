import type { Command } from '@/game/shell/Shell.ts'
import { State } from '@/game/State.ts'

class TimeService extends State {
  constructor() {
    super('time')
  }

  protected _save(): object {
    return {}
  }

  load(data: object): void {}
}

export const timeService = new TimeService()

export const time: Command = {
  name: 'time',
  description: 'Time-based operations',
  subs: [
    {
      name: 'now',
      description: 'Get the time now',
      flags: [{ name: 'reset', description: 'Reset time to 0' }],
      handler: async () => ['Not operational'],
    },
  ],
}
