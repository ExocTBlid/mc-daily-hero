import { describe, expect, it } from 'vitest'
import { sitePath } from '../src/lib/site'

describe('sitePath', () => {
  it('puts a slash between a project-page base and the path', () => {
    expect(sitePath('archive', '/mc-daily-hero')).toBe('/mc-daily-hero/archive')
    expect(sitePath('d/2026-09-25', '/mc-daily-hero')).toBe('/mc-daily-hero/d/2026-09-25')
    expect(sitePath('favicon.svg', '/mc-daily-hero')).toBe('/mc-daily-hero/favicon.svg')
    expect(sitePath('', '/mc-daily-hero')).toBe('/mc-daily-hero/')
  })

  it('keeps a single slash when the base already ends with one', () => {
    expect(sitePath('archive', '/mc-daily-hero/')).toBe('/mc-daily-hero/archive')
    expect(sitePath('archive', '/')).toBe('/archive')
    expect(sitePath('', '/')).toBe('/')
  })
})
