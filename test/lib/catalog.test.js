import { describe, it, expect, beforeEach } from 'vitest'
import { fileURLToPath } from 'node:url'
import {
  catalogKey,
  defaultColumns,
  filterableFields,
  findResource,
  keyType,
  loadCatalog,
  mandatoryFields,
  resetCatalog,
  resolvePath,
  searchResources,
  validateDescriptor,
} from '../../src/lib/catalog.js'

const FIXTURE = fileURLToPath(
  new URL('../fixtures/catalog.json', import.meta.url),
)
const REAL = fileURLToPath(
  new URL('../../src/data/catalog.json.gz', import.meta.url),
)

let catalog
beforeEach(() => {
  resetCatalog()
  catalog = loadCatalog(FIXTURE)
})

describe('catalogKey', () => {
  it.each([
    ['crm/Accounts', '{division}/crm/accounts'],
    ['/crm/Accounts', '{division}/crm/accounts'],
    ['CRM/ACCOUNTS', '{division}/crm/accounts'],
    ['sync/CRM/Accounts', '{division}/sync/crm/accounts'],
    ['bulk/CRM/Accounts', '{division}/bulk/crm/accounts'],
    ['beta/crm/Accounts', 'beta/{division}/crm/accounts'],
    ['current/Me', 'current/me'],
    ['/api/v1/123/crm/Accounts', '{division}/crm/accounts'],
    ['/api/v1/beta/123/crm/Accounts', 'beta/{division}/crm/accounts'],
    ['/api/v1/{division}/crm/Accounts', '{division}/crm/accounts'],
    ["crm/Accounts(guid'x')", '{division}/crm/accounts'],
    ['crm/Accounts?$top=1', '{division}/crm/accounts'],
  ])('normalises %s', (input, key) => {
    expect(catalogKey(input)).toBe(key)
  })
})

describe('findResource', () => {
  it('finds a resource by any accepted reference', () => {
    expect(findResource('crm/accounts', catalog).resource).toBe('Accounts')
    expect(findResource('/api/v1/123/sync/CRM/Accounts', catalog).family).toBe(
      'sync',
    )
    expect(findResource('current/Me', catalog).family).toBe('current')
  })

  it('returns undefined for an unknown path', () => {
    expect(findResource('crm/Nope', catalog)).toBeUndefined()
  })

  it('uses the memoised index for the default catalogue', () => {
    resetCatalog()
    const real = loadCatalog()
    expect(findResource('crm/Accounts', real)).toBe(
      findResource('crm/Accounts'),
    )
  })
})

