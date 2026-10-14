import type { Catalog } from './catalog'
import { deckbuildingBlock, isRestricted, restrictedBonus } from './text'
import { hasTrait } from './text'
import { ASPECTS, PLAYER_TYPES, type Aspect, type Card, type DeckOption, type DeckSlots } from './types'

export type DeckDraft = {
  hero_code: string
  aspects: string[]
  slots: DeckSlots
}

const MIN_DECK = 40
const MAX_DECK = 50
const MAX_RESTRICTED = 2

function deckLimit(card: Card): number {
  if (typeof card.deck_limit === 'number') return card.deck_limit
  return card.is_unique ? 1 : 3
}

function optionMatches(option: DeckOption, card: Card): boolean {
  if (option.type && !option.type.includes(card.type_code ?? '')) return false
  if (option.trait && !option.trait.some((trait) => hasTrait(card, trait))) return false
  if (option.resource) {
    const resources = option.resource
    const matches = resources.some((resource) => {
      if (resource === 'energy') return (card.resource_energy ?? 0) > 0
      if (resource === 'mental') return (card.resource_mental ?? 0) > 0
      if (resource === 'physical') return (card.resource_physical ?? 0) > 0
      if (resource === 'wild') return (card.resource_wild ?? 0) > 0
      return false
    })
    if (!matches) return false
  }
  return Boolean(option.type || option.trait || option.resource)
}

function countedSize(entries: { qty: number; card: Card }[]): number {
  return entries.reduce((sum, entry) => sum + (entry.card.permanent ? 0 : entry.qty), 0)
}

/**
 * Legality for a finished player deck. This follows the checks MarvelCDB's
 * deck builder actually runs, plus the printed trait locks and the Restricted
 * keyword, which that builder does not enforce.
 */
