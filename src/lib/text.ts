import type { Card } from './types'

function sameTrait(have: string[], needed: string): boolean {
  const needle = cleanTrait(needed)
  return have.some((trait) => cleanTrait(trait) === needle)
}

/** Traits are separated by ". ", and abbreviations such as S.H.I.E.L.D. keep their periods. */
export function cleanTrait(trait: string): string {
  return trait.replace(/\.+$/, '').trim().toLowerCase()
}

export function traitsOf(card: Card | undefined): string[] {
  if (!card?.traits) return []
  return card.traits
    .split(/\.\s+/)
    .map((trait) => cleanTrait(trait))
    .filter(Boolean)
}

export function hasTrait(card: Card, trait: string): boolean {
  const needle = cleanTrait(trait)
  return traitsOf(card).some((item) => item === needle)
}

export function identityTraits(hero: Card, alterEgo: Card | undefined): string[] {
  return [...traitsOf(hero), ...traitsOf(alterEgo)]
}

/** Restricted is a deckbuilding keyword: at most two restricted cards in the deck. */
export function isRestricted(card: Card): boolean {
  const text = card.text ?? ''
  return /\bRestricted\./.test(text)
}

function traitList(match: string): string[] {
  return [...match.matchAll(/\[\[([^\]]+)\]\]/g)].map((part) => part[1])
}

/**
 * Deckbuilding locks only. "Play only if you control a Spy" is a play
 * restriction, and those cards are legal to include.
 * Returns the missing requirement, or null when the card is allowed.
 */
export function deckbuildingBlock(card: Card, hero: Card, alterEgo: Card | undefined): string | null {
  const text = card.text ?? ''
  if (!/play only if/i.test(text)) return null

  const both = identityTraits(hero, alterEgo)
  const heroOnly = traitsOf(hero)

  const identity = text.match(/play only if your identity has the\s+((?:\[\[[^\]]+\]\]\s*(?:or\s+)?)+)trait/i)
  if (identity) {
    const needed = traitList(identity[1])
    if (needed.length && !needed.some((trait) => sameTrait(both, trait))) {
      return `${card.name ?? card.code} needs an identity trait: ${needed.map(cleanTrait).join(' or ')}`
    }
    return null
  }

  const yourHero = text.match(/play only if your hero has the\s+((?:\[\[[^\]]+\]\]\s*(?:or\s+)?)+)trait/i)
  if (yourHero) {
    const needed = traitList(yourHero[1])
    if (needed.length && !needed.some((trait) => sameTrait(heroOnly, trait))) {
      return `${card.name ?? card.code} needs a hero trait: ${needed.map(cleanTrait).join(' or ')}`
    }
    return null
  }

  const youHave = text.match(/play only if you have the\s+((?:\[\[[^\]]+\]\]\s*(?:or\s+)?)+)trait/i)
  if (youHave) {
    const needed = traitList(youHave[1])
    if (needed.length && !needed.some((trait) => sameTrait(both, trait))) {
      return `${card.name ?? card.code} needs a trait: ${needed.map(cleanTrait).join(' or ')}`
    }
    return null
  }

  const health = text.match(/play only if your identity has at least (\d+) printed hit points/i)
  if (health) {
    const need = Number(health[1])
    const printed = hero.health ?? 0
    if (printed < need) return `${card.name ?? card.code} needs ${need} printed hit points`
    return null
  }

  const player = text.match(/play only if you are the (.+?) player/i)
  if (player) {
    const names = player[1].split(/\s+or\s+/i).map((name) => name.trim().toLowerCase())
    const ours = [hero.name, hero.subname, alterEgo?.name, alterEgo?.subname]
      .filter(Boolean)
      .map((name) => name!.toLowerCase())
    if (!names.some((name) => ours.includes(name))) {
      return `${card.name ?? card.code} is only for ${player[1]}`
    }
    return null
  }

  return null
}
