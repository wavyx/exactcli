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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-document-'))

const { default: Cmd } = await import('../../../src/commands/document/list.js')

const PATH = '/api/v1/123/documents/Documents'
const SELECT = descriptors.document.columns.join(',')
const ORDER = descriptors.document.orderBy

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

describe('document list', () => {
  it('is the typed command of its descriptor', () => {
    expect(Cmd.descriptor).toBe(descriptors.document)
  })

  it('selects the descriptor columns, orders by default, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            { __metadata: { uri: 'x' }, Subject: 'Invoice 1', Type: 10 },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([{ Subject: 'Invoice 1', Type: 10 }])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          "Type eq 10 and DocumentDate ge datetime'2026-01-01' and DocumentDate le datetime'2026-12-31T23:59:59'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--type',
      '10',
      '--from',
      '2026-01-01',
      '--to',
      '2026-12-31',
    ])

    expect(scope.isDone()).toBe(true)
  })
  it('resolves --account through crm/Accounts', async () => {
    const GUID = '11111111-1111-1111-1111-111111111111'
    const scope = mockApi()
      .get('/api/v1/123/crm/Accounts')
      .query({ $filter: "Code eq 'ACME'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `Account eq guid'${GUID}'`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--account', 'ACME'])

    expect(scope.isDone()).toBe(true)
  })
})
