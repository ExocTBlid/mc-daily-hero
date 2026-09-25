/** A player card, trimmed from marvelsdb-json-data. Encounter packs are not loaded. */
export type Card = {
  code: string
  name?: string
  subname?: string
  faction_code?: string
  type_code?: string
  deck_limit?: number
  quantity?: number
  set_code?: string
  traits?: string
  cost?: number | null
  is_unique?: boolean
  duplicate_of?: string
  deck_requirements?: DeckRequirement[] | null
  deck_options?: DeckOption[] | null
  text?: string
  hidden?: boolean
  permanent?: boolean
  pack_code?: string
  health?: number
  back_link?: string
  resource_energy?: number
  resource_mental?: number
  resource_physical?: number
  resource_wild?: number
}

export type DeckRequirement = {
  aspects?: number
  limit?: number
}

/** Off-aspect permission copied from the hero's deck_options. */
export type DeckOption = {
  limit?: number
  name_limit?: number
  use_deck_limit?: boolean
  trait?: string[]
  type?: string[]
  resource?: string[]
}

export type CardSnapshot = {
  rev: string
  source: string
  cards: Card[]
}

export type DeckSlots = Record<string, number>

export type SavedDeck = {
  date: string
  title: string
  hero_code: string
  hero_name: string
  aspects: string[]
  summary: string
  slots: DeckSlots
  source: 'generated' | 'marvelcdb'
  fallback_decklist_id: number | null
  card_data_rev: string
}

export type IndexEntry = {
  date: string
  title: string
  hero_name: string
  hero_code: string
  aspects: string[]
  source: SavedDeck['source']
}

export const ASPECTS = ['aggression', 'justice', 'leadership', 'protection', 'pool'] as const
export type Aspect = (typeof ASPECTS)[number]

/** The four aspects Adam Warlock has to split evenly. Pool is a normal aspect for everyone else. */
export const CORE_ASPECTS: Aspect[] = ['aggression', 'justice', 'leadership', 'protection']

export const PLAYER_TYPES = new Set([
  'ally',
  'event',
  'support',
  'upgrade',
  'resource',
  'player_side_scheme',
])

export const TYPE_ORDER = [
  'ally',
  'event',
  'resource',
  'support',
  'upgrade',
  'player_side_scheme',
] as const

export const TYPE_LABEL: Record<string, string> = {
  ally: 'Ally',
  event: 'Event',
  resource: 'Resource',
  support: 'Support',
  upgrade: 'Upgrade',
  player_side_scheme: 'Player side scheme',
}
