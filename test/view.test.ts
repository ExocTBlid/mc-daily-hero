import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCatalog } from '../src/lib/catalog'
import { TYPE_ORDER, type SavedDeck } from '../src/lib/types'
import { presentDeck } from '../src/lib/view'

const catalog = loadCatalog()

function saved(file: string, overrides: Partial<SavedDeck> = {}): SavedDeck {
  const raw = JSON.parse(readFileSync(path.resolve(process.cwd(), file), 'utf8')) as SavedDeck & {
    name?: string
    id?: number
  }
  return {
    date: raw.date ?? '2026-09-20',
    title: raw.title ?? raw.name ?? 'Deck',
    hero_code: raw.hero_code,
    hero_name: raw.hero_name ?? 'Captain America',
    aspects: raw.aspects,
    summary: raw.summary ?? 'Test list',
    slots: raw.slots,
    source: raw.source ?? 'marvelcdb',
    fallback_decklist_id: raw.fallback_decklist_id ?? raw.id ?? null,
    card_data_rev: raw.card_data_rev ?? catalog.rev,
    ...overrides,
  }
}

const decks = [
  { name: 'Captain America leadership', deck: saved('test/fixtures/66816.json') },
  { name: 'Spectrum pool', deck: saved('decks/2026-09-25.json') },
]

describe('presentDeck', () => {
  for (const { name, deck } of decks) {
    it(`${name} lists aspects, then basic, with the hero kit last`, () => {
      const page = presentDeck(catalog, deck)
      const factions = page.aspects.map((aspect) => aspect.faction)
      const factionOrder = ['aggression', 'justice', 'leadership', 'protection', 'pool', 'basic', 'hero']
      const factionRanks = factions.map((faction) => {
        const index = factionOrder.indexOf(faction)
        return index === -1 ? factionOrder.length : index
      })
      expect(factions.at(-1)).toBe('hero')
      expect(factions[0]).not.toBe('hero')
      expect(factionRanks).toEqual([...factionRanks].sort((a, b) => a - b))
      expect(new Set(factions).size).toBe(factions.length)

      for (const aspect of page.aspects) {
        const types = aspect.groups.map((group) => group.type)
        const ranks = types.map((type) => {
          const index = TYPE_ORDER.indexOf(type as (typeof TYPE_ORDER)[number])
          return index === -1 ? TYPE_ORDER.length : index
        })
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
        for (const group of aspect.groups) {
          expect(group.cards.every((card) => card.faction === aspect.faction)).toBe(true)
          const names = group.cards.map((card) => card.name)
          const sorted = [...group.cards]
            .sort((a, b) => Number(b.signature) - Number(a.signature) || a.name.localeCompare(b.name))
            .map((card) => card.name)
          expect(names).toEqual(sorted)
        }
      }

      const rows = page.aspects.flatMap((aspect) => aspect.groups.flatMap((group) => group.cards))
      expect(rows).toHaveLength(Object.keys(deck.slots).length)

      const labels = page.aspects.map((aspect) => aspect.label)
      let cursor = 0
      for (const label of labels) {
        const at = page.plain.indexOf(`\n${label}\n`, cursor)
        expect(at).toBeGreaterThan(cursor - 1)
        cursor = at + 1
      }
    })
  }

  it('puts the hero kit under the aspect and the basic cards', () => {
    const page = presentDeck(catalog, saved('decks/2026-09-25.json'))
    expect(page.aspects.map((aspect) => aspect.label)).toEqual(['Pool', 'Basic', 'Hero'])
    expect(page.aspects[0].groups.map((group) => group.type)).toEqual(['ally', 'event', 'resource', 'support', 'upgrade'])
  })
})
