import { describe, it, expect } from 'vitest'
import {
  odataFlags,
  buildQuery,
  divisionPath,
  substituteDivision,
  requireDivision,
  unwrap,
  parseODataDate,
  normalize,
  autoColumns,
  DATE_RE,
} from '../../src/lib/odata.js'

describe('odataFlags', () => {
  it('defines filter as a string flag with the expected description', () => {
    expect(odataFlags.filter.type).toBe('option')
    expect(odataFlags.filter.description).toBe('OData $filter expression')
  })

  it('defines select as a string flag with the expected description', () => {
    expect(odataFlags.select.type).toBe('option')
    expect(odataFlags.select.description).toBe(
      'Comma-separated properties for $select',
    )
  })

  it('defines expand as a string flag', () => {
    expect(odataFlags.expand.type).toBe('option')
    expect(typeof odataFlags.expand.description).toBe('string')
  })

  it('defines orderby as a string flag', () => {
    expect(odataFlags.orderby.type).toBe('option')
    expect(typeof odataFlags.orderby.description).toBe('string')
  })

  it('defines top as an integer flag with min 1 and max 60', () => {
    expect(odataFlags.top.type).toBe('option')
    expect(odataFlags.top.min).toBe(1)
    expect(odataFlags.top.max).toBe(60)
    expect(odataFlags.top.description).toBe('Page size ($top), max 60')
  })
})

describe('buildQuery', () => {
  it('returns an empty object when no flags are given', () => {
    expect(buildQuery({})).toEqual({})
  })

  it('builds every OData parameter when every flag is present', () => {
    expect(
      buildQuery({
        filter: "Code eq 'ACM'",
        select: 'ID,Code',
        expand: 'Contacts',
        orderby: 'Code',
        top: 10,
      }),
    ).toEqual({
      $filter: "Code eq 'ACM'",
      $select: 'ID,Code',
      $expand: 'Contacts',
      $orderby: 'Code',
      $top: 10,
    })
  })

  it('drops empty strings', () => {
    expect(
      buildQuery({ filter: '', select: '', expand: '', orderby: '' }),
    ).toEqual({})
  })

  it('includes only the flags that are present', () => {
    expect(buildQuery({ filter: "Code eq 'ACM'", top: 5 })).toEqual({
      $filter: "Code eq 'ACM'",
      $top: 5,
    })
  })
})

describe('divisionPath', () => {
  it('builds a v1 path from a resource without a leading slash', () => {
    expect(divisionPath(123, 'crm/Accounts')).toBe('/api/v1/123/crm/Accounts')
  })

  it('strips a single leading slash from the resource', () => {
    expect(divisionPath(123, '/crm/Accounts')).toBe('/api/v1/123/crm/Accounts')
  })

  it('builds a beta path when beta is true', () => {
    expect(divisionPath(123, 'crm/Accounts', { beta: true })).toBe(
      '/api/v1/beta/123/crm/Accounts',
    )
  })

  it('throws CliError 64 when the resource has no slash', () => {
    expect(() => divisionPath(123, 'Accounts')).toThrow(
      'Resource must look like service/Resource',
    )
    try {
      divisionPath(123, 'Accounts')
    } catch (err) {
      expect(err.exitCode).toBe(64)
    }
  })

  it('throws CliError 64 when the resource contains ..', () => {
    expect(() => divisionPath(123, 'crm/../Accounts')).toThrow(
      'Resource must look like service/Resource',
    )
  })

  it('throws CliError 64 when the resource contains ?', () => {
    expect(() => divisionPath(123, 'crm/Accounts?x=1')).toThrow(
      'Resource must look like service/Resource',
    )
  })

  it.each([
    '%2e%2e/456/crm/Accounts',
    '.%2e/456/crm/Accounts',
    '%2E%2E/456/crm/Accounts',
    'crm/Acc%20ounts',
    'crm/Acc%zz',
    'crm\\Accounts/x',
  ])(
    'throws CliError 64 for the encoded or escaped resource %s',
    (resource) => {
      let err
      try {
        divisionPath(123, resource)
      } catch (e) {
        err = e
      }
      expect(err.exitCode).toBe(64)
      expect(err.message).toBe('Resource must look like service/Resource')
    },
  )

  it('validates the resource before checking the division', () => {
    try {
      divisionPath(undefined, 'Accounts')
    } catch (err) {
      expect(err.exitCode).toBe(64)
      expect(err.message).toBe('Resource must look like service/Resource')
    }
  })

  it('throws ConfigError 78 when the division is missing and the resource is valid', () => {
    try {
      divisionPath(undefined, 'crm/Accounts')
    } catch (err) {
      expect(err.exitCode).toBe(78)
      expect(err.message).toBe(
        'No division configured. Run: exactcli auth login or exactcli config set division <code>',
      )
    }
  })
})

