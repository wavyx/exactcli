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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiBase, mockApi, runCmd } from '../../helpers.js'
import { readState } from '../../../src/lib/sync-state.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-sync-'))

const { default: Cmd } = await import('../../../src/commands/sync/index.js')

const BASE = apiBase()
const PATH = '/api/v1/123/sync/CRM/Accounts'
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

const exit = (err) => err.exitCode ?? err.oclif?.exit
const row = (n, extra = {}) => ({
  __metadata: { uri: 'x' },
  Timestamp: String(n),
  ...extra,
})

describe('sync', () => {
  it('walks every page after the timestamp without $top and reports the next one', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $filter: 'Timestamp gt 0L' })
      .reply(200, {
        d: {
          results: [row(5, { Code: '1' }), row(10, { Code: '2' })],
          __next: `${BASE}${PATH}?$skiptoken=10`,
        },
      })
      .get(PATH)
      .query({ $skiptoken: '10' })
      .reply(200, { d: { results: [row(20, { Code: '3' })] } })

    const out = JSON.parse(await runCmd(Cmd, ['crm/Accounts', '--since', '0']))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      { Timestamp: '5', Code: '1' },
      { Timestamp: '10', Code: '2' },
      { Timestamp: '20', Code: '3' },
    ])
    expect(stderr.join('')).toBe('Next timestamp: 20\n')
  })

  it('reads and writes the state file, and --since wins over it', async () => {
    mockApi()
      .get(PATH)
      .query({ $filter: 'Timestamp gt 0L' })
      .reply(200, { d: { results: [row(20)] } })
    await runCmd(Cmd, ['crm/Accounts', '--state', stateFile])
    expect(readState(stateFile)).toEqual({ 'sync/CRM/Accounts': 20 })

    mockApi()
      .get(PATH)
      .query({ $filter: 'Timestamp gt 20L' })
      .reply(200, { d: { results: [] } })
    await runCmd(Cmd, ['crm/Accounts', '--state', stateFile])
    expect(stderr.join('')).toMatch(/No changes since 20\n$/)
    expect(readState(stateFile)).toEqual({ 'sync/CRM/Accounts': 20 })

    mockApi()
      .get(PATH)
      .query({ $filter: 'Timestamp gt 7L' })
      .reply(200, { d: { results: [row(9)] } })
    await runCmd(Cmd, ['crm/Accounts', '--state', stateFile, '--since', '7'])
    expect(readState(stateFile)).toEqual({ 'sync/CRM/Accounts': 9 })
  })

  it('leaves the state alone after a partial walk (max-pages, limit)', async () => {
    mockApi()
      .get(PATH)
      .query({ $filter: 'Timestamp gt 0L' })
      .reply(200, {
        d: { results: [row(5)], __next: `${BASE}${PATH}?$skiptoken=5` },
      })
    await runCmd(Cmd, [
      'crm/Accounts',
      '--state',
      stateFile,
      '--max-pages',
      '1',
    ])
    expect(existsSync(stateFile)).toBe(false)

    mockApi()
      .get(PATH)
      .query({ $filter: 'Timestamp gt 0L' })
      .reply(200, { d: { results: [row(5), row(6)] } })
    const out = JSON.parse(
      await runCmd(Cmd, ['crm/Accounts', '--state', stateFile, '--limit', '1']),
    )
    expect(out).toHaveLength(1)
    expect(existsSync(stateFile)).toBe(false)
  })

  it('adds Timestamp to an explicit --select and derives the columns from the rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $filter: 'Timestamp gt 0L', $select: 'Code,Timestamp' })
      .reply(200, { d: { results: [row(5, { Code: '1' })] } })
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [
      'crm/Accounts',
      '--since',
      '0',
      '--select',
      'Code',
    ])

    expect(scope.isDone()).toBe(true)
    expect(out).toMatch(/Code/)
  })

  it('keeps a --select that already carries Timestamp', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $filter: 'Timestamp gt 0L', $select: 'Timestamp,Code' })
      .reply(200, { d: { results: [row(5, { Code: '1' })] } })

    await runCmd(Cmd, [
      'crm/Accounts',
      '--since',
      '0',
      '--select',
      'Timestamp,Code',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('shows the catalogue columns in a terminal', async () => {
    mockApi()
      .get(PATH)
      .query({ $filter: 'Timestamp gt 0L' })
      .reply(200, { d: { results: [row(5, { Code: '1', Name: 'Acme' })] } })
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, ['crm/Accounts', '--since', '0'])

    expect(out).toMatch(/Name/)
    expect(out).toMatch(/Acme/)
  })

  it('fails with 64 on an unknown resource, a resource without sync, a bad --since', async () => {
    process.stdout.isTTY = true
    const unknown = await Cmd.run(['crm/Nope', '--since', '0']).catch((e) => e)
    expect(exit(unknown)).toBe(64)
    const noSync = await Cmd.run(['system/Divisions', '--since', '0']).catch(
      (e) => e,
    )
    expect(exit(noSync)).toBe(64)
    expect(noSync.message).toMatch(/has no sync variant \(families: regular/)
    const bad = await Cmd.run(['crm/Accounts', '--since', 'x']).catch((e) => e)
    expect(exit(bad)).toBe(64)
  })

  it('fails with 65 on a state file that is not JSON', async () => {
    writeFileSync(stateFile, 'nope')
    process.stdout.isTTY = true
    const err = await Cmd.run(['crm/Accounts', '--state', stateFile]).catch(
      (e) => e,
    )
    expect(exit(err)).toBe(65)
  })
})
