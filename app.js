import dotenv from 'dotenv'
dotenv.config()

import {Vestaboard} from './vestaboard.js'
import { Configuration as OpenAIConfig, OpenAIApi, ChatCompletionRequestMessageRoleEnum as Role } from 'openai'

const config = {
  chatApiParams: { model: 'gpt-3.5-turbo' },
  openAiApiKey: process.env.OPENAI_API_KEY
}

console.log(config)
const openai = new OpenAIApi(new OpenAIConfig({apiKey: config.openAiApiKey}))

const newHaiku = (prompt) => openai
  .createChatCompletion(Object.assign(config.chatApiParams, {messages: [{role: Role.User, content: prompt}]}))
  .then(res => res.data.choices[0].message.content)

const board = new Vestaboard({rwKey: null})

newHaiku('Write a haiku about a 1-year cute boy named Aidan. He loves cars and balls.')
  .then(haiku => board.writeHaiku(haiku))