import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import {
  buildCoverage,
  callName,
  renderCoverage,
  typedCalls,
} from '../../scripts/gen-coverage.mjs'

const resource = (uri, family, methods) => ({ uri, family, methods })

describe('callName', () => {
  it.each([
    ['/api/v1/{division}/crm/Accounts', 'crm/Accounts'],
    [
      '/api/v1/beta/{division}/budget/BudgetScenarios',
      'budget/BudgetScenarios',
    ],
    ['/api/v1/{division}/sync/CRM/Accounts', 'sync/CRM/Accounts'],
    ['/api/v1/current/Me', 'current/Me'],
  ])('%s is %s', (uri, name) => {
    expect(callName(uri)).toBe(name)
  })
})

describe('typedCalls', () => {
  it('maps the list descriptors and every call a description names', () => {
    const manifest = {
      commands: {
        'account:create': {
          id: 'account:create',
          description: 'Create an account from flags (POST crm/Accounts)',
        },
        'document:create': {
          id: 'document:create',
          description:
            'Create a document (POST documents/Documents, POST documents/DocumentAttachments)',
        },
        doctor: { id: 'doctor', description: 'Check the setup' },
      },
    }
    const descriptors = {
      account: { topic: 'account', resource: 'crm/Accounts' },
    }

    const typed = typedCalls(manifest, descriptors)

    expect(Object.fromEntries(typed)).toEqual({
      'GET crm/Accounts': ['account list'],
      'POST crm/Accounts': ['account create'],
      'POST documents/Documents': ['document create'],
      'POST documents/DocumentAttachments': ['document create'],
    })
  })
})

describe('buildCoverage', () => {
  const catalog = {
    resources: [
      resource('/api/v1/{division}/crm/Accounts', 'regular', [
        'GET',
        'POST',
        'PUT',
        'DELETE',
      ]),
      resource('/api/v1/{division}/crm/Contacts', 'regular', ['GET', 'POST']),
      resource('/api/v1/{division}/sync/CRM/Accounts', 'sync', ['GET']),
    ],
  }
  const typed = new Map([
    ['GET crm/Accounts', ['account list']],
    ['POST crm/Accounts', ['account create']],
  ])
  const live = ['POST crm/Accounts', 'POST crm/Contacts', 'GET crm/Accounts']

  it('counts the calls, the typed ones and the live writes per family and method', () => {
    const { summary } = buildCoverage(catalog, typed, live)

    expect(summary).toEqual([
      { family: 'regular', method: 'GET', calls: 2, typed: 1, live: null },
      { family: 'regular', method: 'POST', calls: 2, typed: 1, live: 2 },
      { family: 'regular', method: 'PUT', calls: 1, typed: 0, live: 0 },
      { family: 'regular', method: 'DELETE', calls: 1, typed: 0, live: 0 },
      { family: 'sync', method: 'GET', calls: 1, typed: 0, live: null },
    ])
  })

  it('lists every write call with its typed commands and its live state', () => {
    const { writes } = buildCoverage(catalog, typed, live)

    expect(writes).toEqual([
      { call: 'POST crm/Accounts', typed: ['account create'], live: true },
      { call: 'PUT crm/Accounts', typed: [], live: false },
      { call: 'DELETE crm/Accounts', typed: [], live: false },
      { call: 'POST crm/Contacts', typed: [], live: true },
    ])
  })
})

describe('renderCoverage', () => {
  it('renders the summary and the write table as Markdown', () => {
    const md = renderCoverage(
      {
        summary: [
          { family: 'regular', method: 'GET', calls: 2, typed: 1, live: null },
          { family: 'regular', method: 'POST', calls: 2, typed: 1, live: 2 },
        ],
        writes: [
          { call: 'POST crm/Accounts', typed: ['account create'], live: true },
          { call: 'POST crm/Contacts', typed: [], live: false },
        ],
      },
      { catalogDate: '2026-09-07' },
    )

    expect(md).toMatch(/^# API coverage\n/)
    expect(md).toContain('catalogue of 2026-09-07')
    expect(md).toContain('| regular | GET | 2 | 1 | - |')
    expect(md).toContain('| regular | POST | 2 | 1 | 2 |')
    expect(md).toContain('| POST crm/Accounts | `account create` | yes |')
    expect(md).toContain('| POST crm/Contacts | - | no |')
    expect([...md].every((ch) => ch.charCodeAt(0) < 128)).toBe(true)
  })
})

describe('scripts/live-writes.json', () => {
  it('names only write calls that exist in the catalogue', () => {
    const live = JSON.parse(readFileSync('scripts/live-writes.json', 'utf8'))
    const catalog = JSON.parse(
      gunzipSync(readFileSync('src/data/catalog.json.gz')).toString(),
    )
    const known = new Set(
      catalog.resources.flatMap((r) =>
        r.methods.map((m) => `${m} ${callName(r.uri)}`),
      ),
    )

    expect(live.length).toBeGreaterThan(0)
    for (const call of live) {
      expect(call).toMatch(/^(POST|PUT|DELETE) /)
      expect(known.has(call), call).toBe(true)
    }
  })
})
