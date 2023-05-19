import BiMap from 'bidirectional-map'
import axios from 'axios'
import { mode } from 'mathjs'
import _ from 'lodash'
import assert from 'node:assert'

Array.prototype.sortBy = function (arg) {return _.sortBy(this, arg)}
Array.prototype.chunked = function (arg) {return _.chunk(this, arg)}

export class Vestaboard {
  static ROWS = 6
  static COLS = 22

  static charMap = new BiMap({
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
    '▮': 71
  })

  constructor({rwKey}) {
    this.api = axios.create({
      baseURL: 'https://rw.vestaboard.com',
      headers: {
        'Content-Type': 'application/json',
        'X-Vestaboard-Read-Write-Key': rwKey,
      }
    })
  }

  read = () => this.api.get('/')
    .catch(error => Promise.reject(error.toJSON()))
    .then(res => JSON.parse(res.data.currentMessage.layout).map(row => row.map(code => Vestaboard.charMap.getKey(code)).join('')))

  write = (msg) => {
    assert(msg.length === Vestaboard.ROWS && msg.every(row => row.length === Vestaboard.COLS), `Message must be ${Vestaboard.ROWS}x${Vestaboard.COLS} but is ${msg.length}x${msg.map(row => row.length)}`)
    console.log(msg.map(row => row.join('').toUpperCase()))
    const payload = msg.map(row => row.map(c => Vestaboard.charMap.get(c.toUpperCase()) ?? 0))
    return this.api.post('/', JSON.stringify(payload)).catch(error => Promise.reject(error.toJSON()))
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
    const r = () => Math.floor(rainbow.length * Math.random())
    let b1 = r(), b2 = r()
    while (b2 === b1) b2 =  r()

    const result = new Array(Vestaboard.ROWS).fill(' ').map(() => new Array(Vestaboard.COLS).fill(' '))
    for (let r = 0; r < Vestaboard.ROWS; r++)
      for (let c = 0; c < Vestaboard.COLS; c++)
        result[r][c] = (r+c)%2 === 0 ? rainbow[b1] : rainbow[b2]

    const nul = '␀'

    const lines = haiku
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
      .map(line => {
        const spaces = Vestaboard.COLS - line.length
        return Array.from(nul.repeat(spaces/2) + line + nul.repeat((spaces+1)/2))
      })
    assert(lines.length <= Vestaboard.ROWS, `Too many lines in ${lines}`)

    for (let r = 0; r < lines.length; r++)
      for (let c = 0; c < lines[r].length; c++)
        if (lines[r][c] !== nul) result[r + (lines.length > 4 ? 0 : 1)][c] = lines[r][c]

    return this.write(result)
  }

  renderWeather = (forecast) => {
    const msgLength = Vestaboard.COLS - (3+4+1+1)

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
    const normalize = description => description
      .split('/')[0]
      .replace('Increasing', '')
      .replace('Becoming', '')
      .replace('Decreasing', '')
      .replace('Gradual', '')
      .replace('Patchy', '')
      .replace('Areas', '')
      .replace('Slight Chance', 'Slight')
      .replace('Chance', 'Slight')
      .replace('Isolated', 'Slight')
      .replace('Freezing', '')
      .replace('Rain Showers', 'Rain')
      .replace('Drizzle', 'Rain')
      .replace('Lt ', 'Light ')
      .replace('Rain Fog', 'Rain')
      .replace('Spray', 'Rain')
      .replace('Snow Showers', 'Snow')
      .replace('Wintry Mix', 'Snow')
      .replace('Flurries', 'Snow')
      .replace('Scattered', 'Slight')
      .replace('Thunderstorms', 'Tstsm')
      .split(/[^A-Za-z]/)
      .reduce((msg, token) => (msg + ' ' + token).length <= msgLength ? (msg + ' ' + token) : msg.padEnd(msgLength, ' '))

    const result = forecast
      .sortBy(row => row.date.valueOf())
      .slice(0, Vestaboard.ROWS)
      .map(row => {
        const description = mode(row.descriptions.map(normalize))[0]
        let icon = _.findKey(iconToKeyword, kws => kws.some(kw => description.includes(kw)))
        if (row.date.isToday() && row.endHour === 23 && icon && icon !== '⬜️') icon = '⬛' // Show either Night or Snow in night
        return [
          row.date.format('ddd'),
          row.temperature.toString().padStart(4, ' '),
          icon ?? '?',
          ' ',
          description.padEnd(msgLength, ' ')
        ].join('')
      })
    return this.write(result.map(row => Array.from(row)))
  }

  tickerTape = (quotes) => {
    const result = quotes
      .sortBy(quote => quote.name)
      .map(({name, pctChange}) =>
        [
          name.padEnd(4, ' '),
          pctChange < 0 ? '🟥' : '🟩',
          pctChange.toFixed(pctChange > -10 ? 1 : 0).padStart(4, ' '),
          '%'
        ].join('')
      )
      .chunked(2)
      .map(row => row.join('  '))
    return this.write(result.map(row => Array.from(row)))
  }
}
