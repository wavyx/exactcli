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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-sync-timestamp-'))
const { default: Cmd } = await import('../../../src/commands/sync/timestamp.js')
const PATH = '/api/v1/123/read/sync/Sync/SyncTimestamp'

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

describe('sync timestamp', () => {
  it('prints the timestamps per endpoint', async () => {
    const scope = mockApi()
      .get(PATH)
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              API: 'CRM/Accounts',
              TimeStampAsBigInt: '123',
              Modified: '/Date(1723990800000)/',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        API: 'CRM/Accounts',
        TimeStampAsBigInt: '123',
        Modified: '2024-08-18T14:20:00',
      },
    ])
  })

  it('wraps a single record and prints a table', async () => {
    mockApi()
      .get(PATH)
      .reply(200, { d: { API: 'All', TimeStampAsBigInt: '9' } })
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [])

    expect(out).toMatch(/All/)
    expect(out).toMatch(/9/)
  })
})
