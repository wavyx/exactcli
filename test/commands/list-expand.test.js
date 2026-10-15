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
import { defaultColumns, findResource } from '../../src/lib/catalog.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-list-expand-'))

const { default: ListCommand } = await import('../../src/commands/list.js')

const ACCOUNTS_PATH = '/api/v1/123/crm/Accounts'
const BULK_PATH = '/api/v1/123/bulk/CRM/Accounts'
/** The $select the command adds for a known resource without --select. */
const SELECT = defaultColumns(findResource('crm/Accounts')).join(',')

beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
  process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
  process.env.EXACTCLI_DIVISION = '123'
})

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  delete process.env.EXACTCLI_ACCESS_TOKEN
  delete process.env.EXACTCLI_DIVISION
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  nock.disableNetConnect()
  process.stdout.isTTY = false
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
})

// OData v3 returns an expanded navigation property only when $select names
// it too. The injected catalogue $select must carry the --expand names.
describe('list --expand', () => {
  it('names the --expand properties in the catalogue $select', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({
        $select: `${SELECT},Contacts,BankAccounts`,
        $expand: 'Contacts, BankAccounts',
      })
      .reply(200, { d: { results: [] } })

    await runCmd(ListCommand, [
      'crm/Accounts',
      '--expand',
      'Contacts, BankAccounts',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('keeps an explicit --select as typed next to --expand', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $select: 'Code', $expand: 'Contacts' })
      .reply(200, { d: { results: [] } })

    await runCmd(ListCommand, [
      'crm/Accounts',
      '--select',
      'Code',
      '--expand',
      'Contacts',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('names the --expand properties in the bulk fallback $select', async () => {
    const scope = mockApi()
      .get(BULK_PATH)
      .query({ $select: `${SELECT},Contacts`, $expand: 'Contacts' })
      .reply(200, { d: { results: [] } })

    await runCmd(ListCommand, [
      'crm/Accounts',
      '--bulk',
      '--fields',
      'Nope',
      '--expand',
      'Contacts',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('names the --expand properties next to the --fields $select', async () => {
    const scope = mockApi()
      .get(BULK_PATH)
      .query({ $select: 'Code,Contacts', $expand: 'Contacts' })
      .reply(200, { d: { results: [] } })

    await runCmd(ListCommand, [
      'crm/Accounts',
      '--bulk',
      '--fields',
      'Code',
      '--expand',
      'Contacts',
    ])

    expect(scope.isDone()).toBe(true)
  })
})
