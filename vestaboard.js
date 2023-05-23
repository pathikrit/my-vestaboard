import BiMap from 'bidirectional-map'
import axios from 'axios'
import { mode } from 'mathjs'
import _ from 'lodash'
import assert from 'node:assert'
import { makeRetry } from './app.js'
import Table from 'cli-table'

Array.prototype.sortBy = function (arg) {return _.sortBy(this, arg)}
Array.prototype.chunked = function (arg) {return _.chunk(this, arg)}
Array.prototype.isDefinedAt = function (idx) {return _.inRange(idx, 0, this.length)}
_.memoize.Cache = Map

export class Vestaboard {
  static ROWS = 6
  static COLS = 22

  static nul = '␀'
  static charMap = new BiMap({ //TODO: Use https://github.com/sebbo2002/vestaboard/blob/develop/src/message.ts
    ' ': 0,
    'A': 1,
    'B': 2,
    'C': 3,
    'D': 4,
    'E': 5,
    'F': 6,
    'G': 7,
    'H': 8,
    'I': 9,
    'J': 10,
    'K': 11,
    'L': 12,
    'M': 13,
    'N': 14,
    'O': 15,
    'P': 16,
    'Q': 17,
    'R': 18,
    'S': 19,
    'T': 20,
    'U': 21,
    'V': 22,
    'W': 23,
    'X': 24,
    'Y': 25,
    'Z': 26,
    '1': 27,
    '2': 28,
    '3': 29,
    '4': 30,
    '5': 31,
    '6': 32,
    '7': 33,
    '8': 34,
    '9': 35,
    '0': 36,
    '!': 37,
    '@': 38,
    '#': 39,
    '$': 40,
    '(': 41,
    ')': 42,
    '-': 44,
    '+': 46,
    '&': 47,
    '=': 48,
    ';': 49,
    ':': 50,
    "'": 52,
    '"': 53,
    '%': 54,
    ',': 55,
    '.': 56,
    '/': 59,
    '?': 60,
    '°': 62,
    '🟥': 63,
    '🟧': 64,
    '🟨': 65,
    '🟩': 66,
    '🟦': 67,
    '🟪': 68,
    '⬜️': 69,
    '⬛️': 70,
    '␀': 71
  })

  constructor(rwKey) {
    this.api = axios.create({
      baseURL: 'https://rw.vestaboard.com',
      headers: {
        'Content-Type': 'application/json',
        'X-Vestaboard-Read-Write-Key': rwKey,
      }
    })
    makeRetry(this.api)
  }

  read = () => this.api.get('/')
    .catch(error => Promise.reject(error.toJSON()))
    .then(res => JSON.parse(res.data.currentMessage.layout).map(row => row.map(code => Vestaboard.charMap.getKey(code) ?? Vestaboard.nul).join('')))

  write = (msg, background = (r, c) => ' ') => {
    msg = msg.map(row => Array.from((_.isString(row) ? row : row.join('')).toUpperCase()))

    const result = new Array(Vestaboard.ROWS).fill(Vestaboard.nul).map(() => new Array(Vestaboard.COLS).fill(Vestaboard.nul))
    for (let r = 0; r < Vestaboard.ROWS; r++)
      for (let c = 0; c < Vestaboard.COLS; c++)
        result[r][c] = msg.isDefinedAt(r) && msg[r].isDefinedAt(c) && msg[r][c] !== Vestaboard.nul ? msg[r][c] : background(r, c)

    console.debug(result.map(row => row.join('')))

    const payload = result.map(row => row.map(c => Vestaboard.charMap.get(c) ?? Vestaboard.charMap.get(Vestaboard.nul)))
    return this.api.post('/', JSON.stringify(payload))
        .then(_ => console.log(new Table({rows: result}).toString()))
        .catch(error => Promise.reject(error.toJSON()))
  }

  debug = () => {
    const chars = Object.entries(Vestaboard.charMap.getObject())
      .sortBy(([letter, code]) => code)
      .flatMap(([letter, code]) => [letter, (code%10).toString()])
      .chunked(Vestaboard.COLS)
    return this.write(chars)
  }

  writeHaiku = (haiku) => {
    const rainbow = ['🟥', '🟧', '🟨', '🟩', '🟦', '🟪']
    const r = () => _.random(rainbow.length-1)
    let b1 = r(), b2 = r()
    while (b2 === b1) b2 =  r()

    const result = haiku
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .flatMap(line => {
        assert(line.length <= 2*(Vestaboard.COLS - 2), `LINE=[${line}] is too long`)
        if (line.length <= Vestaboard.COLS - 2) return [line]
        let breakIdx = line.indexOf(', ')
        if (breakIdx < 0) breakIdx = line.indexOf(' ', Vestaboard.COLS/2)
        assert(breakIdx >= 0, `Could not split LINE=[${line}]`)
        return [line.substring(0, breakIdx+1), line.substring(breakIdx+1)]
      })
      .map(line => line.trim())
      .map(line => Vestaboard.nul.repeat(Math.max(Vestaboard.COLS - line.length, 0)/2) + line)
    if (result.length <= 4) result.unshift(Vestaboard.nul)

    assert(result.length <= Vestaboard.ROWS, `Too many lines in ${result}`)

    return this.write(result, (r, c) => (r+c)%2 === 0 ? rainbow[b1] : rainbow[b2])
  }

