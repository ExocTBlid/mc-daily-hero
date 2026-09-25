import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Card, CardSnapshot } from '../src/lib/types'

const KEEP: (keyof Card)[] = [
  'code',
  'name',
  'subname',
  'faction_code',
  'type_code',
  'deck_limit',
  'quantity',
  'set_code',
  'traits',
  'cost',
  'is_unique',
  'duplicate_of',
  'deck_requirements',
  'deck_options',
  'text',
  'hidden',
  'permanent',
  'pack_code',
  'health',
  'back_link',
  'resource_energy',
  'resource_mental',
  'resource_physical',
  'resource_wild',
]

const OUT = path.resolve(process.cwd(), 'data/player-cards.json')

async function latestSha(): Promise<string> {
  const response = await fetch('https://api.github.com/repos/zzorba/marvelsdb-json-data/commits/master', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'mc-daily-hero' },
  })
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`)
  const body = (await response.json()) as { sha: string }
  return body.sha
}

function compact(raw: Record<string, unknown>): Card {
  const card: Record<string, unknown> = {}
  for (const key of KEEP) {
    const value = raw[key]
    if (value == null || value === '' || value === false) continue
    card[key] = value
  }
  return card as Card
}

const sha = await latestSha()
const work = mkdtempSync(path.join(tmpdir(), 'mc-cards-'))
try {
  const tarball = path.join(work, 'cards.tar.gz')
  execFileSync('curl', ['-fsSL', `https://codeload.github.com/zzorba/marvelsdb-json-data/tar.gz/${sha}`, '-o', tarball], {
    stdio: 'inherit',
  })
  execFileSync('tar', ['-xzf', tarball, '-C', work])
  const extracted = readdirSync(work).find((name) => name.startsWith('marvelsdb-json-data'))
  if (!extracted) throw new Error('Card tarball had no pack directory')
  const packDir = path.join(work, extracted, 'pack')
  const cards: Card[] = []
  for (const name of readdirSync(packDir)) {
    if (!name.endsWith('.json') || name.endsWith('_encounter.json')) continue
    const pack = JSON.parse(readFileSync(path.join(packDir, name), 'utf8')) as Record<string, unknown>[]
    for (const card of pack) cards.push(compact(card))
  }
  cards.sort((a, b) => a.code.localeCompare(b.code))
  const snapshot: CardSnapshot = {
    rev: sha,
    source: 'https://github.com/zzorba/marvelsdb-json-data',
    cards,
  }
  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(snapshot))
  console.log(`Wrote ${cards.length} cards at ${sha.slice(0, 12)}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
