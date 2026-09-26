import type { Catalog } from './catalog'
import { ASPECTS, type Aspect } from './types'

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
 * has appeared the same number of times. Extra forms count as their hero.
 */
export function pickHero(catalog: Catalog, date: string, used: Map<string, number>): string {
  const year = date.slice(0, 4)
  const codes = catalog.heroes.map((hero) => hero.code)
  const totals = new Map<string, number>()
  for (const [code, count] of used) {
    const identity = catalog.identityCode(code)
    totals.set(identity, (totals.get(identity) ?? 0) + count)
  }
  const order = shuffle(codes, `heroes-${year}`)
  const min = Math.min(...codes.map((code) => totals.get(code) ?? 0))
  const choice = order.find((code) => (totals.get(code) ?? 0) === min)
  if (!choice) throw new Error('No heroes in the card snapshot')
  return choice
}

/**
 * Deal the aspects this hero may play, preferring the ones furthest behind.
 * Ties follow a year-seeded order, so each aspect comes up once before any
 * aspect comes up again.
 */
export function pickAspects(
  catalog: Catalog,
  heroCode: string,
  date: string,
  used: Map<string, number>,
): Aspect[] {
  const hero = catalog.hero(heroCode)
  if (!hero) throw new Error(`Unknown hero ${heroCode}`)
  const choices = catalog.legalAspectChoices(hero)
  if (choices.length === 0) throw new Error(`No legal aspects for ${hero.name ?? heroCode}`)
  if (choices.length === 1) return choices[0]

  const rank = new Map(
    shuffle([...ASPECTS], `aspects-${date.slice(0, 4)}`).map((aspect, index) => [aspect, index]),
  )
  let best = choices[0]
  for (const choice of choices.slice(1)) {
    if (compareAspectChoice(choice, best, used, rank) < 0) best = choice
  }
  return [...best].sort((a, b) => ASPECTS.indexOf(a) - ASPECTS.indexOf(b))
}

function compareAspectChoice(
  left: readonly Aspect[],
  right: readonly Aspect[],
  used: Map<string, number>,
  rank: Map<Aspect, number>,
): number {
  const a = aspectKeys(left, used, rank)
  const b = aspectKeys(right, used, rank)
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) {
    if (!a[i]) return -1
    if (!b[i]) return 1
    if (a[i][0] !== b[i][0]) return a[i][0] - b[i][0]
    if (a[i][1] !== b[i][1]) return a[i][1] - b[i][1]
  }
  return 0
}

/** Least-used aspect first, then the year-seeded order. */
function aspectKeys(
  choice: readonly Aspect[],
  used: Map<string, number>,
  rank: Map<Aspect, number>,
): [number, number][] {
  return choice
    .map((aspect): [number, number] => [used.get(aspect) ?? 0, rank.get(aspect) ?? 0])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
}
