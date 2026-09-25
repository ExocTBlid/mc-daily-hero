import type { Catalog } from './catalog'
import type { Aspect } from './types'

/** Calendar date in America/Los_Angeles, YYYY-MM-DD. */
export function pacificDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function hashString(value: string): number {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let next = Math.imul(state ^ (state >>> 15), 1 | state)
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], seed: string): T[] {
  const order = [...items]
  const random = mulberry32(hashString(seed))
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/**
 * Walk a year-seeded hero order. Nobody appears again until every hero
 * has appeared the same number of times.
 */
export function pickHero(catalog: Catalog, date: string, used: Map<string, number>): string {
  const year = date.slice(0, 4)
  const codes = catalog.heroes.map((hero) => hero.code)
  const order = shuffle(codes, `heroes-${year}`)
  const min = Math.min(...codes.map((code) => used.get(code) ?? 0))
  const choice = order.find((code) => (used.get(code) ?? 0) === min)
  if (!choice) throw new Error('No heroes in the card snapshot')
  return choice
}

export function pickAspects(catalog: Catalog, heroCode: string, date: string): Aspect[] {
  const hero = catalog.hero(heroCode)
  if (!hero) throw new Error(`Unknown hero ${heroCode}`)
  const choices = catalog.legalAspectChoices(hero)
  const random = mulberry32(hashString(`${date}:${heroCode}`))
  const index = Math.floor(random() * choices.length)
  return choices[index]
}
