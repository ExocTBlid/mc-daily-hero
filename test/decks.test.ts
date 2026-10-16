import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCatalog } from '../src/lib/catalog'
import { pacificDate, pickAspects, pickHero } from '../src/lib/rotation'
import { ASPECTS, CORE_ASPECTS, PLAYER_TYPES, type DeckSlots } from '../src/lib/types'
import { preferredSizeError, validateDeck } from '../src/lib/validate'

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

  it('rejects a named aspect that has no cards', () => {
    const hero = catalog.hero(cap.hero_code)!
    const slots = Object.fromEntries(
      Object.entries(cap.slots).filter(([code]) => {
        const card = catalog.resolve(code)
        return card?.faction_code !== 'leadership' || card.set_code === hero.set_code
      }),
    )
    const errors = validateDeck(catalog, { ...cap, slots })
    expect(errors.some((error) => error.includes('no Leadership cards'))).toBe(true)
  })

  it('counts a signature aspect card toward the named aspect', () => {
    const hero = catalog.hero('04031a')!
    const slots: DeckSlots = {}
    for (const card of catalog.signatureCards(hero)) slots[card.code] = card.quantity ?? 1
    const errors = validateDeck(catalog, { hero_code: hero.code, aspects: ['justice', 'pool'], slots })
    expect(errors.some((error) => error.includes('no Pool cards'))).toBe(true)
    expect(errors.some((error) => error.includes('no Justice cards'))).toBe(false)
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

describe('restricted allowance', () => {
  const venom = fixtures.find((fixture) => fixture.hero_code === '20001a')
  if (!venom) throw new Error('missing Venom fixture')

  it('lets Venom run more than two restricted cards', () => {
    // Venom's own kit forces three restricted cards (Multi-Gun + two Venom's
    // Pistols), which a flat two-card cap would reject outright.
    expect(validateDeck(catalog, venom)).toEqual([])
  })

  it('still rejects going past the raised cap', () => {
    // Swap a basic for a second Sonic Rifle to push restricted cards over
    // Venom's allowance of four (base two, +1 identity, +1 Side Holster).
    const slots = { ...venom.slots, '20015': 2 }
    delete slots['01093']
    const errors = validateDeck(catalog, { ...venom, slots })
    expect(errors.some((error) => error.includes('restricted'))).toBe(true)
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
    const used = new Map<string, number>()
    expect(pickAspects(catalog, cap.code, '2026-09-24', used)).toHaveLength(1)
    expect(pickAspects(catalog, warlock.code, '2026-09-24', used)).toEqual([...CORE_ASPECTS])
    expect(pickAspects(catalog, spider.code, '2026-09-24', used)).toHaveLength(2)
    expect(pickAspects(catalog, cap.code, '2026-09-24', used)).toEqual(pickAspects(catalog, cap.code, '2026-09-24', used))
  })

  it('uses every aspect once before it repeats', () => {
    const cap = catalog.heroes.find((hero) => hero.name === 'Captain America')!
    const used = new Map<string, number>()
    const picked: string[] = []
    for (let i = 0; i < ASPECTS.length; i++) {
      const [aspect] = pickAspects(catalog, cap.code, '2026-06-01', used)
      picked.push(aspect)
      used.set(aspect, (used.get(aspect) ?? 0) + 1)
    }
    expect(new Set(picked).size).toBe(ASPECTS.length)
    expect(pickAspects(catalog, cap.code, '2026-06-01', used)).toEqual([picked[0]])
  })

  it('does not deal an aspect that is already ahead', () => {
    const cap = catalog.heroes.find((hero) => hero.name === 'Captain America')!
    const used = new Map<string, number>(ASPECTS.map((aspect) => [aspect, aspect === 'pool' ? 3 : 1]))
    expect(pickAspects(catalog, cap.code, '2026-09-26', used)).not.toEqual(['pool'])
  })

  it('gives a two-aspect hero the two least-used aspects', () => {
    const spider = catalog.heroes.find((hero) => hero.name === 'Spider-Woman')!
    const used = new Map<string, number>([
      ['aggression', 2],
      ['justice', 0],
      ['leadership', 4],
      ['protection', 1],
      ['pool', 5],
    ])
    expect(pickAspects(catalog, spider.code, '2026-09-26', used)).toEqual(['justice', 'protection'])
  })

  it('fills pool back in after a four-aspect hero', () => {
    const cap = catalog.heroes.find((hero) => hero.name === 'Captain America')!
    const warlock = catalog.heroes.find((hero) => hero.name === 'Adam Warlock')!
    const used = new Map<string, number>()
    for (const aspect of pickAspects(catalog, warlock.code, '2026-06-01', used)) {
      used.set(aspect, (used.get(aspect) ?? 0) + 1)
    }
    expect(pickAspects(catalog, cap.code, '2026-06-01', used)).toEqual(['pool'])
  })
})

describe('hero identities', () => {
  it('counts alternate forms as one hero and keeps distinct heroes apart', () => {
    const codes = new Set(catalog.heroes.map((hero) => hero.code))
    expect(codes.has('29001a')).toBe(true)
    expect(codes.has('29002a')).toBe(false)
    expect(codes.has('29003a')).toBe(false)
    expect(codes.has('12001a')).toBe(true)
    expect(codes.has('12001c')).toBe(false)
    expect(codes.has('13001c')).toBe(false)
    expect(codes.has('42001a')).toBe(true)
    expect(codes.has('42001c')).toBe(false)
    expect(catalog.identityCode('29003a')).toBe('29001a')
    expect(catalog.identityCode('12001c')).toBe('12001a')
    expect(catalog.identityCode('13001c')).toBe('13001a')
    expect(catalog.identityCode('42001c')).toBe('42001a')
    expect(catalog.heroes.filter((hero) => hero.name === 'Spider-Man')).toHaveLength(2)
    expect(catalog.heroes.filter((hero) => hero.name === 'Black Panther')).toHaveLength(2)
  })

  it('counts a later armor as that hero already used', () => {
    const used = new Map<string, number>([
      ['29003a', 2],
      ['12001c', 2],
    ])
    const picked: string[] = []
    for (let i = 0; i < catalog.heroes.length - 2; i++) {
      const hero = pickHero(catalog, '2026-06-01', used)
      expect(hero).not.toBe('29001a')
      expect(hero).not.toBe('12001a')
      picked.push(hero)
      used.set(hero, (used.get(hero) ?? 0) + 1)
    }
    expect(new Set(picked).size).toBe(catalog.heroes.length - 2)
  })
})

describe('tight decks', () => {
  function kit(heroCode: string): DeckSlots {
    const hero = catalog.hero(heroCode)!
    const slots: DeckSlots = {}
    for (const card of catalog.signatureCards(hero)) slots[card.code] = card.quantity ?? 1
    return slots
  }

  function fill(faction: string, copies: number, slots: DeckSlots, single: boolean) {
    let left = copies
    for (const card of catalog.byCode.values()) {
      if (left <= 0) break
      if (card.faction_code !== faction || card.hidden || card.duplicate_of || card.permanent || card.set_code) continue
      if (!card.name || !card.type_code || !PLAYER_TYPES.has(card.type_code)) continue
      const take = single ? 1 : Math.min(left, card.deck_limit ?? (card.is_unique ? 1 : 3))
      slots[card.code] = take
      left -= take
    }
    expect(left).toBe(0)
  }

  it('accepts a 40-card list', () => {
    const cap = fixtures.find((fixture) => fixture.id === 66816)!
    expect(preferredSizeError(catalog, cap)).toBeNull()
  })

  it('asks a normal hero to cut to 40', () => {
    const brooklyn = fixtures.find((fixture) => fixture.id === 66745)!
    expect(preferredSizeError(catalog, brooklyn)).toBe(
      'Deck has 42 cards. Build 40. This list can drop cards without breaking a printed rule.',
    )
    expect(validateDeck(catalog, brooklyn)).toEqual([])
  })

  it('asks Adam Warlock to drop a spare basic', () => {
    const puppet = fixtures.find((fixture) => fixture.id === 36680)!
    expect(preferredSizeError(catalog, puppet)).toBe(
      'Deck has 41 cards. Build 40. This list can drop cards without breaking a printed rule.',
    )
    expect(validateDeck(catalog, puppet)).toEqual([])
  })

  it('keeps Spider-Woman at 41 when equal aspects cannot shrink to 40', () => {
    const slots = kit('04031a')
    fill('aggression', 13, slots, false)
    fill('justice', 13, slots, false)
    expect(preferredSizeError(catalog, { hero_code: '04031a', aspects: ['aggression', 'justice'], slots })).toBeNull()
  })

  it('cuts a padded Spider-Woman list to that floor', () => {
    const slots = kit('04031a')
    fill('aggression', 15, slots, false)
    fill('justice', 15, slots, false)
    expect(preferredSizeError(catalog, { hero_code: '04031a', aspects: ['aggression', 'justice'], slots })).toBe(
      'Deck has 45 cards. Cut to 41, the closest this list can come to 40 without breaking a printed rule.',
    )
  })

  it('keeps an all-aspect Adam Warlock list at the equal-count floor', () => {
    const slots = kit('21031a')
    for (const aspect of CORE_ASPECTS) fill(aspect, 7, slots, true)
    expect(preferredSizeError(catalog, { hero_code: '21031a', aspects: [...CORE_ASPECTS], slots })).toBeNull()
  })

  it('cuts a padded Adam Warlock list back to that floor', () => {
    const slots = kit('21031a')
    for (const aspect of CORE_ASPECTS) fill(aspect, 8, slots, true)
    expect(preferredSizeError(catalog, { hero_code: '21031a', aspects: [...CORE_ASPECTS], slots })).toBe(
      'Deck has 47 cards. Cut to 43, the closest this list can come to 40 without breaking a printed rule.',
    )
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
