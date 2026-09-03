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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-gl-account-'))

const { default: Cmd } =
  await import('../../../src/commands/gl-account/list.js')

const PATH = '/api/v1/123/financial/GLAccounts'
const SELECT = descriptors.glAccount.columns.join(',')
const ORDER = descriptors.glAccount.orderBy

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

describe('gl-account list', () => {
  it('is the typed command of its descriptor', () => {
    expect(Cmd.descriptor).toBe(descriptors.glAccount)
  })

  it('selects the descriptor columns, orders by default, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            { __metadata: { uri: 'x' }, Code: '550000', Description: 'Bank' },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([{ Code: '550000', Description: 'Bank' }])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: "Type eq 12 and substringof('bank', Description)",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--type', '12', '--search', 'bank'])

    expect(scope.isDone()).toBe(true)
  })
})
