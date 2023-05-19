import { Vestaboard } from './vestaboard.js'
import 'core-js/actual/array/group.js'
import axios from 'axios'
import _ from 'lodash'
import { mean } from 'mathjs'
import dayjs from 'dayjs-with-plugins'
import yahooFinance from 'yahoo-finance2'
import { Configuration as OpenAIConfig, OpenAIApi, ChatCompletionRequestMessageRoleEnum as Role } from 'openai'
import dotenv from 'dotenv'
dotenv.config()

process.env.TZ = 'America/New_York'
const config = {
  chatApiParams: { model: 'gpt-3.5-turbo' }, // See https://platform.openai.com/docs/api-reference/chat/create
  openAiApiKey: process.env.OPENAI_API_KEY,
  vestaBoardApiKey: process.env.VESTABOARD_READ_WRITE_KEY,
  weather: {
    url: 'https://api.weather.gov/gridpoints/OKX/34,45/forecast/hourly', // Get this from https://api.weather.gov/points/40.9375,-73.9477
    dayTime: {start: 10, end: 17} // We only care about weather between 10am and 5pm
  },
  haikuPrompts: {
    regular: [
      {birthday: '21-Mar', prompt: "Write a haiku about a cute baby boy named Aidan. He loves his mom, his pet cat Tigri and red Pontiac Solstice."},
      {birthday: '21-Mar', prompt: "Write a haiku about a beautiful Bengal cat called Tigri. She likes to purr on us while we sleep, bask in the sun and eat tuna."},
      {birthday: '5-Feb' , prompt: "Write a haiku about a beautiful woman named Nastassia. She likes to play with her little boy, Aidan and sleep with her husband."},
    ].map(({birthday, prompt}) => {
      const suffix = dayjs().format('DD-MMM') === birthday ? 'Today is their birthday!' :
        "You don't have to use all this information - just giving helpful tips."
      return [prompt, suffix, 'Just respond with the haiku and nothing else.'].join(' ')
    }),
    special: {
      '14-Feb': "Today is Valentine's Day. Write a Haiku about a beautiful woman named Nastassia who loves her husband, Rick.",
      '8-Mar': "Today is Woman's Day. Write a Haiku about a beautiful woman named Nastassia.",
      '29-Aug': "Today is marriage anniversary of Rick and Nastassia. Write a haiku about them.",
      '21-Dec': "Today is wedding anniversary of Rick and Nastassia. Write a haiku about them."
    }
  },
  tickers: {
    required: [
      {ticker: 'MSFT'},
      {ticker: 'AAPL'},
      {ticker: 'TSLA'},
      {ticker: 'META', name: 'FB'},
      {ticker: 'AMZN'},
      {ticker: 'GOOGL', name: 'GOOG'},
      {ticker: 'BTC-USD', name: 'BTC'},
      {ticker: '^GSPC', name: 'S&P'},
      {ticker: '^TYX', name: 'US30'},
    ],
    optional: [
      {ticker: 'TSM', name: 'TSMC'},
      {ticker: 'BAC', name: 'BOFA'},
      {ticker: 'BABA'},
      {ticker: 'SNOW'},
    ]
  },
  jobIntervalMinutes: 60
}

const board = new Vestaboard({rwKey: config.vestaBoardApiKey})
const openai = new OpenAIApi(new OpenAIConfig({apiKey: config.openAiApiKey}))

class Haiku {
  static idx = 0
  static nextPrompt = () => config.haikuPrompts.special[dayjs().format('DD-MMM')] ?? config.haikuPrompts.regular[(Haiku.idx = (Haiku.idx + 1)%(config.haikuPrompts.regular.length))]
  static generate = (prompt = Haiku.nextPrompt()) => openai
    .createChatCompletion(Object.assign(config.chatApiParams, {messages: [{role: Role.User, content: prompt}]}))
    .then(res => res.data.choices[0].message.content)
}

const weather = () => axios.get(config.weather.url)
  .catch(error => Promise.reject(error.toJSON()))
  .then(res => res.data.properties.periods)
  .then(entries => entries
    .map(entry => Object.assign(entry, {dateTime: dayjs(entry.startTime)}))
    .filter(entry => {
      const isDayTime = entry.isDaytime && config.weather.dayTime.start < entry.dateTime.hour() && entry.dateTime.hour() < config.weather.dayTime.end
      const isTonight = entry.dateTime.isToday() && dayjs().hour() >= config.weather.dayTime.end
      return entry.dateTime.isAfter(dayjs()) && (isDayTime || isTonight)
    })
    .group(entry => entry.dateTime.format('YYYY-MM-DD'))
  )
  .then(daily => Object.entries(daily).map(([date, entries]) => ({
    date: dayjs(date),
    temperature: Math.round(mean(entries.map(e => e.temperature))),
    startHour: _.min(entries.map(e => e.dateTime.hour())),
    endHour: _.max(entries.map(e => e.dateTime.hour())),
    descriptions: entries.map(e => e.shortForecast)
  })))

const quote = ({ticker, name}) => yahooFinance.quote(ticker)
  .then(quote => Object.assign(quote, {name: name ?? ticker, pctChange: quote.regularMarketChangePercent}))

const tickers = () => config.tickers.required.concat(_.shuffle(config.tickers.optional)).slice(0, 2*Vestaboard.ROWS)

const jobs = [
  () => weather().then(board.renderWeather),
  () => Haiku.generate().then(board.writeHaiku),
  () => Promise.all(tickers().map(quote)).then(board.tickerTape)
]
const run = (jobId) => jobs[jobId]()
  .catch(err => console.error(err))
  .finally(() => setTimeout(run, config.jobIntervalMinutes * 60 * 1000, (jobId + 1)%jobs.length))

run(0) //Yolo!
