
const haiku = `
Aidan laughs, pure joy,
In small hands, world's wonder held,
Life's dawn, boy unfolds.
`

const COLS = 22
const ROWS = 6

const format_haiku = (haiku, border) => {
  const rainbow = ['🟥', '🟧', '🟨', '🟩', '🟦', '🟪']
  const r = () => Math.floor(rainbow.length * Math.random())
  let b1 = r(), b2 = r()
  while (b2 === b1) b2 =  r()

  const result = new Array(ROWS).fill(' ').map(() => new Array(COLS).fill(' '))
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      result[r][c] = (r+c)%2 === 0 ? rainbow[b1] : rainbow[b2]

  const nul = '␀'

  const lines = haiku
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .flatMap(line => {
      console.assert(line.length <= 2*(COLS - 2), `LINE=[${line}] is too long`)
      if (line.length <= COLS - 2) return [line]
      const breakIdx = line.indexOf(', ')
      console.assert(breakIdx >= 0, `Could not split LINE=[${line}]`)
      return [line.substring(0, breakIdx+1), line.substring(breakIdx+1)]
    })
    .map(line => line.trim())
    .map(line => {
      const spaces = COLS - line.length
      return Array.from(nul.repeat(spaces/2) + line + nul.repeat((spaces+1)/2))
    })
  console.assert(lines.length <= ROWS, `Too many lines in ${lines}`)

  for (let r = 0; r < lines.length; r++)
    for (let c = 0; c < lines[r].length; c++)
      if (lines[r][c] !== nul) result[r + (lines.length > 4 ? 0 : 1)][c] = lines[r][c]

  return result.map(row => String(row))
}

console.log('🟥🟧🟨🟩🟦🟪');
console.log(format_haiku(haiku))