describe('substituteDivision', () => {
  it('replaces a single {division} placeholder', () => {
    expect(substituteDivision('/api/v1/{division}/crm/Accounts', 123)).toBe(
      '/api/v1/123/crm/Accounts',
    )
  })

  it('replaces every occurrence of the placeholder', () => {
    expect(substituteDivision('/{division}/a/{division}/b', 7)).toBe('/7/a/7/b')
  })

  it('returns the path unchanged when it has no placeholder', () => {
    expect(substituteDivision('/api/v1/123/crm/Accounts', undefined)).toBe(
      '/api/v1/123/crm/Accounts',
    )
  })

  it('does not validate the division when the placeholder is absent', () => {
    expect(() =>
      substituteDivision('/api/v1/123/crm/Accounts', 'not-a-number'),
    ).not.toThrow()
  })

  it('throws ConfigError when the placeholder is present and the division is missing', () => {
    try {
      substituteDivision('/api/v1/{division}/crm/Accounts', undefined)
    } catch (err) {
      expect(err.exitCode).toBe(78)
      expect(err.message).toBe(
        'No division configured. Run: exactcli auth login or exactcli config set division <code>',
      )
    }
  })

  it('accepts a numeric string division', () => {
    expect(substituteDivision('/{division}/x', '456')).toBe('/456/x')
  })
})

describe('requireDivision', () => {
  it('returns a positive integer division as a number', () => {
    expect(requireDivision(123)).toBe(123)
  })

  it('returns a positive numeric string division as a number', () => {
    expect(requireDivision('123')).toBe(123)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a non-numeric string', 'abc'],
    ['zero', 0],
    ['a negative number', -1],
    ['a non-integer number', 1.5],
  ])('throws ConfigError for %s', (_label, value) => {
    expect(() => requireDivision(value)).toThrow(
      'No division configured. Run: exactcli auth login or exactcli config set division <code>',
    )
    try {
      requireDivision(value)
    } catch (err) {
      expect(err.exitCode).toBe(78)
    }
  })
})

describe('unwrap', () => {
  it('returns { ok: true } when the body is undefined', () => {
    expect(unwrap(undefined)).toEqual({ ok: true })
  })

  it('returns { ok: true } when the body is null', () => {
    expect(unwrap(null)).toEqual({ ok: true })
  })

  it('returns the results array from a collection envelope', () => {
    const results = [{ ID: 1 }, { ID: 2 }]
    expect(unwrap({ d: { results } })).toBe(results)
  })

  it('returns the d object from a single-record envelope', () => {
    const record = { ID: 1, Code: 'ACM' }
    expect(unwrap({ d: record })).toBe(record)
  })

  it('returns the d value unchanged when it is explicitly null', () => {
    const body = { d: null }
    expect(unwrap(body)).toBe(body)
  })

  it('returns the body as is when it has no d property', () => {
    const body = { foo: 'bar' }
    expect(unwrap(body)).toBe(body)
  })
})

describe('DATE_RE', () => {
  it('matches a /Date(ms)/ value without an offset', () => {
    expect(DATE_RE.test('/Date(1723990800000)/')).toBe(true)
  })

  it('matches a /Date(ms+offset)/ value', () => {
    expect(DATE_RE.test('/Date(1723990800000+0000)/')).toBe(true)
  })

  it('does not match an unrelated string', () => {
    expect(DATE_RE.test('2024-08-18')).toBe(false)
  })
})

