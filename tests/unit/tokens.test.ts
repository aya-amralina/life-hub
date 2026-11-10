import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Tailwind derives `text-<name>` from both --text-<name> (font size) and --color-<name> (colour).
// A shared name silently applies both — e.g. «text-body» once painted titles in the Тело colour.
const css = readFileSync(join(__dirname, '../../src/styles/index.css'), 'utf8')
const names = (prefix: string) =>
  new Set([...css.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+?)(?:--[a-z-]+)?:`, 'g'))].map((m) => m[1]!).filter((n) => n !== '*'))

describe('design tokens', () => {
  it('font-size names never collide with colour names', () => {
    const sizes = names('text')
    const colors = names('color')
    expect([...sizes].sort()).toEqual(['base', 'big', 'cap', 'title'])
    expect([...sizes].filter((s) => colors.has(s))).toEqual([])
  })
})
