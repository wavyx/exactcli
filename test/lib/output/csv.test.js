import { describe, it, expect } from 'vitest'
import { formatCsv } from '../../../src/lib/output/csv.js'

const columns = {
  id: { header: 'ID' },
  name: { header: 'Name' },
}

describe('formatCsv', () => {
  it('generates a header row and data rows', () => {
    const result = formatCsv(
      [
        { id: 1, name: 'Acme' },
        { id: 2, name: 'Globex' },
      ],
      columns,
    )
    expect(result).toBe('ID,Name\n1,Acme\n2,Globex')
  })

  it('returns an empty string for empty data', () => {
    expect(formatCsv([], columns)).toBe('')
    expect(formatCsv(null, columns)).toBe('')
  })

  it('escapes values with commas', () => {
    const result = formatCsv([{ id: 1, name: 'Acme, Inc' }], columns)
    expect(result).toContain('"Acme, Inc"')
  })

  it('escapes values with double quotes', () => {
    const result = formatCsv([{ id: 1, name: 'Say "hi"' }], columns)
    expect(result).toContain('"Say ""hi"""')
  })

  it('escapes values with newlines', () => {
    const result = formatCsv([{ id: 1, name: 'line1\nline2' }], columns)
    expect(result).toContain('"line1\nline2"')
  })

  it('handles null values', () => {
    expect(formatCsv([{ id: 1, name: null }], columns)).toBe('ID,Name\n1,')
  })

  it('uses the column.get function', () => {
    const cols = {
      email: { header: 'Email', get: (row) => row.emails?.[0] ?? '' },
    }
    expect(formatCsv([{ emails: ['a@b.com'] }], cols)).toBe('Email\na@b.com')
  })

  it('uses column.key when specified', () => {
    const cols = { mail: { header: 'Mail', key: 'Email_1' } }
    expect(formatCsv([{ Email_1: 'x@y.com' }], cols)).toBe('Mail\nx@y.com')
  })

  it('derives columns from object keys when none are given (no silent blank output)', () => {
    const result = formatCsv(
      [
        { ID: 1, Name: 'Acme' },
        { ID: 2, Name: 'Globex' },
      ],
      {},
    )
    expect(result).toBe('ID,Name\n1,Acme\n2,Globex')
  })

  it('unions keys across rows when deriving columns', () => {
    const result = formatCsv([{ ID: 1 }, { ID: 2, Extra: 'z' }], {})
    expect(result).toBe('ID,Extra\n1,\n2,z')
  })

  it('JSON-encodes nested object and array values in derived columns', () => {
    const result = formatCsv([{ ID: 1, Address: { City: 'Gent' } }], {})
    expect(result).toBe('ID,Address\n1,"{""City"":""Gent""}"')
  })
})
