import type { Catalog } from './catalog'
import { validateDeck } from './validate'
import { ASPECTS, type DeckSlots } from './types'

const API = 'https://marvelcdb.com/api/public'
const USER_AGENT = 'mc-daily-hero (daily hero deck; public API, caches responses)'

export type PublicDeck = {
  id: number
  name: string
  hero_code: string
  hero_name: string
  slots: DeckSlots
  aspects: string[]
  date: string
}

type DecklistPayload = {
  id: number
  name: string
  hero_code: string
  hero_name: string
  date_creation?: string
  slots?: Record<string, number> | null
  meta?: string | null
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return (await response.json()) as T
}

/**
 * MarvelCDB's stored aspect tags are incomplete for heroes who play more
 * than one. The cards that are not part of the hero kit show the real choice.
 */
function inferAspects(catalog: Catalog, heroCode: string, slots: DeckSlots): string[] {
  const hero = catalog.hero(heroCode)
  if (!hero) return []
  const rules = catalog.rules(hero)
  const counts = new Map<string, number>()
  for (const [code, qty] of Object.entries(slots)) {
    const card = catalog.resolve(code)
    const faction = card?.faction_code
    if (!faction || !(ASPECTS as readonly string[]).includes(faction)) continue
    if (card.set_code === hero.set_code) continue
    counts.set(faction, (counts.get(faction) ?? 0) + qty)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (rules.aspects === 4) return ranked.map(([faction]) => faction).sort()
  if (rules.aspects === 2) return ranked.slice(0, 2).map(([faction]) => faction).sort()
  return ranked[0] ? [ranked[0][0]] : []
}

function addDays(date: string, delta: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + delta)
  return utc.toISOString().slice(0, 10)
}

/**
 * Recent public lists for one hero. Used as examples for the model and as
 * the fallback when a generated list is still illegal. Stops once it has
 * enough lists that our checker accepts.
 */
export async function findPublicDecks(
  catalog: Catalog,
  heroCode: string,
  fromDate: string,
  need: number,
  maxDays = 45,
): Promise<PublicDeck[]> {
  const found: PublicDeck[] = []
  const seen = new Set<number>()
  for (let ago = 0; ago < maxDays && found.length < need; ago++) {
    const date = addDays(fromDate, -ago)
    let lists: DecklistPayload[]
    try {
      lists = await getJson<DecklistPayload[]>(`${API}/decklists/by_date/${date}.json`)
    } catch {
      continue
    }
    for (const list of lists) {
      if (list.hero_code !== heroCode || seen.has(list.id) || !list.slots) continue
      seen.add(list.id)
      const slots: DeckSlots = {}
      for (const [code, qty] of Object.entries(list.slots)) slots[code] = qty
      const aspects = inferAspects(catalog, heroCode, slots)
      if (validateDeck(catalog, { hero_code: heroCode, aspects, slots }).length > 0) continue
      found.push({
        id: list.id,
        name: list.name,
        hero_code: heroCode,
        hero_name: list.hero_name,
        slots,
        aspects,
        date,
      })
      if (found.length >= need) break
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return found
}

export function decklistUrl(id: number): string {
  return `https://marvelcdb.com/decklist/view/${id}`
}
