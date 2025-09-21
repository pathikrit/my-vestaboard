import {Vestaboard} from './vestaboard.js'
import 'core-js/actual/array/group.js'
import axios from 'axios'
import axiosRetry from 'axios-retry'
import _ from 'lodash'
import {mean} from 'mathjs'
import dayjs from 'dayjs-with-plugins'
import yahooFinance from 'yahoo-finance2'
import {google} from 'googleapis'
import OpenAI from 'openai'
import assert from 'node:assert'
import dotenv from 'dotenv'
import quotes from 'quotesy'

dotenv.config()

const env = {
  isProd: process.env.NODE_ENV === 'production'
}

process.env.TZ = 'America/New_York'
const config = {
  chatApiParams: {model: 'gpt-5-mini-2025-08-07'}, // See https://platform.openai.com/docs/api-reference/chat/create
  openAiApiKey: process.env.OPENAI_API_KEY,
  vestaBoardApiKey: process.env.VESTABOARD_READ_WRITE_KEY,
  doWrites: env.isProd,  // Set this flag to true locally to do writes to the board
  weather: {
    url: 'https://api.weather.gov/gridpoints/OKX/34,46/forecast/hourly', // Get this from https://api.weather.gov/points/40.9398,-73.9449
    dayTime: {start: 10, end: 17} // We only care about the weather between 10am and 5pm
  },
  haikuPrompt: () => {
    const prompt = `
      I will describe to you my family:
      "
      My name is Rick. I am married to a beautiful woman named Nastenka (she also goes by Nastya)
      We have a smart & cute boy named Aidan, a newborn baby boy named Kieran and a beautiful Bengal cat called Tigri.
      We live in NYC.

      Aidan:
        Aidan loves exploring cool things in Rick's office (his favorite is a mini red Pontiac Solstice) and chasing after Tigri.
        He has beautiful brown eyes with long eyelashes and cute curly blonde hair.        

      Kieran:
        Newborn baby boy - just suckling Nastenka's milk for now

      Nastenka / Nastya:
        Nastenka loves to play with Aidan, Kieran & Tigri and cuddle & sleep with Rick.

      Tigri:
        Tigri likes to purr on us while we sleep, bask in the sun, eat tuna, and roll on her belly to get whipped.
      "
    `
    const special = {
      '5-Feb': "Today is Nastenka's birthday! Write a haiku about Nastenka!",
      '14-Feb': "Today is Valentine's Day! Write a haiku about Rick & Nastenka!",
      '8-Mar': "Today is Woman's Day! Write a haiku about Nastenka!",
      '21-Mar': "Today is the birthday of both Tigri and Aidan (born 9 years apart on the same day)! Write a haiku about them!" ,
      '25-Aug': "Today is Rick's birthday! Write a haiku about Rick!",
      '29-Aug': "Today is the marriage anniversary of Rick and Nastenka. Write a haiku about them!",
      "17-Sep": "Today is Kieran's birthday! Write a haiku about Kieran!",
      '21-Dec': "Today is the wedding anniversary of Rick and Nastenka. Write a haiku about them!",
    }
    return [
      prompt,
      special[dayjs().format('D-MMM')] ?? `Write a haiku about ${_.sample(['Aidan', 'Tigri', 'Nastenka'])}.`,
      'Just respond with the haiku and nothing else.'
    ].join('\n\n')
  },
  googleTasks: {
    token: { // see https://developers.google.com/tasks/quickstart/nodejs
      type: "authorized_user",
      client_id: process.env.GOOGLE_TASKS_TOKEN_CLIENT_ID,
      client_secret: process.env.GOOGLE_TASKS_TOKEN_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_TASKS_TOKEN_REFRESH_TOKEN
    },
    maxDueDays: 7
  },
  tickers: [
    {ticker: 'AAPL'},
    {ticker: 'AMZN'},
    {ticker: 'BTC-USD', name: 'BTC'},
    {ticker: 'CTA'},
    {ticker: 'DBMF'},
    {ticker: 'GOOGL'},
    {ticker: 'KMLM'},
    {ticker: 'META'},
    {ticker: 'MSFT'},
    {ticker: 'NFLX'},
    {ticker: 'NVDA'},    
    {ticker: '^GSPC', name: 'SP500'},    
    {ticker: 'SNOW'},
    {ticker: 'SOXL'},
    {ticker: 'TQQQ'},
    {ticker: 'TSLA'},
    {ticker: 'TSM', name: 'TSMC'},
    {ticker: 'UGL'},
    {ticker: '^TYX', name: 'UST30'},
    {ticker: 'YINN'},    
    {ticker: 'ZROZ'},
  ],
  defaultRefreshMinutes: 5,
  retryIntervalMinutes: [1, 1, 1, 1]
}

