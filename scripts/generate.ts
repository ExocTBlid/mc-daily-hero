import { getCatalog } from '../src/lib/catalog'
import { generateDailyDeck } from '../src/lib/generate'

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

const date = flag('--date') ?? (process.env.DECK_DATE || undefined)
const force = process.argv.includes('--force') || process.env.DECK_FORCE === 'true'
const deck = await generateDailyDeck(getCatalog(), { date, force })
console.log(`${deck.date}  ${deck.hero_name}  ${deck.aspects.join('/')}  ${deck.source}  ${deck.title}`)
