import { Vestaboard } from './vestaboard.js'
import 'core-js/actual/array/group.js'
import axios from 'axios'
import { mean } from 'mathjs'
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

const newHaiku = (prompt) => openai
  .createChatCompletion(Object.assign(config.chatApiParams, {messages: [{role: Role.User, content: prompt}]}))
  .then(res => res.data.choices[0].message.content)

const weather = () => axios.get(config.weather.url)
  .then(res => res.data.properties.periods)
  .then(entries => entries
    .map(entry => Object.assign(entry, {dateTime: new Date(entry.startTime)}))
    .filter(entry => entry.isDaytime && entry.dateTime.getHours() > 10)
    .group(entry => entry.dateTime.toISOString().split('T')[0])
  )
  .then(daily => Object.entries(daily).map(([date, entries]) => ({
    date: new Date(date),
    temperature: Math.round(mean(entries.map(e => e.temperature))),
    descriptions: entries.map(e => e.shortForecast)
  })))

const board = new Vestaboard({rwKey: null})

weather().then(board.renderWeather)
