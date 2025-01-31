import { JSONFilePreset } from 'lowdb/node'
import type { AIMessage } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { summarizeMessages } from './llm'

export type MessageWithMetadata = AIMessage & {
  id: string
  createdAt: string
}

type Data = {
  messages: MessageWithMetadata[]
  summary: string
}

export const addMetadata = (message: AIMessage) => {
  return {
    ...message,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  }
}

export const removeMetadata = (message: MessageWithMetadata) => {
  const { id, createdAt, ...rest } = message
  return rest
}

const defaultData: Data = {
  messages: [],
  summary: '',
}

export const getDb = async () => {
  const db = await JSONFilePreset<Data>('db.json', defaultData)
  return db
}

export const addMessages = async (messages: AIMessage[]) => {
  const db = await getDb()
  db.data.messages.push(...messages.map(addMetadata))

  if (db.data.messages.length >= 10) {
    // Remove the first 5 messages to manage context window
    // Check to ensure that, we do not leave DB at tool call state.
    if (db.data.messages[4].role == 'tool') {
      db.data.messages.splice(0, 6)
    } else {
      db.data.messages.splice(0, 5)
    }
    const oldestMessages = db.data.messages.slice(0, 5).map(removeMetadata)
    const summary = await summarizeMessages(oldestMessages)
    db.data.summary = summary
  }

  await db.write()
}

export const getMessages = async () => {
  const db = await getDb()
  const messages = db.data.messages.map(removeMetadata)
  const lastFive = messages.slice(-5)

  /* 
    By Design the last message of DB will never be a plain tool call definition.
    You do not want to send a tool call definition, for summarization
    without the user prompt which triggered it.

    So if 1st message of last 5 is a tool call definition
    we need to go back and add one more to ensure that the context is complete
  */
  if (lastFive[0]?.role === 'tool') {
    const sixthMessage = messages[messages.length - 6]
    if (sixthMessage) {
      return [...[sixthMessage], ...lastFive]
    }
  }

  return lastFive
}

export const getSummary = async () => {
  const db = await getDb()
  return db.data.summary
}

export const saveToolResponse = async (
  toolCallId: string,
  toolResponse: string
) => {
  return addMessages([
    {
      role: 'tool',
      content: toolResponse,
      tool_call_id: toolCallId,
    },
  ])
}
