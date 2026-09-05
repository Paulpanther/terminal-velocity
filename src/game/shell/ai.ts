import { type Command, Shell, StdErr } from '@/game/shell/Shell.ts'

const BASE_URL: string = import.meta.env.VITE_AI_URL
const API_KEY: string = import.meta.env.VITE_AI_KEY
const MODEL: string = import.meta.env.VITE_AI_MODEL

type Message = { role: 'system' | 'user' | 'assistant'; content: string }

type Response = {
  choices: {
    message: { content: string }
  }[]
}

async function prompt(messages: Message[]) {
  // TODO put into backend
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages }),
  })
  if (!res.ok) {
    throw new StdErr(['AI error', await res.text()])
  }

  const data: Response = await res.json()
  return data?.choices?.[0]?.message?.content
}

export const ai: Command = {
  name: 'ai',
  description: 'Invoice the AI',
  params: [
    {
      name: 'message',
      type: 'string',
    },
  ],
  handler: async (args) => {
    const message = Shell.getParam(args, 'message').value as string
    return [await prompt([{ role: 'user', content: message }])]
  },
}
