import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
import nock from 'nock'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiBase, mockApi, runCmd } from '../helpers.js'
import { defaultColumns, findResource } from '../../src/lib/catalog.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-list-test-'))

const { default: ListCommand } = await import('../../src/commands/list.js')

const BASE = apiBase()
const ACCOUNTS_PATH = '/api/v1/123/crm/Accounts'
const BETA_ACCOUNTS_PATH = '/api/v1/beta/123/crm/Accounts'
/** The $select the command adds for a known resource without --select. */
const SELECT = defaultColumns(findResource('crm/Accounts')).join(',')

/** @param {object} [overrides] */
function account(overrides = {}) {
  return {
    __metadata: { uri: 'x' },
    ID: '11111111-1111-1111-1111-111111111111',
    Code: '1001',
    Name: 'Acme BE',
    Created: '/Date(1723990800000)/',
    ...overrides,
  }
}

/** Capture what the command writes to stderr. */
function captureStderr() {
  const chunks = []
  const spy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk) => chunks.push(String(chunk)) > 0)
  return {
    text: () => chunks.join(''),
    restore: () => spy.mockRestore(),
  }
}

beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
  process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
})

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  delete process.env.EXACTCLI_ACCESS_TOKEN
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  nock.cleanAll()
  nock.disableNetConnect()
  delete process.env.EXACTCLI_DIVISION
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
  delete process.env.EXACTCLI_DIVISION
})