export function validateDeck(catalog: Catalog, draft: DeckDraft): string[] {
  const errors: string[] = []
  const hero = catalog.hero(draft.hero_code)
  if (!hero) return [`Unknown hero ${draft.hero_code}`]

  const alterEgo = catalog.alterEgo(hero)
  const rules = catalog.rules(hero)
  const aspects = draft.aspects

  if (rules.aspects === 4) {
    if (aspects.length !== 4 || new Set(aspects).size !== 4 || aspects.some((aspect) => !isAspect(aspect))) {
      errors.push('This hero must use exactly four aspects')
    }
  } else if (rules.aspects === 2) {
    if (aspects.length !== 2 || new Set(aspects).size !== 2 || aspects.some((aspect) => !isAspect(aspect))) {
      errors.push('This hero must name exactly two aspects')
    }
  } else if (aspects.length !== 1 || !isAspect(aspects[0])) {
    errors.push('Name exactly one aspect')
  }

  const aspectSet = new Set(aspects)
  const entries: { code: string; qty: number; card: Card; signature: boolean }[] = []

  for (const [code, qty] of Object.entries(draft.slots)) {
    if (!Number.isInteger(qty) || qty <= 0) {
      errors.push(`${code} has a bad quantity`)
      continue
    }
    const card = catalog.resolve(code)
    if (!card || !card.name || !card.type_code) {
      errors.push(`Unknown card ${code}`)
      continue
    }
    if (card.hidden) {
      errors.push(`${card.name} is the back of another card`)
      continue
    }
    if (!PLAYER_TYPES.has(card.type_code) || card.faction_code === 'encounter' || card.faction_code === 'campaign') {
      errors.push(`${card.name} (${code}) cannot go in a player deck`)
      continue
    }
    const signature = card.set_code === hero.set_code
    if (card.set_code && card.set_code !== hero.set_code) {
      errors.push(`${card.name} belongs to another hero's set`)
      continue
    }
    const block = deckbuildingBlock(card, hero, alterEgo)
    if (block) errors.push(block)

    const inAspect = card.faction_code === 'basic' || (card.faction_code != null && aspectSet.has(card.faction_code))
    if (!signature && !inAspect && !rules.options.some((option) => optionMatches(option, card))) {
      errors.push(`${card.name} (${code}) is not legal for ${aspects.join(' / ') || 'this hero'}`)
    }
    entries.push({ code, qty, card, signature })
  }

  for (const required of catalog.signatureCards(hero)) {
    const have = draft.slots[required.code] ?? 0
    const need = required.quantity ?? 1
    if (have !== need) {
      errors.push(`${required.name} must be included exactly ${need} time${need === 1 ? '' : 's'} (has ${have})`)
    }
  }

  const byRoot = new Map<string, { card: Card; qty: number }>()
  for (const entry of entries) {
    const root = catalog.rootCode(entry.card.code)
    const current = byRoot.get(root)
    if (current) current.qty += entry.qty
    else byRoot.set(root, { card: entry.card, qty: entry.qty })
  }
  for (const { card, qty } of byRoot.values()) {
    const limit = deckLimit(card)
    if (qty > limit) errors.push(`${card.name} is limited to ${limit} (has ${qty})`)
    if (rules.copyLimit != null && card.faction_code !== 'hero' && !card.set_code && qty !== rules.copyLimit) {
      errors.push(`${card.name} must be included exactly ${rules.copyLimit} time${rules.copyLimit === 1 ? '' : 's'}`)
    }
  }

  // Off-aspect permissions. In-aspect and signature cards do not spend these.
  const offAspect = entries.filter((entry) => {
    if (entry.signature) return false
    if (entry.card.faction_code === 'basic') return false
    if (entry.card.faction_code && aspectSet.has(entry.card.faction_code)) return false
    return true
  })
  const claimed = new Set<string>()
  for (const option of rules.options) {
    const matched = offAspect.filter((entry) => !claimed.has(entry.code) && optionMatches(option, entry.card))
    for (const entry of matched) claimed.add(entry.code)
    if (option.use_deck_limit && option.name_limit != null) {
      if (matched.length > option.name_limit) {
        errors.push(`Only ${option.name_limit} off-aspect cards of that kind are allowed`)
      }
      for (const entry of matched) {
        if (entry.qty !== deckLimit(entry.card)) {
          errors.push(`${entry.card.name} must be included at its deck limit (${deckLimit(entry.card)})`)
        }
      }
    } else if (option.limit != null) {
      const used = matched.reduce((sum, entry) => sum + entry.qty, 0)
      if (used > option.limit) errors.push(`Off-aspect allowance is ${option.limit} cards (has ${used})`)
    }
  }

  if (rules.aspects === 4) {
    const present = ASPECTS.map((aspect) => [aspect, countFaction(entries, aspect)] as const).filter(([, count]) => count > 0)
    const equal = present.length > 0 && present.every(([, count]) => count === present[0][1])
    const named = [...aspects].sort().join(',')
    const used = present.map(([aspect]) => aspect).sort().join(',')
    if (present.length !== 4 || !equal || named !== used) {
      const shown = present.map(([aspect, count]) => `${aspect} ${count}`).join(', ') || 'none'
      errors.push(`Exactly four aspects must be included in equal numbers (has ${shown})`)
    }
  } else if (rules.aspects === 2 && aspects.length === 2) {
    const left = countFaction(entries, aspects[0])
    const right = countFaction(entries, aspects[1])
    if (left !== right) errors.push(`${label(aspects[0])} and ${label(aspects[1])} must match (${left} vs ${right})`)
  }

  const restricted = entries.reduce((sum, entry) => sum + (isRestricted(entry.card) ? entry.qty : 0), 0)
  const restrictedMax = MAX_RESTRICTED + restrictedBonus(hero, alterEgo, entries)
  if (restricted > restrictedMax) errors.push(`A deck can include ${restrictedMax} restricted cards (has ${restricted})`)

  const size = countedSize(entries)
  if (size < MIN_DECK) errors.push(`Deck has ${size} cards; the minimum is ${MIN_DECK}`)
  if (size > MAX_DECK) errors.push(`Deck has ${size} cards; the maximum is ${MAX_DECK}`)

  return errors
}

type DeckEntry = { code: string; qty: number; card: Card; signature: boolean }
type RemovalGroup = { free: number; bundles: number[] }

/**
 * Generated lists should be 40 cards. A larger list is kept only when cutting
 * it would break a printed rule: matching aspect counts, a copy limit, or an
 * off-aspect card that has to be taken at its deck limit. 50 stays the game
 * maximum inside validateDeck, so a published list can still be larger.
 */
export function preferredSizeError(catalog: Catalog, draft: DeckDraft): string | null {
  const hero = catalog.hero(draft.hero_code)
  if (!hero) return null
  const entries = listedEntries(catalog, hero, draft.slots)
  const size = countedSize(entries)
  if (size <= MIN_DECK) return null

  const rules = catalog.rules(hero)
  const aspectSet = new Set(draft.aspects)
  const groups = new Map<string, RemovalGroup>()
  for (const entry of entries) {
    if (entry.signature || entry.card.permanent) continue
    const group = groupFor(groups, entry.card.faction_code ?? 'basic')
    if (isLockedBundle(rules, aspectSet, entry)) group.bundles.push(entry.qty)
    else group.free += entry.qty
  }

  const balance =
    (rules.aspects === 2 || rules.aspects === 4) && draft.aspects.length === rules.aspects ? draft.aspects : []
  const floor = closestFloor(size, balance, groups)
  if (floor >= size) return null
  if (floor === MIN_DECK) {
    return `Deck has ${size} cards. Build ${MIN_DECK}. This list can drop cards without breaking a printed rule.`
  }
  return `Deck has ${size} cards. Cut to ${floor}, the closest this list can come to ${MIN_DECK} without breaking a printed rule.`
}

