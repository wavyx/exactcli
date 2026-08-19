import { describe, it, expect } from 'vitest'
import { formatJson } from '../../../src/lib/output/json.js'

describe('formatJson', () => {
  it('returns pretty-printed JSON', () => {
    const data = { ID: 1, Name: 'Acme' }
    expect(formatJson(data)).toBe(JSON.stringify(data, null, 2))
  })

  it('handles arrays', () => {
    const data = [{ a: 1 }, { a: 2 }]
    expect(formatJson(data)).toBe(JSON.stringify(data, null, 2))
  })

  it('handles null and primitive values', () => {
    expect(formatJson(null)).toBe('null')
    expect(formatJson('hello')).toBe('"hello"')
    expect(formatJson(42)).toBe('42')
  })
})
