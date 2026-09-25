import type { Catalog } from './catalog'
import { deckbuildingBlock, hasTrait } from './text'
import { PLAYER_TYPES, type Card, type DeckOption } from './types'

export type ShortCard = {
  code: string
  name: string
  faction: string
  type: string
  cost: string
  traits: string
  limit: number
  required: number | null
  permanent: boolean
}

function optionMatches(option: DeckOption, card: Card): boolean {
  if (option.type && !option.type.includes(card.type_code ?? '')) return false
  if (option.trait && !option.trait.some((trait) => hasTrait(card, trait))) return false
  if (option.resource) {
    const ok = option.resource.some((resource) => {
      if (resource === 'energy') return (card.resource_energy ?? 0) > 0
      if (resource === 'mental') return (card.resource_mental ?? 0) > 0
      if (resource === 'physical') return (card.resource_physical ?? 0) > 0
      if (resource === 'wild') return (card.resource_wild ?? 0) > 0
      return false
    })
    if (!ok) return false
  }
  return Boolean(option.type || option.trait || option.resource)
}

function costLabel(card: Card): string {
  if (card.cost == null) return '-'
  if (card.cost < 0) return 'X'
  return String(card.cost)
}

/**
 * Cards the model is allowed to use for this hero and aspect.
 * One printing each. Signature cards are marked required.
 */
export function shortlist(catalog: Catalog, heroCode: string, aspects: string[]): ShortCard[] {
  const hero = catalog.hero(heroCode)
  if (!hero) return []
  const alterEgo = catalog.alterEgo(hero)
  const rules = catalog.rules(hero)
  const aspectSet = new Set(aspects)
  const required = new Map(catalog.signatureCards(hero).map((card) => [card.code, card.quantity ?? 1]))
  const rows: ShortCard[] = []

  for (const card of catalog.byCode.values()) {
    if (!card.name || card.hidden || card.duplicate_of) continue
    if (!card.type_code || !PLAYER_TYPES.has(card.type_code)) continue
    if (card.faction_code === 'encounter' || card.faction_code === 'campaign') continue
    if (deckbuildingBlock(card, hero, alterEgo)) continue

    const signature = card.set_code === hero.set_code
    if (card.set_code && !signature) continue
    const inAspect = card.faction_code === 'basic' || (card.faction_code != null && aspectSet.has(card.faction_code))
    const viaOption = rules.options.some((option) => optionMatches(option, card))
    if (!signature && !inAspect && !viaOption) continue

    rows.push({
      code: card.code,
      name: card.subname ? `${card.name} (${card.subname})` : card.name,
      faction: card.faction_code ?? '',
      type: card.type_code,
      cost: costLabel(card),
      traits: card.traits ?? '',
      limit: card.deck_limit ?? (card.is_unique ? 1 : 3),
      required: required.get(card.code) ?? null,
      permanent: Boolean(card.permanent),
    })
  }

  rows.sort((a, b) => a.faction.localeCompare(b.faction) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
  return rows
}

export function formatShortlist(rows: ShortCard[]): { required: string; pool: string } {
  const required = rows
    .filter((row) => row.required != null)
    .map((row) => `${row.code} x${row.required}${row.permanent ? ' permanent (does not count toward 40)' : ''} ${row.name}`)
  const pool = rows
    .filter((row) => row.required == null)
    .map((row) => `${row.code} | ${row.faction} ${row.type} | cost ${row.cost} | max ${row.limit} | ${row.name}${row.traits ? ` | ${row.traits}` : ''}`)
  return { required: required.join('\n'), pool: pool.join('\n') }
}
