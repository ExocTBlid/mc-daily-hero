import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCatalog } from '../src/lib/catalog'
import { pacificDate, pickAspects, pickHero } from '../src/lib/rotation'
import { CORE_ASPECTS, type DeckSlots } from '../src/lib/types'
import { validateDeck } from '../src/lib/validate'

const catalog = loadCatalog()

type Fixture = {
  id: number
  name: string
  hero_code: string
  aspects: string[]
  slots: DeckSlots
}

const fixtureDir = path.resolve(process.cwd(), 'test/fixtures')
const fixtures = readdirSync(fixtureDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(path.join(fixtureDir, name), 'utf8')) as Fixture)

describe('published decks', () => {
  for (const fixture of fixtures) {
    it(`${fixture.name} is legal`, () => {
      const errors = validateDeck(catalog, fixture)
      expect(errors).toEqual([])
    })
  }
})

describe('rejected decks', () => {
  const cap = fixtures.find((fixture) => fixture.id === 66816)
  if (!cap) throw new Error('missing Captain America fixture')

  it('requires the hero kit', () => {
    const hero = catalog.hero(cap.hero_code)!
    const signature = catalog.signatureCards(hero).find((card) => !card.permanent)!
    const slots = { ...cap.slots }
    slots[signature.code] = (slots[signature.code] ?? 1) - 1
    if (slots[signature.code] <= 0) delete slots[signature.code]
    const errors = validateDeck(catalog, { ...cap, slots })
    expect(errors.some((error) => error.includes(signature.name!))).toBe(true)
  })

  it('rejects a second aspect', () => {
    const justice = [...catalog.byCode.values()].find(
      (card) => card.faction_code === 'justice' && card.type_code === 'event' && card.name && !card.duplicate_of,
    )!
    const slots = { ...cap.slots, [justice.code]: 1 }
    const errors = validateDeck(catalog, { ...cap, slots })
    expect(errors.some((error) => error.includes('not legal'))).toBe(true)
  })

  it('rejects a 39-card deck', () => {
    const hero = catalog.hero(cap.hero_code)!
    const spare = Object.entries(cap.slots).find(([code, qty]) => {
      const card = catalog.resolve(code)
      return qty > 1 && card && !card.permanent && card.set_code !== hero.set_code
    })!
    const slots = { ...cap.slots, [spare[0]]: spare[1] - 1 }
    const errors = validateDeck(catalog, { ...cap, slots })
    expect(errors.some((error) => error.includes('minimum'))).toBe(true)
  })

  it('rejects a fourth copy', () => {
    const triple = Object.entries(cap.slots).find(([code, qty]) => qty === 3 && (catalog.resolve(code)?.deck_limit ?? 3) === 3)!
    const slots = { ...cap.slots, [triple[0]]: 4 }
    const errors = validateDeck(catalog, { ...cap, slots })
    expect(errors.some((error) => error.includes('limited to 3'))).toBe(true)
  })
})

describe('the day', () => {
  it('rolls over at midnight Pacific', () => {
    expect(pacificDate(new Date('2026-01-15T07:30:00Z'))).toBe('2026-01-14')
    expect(pacificDate(new Date('2026-01-15T08:30:00Z'))).toBe('2026-01-15')
    expect(pacificDate(new Date('2026-07-15T06:30:00Z'))).toBe('2026-07-14')
    expect(pacificDate(new Date('2026-07-15T07:30:00Z'))).toBe('2026-07-15')
  })

  it('uses every hero once before it repeats', () => {
    const used = new Map<string, number>()
    const picked: string[] = []
    for (let i = 0; i < catalog.heroes.length; i++) {
      const hero = pickHero(catalog, '2026-06-01', used)
      picked.push(hero)
      used.set(hero, (used.get(hero) ?? 0) + 1)
    }
    expect(new Set(picked).size).toBe(catalog.heroes.length)
    expect(pickHero(catalog, '2026-06-01', used)).toBe(picked[0])
  })

  it('deals aspects the hero is allowed to play', () => {
    const cap = catalog.heroes.find((hero) => hero.name === 'Captain America')!
    const warlock = catalog.heroes.find((hero) => hero.name === 'Adam Warlock')!
    const spider = catalog.heroes.find((hero) => hero.name === 'Spider-Woman')!
    expect(pickAspects(catalog, cap.code, '2026-09-24')).toHaveLength(1)
    expect(pickAspects(catalog, warlock.code, '2026-09-24')).toEqual([...CORE_ASPECTS])
    expect(pickAspects(catalog, spider.code, '2026-09-24')).toHaveLength(2)
    expect(pickAspects(catalog, cap.code, '2026-09-24')).toEqual(pickAspects(catalog, cap.code, '2026-09-24'))
  })
})

describe('hero kits', () => {
  it('leaves room to reach a 40-card deck', () => {
    for (const hero of catalog.heroes) {
      const live = catalog
        .signatureCards(hero)
        .filter((card) => !card.permanent)
        .reduce((sum, card) => sum + (card.quantity ?? 1), 0)
      expect(live).toBeGreaterThanOrEqual(10)
      expect(live).toBeLessThanOrEqual(25)
    }
  })
})
