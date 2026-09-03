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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-quota-'))

const { default: Cmd } = await import('../../src/commands/quota.js')

const PATH = '/api/v1/123/system/Divisions'
const HEADERS = {
  'x-ratelimit-minutely-limit': '60',
  'x-ratelimit-minutely-remaining': '59',
  'x-ratelimit-minutely-reset': '1788442200000',
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4996',
  'x-ratelimit-reset': '1788480000000',
}

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

describe('quota', () => {
  it('reads the budget off one cheap call and prints ISO resets', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $top: '1', $select: 'Code' })
      .reply(200, { d: [{ Code: 123 }] }, HEADERS)

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      minutelyLimit: 60,
      minutelyRemaining: 59,
      minutelyReset: '2026-09-03T13:30:00.000Z',
      dailyLimit: 5000,
      dailyRemaining: 4996,
      dailyReset: '2026-09-04T00:00:00.000Z',
    })
  })

  it('prints a table in a terminal', async () => {
    mockApi()
      .get(PATH)
      .query({ $top: '1', $select: 'Code' })
      .reply(200, { d: [] }, HEADERS)
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [])

    expect(out).toMatch(/Minute remaining/)
    expect(out).toMatch(/4996/)
  })

  it('fails with 69 when the answer carries no rate-limit headers', async () => {
    mockApi()
      .get(PATH)
      .query({ $top: '1', $select: 'Code' })
      .reply(200, { d: [] })
    process.stdout.isTTY = true

    const err = await Cmd.run([]).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(69)
    expect(err.message).toMatch(/no rate-limit headers/)
  })

  it('leaves a missing reset as null', async () => {
    const partial = Object.fromEntries(
      Object.entries(HEADERS).filter(([k]) => k !== 'x-ratelimit-reset'),
    )
    mockApi()
      .get(PATH)
      .query({ $top: '1', $select: 'Code' })
      .reply(200, { d: [] }, partial)

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(out.dailyReset).toBeNull()
    expect(out.minutelyReset).toBe('2026-09-03T13:30:00.000Z')
  })
})