function listedEntries(catalog: Catalog, hero: Card, slots: DeckSlots): DeckEntry[] {
  const entries: DeckEntry[] = []
  for (const [code, qty] of Object.entries(slots)) {
    if (!Number.isInteger(qty) || qty <= 0) continue
    const card = catalog.resolve(code)
    if (!card?.name || !card.type_code) continue
    if (card.hidden) continue
    if (!PLAYER_TYPES.has(card.type_code) || card.faction_code === 'encounter' || card.faction_code === 'campaign') continue
    if (card.set_code && card.set_code !== hero.set_code) continue
    entries.push({ code, qty, card, signature: card.set_code === hero.set_code })
  }
  return entries
}

function groupFor(groups: Map<string, RemovalGroup>, faction: string): RemovalGroup {
  const existing = groups.get(faction)
  if (existing) return existing
  const created: RemovalGroup = { free: 0, bundles: [] }
  groups.set(faction, created)
  return created
}

/** Copies that have to leave together: a copy limit, or an off-aspect card taken at its deck limit. */
function isLockedBundle(
  rules: { copyLimit: number | null; options: DeckOption[] },
  aspectSet: Set<string>,
  entry: DeckEntry,
): boolean {
  if (rules.copyLimit != null && entry.card.faction_code !== 'hero' && !entry.card.set_code) return true
  const inAspect = entry.card.faction_code === 'basic' || (entry.card.faction_code != null && aspectSet.has(entry.card.faction_code))
  if (inAspect) return false
  return rules.options.some((option) => option.use_deck_limit === true && option.name_limit != null && optionMatches(option, entry.card))
}

function achievable(group: RemovalGroup): Set<number> {
  let reachable = new Set<number>([0])
  const bySize = new Map<number, number>()
  for (const bundle of group.bundles) {
    if (bundle <= 0) continue
    bySize.set(bundle, (bySize.get(bundle) ?? 0) + 1)
  }
  for (const [bundle, count] of bySize) {
    const next = new Set<number>()
    for (const have of reachable) {
      for (let n = 0; n <= count; n++) next.add(have + n * bundle)
    }
    reachable = next
  }
  const out = new Set<number>()
  for (const sum of reachable) {
    for (let extra = 0; extra <= group.free; extra++) out.add(sum + extra)
  }
  return out
}

function closestFloor(size: number, balance: string[], groups: Map<string, RemovalGroup>): number {
  if (balance.length === 0) {
    const all: RemovalGroup = { free: 0, bundles: [] }
    for (const group of groups.values()) {
      all.free += group.free
      all.bundles.push(...group.bundles)
    }
    let best = size
    for (const remove of achievable(all)) {
      const next = size - remove
      if (next >= MIN_DECK && next < best) best = next
    }
    return best
  }

  const rest: RemovalGroup = { free: 0, bundles: [] }
  for (const [faction, group] of groups) {
    if (balance.includes(faction)) continue
    rest.free += group.free
    rest.bundles.push(...group.bundles)
  }
  const aspectSets = balance.map((faction) => achievable(groups.get(faction) ?? { free: 0, bundles: [] }))
  const restSet = achievable(rest)
  let best = size
  for (const removed of aspectSets[0]) {
    if (!aspectSets.every((set) => set.has(removed))) continue
    for (const fromRest of restSet) {
      const next = size - (balance.length * removed + fromRest)
      if (next >= MIN_DECK && next < best) best = next
    }
  }
  return best
}

function countFaction(entries: { qty: number; card: Card }[], faction: string): number {
  return entries.reduce((sum, entry) => sum + (entry.card.faction_code === faction ? entry.qty : 0), 0)
}

function isAspect(value: string): value is Aspect {
  return (['aggression', 'justice', 'leadership', 'protection', 'pool'] as string[]).includes(value)
}

function label(aspect: string): string {
  return aspect.charAt(0).toUpperCase() + aspect.slice(1)
}
