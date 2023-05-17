import { Vestaboard } from './vestaboard.js'
import 'core-js/actual/array/group.js'
import axios from 'axios'
import { mean } from 'mathjs'
import dayjs from 'dayjs'
import { Configuration as OpenAIConfig, OpenAIApi, ChatCompletionRequestMessageRoleEnum as Role } from 'openai'
import dotenv from 'dotenv'
dotenv.config()

const config = {
  chatApiParams: { model: 'gpt-3.5-turbo' },
  openAiApiKey: process.env.OPENAI_API_KEY,
  weather: {
    url: 'https://api.weather.gov/gridpoints/OKX/34,45/forecast/hourly' // Get this from https://api.weather.gov/points/40.9375,-73.9477
  }
}

const openai = new OpenAIApi(new OpenAIConfig({apiKey: config.openAiApiKey}))

class Haiku {
  static idx = 0

  static peoplePrompts = [
    {birthday: '21-Mar', prompt: "Write a haiku about a cute baby boy named Aidan. He loves his mom, his pet cat Tigri and red Pontiac Solstice."},
    {birthday: '21-Mar', prompt: "Write a haiku about a beautiful Bengal cat called Tigri. She likes to purr on us, bask in the sun and eat tuna."},
    {birthday: '5-Feb' , prompt: "Write a haiku about a beautiful woman named Nastassia. She likes to play with her little boy, Aidan and sleep with her husband."},
  ].map(({birthday, prompt}) => {
    const suffix = dayjs().format('DD-MMM') === birthday ? 'Today is their birthday!' :
      "You don't have to use all this information - just giving helpful tips."
    return prompt + ' ' + suffix + ' . Just respond with the haiku and nothing else.'
  })

  static specialPrompts = {
    '14-Feb': "Today is Valentine's Day. Write a Haiku about a beautiful woman named Nastassia who loves her husband, Rick.",
     '8-Mar': "Today is Woman's Day. Write a Haiku about a beautiful woman named Nastassia.",
    '29-Aug': "Today is marriage anniversary of Rick and Nastassia. Write a haiku about them.",
    '21-Dec': "Today is wedding anniversary of Rick and Nastassia. Write a haiku about them."
  }

  static nextPrompt = () => Haiku.specialPrompts[dayjs().format('DD-MMM')] ?? Haiku.peoplePrompts[(Haiku.idx = (Haiku.idx + 1)%(Haiku.peoplePrompts.length))]

  static generate = (prompt = Haiku.nextPrompt()) => openai
    .createChatCompletion(Object.assign(config.chatApiParams, {messages: [{role: Role.User, content: prompt}]}))
    .then(res => res.data.choices[0].message.content)
}

const weather = () => axios.get(config.weather.url)
  .then(res => res.data.properties.periods)
  .then(entries => entries
    .map(entry => Object.assign(entry, {dateTime: dayjs(entry.startTime)}))
    .filter(entry => entry.isDaytime && entry.dateTime.hour() > 10)
    .group(entry => entry.dateTime.format('YYYY-MM-DD'))
  )
  .then(daily => Object.entries(daily).map(([date, entries]) => ({
    date: dayjs(date),
    temperature: Math.round(mean(entries.map(e => e.temperature))),
    descriptions: entries.map(e => e.shortForecast)
  })))

const board = new Vestaboard({rwKey: null})

console.log(Haiku.generate().then(board.writeHaiku))
