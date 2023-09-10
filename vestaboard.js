import BiMap from 'bidirectional-map'
import axios from 'axios'
import {mode} from 'mathjs'
import _ from 'lodash'
import assert from 'node:assert'
import {makeRetry} from './app.js'
import Table from 'cli-table'
import wrap from 'word-wrap'

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
    '⬜': 69,
    '⬛': 70,
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
        result[r][c] = r in msg && c in msg[r] && msg[r][c] !== Vestaboard.nul ? msg[r][c] : background(r, c)

    console.debug(result.map(row => row.join('')))

    const payload = result.map(row => row.map(c => Vestaboard.charMap.get(c) ?? Vestaboard.charMap.get(Vestaboard.nul)))
    return this.api.post('/', JSON.stringify(payload)).then(_ => new Table({rows: result}).toString())
  }

  debug = () => {
    const chars = _.chain(Object.entries(Vestaboard.charMap.getObject()))
      .sortBy(([_, code]) => code)
      .flatMap(([letter, code]) => [letter, (code%10).toString()])
      .chunk(Vestaboard.COLS)
      .value()
    return this.write(chars)
  }

  static center = (line) => Vestaboard.nul.repeat(Math.max(Vestaboard.COLS - line.length, 0)/2) + line

  writeHaiku = (haiku) => {
    const result = _.chain(haiku.split('\n'))
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .flatMap(line => {
        assert(line.length <= 2*(Vestaboard.COLS - 2), `LINE=[${line}] is too long`)
        if (line.length <= Vestaboard.COLS - 2) return [line]
        let breakIdx = line.indexOf(', ')
        if (breakIdx < 0) breakIdx = line.indexOf(' ', Vestaboard.COLS/2)
        assert(breakIdx > 1, `Could not split LINE=[${line}]`)
        return [line.substring(0, breakIdx+1), line.substring(breakIdx+1)]
      })
      .map(line => line.trim())
      .map(Vestaboard.center)
      .tap(result => {
        if (result.length <= 4) result.unshift(Vestaboard.nul)
        assert(result.length <= Vestaboard.ROWS, `Too many lines in ${result}`)
      })
    const colors = _.sampleSize(['🟥', '🟧', '🟨', '🟩', '🟦', '🟪'], 2)
    return this.write(result.value(), (r, c) => colors[(r+c)%colors.length])
  }

  static normalizeWeather = _.memoize((description) => {
    const msgLength = Vestaboard.COLS - (3+4+1+1)
    const normalizers = [
      {to: '&', from: ['And']},
      {to: '', from: ['Increasing', 'Becoming', 'Decreasing', 'Gradual', 'Patchy', 'Areas', 'Freezing']},
      {to: 'Slight', from: ['Slight Chance', 'Slight Chance Light', 'Chance', 'Isolated', 'Scattered']},
      {to: 'Rain', from: ['Rain Showers', 'Spray', 'Rain Fog', 'Showers']},
      {to: 'Snow', from: ['Snow Showers', 'Wintry Mix', 'Flurries']},
      {to: 'Light ', from: ['Lt ']},
      {to: 'Tstms ', from: ['Thunderstorms']}
    ].map(({to, from}) => (s) => s.replaceAll(new RegExp(from.join('|'), 'g'), to))
    return normalizers
      .reduce((d, f) => f(d), description)
      .split(/[^A-Za-z]/)
      .reduce((msg, token) => ((msg + ' ' + token).length <= msgLength ? (msg + ' ' + token) : msg.padEnd(msgLength, ' ')).trim())
  })

  renderWeather = (forecast) => {
    const result = _.chain(forecast)
      .sortBy(row => row.date.valueOf())
      .slice(0, Vestaboard.ROWS)
      .map(row => {
        // https://github.com/vbguyny/ws4kp/blob/578d62a255cbae885fd3c3e840eed19d7a0bf434/Scripts/Icons.js#L124
        const description = mode(row.descriptions.map(Vestaboard.normalizeWeather))[0]
        const icon = () => {
          let sunny = '🟪'
          if (row.temperature >= 40) sunny = '🟩'
          if (row.temperature >= 55) sunny = '🟨'
          if (row.temperature >= 70) sunny = '🟧'
          if (row.temperature >= 80) sunny = '🟥'
          const isTonight = row.date.isToday() && row.endHour === 23
          const table = [
            ['🟥', ['Hot']],
            [isTonight ? '⬛' : '🟧', ['Dust', 'Sand']],
            [isTonight ? '⬛' : sunny, ['Sunny', 'Clear', 'Fair', 'Haze']],
            [isTonight ? '⬛' : '🟩', ['Windy', 'Breezy', 'Blustery']],
            ['🟪', ['Frost', 'Cold']],
            ['⬛', ['Cloud', 'Overcast', 'Fog', 'Smoke', 'Ash', 'Tstms']],
            ['🟦', ['Sleet', 'Spray', 'Rain', 'Shower', 'Spouts']],
            ['⬜', ['Snow', 'Ice', 'Blizzard']]
          ]
          return _.head(table.find(([_, kws]) => kws.some(kw => description.includes(kw))))
        }
        return [
          row.date.format('ddd'),
          row.temperature.toString().padStart(4, ' '),
          icon() ?? Vestaboard.nul,
          ' ',
          description
        ].join('')
      })
      .tap(_ => console.debug('Normalization', Object.fromEntries(Vestaboard.normalizeWeather.cache)))

    return this.write(result.value())
  }

  tickerTape = (quotes) => {
    const f = _.sample([this.ticker1Cols, this.ticker2Cols])
    return f(_.chain(quotes).sortBy(quote => -Math.abs(quote.regularMarketChangePercent)))
  }

  ticker1Cols = (quotes) => {
    const result = quotes
      .slice(0, Vestaboard.ROWS)
      .map(quote => _.set(quote, 'price', (quote.regularMarketPrice < 10000 ? quote.regularMarketPrice.toFixed(2) : quote.regularMarketPrice.toLocaleString('en-US', {maximumFractionDigits: 0}))))
      .map(({name, regularMarketChangePercent: pctChange, price}) =>
        [
          name.padEnd(5, ' '),
          pctChange < 0 ? '🟥' : '🟩',
          pctChange.toFixed(2).padStart(6, ' '),
          '% ',
          ('$' + price).padStart(Vestaboard.COLS-(5+1+6+2), ' ')
        ].join('')
      )
    return this.write(result.value())
  }

  ticker2Cols = (quotes) => {
    const result = quotes
      .slice(0, 2 * Vestaboard.ROWS)
      .sortBy(quote => quote.name.length > 4) // Makes sure 5 letter tickers are on the right column
      .map(({name, regularMarketChangePercent: pctChange}, idx) => Object.assign({pctChange}, {
          display: [
            name.padEnd(idx < Vestaboard.ROWS ? 4 : 5, ' '),
            pctChange < 0 ? '🟥' : '🟩',
            pctChange.toFixed(pctChange > -10 ? 1 : 0).padStart(4, ' '),
            '%'
          ].join('')
       }))
      .thru(result => _.chunk(result, Vestaboard.ROWS).map(col => _.sortBy(col, quote => -Math.abs(quote.pctChange))))
      .thru(([left, right]) => _.zipWith(left, right, (l, r) => l.display + ' ' + r.display))
    return this.write(result.value())
  }

  renderTasks = (tasks) => {
    const icon = (taskList) => {
      if (taskList.includes('Aidan')) return '🟦'
      if (taskList.includes('Home')) return '🟩'
      if (taskList.includes('Nastya')) return '🟨'
      if (taskList.includes('Rick')) return '🟪'
    }
    const result = _.chain(tasks)
      .map(task => Object.assign(task, {icon: icon(task.taskList)}))
      .filter(task => task.icon)
      .sampleSize(Vestaboard.ROWS)
      .map(({icon, title, notes}) => icon + title + (notes ? ': ' + notes.replace('\n', ' ').replace(/[^a-z]+/gi, ' ').trim() : ''))
    return this.write(result.value())
  }

  displayQuotes = (quotes) => {
    const result = _.chain(quotes)
      .map(quote => Object.assign(quote, {lines: wrap(quote.text, {width: Vestaboard.COLS-2}).split('\n').map(line => line.trim())}))
      .filter(({author, lines}) => lines.length < Vestaboard.ROWS && (author.length+2) < Vestaboard.COLS-2)
      .sample()
      .thru(({author, lines}) => {
        const z = Vestaboard.nul, attr = '- ' + author
        switch (lines.length) {
          case 1: return [z, ...lines, z, z, attr, z]
          case 2: return [z, ...lines, z, attr, z]
          case 3: return [...lines, z, attr, z]
          case 4: return [...lines, z, attr]
          case 5: return [...lines, attr]
        }
      })
      .thru(lines => lines.map(Vestaboard.center))
    const colors = _.sampleSize(['🟥', '🟧', '🟨', '🟩', '🟦', '🟪'], 2)
    return this.write(result.value(), (r, c) => _.inRange(c, 1, Vestaboard.COLS-1) ? ' ' : colors[(r+c)%colors.length])
  }
}
