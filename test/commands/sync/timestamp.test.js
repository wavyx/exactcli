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

const QUERY = { modified: "datetime'2026-09-01'", endPoint: "'Accounts'" }
const ARGS = ['--endpoint', 'Accounts', '--modified', '2026-09-01']

describe('sync timestamp', () => {
  it('asks the function for the feed and the date, prints the timestamp', async () => {
    const scope = mockApi()
      .get(PATH)
      .query(QUERY)
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

    const out = JSON.parse(await runCmd(Cmd, ARGS))

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
      .query(QUERY)
      .reply(200, { d: { API: 'All', TimeStampAsBigInt: '9' } })
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, ARGS)

    expect(out).toMatch(/All/)
    expect(out).toMatch(/9/)
  })

  it('rejects an endpoint that is not a resource name with 64', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run([
      '--endpoint',
      "Accounts'",
      '--modified',
      '2026-09-01',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toBe('Expected a resource name such as Accounts')
    expect(nock.pendingMocks()).toEqual([])
  })

  it('rejects a date that is not YYYY-MM-DD with 64', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run([
      '--endpoint',
      'Accounts',
      '--modified',
      'today',
    ]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/--modified expects YYYY-MM-DD/)
  })
})
