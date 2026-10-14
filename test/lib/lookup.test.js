import { describe, it, expect } from 'vitest'
import { findResource } from '../../src/lib/catalog.js'
import {
  bodyValue,
  literal,
  matchFilter,
  parseMatch,
} from '../../src/lib/lookup.js'

const accounts = findResource('crm/Accounts')
const prop = (res, name) => res.properties.find((p) => p.name === name)
const exit = (fn) => {
  try {
    fn()
  } catch (err) {
    return err.exitCode
  }
  return undefined
}

describe('parseMatch', () => {
  it('splits Field=value at the first =', () => {
    expect(parseMatch(['Code=1001', 'Name=A=B'])).toEqual([
      { field: 'Code', value: '1001' },
      { field: 'Name', value: 'A=B' },
    ])
  })

  it('fails with 64 without a field or a pair', () => {
    expect(exit(() => parseMatch([]))).toBe(64)
    expect(exit(() => parseMatch(['Code']))).toBe(64)
    expect(exit(() => parseMatch(['=x']))).toBe(64)
  })
})

describe('literal', () => {
  it('renders each type as an OData literal', () => {
    expect(literal(prop(accounts, 'Name'), "O'Neil")).toBe("'O''Neil'")
    expect(
      literal(prop(accounts, 'ID'), '11111111-1111-1111-1111-111111111111'),
    ).toBe("guid'11111111-1111-1111-1111-111111111111'")
    expect(literal({ name: 'N', type: 'Edm.Int32' }, '-12')).toBe('-12')
    expect(literal({ name: 'N', type: 'Edm.Double' }, '1.5')).toBe('1.5')
    expect(literal({ name: 'B', type: 'Edm.Boolean' }, 'TRUE')).toBe('true')
    expect(literal({ name: 'D', type: 'Edm.DateTime' }, '2026-10-14')).toBe(
      "datetime'2026-10-14'",
    )
  })

  it('fails with 64 on a value of the wrong shape or a type it cannot filter', () => {
    expect(exit(() => literal(prop(accounts, 'ID'), 'x'))).toBe(64)
    expect(
      exit(() => literal({ name: 'N', type: 'Edm.Int32' }, '1 or 1')),
    ).toBe(64)
    expect(exit(() => literal({ name: 'B', type: 'Edm.Boolean' }, 'yes'))).toBe(
      64,
    )
    expect(
      exit(() => literal({ name: 'D', type: 'Edm.DateTime' }, '14/10')),
    ).toBe(64)
    expect(exit(() => literal({ name: 'X', type: 'Notes' }, 'a'))).toBe(64)
  })
})

describe('bodyValue', () => {
  it('types a match value by its property', () => {
    expect(bodyValue({ type: 'Edm.Int32' }, '30')).toBe(30)
    expect(bodyValue({ type: 'Edm.Boolean' }, 'TRUE')).toBe(true)
    expect(bodyValue({ type: 'Edm.Boolean' }, 'false')).toBe(false)
    expect(bodyValue({ type: 'Edm.String' }, '1001')).toBe('1001')
  })
})

describe('matchFilter', () => {
  it('joins the fields with and, and tries a numeric Code padded too', () => {
    expect(
      matchFilter(accounts, [
        { field: 'Code', value: '1001' },
        { field: 'Name', value: 'Acme' },
      ]),
    ).toBe(
      "(Code eq '1001' or Code eq '              1001') and Name eq 'Acme'",
    )
    expect(matchFilter(accounts, [{ field: 'Code', value: 'ACME' }])).toBe(
      "Code eq 'ACME'",
    )
  })

  it('leaves a numeric Code of an Int32 field unpadded', () => {
    expect(
      matchFilter(findResource('hrm/Divisions'), [
        { field: 'Code', value: '123' },
      ]),
    ).toBe('Code eq 123')
  })

  it('fails with 64 on a field the resource does not have', () => {
    expect(
      exit(() => matchFilter(accounts, [{ field: 'Nope', value: 'x' }])),
    ).toBe(64)
  })
})
