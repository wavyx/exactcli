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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiBase, mockApi, runCmd } from '../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-api-test-'))
const BODY_FILE = join(TMP_CONFIG_DIR, 'payload.json')

const { default: ApiCommand } = await import('../../src/commands/api.js')

const BASE = apiBase()
const ACCOUNTS_PATH = '/api/v1/123/crm/Accounts'

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
  writeFileSync(BODY_FILE, JSON.stringify({ Name: 'Acme from file' }))
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

describe('api', () => {
  it('resolves a bare resource path against the division', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .reply(200, { d: { results: [{ __metadata: { uri: 'x' }, Code: '1' }] } })

    const stdout = await runCmd(ApiCommand, [
      'GET',
      'crm/Accounts',
      '--division',
      '123',
      '--output',
      'json',
    ])
    const body = JSON.parse(stdout)

    // The envelope passes through untouched: no unwrap, no normalize.
    expect(body.d.results[0].__metadata).toEqual({ uri: 'x' })
    expect(scope.isDone()).toBe(true)
  })

  it('sends current/... without the division prefix', async () => {
    const scope = mockApi()
      .get('/api/v1/current/Me')
      .reply(200, { d: { results: [{ CurrentDivision: 123 }] } })

    const stdout = await runCmd(ApiCommand, [
      'GET',
      'current/Me',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).d.results[0].CurrentDivision).toBe(123)
    expect(scope.isDone()).toBe(true)
  })

  it('sends an /api/ path as it is and needs no division', async () => {
    const scope = mockApi()
      .get('/api/v1/current/Me')
      .reply(200, { d: { results: [{ CurrentDivision: 123 }] } })

    const stdout = await runCmd(ApiCommand, [
      'GET',
      '/api/v1/current/Me',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).d.results[0].CurrentDivision).toBe(123)
    expect(scope.isDone()).toBe(true)
  })

  it('substitutes {division} in the path', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .reply(200, { d: { results: [] } })

    await runCmd(ApiCommand, [
      'GET',
      '/api/v1/{division}/crm/Accounts',
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with exit 78 when {division} has no division to fill it', async () => {
    const err = await ApiCommand.run([
      'GET',
      '/api/v1/{division}/crm/Accounts',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.message).toMatch(/No division configured/)
  })

  it('accepts a lowercase method', async () => {
    const scope = mockApi().get('/api/v1/current/Me').reply(200, { d: {} })

    await runCmd(ApiCommand, ['get', '/api/v1/current/Me', '--output', 'json'])

    expect(scope.isDone()).toBe(true)
  })

  it('rejects an unsupported method with exit 64', async () => {
    const err = await ApiCommand.run(['PATCH', '/api/v1/current/Me']).catch(
      (e) => e,
    )
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/GET, POST, PUT, DELETE/)
  })

  it('POSTs an inline JSON body', async () => {
    const scope = mockApi()
      .post(ACCOUNTS_PATH, { Name: 'Acme BE' })
      .reply(201, { d: { ID: '1', Name: 'Acme BE' } })

    const stdout = await runCmd(ApiCommand, [
      'POST',
      'crm/Accounts',
      '--body',
      '{"Name":"Acme BE"}',
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).d.Name).toBe('Acme BE')
    expect(scope.isDone()).toBe(true)
  })

  it('POSTs a body read from @file', async () => {
    const scope = mockApi()
      .post(ACCOUNTS_PATH, { Name: 'Acme from file' })
      .reply(201, { d: { ID: '1' } })

    await runCmd(ApiCommand, [
      'POST',
      'crm/Accounts',
      '--body',
      `@${BODY_FILE}`,
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('rejects a body that is not valid JSON with exit 64', async () => {
    const err = await ApiCommand.run([
      'POST',
      'crm/Accounts',
      '--body',
      'not json',
      '--division',
      '123',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/--body is not valid JSON/)
  })

  it('PUTs a body and turns a 204 into { ok: true }', async () => {
    const scope = mockApi()
      .put(`${ACCOUNTS_PATH}(guid'1')`, { Name: 'Acme NV' })
      .reply(204)

    const stdout = await runCmd(ApiCommand, [
      'PUT',
      "crm/Accounts(guid'1')",
      '--body',
      '{"Name":"Acme NV"}',
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({ ok: true })
    expect(scope.isDone()).toBe(true)
  })

  it('DELETEs a record', async () => {
    const scope = mockApi().delete(`${ACCOUNTS_PATH}(guid'1')`).reply(204)

    const stdout = await runCmd(ApiCommand, [
      'DELETE',
      "crm/Accounts(guid'1')",
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({ ok: true })
    expect(scope.isDone()).toBe(true)
  })

  it('sends every --query pair', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $select: 'ID,Name', $filter: "Code eq '1'" })
      .reply(200, { d: { results: [] } })

    await runCmd(ApiCommand, [
      'GET',
      'crm/Accounts',
      '--query',
      '$select=ID,Name',
      '--query',
      "$filter=Code eq '1'",
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('rejects a --query pair without = with exit 64', async () => {
    const err = await ApiCommand.run([
      'GET',
      'crm/Accounts',
      '--query',
      'broken',
      '--division',
      '123',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/--query expects key=value/)
  })

  it('--paginate concatenates the pages into one array', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .reply(200, {
        d: {
          results: [{ Code: '1' }],
          __next: `${BASE}${ACCOUNTS_PATH}?$skiptoken=guid'1'`,
        },
      })
      .get(ACCOUNTS_PATH)
      .query({ $skiptoken: "guid'1'" })
      .reply(200, { d: { results: [{ Code: '2' }] } })

    const stdout = await runCmd(ApiCommand, [
      'GET',
      'crm/Accounts',
      '--paginate',
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).map((r) => r.Code)).toEqual(['1', '2'])
    expect(scope.isDone()).toBe(true)
  })

  it('--paginate stops at --limit', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .reply(200, {
        d: {
          results: [{ Code: '1' }, { Code: '2' }],
          __next: `${BASE}${ACCOUNTS_PATH}?$skiptoken=guid'2'`,
        },
      })

    const stderr = captureStderr()
    let stdout
    try {
      stdout = await runCmd(ApiCommand, [
        'GET',
        'crm/Accounts',
        '--paginate',
        '--limit',
        '1',
        '--division',
        '123',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(JSON.parse(stdout)).toEqual([{ Code: '1' }])
    expect(scope.isDone()).toBe(true)
  })

  it('--paginate stops at --max-pages and reports the rest on stderr', async () => {
    mockApi()
      .get(ACCOUNTS_PATH)
      .reply(200, {
        d: {
          results: [{ Code: '1' }],
          __next: `${BASE}${ACCOUNTS_PATH}?$skiptoken=guid'1'`,
        },
      })
      .get(ACCOUNTS_PATH)
      .query({ $skiptoken: "guid'1'" })
      .reply(200, { d: { results: [{ Code: '2' }] } })

    const stderr = captureStderr()
    let stdout
    try {
      stdout = await runCmd(ApiCommand, [
        'GET',
        'crm/Accounts',
        '--paginate',
        '--max-pages',
        '1',
        '--division',
        '123',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(JSON.parse(stdout)).toEqual([{ Code: '1' }])
    expect(stderr.text()).toBe('More results available. Raise --max-pages.\n')
    expect(nock.pendingMocks()).toHaveLength(1)
  })

  it('--paginate stays quiet on stderr when the pages run out', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .reply(200, { d: { results: [{ Code: '1' }] } })

    const stderr = captureStderr()
    try {
      await runCmd(ApiCommand, [
        'GET',
        'crm/Accounts',
        '--paginate',
        '--division',
        '123',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }

    expect(stderr.text()).toBe('')
    expect(scope.isDone()).toBe(true)
  })

  it('--paginate builds a table from the collected rows', async () => {
    mockApi()
      .get(ACCOUNTS_PATH)
      .reply(200, { d: { results: [{ Code: '1', Name: 'Acme BE' }] } })

    const stdout = await runCmd(ApiCommand, [
      'GET',
      'crm/Accounts',
      '--paginate',
      '--division',
      '123',
    ])

    expect(stdout).toContain('Code')
    expect(stdout).toContain('Acme BE')
  })

  it('rejects --paginate on a method other than GET with exit 64', async () => {
    const err = await ApiCommand.run([
      'DELETE',
      'crm/Accounts',
      '--paginate',
      '--division',
      '123',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/--paginate is only valid with GET/)
  })
})