describe('searchResources', () => {
  it('matches name, service and property descriptions, regular family first', () => {
    const uris = searchResources('account', catalog).map((r) => r.uri)
    expect(uris[0]).toBe('/api/v1/{division}/crm/Accounts')
    expect(uris).toContain('/api/v1/{division}/financial/GLAccounts')
    expect(uris).toContain('/api/v1/{division}/sync/CRM/Accounts')
  })

  it('ranks a service match after a name match and a property match last', () => {
    const uris = searchResources('financial', catalog).map((r) => r.uri)
    expect(uris).toEqual([
      '/api/v1/{division}/financial/GLAccounts',
      '/api/v1/{division}/financialtransaction/TransactionLines',
    ])
    const byProperty = searchResources('subject', catalog).map((r) => r.uri)
    expect(byProperty).toEqual(['/api/v1/{division}/documents/Documents'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(searchResources('zzz', catalog)).toEqual([])
  })
})

describe('field helpers', () => {
  it('lists mandatory and filterable fields', () => {
    const res = findResource('crm/Accounts', catalog)
    expect(mandatoryFields(res)).toEqual(['Name'])
    expect(filterableFields(res)).toEqual(['ID', 'Code', 'Name'])
  })

  it('reports the key type', () => {
    expect(keyType(findResource('crm/Accounts', catalog))).toBe('guid')
    expect(keyType(findResource('system/Divisions', catalog))).toBe('plain')
  })

  it('derives default columns: keys, names, dates, amounts, 8 at most, no hidden', () => {
    expect(defaultColumns(findResource('crm/Accounts', catalog))).toEqual([
      'ID',
      'Code',
      'Name',
      'Status',
      'Created',
      'City',
      'Country',
      'VATNumber',
    ])
    expect(
      defaultColumns(findResource('salesentry/SalesEntries', catalog)),
    ).toEqual([
      'EntryID',
      'Description',
      'EntryNumber',
      'InvoiceNumber',
      'StatusDescription',
      'EntryDate',
      'AmountDC',
      'VATAmountDC',
    ])
  })
})

describe('defaultColumns and dates', () => {
  const res = (names) => ({
    keys: [],
    properties: names.map((name) => ({ name, type: 'Edm.DateTime' })),
  })

  it('takes the known dates in order and drops the others', () => {
    expect(
      defaultColumns(res(['EndDate', 'Modified', 'ControlledDate', 'Created'])),
    ).toEqual(['Created', 'Modified', 'EndDate', 'ControlledDate'])
  })

  it('takes the first date only when none is known', () => {
    expect(defaultColumns(res(['EndDate', 'StartDate']))).toEqual([
      'EndDate',
      'StartDate',
    ])
  })
})

describe('validateDescriptor', () => {
  it('accepts a descriptor whose columns and filter fields exist', () => {
    expect(() =>
      validateDescriptor(
        {
          resource: 'crm/Accounts',
          columns: ['Code', 'Name'],
          filters: { search: { field: 'Name' } },
        },
        catalog,
      ),
    ).not.toThrow()
  })

  it('names every unknown column and field', () => {
    expect(() =>
      validateDescriptor(
        {
          resource: 'crm/Accounts',
          columns: ['Nope'],
          filters: { x: { field: 'Zip' } },
        },
        catalog,
      ),
    ).toThrow(/crm\/Accounts: unknown columns Nope; unknown filter fields Zip/)
  })

  it('tolerates a descriptor without filters and reports a missing column only', () => {
    expect(() =>
      validateDescriptor(
        { resource: 'crm/Accounts', columns: ['Nope'] },
        catalog,
      ),
    ).toThrow(/unknown columns Nope; unknown filter fields -/)
  })

  it('rejects an unknown resource', () => {
    expect(() =>
      validateDescriptor({ resource: 'crm/Nope', columns: [] }, catalog),
    ).toThrow(/unknown resource crm\/Nope/)
  })
})

describe('catalogue copies', () => {
  it('indexes a catalogue that is not the memoised one', () => {
    const copy = structuredClone(catalog)
    expect(findResource('crm/Accounts', copy).resource).toBe('Accounts')
  })

  it('searches through a property without description', () => {
    const copy = structuredClone(catalog)
    copy.resources[0].properties[0].description = null
    expect(searchResources('zzz', copy)).toEqual([])
  })

  it('validates a descriptor without columns', () => {
    expect(() =>
      validateDescriptor(
        { resource: 'crm/Accounts', filters: { x: { field: 'Zip' } } },
        catalog,
      ),
    ).toThrow(/unknown columns -; unknown filter fields Zip/)
  })
})

describe('resolvePath', () => {
  it('builds the division path and returns the record', () => {
    const { path, resource } = resolvePath(123, 'crm/Accounts', {}, catalog)
    expect(path).toBe('/api/v1/123/crm/Accounts')
    expect(resource.resource).toBe('Accounts')
  })

  it('handles current, beta and sync references', () => {
    expect(resolvePath(123, 'current/Me', {}, catalog).path).toBe(
      '/api/v1/current/Me',
    )
    expect(resolvePath(123, '/current/Me', {}, catalog).path).toBe(
      '/api/v1/current/Me',
    )
    expect(resolvePath(123, 'crm/Accounts', { beta: true }, catalog).path).toBe(
      '/api/v1/beta/123/crm/Accounts',
    )
    expect(resolvePath(123, 'beta/crm/Accounts', {}, catalog).path).toBe(
      '/api/v1/beta/123/crm/Accounts',
    )
    expect(resolvePath(123, 'sync/CRM/Accounts', {}, catalog).path).toBe(
      '/api/v1/123/sync/CRM/Accounts',
    )
  })

  it('returns no record for an unknown path but still a path', () => {
    const { path, resource } = resolvePath(123, 'crm/Nope', {}, catalog)
    expect(path).toBe('/api/v1/123/crm/Nope')
    expect(resource).toBeUndefined()
  })

  it('rejects a path that is not service/Resource', () => {
    expect(() => resolvePath(123, 'nope', {}, catalog)).toThrow(
      /service\/Resource/,
    )
  })
})

describe('the shipped catalogue', () => {
  it('loads, has at least 400 resources with unique uris and a generatedAt', () => {
    resetCatalog()
    const real = loadCatalog(REAL)
    expect(real.resources.length).toBeGreaterThan(400)
    expect(new Set(real.resources.map((r) => r.uri)).size).toBe(
      real.resources.length,
    )
    expect(real.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(findResource('crm/Accounts', real).methods).toContain('POST')
  })

  it('memoises the default load', () => {
    resetCatalog()
    expect(loadCatalog()).toBe(loadCatalog())
  })
})
