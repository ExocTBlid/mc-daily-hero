import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ASPECTS, CORE_ASPECTS, PLAYER_TYPES, type Aspect, type Card, type CardSnapshot, type DeckOption } from './types'

export const CARD_DATA_PATH = path.resolve(process.cwd(), 'data/player-cards.json')

export type HeroRules = {
  /** How many aspects the hero must play. Null means one chosen aspect. */
  aspects: number | null
  /** Exact copy count for every non-signature card, when the hero prints one. */
  copyLimit: number | null
  options: DeckOption[]
}

export class Catalog {
  readonly rev: string
  readonly byCode = new Map<string, Card>()
  /** One card per hero kit. Later forms of that kit are not separate heroes. */
  readonly heroes: Card[]
  private readonly identityOf = new Map<string, string>()

  constructor(snapshot: CardSnapshot) {
    this.rev = snapshot.rev
    for (const card of snapshot.cards) this.byCode.set(card.code, card)

    const bySet = new Map<string, Card[]>()
    for (const card of snapshot.cards) {
      if (card.type_code !== 'hero' || card.hidden || !card.set_code || !card.name) continue
      const group = bySet.get(card.set_code) ?? []
      group.push(card)
      bySet.set(card.set_code, group)
    }

    this.heroes = [...bySet.values()]
      .map((group) => chooseIdentity(group, this.byCode))
      .sort((a, b) => a.name!.localeCompare(b.name!) || a.code.localeCompare(b.code))

    for (const [setCode, group] of bySet) {
      const identity = this.heroes.find((hero) => hero.set_code === setCode)
      if (!identity) continue
      for (const card of group) this.identityOf.set(card.code, identity.code)
    }
  }

  /** The hero a form belongs to. Ant-Man's giant form and Ironheart's later armors share one hero. */
  identityCode(code: string): string {
    return this.identityOf.get(code) ?? code
  }

  card(code: string): Card | undefined {
    return this.byCode.get(code)
  }

  /** Follow reprint links to the card that carries the rules text. */
  resolve(code: string): Card | undefined {
    const seen = new Set<string>()
    let current = this.byCode.get(code)
    while (current?.duplicate_of && !seen.has(current.code)) {
      seen.add(current.code)
      const next = this.byCode.get(current.duplicate_of)
      if (!next) break
      current = next
    }
    return current
  }

  rootCode(code: string): string {
    return this.resolve(code)?.code ?? code
  }

  hero(code: string): Card | undefined {
    const card = this.resolve(code)
    if (!card || card.type_code !== 'hero' || card.hidden) return undefined
    return card
  }

  alterEgo(hero: Card): Card | undefined {
    if (!hero.back_link) return undefined
    return this.byCode.get(hero.back_link)
  }

  rules(hero: Card): HeroRules {
    let aspects: number | null = null
    let copyLimit: number | null = null
    for (const req of hero.deck_requirements ?? []) {
      if (typeof req.aspects === 'number') aspects = req.aspects
      if (typeof req.limit === 'number') copyLimit = req.limit
    }
    return { aspects, copyLimit, options: hero.deck_options ?? [] }
  }

  /** Aspects this hero is allowed to be dealt on a given day. */
  legalAspectChoices(hero: Card): Aspect[][] {
    const rules = this.rules(hero)
    if (rules.aspects === 4) return [[...CORE_ASPECTS]]
    if (rules.aspects === 2) {
      const pairs: Aspect[][] = []
      for (let i = 0; i < ASPECTS.length; i++) {
        for (let j = i + 1; j < ASPECTS.length; j++) pairs.push([ASPECTS[i], ASPECTS[j]])
      }
      return pairs
    }
    return ASPECTS.map((aspect) => [aspect])
  }

  /**
   * The hero's own cards, fronts only. Hidden backs are the same physical card.
   * Permanents are part of the kit and do not count toward the 40.
   */
  signatureCards(hero: Card): Card[] {
    return [...this.byCode.values()].filter(
      (card) =>
        card.set_code === hero.set_code &&
        !card.hidden &&
        !card.duplicate_of &&
        Boolean(card.name) &&
        PLAYER_TYPES.has(card.type_code ?? ''),
    )
  }
}

/**
 * The form the deck is built as. A kit with several hero cards still has one
 * identity: the form that flips back to its alter-ego, and the earliest of
 * those when every form does (Ironheart starts at Version 1).
 */
function chooseIdentity(group: Card[], byCode: Map<string, Card>): Card {
  const linked = group.filter((card) => {
    const back = card.back_link ? byCode.get(card.back_link) : undefined
    return back?.type_code === 'alter_ego'
  })
  const candidates = linked.length > 0 ? linked : group
  return [...candidates].sort((a, b) => a.code.localeCompare(b.code))[0]
}

let cached: Catalog | null = null

export function loadCatalog(file = CARD_DATA_PATH): Catalog {
  const snapshot = JSON.parse(readFileSync(file, 'utf8')) as CardSnapshot
  return new Catalog(snapshot)
}

export function getCatalog(): Catalog {
  if (!cached) cached = loadCatalog()
  return cached
}
