import type { Catalog } from './catalog'
import { PACK_NAMES } from './packs'
import { isRestricted } from './text'
import { ASPECTS, TYPE_LABEL, TYPE_ORDER, type SavedDeck } from './types'

export type DeckCardRow = {
  qty: number
  name: string
  code: string
  faction: string
  signature: boolean
  permanent: boolean
  restricted: boolean
}

export type DeckGroup = {
  type: string
  label: string
  cards: DeckCardRow[]
}

export type DeckAspect = {
  faction: string
  label: string
  groups: DeckGroup[]
}

export type DeckPage = {
  deck: SavedDeck
  aspects: DeckAspect[]
  plain: string
  size: number
  aspectLabel: string
  heroUrl: string
  fallbackUrl: string | null
}

/** Section order and headings MarvelCDB writes in its text export. The importer ignores the headings. */
const IMPORT_SECTIONS: Array<[string, string]> = [
  ['upgrade', 'Upgrades'],
  ['event', 'Events'],
  ['support', 'Supports'],
  ['resource', 'Resources'],
  ['ally', 'Allies'],
  ['player_side_scheme', 'Player Side Scheme'],
]

/** Aspects, then the basic shell. The hero kit is always last. Anything else sits just above it. */
const FACTION_ORDER = [...ASPECTS, 'basic'] as const

function rank(order: readonly string[], value: string): number {
  const index = order.indexOf(value)
  return index === -1 ? order.length : index
}

function factionRank(faction: string): number {
  if (faction === 'hero') return FACTION_ORDER.length + 1
  return rank(FACTION_ORDER, faction)
}

function factionLabel(faction: string): string {
  if (faction === 'hero') return 'Hero'
  if (faction === 'basic') return 'Basic'
  return labelAspects([faction])
}

export function presentDeck(catalog: Catalog, deck: SavedDeck): DeckPage {
  const hero = catalog.hero(deck.hero_code)
  const buckets = new Map<string, Map<string, DeckCardRow[]>>()
  let size = 0

  for (const [code, qty] of Object.entries(deck.slots)) {
    const card = catalog.resolve(code)
    const faction = card?.faction_code || 'other'
    const type = card?.type_code ?? 'upgrade'
    const row: DeckCardRow = {
      qty,
      name: card?.name ?? code,
      code: card?.code ?? code,
      faction,
      signature: Boolean(hero && card?.set_code === hero.set_code),
      permanent: Boolean(card?.permanent),
      restricted: card ? isRestricted(card) : false,
    }
    const byType = buckets.get(faction) ?? new Map<string, DeckCardRow[]>()
    const list = byType.get(type) ?? []
    list.push(row)
    byType.set(type, list)
    buckets.set(faction, byType)
    if (!row.permanent) size += qty
  }

  const factions = [...buckets.keys()].sort((a, b) => factionRank(a) - factionRank(b) || a.localeCompare(b))

  const aspects: DeckAspect[] = factions.map((faction) => {
    const byType = buckets.get(faction)!
    const types = [...byType.keys()].sort(
      (a, b) => rank(TYPE_ORDER, a) - rank(TYPE_ORDER, b) || a.localeCompare(b),
    )
    const groups = types.map((type) => {
      const cards = byType.get(type)!
      cards.sort((a, b) => Number(b.signature) - Number(a.signature) || a.name.localeCompare(b.name))
      return { type, label: TYPE_LABEL[type] ?? type, cards }
    })
    return { faction, label: factionLabel(faction), groups }
  })

  const plain = marvelcdbImport(catalog, deck, aspects)

  return {
    deck,
    aspects,
    plain,
    size,
    aspectLabel: labelAspects(deck.aspects),
    heroUrl: `https://marvelcdb.com/card/${deck.hero_code}`,
    fallbackUrl: deck.fallback_decklist_id ? `https://marvelcdb.com/decklist/view/${deck.fallback_decklist_id}` : null,
  }
}

function marvelcdbImport(catalog: Catalog, deck: SavedDeck, aspects: DeckAspect[]): string {
  const byType = new Map<string, DeckCardRow[]>()
  for (const aspect of aspects) {
    for (const group of aspect.groups) {
      const list = byType.get(group.type) ?? []
      list.push(...group.cards)
      byType.set(group.type, list)
    }
  }
  for (const cards of byType.values()) cards.sort((a, b) => a.name.localeCompare(b.name))

  const line = (card: DeckCardRow) => {
    const packCode = catalog.card(card.code)?.pack_code
    const pack = packCode ? PACK_NAMES[packCode] : undefined
    return `${card.qty}x ${card.name}${pack ? ` (${pack})` : ''}`
  }

  const seen = new Set<string>()
  const sections: string[] = []
  for (const [type, label] of IMPORT_SECTIONS) {
    const cards = byType.get(type)
    if (!cards?.length) continue
    seen.add(type)
    sections.push(label, ...cards.map(line), '')
  }
  for (const [type, cards] of byType) {
    if (seen.has(type) || !cards.length) continue
    sections.push(TYPE_LABEL[type] ?? type, ...cards.map(line), '')
  }

  // One line, exactly the hero's name. A second copy is imported as a different
  // card, such as the leadership ally also named Spectrum.
  const heroName = catalog.hero(deck.hero_code)?.name ?? deck.hero_name
  return [heroName, '', ...sections].join('\n').trimEnd() + '\n'
}

export function labelAspects(aspects: string[]): string {
  return aspects.map((aspect) => aspect.charAt(0).toUpperCase() + aspect.slice(1)).join(' / ')
}

export function cardUrl(code: string): string {
  return `https://marvelcdb.com/card/${code}`
}

export function cardImageUrl(code: string): string {
  return `https://marvelcdb.com/bundles/cards/${code}.png`
}
