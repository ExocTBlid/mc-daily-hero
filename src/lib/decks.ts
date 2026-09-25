import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { IndexEntry, SavedDeck } from './types'

export const DECKS_DIR = path.resolve(process.cwd(), 'decks')
export const INDEX_PATH = path.join(DECKS_DIR, 'index.json')

export function deckPath(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Bad deck date ${date}`)
  return path.join(DECKS_DIR, `${date}.json`)
}

export function loadIndex(): IndexEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as IndexEntry[]
    return parsed.sort((a, b) => b.date.localeCompare(a.date))
  } catch {
    return []
  }
}

export function loadDeck(date: string): SavedDeck | null {
  try {
    return JSON.parse(readFileSync(deckPath(date), 'utf8')) as SavedDeck
  } catch {
    return null
  }
}

export function listDeckDates(): string[] {
  try {
    return readdirSync(DECKS_DIR)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map((name) => name.slice(0, 10))
      .sort()
  } catch {
    return []
  }
}

export function heroCounts(dates = listDeckDates()): Map<string, number> {
  const counts = new Map<string, number>()
  for (const date of dates) {
    const deck = loadDeck(date)
    if (!deck) continue
    counts.set(deck.hero_code, (counts.get(deck.hero_code) ?? 0) + 1)
  }
  return counts
}

export function writeDeck(deck: SavedDeck): void {
  mkdirSync(DECKS_DIR, { recursive: true })
  writeFileSync(deckPath(deck.date), `${JSON.stringify(deck, null, 2)}\n`)
  rebuildIndex()
}

export function rebuildIndex(): IndexEntry[] {
  const entries: IndexEntry[] = listDeckDates().map((date) => {
    const deck = loadDeck(date)
    if (!deck) throw new Error(`Unreadable deck ${date}`)
    return {
      date: deck.date,
      title: deck.title,
      hero_name: deck.hero_name,
      hero_code: deck.hero_code,
      aspects: deck.aspects,
      source: deck.source,
    }
  })
  entries.sort((a, b) => b.date.localeCompare(a.date))
  mkdirSync(DECKS_DIR, { recursive: true })
  writeFileSync(INDEX_PATH, `${JSON.stringify(entries, null, 2)}\n`)
  return entries
}
