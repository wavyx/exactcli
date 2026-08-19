import { describe, it, expect } from 'vitest'
import { formatTable } from '../../../src/lib/output/table.js'

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name' },
}

describe('formatTable', () => {
  it('returns a string containing headers and values', () => {
    const data = [
      { id: 1, name: 'Acme' },
      { id: 2, name: 'Globex' },
    ]
    const result = formatTable(data, columns)
    expect(result).toContain('ID')
    expect(result).toContain('Name')
    expect(result).toContain('1')
    expect(result).toContain('Acme')
    expect(result).toContain('2')
    expect(result).toContain('Globex')
  })

  it('returns "No results found." for an empty array', () => {
    expect(formatTable([], columns)).toContain('No results found.')
  })

  it('returns "No results found." for null data', () => {
    expect(formatTable(null, columns)).toContain('No results found.')
  })

  it('uses column.key when specified', () => {
    const cols = { email: { header: 'Email', key: 'Email_1' } }
    const result = formatTable([{ Email_1: 'test@example.com' }], cols)
    expect(result).toContain('Email')
    expect(result).toContain('test@example.com')
  })

  it('uses the column.get function when specified', () => {
    const cols = {
      fullName: {
        header: 'Full Name',
        get: (row) => `${row.first} ${row.last}`,
      },
    }
    const result = formatTable([{ first: 'Jane', last: 'Doe' }], cols)
    expect(result).toContain('Full Name')
    expect(result).toContain('Jane Doe')
  })

  it('renders an empty cell for null values', () => {
    const result = formatTable([{ id: 1, name: null }], columns)
    expect(result).toContain('1')
    expect(typeof result).toBe('string')
  })

  it('renders an empty cell when col.get returns null', () => {
    const cols = { val: { header: 'Val', get: () => null } }
    expect(formatTable([{ id: 1 }], cols)).toContain('Val')
  })
})
