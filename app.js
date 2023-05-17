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
  static regularPrompts = [
    "Write a haiku about a 1-year old boy named Aidan. He loves his mom, his pet cat Tigri and red Pontiac solstices.",
    "Write a haiku about a beautiful Bengal cat called Tigri. She likes to purr on us, bask in the sun and eat tuna.",
  ].map(prompt => prompt + " You don't have to use all this information - just giving helpful tips.")

  static specialPrompts = {
    '5-Feb': '',
    '14-Feb': ''
  }
}

const newHaiku = prompt => openai
  .createChatCompletion(Object.assign(config.chatApiParams, {messages: [{role: Role.User, content: prompt}]}))
  .then(res => res.data.choices[0].message.content)

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

weather().then(board.renderWeather)
