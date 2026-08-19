import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest'
import nock from 'nock'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockApi, runCmd } from '../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-get-test-'))

const { default: GetCommand } = await import('../../src/commands/get.js')

const GUID = '11111111-1111-1111-1111-111111111111'
const GUID_PATH = `/api/v1/123/crm/Accounts(guid'${GUID}')`

/** @param {object} [overrides] */
function account(overrides = {}) {
  return {
    __metadata: { uri: 'x' },
    ID: GUID,
    Code: '1001',
    Name: 'Acme BE',
    Created: '/Date(1723990800000)/',
    ...overrides,
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

describe('get', () => {
  it('reads a record by GUID key and normalizes it', async () => {
    const scope = mockApi().get(GUID_PATH).reply(200, { d: account() })

    const stdout = await runCmd(GetCommand, [
      'crm/Accounts',
      GUID,
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({
      ID: GUID,
      Code: '1001',
      Name: 'Acme BE',
      Created: '2024-08-18T14:20:00',
    })
    expect(scope.isDone()).toBe(true)
  })

  it('passes a non-GUID key through unquoted', async () => {
    const scope = mockApi()
      .get('/api/v1/123/financial/GLAccounts(700)')
      .reply(200, { d: { ID: 700, Code: '700' } })

    await runCmd(GetCommand, [
      'financial/GLAccounts',
      '700',
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('sends $select and $expand', async () => {
    const scope = mockApi()
      .get(GUID_PATH)
      .query({ $select: 'ID,Name', $expand: 'Contacts' })
      .reply(200, { d: account() })

    await runCmd(GetCommand, [
      'crm/Accounts',
      GUID,
      '--division',
      '123',
      '--select',
      'ID,Name',
      '--expand',
      'Contacts',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('takes the first record of a results envelope', async () => {
    mockApi()
      .get(GUID_PATH)
      .reply(200, { d: { results: [account(), account({ Code: '1002' })] } })

    const stdout = await runCmd(GetCommand, [
      'crm/Accounts',
      GUID,
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout).Code).toBe('1001')
  })

  it('--raw prints the untouched envelope', async () => {
    mockApi().get(GUID_PATH).reply(200, { d: account() })

    const stdout = await runCmd(GetCommand, [
      'crm/Accounts',
      GUID,
      '--division',
      '123',
      '--raw',
      '--output',
      'json',
    ])
    const body = JSON.parse(stdout)

    expect(body.d.__metadata).toEqual({ uri: 'x' })
    expect(body.d.Created).toBe('/Date(1723990800000)/')
  })

  it('--beta reads the beta path', async () => {
    const scope = mockApi()
      .get(`/api/v1/beta/123/crm/Accounts(guid'${GUID}')`)
      .reply(200, { d: account() })

    await runCmd(GetCommand, [
      'crm/Accounts',
      GUID,
      '--division',
      '123',
      '--beta',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('derives the table columns from the record', async () => {
    mockApi().get(GUID_PATH).reply(200, { d: account() })

    const stdout = await runCmd(GetCommand, [
      'crm/Accounts',
      GUID,
      '--division',
      '123',
    ])

    expect(stdout).toContain('Name')
    expect(stdout).toContain('Acme BE')
    expect(stdout).not.toContain('__metadata')
  })

  it('fails with exit 65 when the record is not there', async () => {
    mockApi()
      .get(GUID_PATH)
      .reply(200, { d: { results: [] } })

    const err = await GetCommand.run([
      'crm/Accounts',
      GUID,
      '--division',
      '123',
    ]).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
    expect(err.message).toBe(`No record found for crm/Accounts ${GUID}`)
  })

  it('rejects a key with unsafe characters with exit 64', async () => {
    const err = await GetCommand.run([
      'crm/Accounts',
      "700') or 1 eq 1--",
      '--division',
      '123',
    ]).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Record key must be a GUID or a plain key/)
    expect(nock.pendingMocks()).toEqual([])
  })

  it('accepts a plain key that carries a dot, a colon or a dash', async () => {
    const scope = mockApi()
      .get('/api/v1/123/financial/GLAccounts(7.0:0-1_2)')
      .reply(200, { d: { ID: 1 } })

    await runCmd(GetCommand, [
      'financial/GLAccounts',
      '7.0:0-1_2',
      '--division',
      '123',
      '--output',
      'json',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with exit 78 when no division is configured', async () => {
    const err = await GetCommand.run(['crm/Accounts', GUID]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.message).toMatch(/No division configured/)
  })
})
