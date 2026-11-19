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

const CARD_REPO = 'https://github.com/zzorba/marvelsdb-json-data.git'

function latestSha(): string {
  // actions/checkout stores this repo's token as an extra header for every
  // github.com URL. Clear it so this public read stays anonymous. The token
  // cannot read the card repo, and the unauthenticated REST API is what
  // returned 403 from the shared runner address.
  let output = ''
  try {
    output = execFileSync(
      'git',
      ['-c', 'http.https://github.com/.extraheader=', 'ls-remote', CARD_REPO, 'refs/heads/master'],
      { encoding: 'utf8' },
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read the card data revision: ${detail}`)
  }
  const sha = output.split(/\s+/, 1)[0] ?? ''
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Could not read the card data revision: ${output.trim() || 'no revision returned'}`)
  }
  return sha
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

const sha = latestSha()
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
