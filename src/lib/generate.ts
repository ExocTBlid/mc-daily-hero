import OpenAI from 'openai'
import type { Catalog } from './catalog'
import { heroCounts, loadDeck, writeDeck } from './decks'
import { decklistUrl, findPublicDecks, type PublicDeck } from './public-decks'
import { pacificDate, pickAspects, pickHero } from './rotation'
import { formatShortlist, shortlist } from './shortlist'
import { validateDeck } from './validate'
import type { DeckSlots, SavedDeck } from './types'

const MODEL = process.env.DECK_MODEL || 'grok-4.5'
const ATTEMPTS = 3

export type GenerateOptions = {
  date?: string
  force?: boolean
  now?: Date
}

export async function generateDailyDeck(catalog: Catalog, options: GenerateOptions = {}): Promise<SavedDeck> {
  const date = options.date ?? pacificDate(options.now ?? new Date())
  const existing = loadDeck(date)
  if (existing && !options.force) return existing

  const heroCode = pickHero(catalog, date, heroCounts())
  const hero = catalog.hero(heroCode)
  if (!hero?.name) throw new Error(`Hero ${heroCode} has no name`)
  const aspects = pickAspects(catalog, heroCode, date)
  const rows = shortlist(catalog, heroCode, aspects)
  const lists = formatShortlist(rows)
  const examples = await findPublicDecks(catalog, heroCode, date, 2, 21).catch(() => [])

  let slots: DeckSlots | null = null
  let title = ''
  let summary = ''
  let errors: string[] = []

  if (!process.env.XAI_API_KEY) {
    errors = ['XAI_API_KEY is not set']
  } else {
    const client = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' })
    let correction = ''
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const raw = await ask(client, buildPrompt(hero.name, aspects, lists, examples, correction))
      const parsed = parseModelDeck(raw)
      if (!parsed) {
        errors = ['Reply was not the JSON object requested']
        correction = errors[0]
        continue
      }
      title = parsed.title
      summary = parsed.summary
      slots = parsed.slots
      errors = validateDeck(catalog, { hero_code: heroCode, aspects, slots })
      if (errors.length === 0) break
      correction = errors.join('\n')
      slots = null
    }
  }

  if (slots && errors.length === 0) {
    const deck: SavedDeck = {
      date,
      title: title || `${hero.name} deck`,
      hero_code: heroCode,
      hero_name: hero.name,
      aspects,
      summary,
      slots,
      source: 'generated',
      fallback_decklist_id: null,
      card_data_rev: catalog.rev,
    }
    writeDeck(deck)
    return deck
  }

  const fallback = (await findPublicDecks(catalog, heroCode, date, 1, 90).catch(() => []))[0]
  if (!fallback) {
    throw new Error(
      `No legal deck for ${hero.name} on ${date}.\n${errors.join('\n') || 'The model was not called.'}`,
    )
  }
  const deck: SavedDeck = {
    date,
    title: fallback.name,
    hero_code: heroCode,
    hero_name: hero.name,
    aspects: fallback.aspects,
    summary: `Today's list is a published MarvelCDB deck, “${fallback.name}”. A generated list for this hero did not pass the legality check.`,
    slots: fallback.slots,
    source: 'marvelcdb',
    fallback_decklist_id: fallback.id,
    card_data_rev: catalog.rev,
  }
  writeDeck(deck)
  return deck
}

function buildPrompt(
  heroName: string,
  aspects: string[],
  lists: { required: string; pool: string },
  examples: PublicDeck[],
  correction: string,
): string {
  const exampleText = examples
    .map((deck) => {
      const lines = Object.entries(deck.slots)
        .map(([code, qty]) => `${qty}x ${code}`)
        .join(', ')
      return `${deck.name} (${deck.aspects.join(' / ')}): ${lines}`
    })
    .join('\n')

  return [
    `Build one Marvel Champions player deck for ${heroName}.`,
    `Aspects: ${aspects.join(', ')}.`,
    `The deck must contain every required card at the exact quantity shown. Permanents are required and do not count toward the 40–50 card size. Every other card must come from the pool. Stay at or under each card's max.`,
    `Give the deck a thwart plan, a damage plan, and some economy. The summary is your own two or three sentences. Do not quote card text.`,
    `Reply with JSON only: {"title":"...","summary":"...","slots":{"code":1}}`,
    ``,
    `Required cards:`,
    lists.required,
    ``,
    `Card pool (code | faction type | cost | max | name | traits):`,
    lists.pool,
    exampleText ? `\nRecent legal lists for this hero, as shape examples only:\n${exampleText}` : '',
    correction ? `\nThe previous list was illegal. Fix every line:\n${correction}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function ask(client: OpenAI, prompt: string): Promise<string> {
  const response = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: 'system',
        content:
          'You build legal Marvel Champions decks. Reply with one JSON object and no markdown. Slots map a card code to an integer quantity.',
      },
      { role: 'user', content: prompt },
    ],
  })
  return response.output_text
}

function parseModelDeck(raw: string): { title: string; summary: string; slots: DeckSlots } | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      title?: unknown
      summary?: unknown
      slots?: Record<string, unknown>
    }
    if (!parsed.slots || typeof parsed.slots !== 'object') return null
    const slots: DeckSlots = {}
    for (const [code, qty] of Object.entries(parsed.slots)) {
      if (typeof qty !== 'number' || !Number.isInteger(qty)) return null
      slots[code] = qty
    }
    return {
      title: typeof parsed.title === 'string' ? parsed.title.trim().slice(0, 80) : '',
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 600) : '',
      slots,
    }
  } catch {
    return null
  }
}

export { decklistUrl }
