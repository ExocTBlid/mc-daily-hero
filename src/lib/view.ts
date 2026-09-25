import type { Catalog } from './catalog'
import { isRestricted } from './text'
import { ASPECTS, TYPE_LABEL, TYPE_ORDER, type SavedDeck } from './types'

export type DeckCardRow = {
  qty: number
  name: string
  code: string
  cost: string
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
      cost: card?.cost == null ? '' : card.cost < 0 ? 'X' : String(card.cost),
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

  const plain = [
    deck.title,
    `${deck.hero_name} — ${labelAspects(deck.aspects)}`,
    deck.summary,
    '',
    ...aspects.flatMap((aspect) => [
      aspect.label,
      ...aspect.groups.flatMap((group) => [
        group.label,
        ...group.cards.map((card) => `${card.qty}x ${card.name}${card.signature ? ' (hero)' : ''}`),
        '',
      ]),
    ]),
  ].join('\n')

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

export function labelAspects(aspects: string[]): string {
  return aspects.map((aspect) => aspect.charAt(0).toUpperCase() + aspect.slice(1)).join(' / ')
}

export function cardUrl(code: string): string {
  return `https://marvelcdb.com/card/${code}`
}