describe('parseODataDate', () => {
  it('parses a /Date(ms)/ value into an ISO-like string without an offset', () => {
    expect(parseODataDate('/Date(1723990800000)/')).toBe('2024-08-18T14:20:00')
  })

  it('ignores the offset when present', () => {
    expect(parseODataDate('/Date(1723990800000+0000)/')).toBe(
      '2024-08-18T14:20:00',
    )
    expect(parseODataDate('/Date(1723990800000-0500)/')).toBe(
      '2024-08-18T14:20:00',
    )
  })

  it('handles a negative millisecond value (before the epoch)', () => {
    expect(parseODataDate('/Date(-3600000)/')).toBe('1969-12-31T23:00:00')
  })

  it('returns non-matching strings unchanged', () => {
    expect(parseODataDate('not a date')).toBe('not a date')
    expect(parseODataDate('2024-08-18T14:20:00Z')).toBe('2024-08-18T14:20:00Z')
  })

  it('returns non-string input unchanged', () => {
    expect(parseODataDate(123)).toBe(123)
    expect(parseODataDate(null)).toBe(null)
    expect(parseODataDate(undefined)).toBe(undefined)
    const obj = { x: 1 }
    expect(parseODataDate(obj)).toBe(obj)
  })
})

describe('normalize', () => {
  it('removes __metadata and __deferred from a top-level object', () => {
    const input = Object.freeze({
      ID: 1,
      __metadata: { uri: 'x', type: 'y' },
      Contacts: Object.freeze({ __deferred: { uri: 'z' } }),
    })
    expect(normalize(input)).toEqual({ ID: 1, Contacts: {} })
  })

  it('removes __metadata and __deferred from nested objects', () => {
    const input = {
      d: {
        __metadata: { uri: 'x' },
        Account: {
          __metadata: { uri: 'y' },
          Address: { __deferred: { uri: 'z' }, __metadata: { uri: 'w' } },
        },
      },
    }
    expect(normalize(input)).toEqual({
      d: { Account: { Address: {} } },
    })
  })

  it('removes __metadata and __deferred from objects inside arrays', () => {
    const input = {
      results: [
        { ID: 1, __metadata: { uri: 'a' } },
        { ID: 2, __metadata: { uri: 'b' } },
      ],
    }
    expect(normalize(input)).toEqual({
      results: [{ ID: 1 }, { ID: 2 }],
    })
  })

  it('converts matching date strings anywhere in the structure', () => {
    const input = {
      Created: '/Date(1723990800000)/',
      Nested: { Modified: '/Date(1723990800000+0000)/' },
      History: ['/Date(1723990800000)/', 'not a date'],
    }
    expect(normalize(input)).toEqual({
      Created: '2024-08-18T14:20:00',
      Nested: { Modified: '2024-08-18T14:20:00' },
      History: ['2024-08-18T14:20:00', 'not a date'],
    })
  })

  it('passes primitives through unchanged', () => {
    expect(normalize(1)).toBe(1)
    expect(normalize(true)).toBe(true)
    expect(normalize(null)).toBe(null)
    expect(normalize(undefined)).toBe(undefined)
    expect(normalize('plain string')).toBe('plain string')
  })

  it('normalizes a bare array', () => {
    expect(normalize([{ __metadata: { uri: 'x' }, ID: 1 }])).toEqual([
      { ID: 1 },
    ])
  })

  it('does not mutate the input', () => {
    const input = {
      ID: 1,
      __metadata: { uri: 'x' },
      Created: '/Date(1723990800000)/',
      Nested: { __deferred: { uri: 'y' }, Value: 2 },
      List: [{ __metadata: { uri: 'z' }, ID: 3 }],
    }
    const snapshot = JSON.parse(JSON.stringify(input))
    normalize(input)
    expect(input).toEqual(snapshot)
  })
})

describe('autoColumns', () => {
  it('returns an empty object for empty input', () => {
    expect(autoColumns([])).toEqual({})
  })

  it('builds one column per primitive-valued key on the first row', () => {
    const rows = [
      { ID: 1, Code: 'ACM', Active: true, Notes: null },
      { ID: 2, Code: 'FOO', Active: false, Notes: 'x' },
    ]
    expect(autoColumns(rows)).toEqual({
      ID: { header: 'ID' },
      Code: { header: 'Code' },
      Active: { header: 'Active' },
      Notes: { header: 'Notes' },
    })
  })

  it('skips keys whose first-row value is an object or an array', () => {
    const rows = [
      {
        ID: 1,
        Address: { City: 'Brussels' },
        Tags: ['a', 'b'],
        Code: 'ACM',
      },
    ]
    expect(autoColumns(rows)).toEqual({
      ID: { header: 'ID' },
      Code: { header: 'Code' },
    })
  })

  it('uses only the first row, ignoring keys that appear later', () => {
    const rows = [{ ID: 1 }, { ID: 2, Extra: 'x' }]
    expect(autoColumns(rows)).toEqual({ ID: { header: 'ID' } })
  })
})