export const makeRetry = (client) => {
  client.interceptors.request.use((req) => {
    req.method = req.method.toUpperCase()
    return (!config.doWrites && req.method !== 'GET') ? Promise.reject(`${req.method} ${req.baseURL + req.url} BLOCKED (cannot make non-GET call from non-prod env)`) : req
  }, (error) => Promise.reject(error.toJSON()))
  axiosRetry(client, {
    retries: config.retryIntervalMinutes.length,
    retryDelay: (retryCount) => config.retryIntervalMinutes[retryCount] * 60 * 1000,
    onRetry: (retryCount, error) => console.warn(`Retrying web call (${retryCount} retries)`, error.toJSON())
  })
}

makeRetry(axios)
google.options({auth: google.auth.fromJSON(config.googleTasks.token)})

const taskApi = google.tasks('v1')
const board = new Vestaboard(config.vestaBoardApiKey)
const openai = new OpenAI({apiKey: config.openAiApiKey})

const haiku = (prompt) => openai.chat.completions.create(Object.assign(config.chatApiParams, {messages: [{role: 'user', content: prompt}]}))
  .then(res => res.choices[0].message.content)

const weather = (url) => axios.get(url)
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

const fetchTickerData = ({ticker, name}) => yahooFinance.quote(ticker).then(quote => Object.assign(quote, {name: name ?? ticker}))

const tasks = (maxDueDays) => {
  const fetchTaskList = (taskList) => taskApi.tasks
    .list({
      tasklist: taskList.id,
      showCompleted: false,
      dueMax: dayjs().add(maxDueDays, 'days').format()
    })
    .then(res => res.data.items.map(task => Object.assign(task, {taskList: taskList.title})))

  return taskApi
    .tasklists.list()
    .then(res => Promise.all(res.data.items.map(fetchTaskList)))
    .then(tasks => tasks.flat())
}

const jobs = {
  weather: {
    run: () => weather(config.weather.url).then(board.renderWeather)
  },
  haiku: {
    run: () => haiku(config.haikuPrompt()).then(board.writeHaiku),
    check: (date) => !_.inRange(date.hour(), 2, 17) // Skip haikus between 2am and 5pm
  },
  stocks: {
    run: () => Promise.all(config.tickers.map(fetchTickerData)).then(board.tickerTape),
    check: (date) => _.inRange(date.hour(), 9, 17) && _.inRange(date.day(), 1, 6) //Weekdays, 9am to 5pm
  },
  // tasks: {
  //   run: () => tasks(config.googleTasks.maxDueDays).then(board.renderTasks)
  // },
  quotes: {
    run: () => board.displayQuotes(quotes.parse_json()),
    check: (date) => !jobs.stocks.check(date)
  }
}

//assert(_.sum(config.retryIntervalMinutes) < config.defaultRefreshMinutes, 'Retries must finish within defaultRefreshMinutes')
//assert(Object.values(jobs).filter(job => !job.check).length > 1, 'Must be >1 job without a checker!')

const run = (current) => _.chain(Object.entries(jobs))
  .filter(([id, job]) => id !== current && (!job.check || job.check(dayjs())))
  .sample()
  .thru(([id, job]) => job.run()
    .then(res => console.log(res))
    .catch(err => console.error(err))
    .finally(() => setTimeout(run, Math.max(job.displayFor ?? 0, config.defaultRefreshMinutes) * 60 * 1000, id))
  )
  .value()

// yolo
if (env.isProd) run()
else jobs.stocks.run()
