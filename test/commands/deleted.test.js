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
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockApi, runCmd } from '../helpers.js'
import { readState } from '../../src/lib/sync-state.js'
import { findResource, propertyNames } from '../../src/lib/catalog.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-deleted-'))

const { default: Cmd } = await import('../../src/commands/deleted.js')

const PATH = '/api/v1/123/sync/Deleted'
const SELECT = propertyNames(findResource('sync/Deleted')).join(',')
let stateFile
let stderr

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
  stateFile = join(TMP_CONFIG_DIR, `state-${Date.now()}-${Math.random()}.json`)
  stderr = []
  vi.spyOn(process.stderr, 'write').mockImplementation(
    (c) => stderr.push(String(c)) > 0,
  )
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
  vi.restoreAllMocks()
})

const row = (n, extra = {}) => ({
  __metadata: { uri: 'x' },
  Timestamp: String(n),
  ...extra,
})

describe('deleted', () => {
  it('reads sync/Deleted after the timestamp, filtered on the type', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $filter: 'Timestamp gt 5L and EntityType eq 10',
        $select: SELECT,
      })
      .reply(200, {
        d: {
          results: [
            row(8, {
              EntityType: 10,
              EntityKey: 'k',
              DeletedDate: '/Date(1723990800000)/',
            }),
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, ['--since', '5', '--type', '10']))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        Timestamp: '8',
        EntityType: 10,
        EntityKey: 'k',
        DeletedDate: '2024-08-18T14:20:00',
      },
    ])
    expect(stderr.join('')).toBe('Next timestamp: 8\n')
  })

  it('remembers the timestamp under the Deleted key', async () => {
    mockApi()
      .get(PATH)
      .query({ $filter: 'Timestamp gt 0L', $select: SELECT })
      .reply(200, { d: { results: [row(3)] } })

    await runCmd(Cmd, ['--state', stateFile])

    expect(readState(stateFile)).toEqual({ Deleted: 3 })
    expect(existsSync(`${stateFile}.tmp`)).toBe(false)
  })
})