  static normalizeWeather = _.memoize((description) => {
    const msgLength = Vestaboard.COLS - (3+4+1+1)
    const normalizers = [
      {to: '&', from: ['And']},
      {to: '', from: ['Increasing', 'Becoming', 'Decreasing', 'Gradual', 'Patchy', 'Areas', 'Freezing']},
      {to: 'Slight', from: ['Slight Chance', 'Chance', 'Isolated', 'Scattered']},
      {to: 'Rain', from: ['Rain Showers', 'Spray', 'Rain Fog', 'Showers']},
      {to: 'Snow', from: ['Snow Showers', 'Wintry Mix', 'Flurries']},
      {to: 'Light ', from: ['Lt ']},
      {to: 'Tstms ', from: ['Thunderstorms']}
    ]
    description = description.split('/')[0]
    for (const {to, from} of normalizers)
      for (const token of from)
        description = description.replace(token, to) //TODO: regex this
    return description
      .split(/[^A-Za-z]/)
      .reduce((msg, token) => (msg + ' ' + token).length <= msgLength ? (msg + ' ' + token) : msg.padEnd(msgLength, ' '))
  })

  renderWeather = (forecast) => {
    // https://github.com/vbguyny/ws4kp/blob/578d62a255cbae885fd3c3e840eed19d7a0bf434/Scripts/Icons.js#L124
    const iconToKeyword = {
      '🟥': ['Hot'],
      '🟧': ['Sunny', 'Clear', 'Fair'],
      '🟩': ['Windy', 'Breezy', 'Blustery'],
      '🟪': ['Frost', 'Cold'],
      '⬛': ['Cloud', 'Haze', 'Overcast', 'Fog', 'Smoke', 'Ash', 'Dust', 'Sand', 'Tstms'],
      '🟦': ['Sleet', 'Spray', 'Rain', 'Shower', 'Spouts'],
      '⬜️': ['Snow', 'Ice', 'Blizzard']
    }
    const result = forecast
      .sortBy(row => row.date.valueOf())
      .slice(0, Vestaboard.ROWS)
      .map(row => {
        const description = mode(row.descriptions.map(Vestaboard.normalizeWeather))[0]
        let icon = _.findKey(iconToKeyword, kws => kws.some(kw => description.includes(kw)))
        if (row.date.isToday() && row.endHour === 23 && icon && icon !== '⬜️') icon = '⬛' // Show either Night or Snow in night
        return [
          row.date.format('ddd'),
          row.temperature.toString().padStart(4, ' '),
          icon ?? '?',
          ' ',
          description
        ].join('')
      })
    console.debug('Normalization', Object.fromEntries(Vestaboard.normalizeWeather.cache))

    return this.write(result)
  }

  tickerTape = (quotes) => {
    let result = quotes
      .sortBy(quote => Math.abs(quote.pctChange))
      .slice(0, 2*Vestaboard.ROWS)
      .sortBy(quote => quote.name)
      .sortBy(quote => quote.name.length > 4) // Makes sure 5 letter tickers are on the right column
      .map(({name, pctChange}, idx) =>
        [
          name.padEnd(idx < Vestaboard.ROWS ? 4 : 5, ' '),
          pctChange < 0 ? '🟥' : '🟩',
          pctChange.toFixed(pctChange > -10 ? 1 : 0).padStart(4, ' '),
          '%'
        ].join('')
      )
    result = _.zipWith(result.slice(0, Vestaboard.ROWS), result.slice(Vestaboard.ROWS).sort(), (l, r) => l + ' ' + r)
    return this.write(result)
  }

  renderTasks = (tasks) => {
    const icon = (taskList) => {
      if (taskList.includes('Aidan')) return '🟦'
      if (taskList.includes('Home')) return '🟩'
      if (taskList.includes('Nastya')) return '🟪'
      if (taskList.includes('Rick')) return '⬛'
    }
    const result = _.shuffle(tasks)
      .map(task => Object.assign(task, {icon: icon(task.taskList)}))
      .filter(task => task.icon)
      .slice(0, Vestaboard.ROWS)
      .map(({icon, title}) => icon + title)
    return this.write(result)
  }
}
