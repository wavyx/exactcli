import { describe, it, expect } from 'vitest'
import {
  buildCatalog,
  diffCatalogs,
  familyOf,
  trimResource,
} from '../../scripts/build-catalog.mjs'

describe('familyOf', () => {
  it.each([
    ['/api/v1/current/Me', 'current'],
    ['/api/v1/beta/{division}/crm/Accounts', 'beta'],
    ['/api/v1/{division}/sync/CRM/Accounts', 'sync'],
    ['/api/v1/{division}/bulk/CRM/Accounts', 'bulk'],
    ['/api/v1/{division}/read/crm/AccountDocuments', 'read'],
    ['/api/v1/{division}/crm/Accounts', 'regular'],
  ])('%s is %s', (uri, family) => {
    expect(familyOf(uri)).toBe(family)
  })
})

describe('trimResource', () => {
  it('keeps the catalogue keys only and defaults the property flags', () => {
    const trimmed = trimResource({
      name: 'CRMAccounts',
      uri: '/api/v1/{division}/crm/Accounts',
      service: 'CRM',
      resource: 'Accounts',
      methods: ['GET'],
      keys: ['ID'],
      scopeCode: 'crm-accounts',
      webhook: true,
      goodToKnow: 'dropped',
      properties: [{ name: 'ID', type: 'Edm.Guid', key: true, extra: 'x' }],
    })
    expect(trimmed).toEqual({
      uri: '/api/v1/{division}/crm/Accounts',
      service: 'CRM',
      resource: 'Accounts',
      family: 'regular',
      methods: ['GET'],
      keys: ['ID'],
      scope: 'crm-accounts',
      webhook: true,
      mandatoryFilters: null,
      properties: [
        {
          name: 'ID',
          type: 'Edm.Guid',
          key: true,
          mandatory: false,
          filter: null,
          post: false,
          put: false,
          navigation: false,
          hidden: false,
          description: null,
        },
      ],
    })
  })

  it('defaults the lists when the scrape has none', () => {
    const trimmed = trimResource({
      uri: '/api/v1/{division}/x/Y',
      service: 'x',
      resource: 'Y',
    })
    expect(trimmed.methods).toEqual([])
    expect(trimmed.keys).toEqual([])
    expect(trimmed.scope).toBeNull()
    expect(trimmed.webhook).toBe(false)
    expect(trimmed.properties).toEqual([])
  })
})

describe('buildCatalog', () => {
  it('sorts by uri, counts, and keeps the scrape date', () => {
    const catalog = buildCatalog({
      generatedAt: '2026-08-19T14:24:24.897Z',
      resources: [
        {
          uri: '/api/v1/{division}/crm/Accounts',
          service: 'CRM',
          resource: 'Accounts',
        },
        { uri: '/api/v1/current/Me', service: 'System', resource: 'Me' },
      ],
    })
    expect(catalog.count).toBe(2)
    expect(catalog.source).toBe('exactdoc')
    expect(catalog.generatedAt).toBe('2026-08-19T14:24:24.897Z')
    expect(catalog.resources.map((r) => r.uri)).toEqual([
      '/api/v1/current/Me',
      '/api/v1/{division}/crm/Accounts',
    ])
  })
})

describe('diffCatalogs', () => {
  it('reports added, removed and changed resources', () => {
    const r = (uri, properties = []) => ({ uri, properties })
    const before = { resources: [r('/a'), r('/b', [{ name: 'X' }]), r('/c')] }
    const after = { resources: [r('/a'), r('/b', [{ name: 'Y' }]), r('/d')] }
    expect(diffCatalogs(before, after)).toEqual({
      added: ['/d'],
      removed: ['/c'],
      changed: ['/b'],
    })
  })
})
