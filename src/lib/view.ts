import type { Catalog } from './catalog'
import { isRestricted } from './text'
import { TYPE_LABEL, TYPE_ORDER, type SavedDeck } from './types'

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

export type DeckPage = {
  deck: SavedDeck
  groups: DeckGroup[]
  plain: string
  size: number
  aspectLabel: string
  heroUrl: string
  fallbackUrl: string | null
}

export function presentDeck(catalog: Catalog, deck: SavedDeck): DeckPage {
  const hero = catalog.hero(deck.hero_code)
  const groups = new Map<string, DeckCardRow[]>()
  let size = 0

  const codes = Object.keys(deck.slots).sort((a, b) => {
    const left = catalog.resolve(a)
    const right = catalog.resolve(b)
    const type = TYPE_ORDER.indexOf((left?.type_code ?? '') as (typeof TYPE_ORDER)[number])
    const other = TYPE_ORDER.indexOf((right?.type_code ?? '') as (typeof TYPE_ORDER)[number])
    return type - other || (left?.name ?? a).localeCompare(right?.name ?? b)
  })

  for (const code of codes) {
    const qty = deck.slots[code]
    const card = catalog.resolve(code)
    const type = card?.type_code ?? 'upgrade'
    const row: DeckCardRow = {
      qty,
      name: card?.name ?? code,
      code: card?.code ?? code,
      cost: card?.cost == null ? '' : card.cost < 0 ? 'X' : String(card.cost),
      faction: card?.faction_code ?? '',
      signature: Boolean(hero && card?.set_code === hero.set_code),
      permanent: Boolean(card?.permanent),
      restricted: card ? isRestricted(card) : false,
    }
    const list = groups.get(type) ?? []
    list.push(row)
    groups.set(type, list)
    if (!row.permanent) size += qty
  }

  const ordered: DeckGroup[] = []
  for (const type of TYPE_ORDER) {
    const cards = groups.get(type)
    if (!cards?.length) continue
    cards.sort((a, b) => Number(b.signature) - Number(a.signature) || a.name.localeCompare(b.name))
    ordered.push({ type, label: TYPE_LABEL[type] ?? type, cards })
  }

  const plain = [
    `${deck.title}`,
    `${deck.hero_name} — ${labelAspects(deck.aspects)}`,
    deck.summary,
    '',
    ...ordered.flatMap((group) => [
      group.label,
      ...group.cards.map((card) => `${card.qty}x ${card.name}${card.signature ? ' (hero)' : ''}`),
      '',
    ]),
  ].join('\n')

  return {
    deck,
    groups: ordered,
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
