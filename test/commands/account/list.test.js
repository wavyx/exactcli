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
import { mockApi, runCmd } from '../../helpers.js'
import { descriptors } from '../../../src/lib/typed/descriptors.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-account-'))

const { default: Cmd } = await import('../../../src/commands/account/list.js')

const PATH = '/api/v1/123/crm/Accounts'
const SELECT = descriptors.account.columns.join(',')
const ORDER = descriptors.account.orderBy

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

describe('account list', () => {
  it('is the typed command of its descriptor', () => {
    expect(Cmd.descriptor).toBe(descriptors.account)
  })

  it('selects the descriptor columns, orders by default, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [{ __metadata: { uri: 'x' }, Code: '1001', Name: 'Acme' }],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([{ Code: '1001', Name: 'Acme' }])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          "substringof('acme', Name) and Status eq 'C' and IsSales eq true and IsSupplier eq false",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--search',
      'acme',
      '--status',
      'C',
      '--customer',
      'yes',
      '--supplier',
      'no',
    ])

    expect(scope.isDone()).toBe(true)
  })
})