describe('list', () => {
  it('reads one page and normalizes the rows', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $select: SELECT })
      .reply(200, { d: { results: [account(), account({ Code: '1002' })] } })

    const stdout = await runCmd(ListCommand, [
      'crm/Accounts',
      '--division',
      '123',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      ID: '11111111-1111-1111-1111-111111111111',
      Code: '1001',
      Name: 'Acme BE',
      Created: '2024-08-18T14:20:00',
    })
    expect(scope.isDone()).toBe(true)
  })

  it('stops after the first page and reports the rest on stderr', async () => {
    // A second page mock is deliberately absent: without --all and without
    // --limit the walk must stop after page one.
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $select: SELECT })
      .reply(200, {
        d: {
          results: [account()],
          __next: `${BASE}${ACCOUNTS_PATH}?$skiptoken=guid'1'`,
        },
      })

    const stderr = captureStderr()
    let stdout
    try {
      stdout = await runCmd(ListCommand, [
        'crm/Accounts',
        '--division',
        '123',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(JSON.parse(stdout)).toHaveLength(1)
    expect(stderr.text()).toBe(
      'More results available. Use --all or --limit.\n',
    )
    expect(scope.isDone()).toBe(true)
  })

  it('stays quiet on stderr when the collection is exhausted', async () => {
    mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $select: SELECT })
      .reply(200, { d: { results: [account()] } })

    const stderr = captureStderr()
    try {
      await runCmd(ListCommand, [
        'crm/Accounts',
        '--division',
        '123',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(stderr.text()).toBe('')
  })

  it('sends every OData flag as a query parameter', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({
        $filter: "Status eq 'C'",
        $select: 'ID,Name',
        $expand: 'Contacts',
        $orderby: 'Name asc',
        $top: '10',
      })
      .reply(200, { d: [account()] })

    await runCmd(ListCommand, [
      'crm/Accounts',
      '--division',
      '123',
      '--filter',
      "Status eq 'C'",
      '--select',
      'ID,Name',
      '--expand',
      'Contacts',
      '--orderby',
      'Name asc',
      '--top',
      '10',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('--top reads the bare array envelope Exact answers with $top', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $top: '2', $select: SELECT })
      .reply(200, { d: [account({ Code: '1' }), account({ Code: '2' })] })

    const stderr = captureStderr()
    let stdout
    try {
      stdout = await runCmd(ListCommand, [
        'crm/Accounts',
        '--division',
        '123',
        '--top',
        '2',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(JSON.parse(stdout).map((r) => r.Code)).toEqual(['1', '2'])
    expect(stderr.text()).toBe('')
    expect(scope.isDone()).toBe(true)
  })

  it('--limit collects across pages and truncates to the limit', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $top: '2', $select: SELECT })
      .reply(200, {
        d: {
          results: [account({ Code: '1' }), account({ Code: '2' })],
          __next: `${BASE}${ACCOUNTS_PATH}?$skiptoken=guid'2'`,
        },
      })
      .get(ACCOUNTS_PATH)
      .query({ $skiptoken: "guid'2'" })
      .reply(200, {
        d: {
          results: [account({ Code: '3' }), account({ Code: '4' })],
          __next: `${BASE}${ACCOUNTS_PATH}?$skiptoken=guid'4'`,
        },
      })

    const stderr = captureStderr()
    let stdout
    try {
      stdout = await runCmd(ListCommand, [
        'crm/Accounts',
        '--division',
        '123',
        '--top',
        '2',
        '--limit',
        '3',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(JSON.parse(stdout).map((r) => r.Code)).toEqual(['1', '2', '3'])
    expect(stderr.text()).toContain('More results available')
    expect(scope.isDone()).toBe(true)
  })

  it('reports the rest when --limit ends exactly on a page boundary', async () => {
    // --top 2 --limit 2 consumes the whole first page. The note still goes
    // out, so the second page must stay unrequested.
    mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $top: '2', $select: SELECT })
      .reply(200, {
        d: {
          results: [account({ Code: '1' }), account({ Code: '2' })],
          __next: `${BASE}${ACCOUNTS_PATH}?$skiptoken=guid'2'`,
        },
      })
      .get(ACCOUNTS_PATH)
      .query({ $skiptoken: "guid'2'" })
      .reply(200, { d: { results: [account({ Code: '3' })] } })

    const stderr = captureStderr()
    let stdout
    try {
      stdout = await runCmd(ListCommand, [
        'crm/Accounts',
        '--division',
        '123',
        '--top',
        '2',
        '--limit',
        '2',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(JSON.parse(stdout).map((r) => r.Code)).toEqual(['1', '2'])
    expect(stderr.text()).toBe(
      'More results available. Use --all or --limit.\n',
    )
    expect(nock.pendingMocks()).toHaveLength(1)
  })

  it('--limit alone truncates inside the first page', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $select: SELECT })
      .reply(200, {
        d: { results: [account({ Code: '1' }), account({ Code: '2' })] },
      })

    const stdout = await runCmd(ListCommand, [
      'crm/Accounts',
      '--division',
      '123',
      '--limit',
      '1',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).map((r) => r.Code)).toEqual(['1'])
    expect(scope.isDone()).toBe(true)
  })

  it('--max-pages caps the pages a --limit would otherwise need', async () => {
    // --limit 100 at a page size of 2 asks for 50 pages; --max-pages 1 wins.
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $top: '2', $select: SELECT })
      .reply(200, {
        d: {
          results: [account({ Code: '1' }), account({ Code: '2' })],
          __next: `${BASE}${ACCOUNTS_PATH}?$skiptoken=guid'2'`,
        },
      })

    const stderr = captureStderr()
    let stdout
    try {
      stdout = await runCmd(ListCommand, [
        'crm/Accounts',
        '--division',
        '123',
        '--top',
        '2',
        '--limit',
        '100',
        '--max-pages',
        '1',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(JSON.parse(stdout)).toHaveLength(2)
    expect(scope.isDone()).toBe(true)
  })

  it('--all follows every page', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $select: SELECT })
      .reply(200, {
        d: {
          results: [account({ Code: '1' })],
          __next: `${BASE}${ACCOUNTS_PATH}?$skiptoken=guid'1'`,
        },
      })
      .get(ACCOUNTS_PATH)
      .query({ $skiptoken: "guid'1'" })
      .reply(200, { d: { results: [account({ Code: '2' })] } })

    const stderr = captureStderr()
    let stdout
    try {
      stdout = await runCmd(ListCommand, [
        'crm/Accounts',
        '--division',
        '123',
        '--all',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(JSON.parse(stdout).map((r) => r.Code)).toEqual(['1', '2'])
    expect(stderr.text()).toBe('')
    expect(scope.isDone()).toBe(true)
  })

  it('--all stops at --max-pages and reports the rest on stderr', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $select: SELECT })
      .reply(200, {
        d: {
          results: [account({ Code: '1' })],
          __next: `${BASE}${ACCOUNTS_PATH}?$skiptoken=guid'1'`,
        },
      })

    const stderr = captureStderr()
    let stdout
    try {
      stdout = await runCmd(ListCommand, [
        'crm/Accounts',
        '--division',
        '123',
        '--all',
        '--max-pages',
        '1',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(JSON.parse(stdout)).toHaveLength(1)
    expect(stderr.text()).toBe('More results available. Raise --max-pages.\n')
    expect(scope.isDone()).toBe(true)
  })

  it('--raw keeps the envelope fields untouched', async () => {
    mockApi()
      .get(ACCOUNTS_PATH)
      .reply(200, { d: { results: [account()] } })

    const stdout = await runCmd(ListCommand, [
      'crm/Accounts',
      '--division',
      '123',
      '--raw',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)

    expect(rows[0].__metadata).toEqual({ uri: 'x' })
    expect(rows[0].Created).toBe('/Date(1723990800000)/')
  })

  it('--beta reads the beta path', async () => {
    const scope = mockApi()
      .get(BETA_ACCOUNTS_PATH)
      .query({ $select: SELECT })
      .reply(200, { d: { results: [account()] } })

    await runCmd(ListCommand, [
      'crm/Accounts',
      '--division',
      '123',
      '--beta',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('derives the table columns from the rows', async () => {
    mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $select: SELECT })
      .reply(200, { d: { results: [account()] } })

    const stdout = await runCmd(ListCommand, [
      'crm/Accounts',
      '--division',
      '123',
    ])

    for (const header of ['ID', 'Code', 'Name', 'Created']) {
      expect(stdout).toContain(header)
    }
    expect(stdout).toContain('Acme BE')
    expect(stdout).not.toContain('__metadata')
  })

  it('rejects a resource that is not service/Resource with exit 64', async () => {
    const err = await ListCommand.run(['Accounts', '--division', '123']).catch(
      (e) => e,
    )
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/service\/Resource/)
  })

  it('fails with exit 78 when no division is configured', async () => {
    const err = await ListCommand.run(['crm/Accounts']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.message).toMatch(/No division configured/)
  })
  it('selects the default columns of a known resource and shows them', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $select: SELECT })
      .reply(200, { d: { results: [account()] } })
    process.stdout.isTTY = true

    const stdout = await runCmd(ListCommand, [
      'crm/Accounts',
      '--division',
      '123',
    ])

    expect(scope.isDone()).toBe(true)
    expect(stdout).toMatch(/Code/)
    expect(stdout).toMatch(/Acme BE/)
  })

  it('keeps every field when --fields is given', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .reply(200, { d: { results: [account()] } })

    const stdout = await runCmd(ListCommand, [
      'crm/Accounts',
      '--division',
      '123',
      '--fields',
      'Code',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
    expect(JSON.parse(stdout)).toEqual([{ Code: '1001' }])
  })

  it('warns on stderr for an unknown resource and still sends the request', async () => {
    const scope = mockApi()
      .get('/api/v1/123/crm/Nope')
      .reply(200, { d: { results: [] } })
    const stderr = captureStderr()
    try {
      await runCmd(ListCommand, [
        'crm/Nope',
        '--division',
        '123',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(scope.isDone()).toBe(true)
    expect(stderr.text()).toMatch(
      /^Unknown resource crm\/Nope \(not in the catalogue of \d{4}-\d{2}-\d{2}\)\. Sending anyway\.\n/,
    )
  })
  it('--count asks $count with the filter and prints the number', async () => {
    const scope = mockApi()
      .get(`${ACCOUNTS_PATH}/$count`)
      .query({ $filter: "Status eq 'C'" })
      .matchHeader('accept', 'text/plain, application/json')
      .reply(200, '7', { 'content-type': 'text/plain' })

    const stdout = await runCmd(ListCommand, [
      'crm/Accounts',
      '--filter',
      "Status eq 'C'",
      '--count',
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({ count: 7 })
    expect(scope.isDone()).toBe(true)
  })

  it('--count prints the bare number in a table', async () => {
    const scope = mockApi()
      .get(`${ACCOUNTS_PATH}/$count`)
      .reply(200, '7', { 'content-type': 'text/plain' })

    const stdout = await runCmd(ListCommand, [
      'crm/Accounts',
      '--count',
      '--division',
      '123',
      '--output',
      'table',
    ])

    expect(stdout).toBe('7')
    expect(scope.isDone()).toBe(true)
  })

  it('--count with --bulk counts through the regular resource', async () => {
    const scope = mockApi()
      .get(`${ACCOUNTS_PATH}/$count`)
      .reply(200, '3', { 'content-type': 'text/plain' })

    const stdout = await runCmd(ListCommand, [
      'crm/Accounts',
      '--bulk',
      '--count',
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({ count: 3 })
    expect(scope.isDone()).toBe(true)
  })

  it('--bulk reads the bulk variant with the catalogue columns and no $top', async () => {
    const scope = mockApi()
      .get('/api/v1/123/bulk/CRM/Accounts')
      .query({ $select: SELECT })
      .reply(200, { d: { results: [account()] } })

    const stdout = await runCmd(ListCommand, [
      'crm/Accounts',
      '--bulk',
      '--top',
      '2',
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
    expect(JSON.parse(stdout)).toHaveLength(1)
  })

  it('--bulk falls back to the catalogue $select when --fields projects the output', async () => {
    const scope = mockApi()
      .get('/api/v1/123/bulk/CRM/Accounts')
      .query({ $select: SELECT })
      .reply(200, { d: { results: [account()] } })

    const stdout = await runCmd(ListCommand, [
      'crm/Accounts',
      '--bulk',
      '--fields',
      'Code',
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
    expect(JSON.parse(stdout)).toEqual([{ Code: '1001' }])
  })

  it('--bulk keeps an explicit --select', async () => {
    const scope = mockApi()
      .get('/api/v1/123/bulk/CRM/Accounts')
      .query({ $select: 'Code' })
      .reply(200, { d: { results: [{ Code: '1' }] } })

    await runCmd(ListCommand, [
      'crm/Accounts',
      '--bulk',
      '--select',
      'Code',
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('--bulk fails with 64 without a bulk variant, on an unknown resource, and with --raw', async () => {
    const noVariant = await ListCommand.run([
      'system/Divisions',
      '--bulk',
      '--division',
      '123',
    ]).catch((e) => e)
    expect(noVariant.exitCode ?? noVariant.oclif?.exit).toBe(64)
    expect(noVariant.message).toMatch(/has no bulk variant \(families: regular/)
    const unknown = await ListCommand.run([
      'crm/Nope',
      '--bulk',
      '--division',
      '123',
    ]).catch((e) => e)
    expect(unknown.exitCode ?? unknown.oclif?.exit).toBe(64)
    const raw = await ListCommand.run([
      'crm/Accounts',
      '--bulk',
      '--raw',
      '--division',
      '123',
    ]).catch((e) => e)
    expect(raw.exitCode ?? raw.oclif?.exit).toBe(64)
    expect(raw.message).toMatch(/--bulk needs --select/)
  })
})
