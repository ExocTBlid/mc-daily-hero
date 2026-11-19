import type { Catalog } from './catalog'
import { ASPECTS, type Aspect } from './types'

/**
 * First day of the smaller pool share. Earlier days split all five aspects
 * evenly, and every aspect finished that stretch tied, so they stay out of
 * this count. Counting them would treat pool as months ahead of a 5% share.
 */
export const ASPECT_SHARE_SINCE = '2026-11-20'

/** Days that count toward the current aspect share. */
export function datesInAspectShare(dates: readonly string[]): string[] {
  return dates.filter((day) => day >= ASPECT_SHARE_SINCE)
}

/**
 * Relative share of days. The four main aspects take 19 eightieths each.
 * Pool takes 4 eightieths, which is one day in twenty.
 */
const ASPECT_WEIGHT: Record<Aspect, number> = {
  aggression: 19,
  justice: 19,
  leadership: 19,
  protection: 19,
  pool: 4,
}

/** Scale that makes count/weight an integer for both weights. */
const WEIGHT_SCALE = 76

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
 * Deal the aspects this hero may play, preferring the ones furthest behind
 * their share. Ties follow a year-seeded order. When two aspects are equally
 * far behind, the more common one is dealt first, so pool waits out a tie.
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
    for (let part = 0; part < a[i].length; part++) {
      if (a[i][part] !== b[i][part]) return a[i][part] - b[i][part]
    }
  }
  return 0
}

/**
 * Furthest behind its share first. The key is count/weight, then the more
 * common aspect, then the year-seeded order.
 */
function aspectKeys(
  choice: readonly Aspect[],
  used: Map<string, number>,
  rank: Map<Aspect, number>,
): [number, number, number][] {
  return choice
    .map((aspect): [number, number, number] => {
      const weight = ASPECT_WEIGHT[aspect]
      return [(used.get(aspect) ?? 0) * (WEIGHT_SCALE / weight), -weight, rank.get(aspect) ?? 0]
    })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
}
