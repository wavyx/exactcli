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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-division-use-'))

const { default: Cmd } = await import('../../../src/commands/division/use.js')
const { getConf, getProfileConfig } = await import('../../../src/lib/config.js')

const PATH = '/api/v1/456/system/Divisions(456)'
const QUERY = { $select: 'Code,Description' }

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
  getConf().clear()
  process.stdout.isTTY = false
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
})

describe('division use', () => {
  it('checks the division, stores it in the profile and reports it', async () => {
    const scope = mockApi()
      .get(PATH)
      .query(QUERY)
      .reply(200, { d: { Code: 456, Description: 'Acme NL' } })

    const out = JSON.parse(await runCmd(Cmd, ['456']))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      profile: 'default',
      division: 456,
      description: 'Acme NL',
    })
    expect(getProfileConfig('default', 'division')).toBe(456)
  })

  it('prints a human line in a terminal', async () => {
    mockApi()
      .get(PATH)
      .query(QUERY)
      .reply(200, { d: { Code: 456, Description: 'Acme NL' } })
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, ['456'])

    expect(out).toBe('Division 456 (Acme NL) is now active for profile default')
  })

  it('reports a missing description as null', async () => {
    mockApi()
      .get(PATH)
      .query(QUERY)
      .reply(200, { d: { results: [] } })

    const out = JSON.parse(await runCmd(Cmd, ['456']))

    expect(out.description).toBeNull()
    expect(getProfileConfig('default', 'division')).toBe(456)
  })

  it('fails with 65 and stores nothing when the division is not accessible', async () => {
    mockApi()
      .get(PATH)
      .query(QUERY)
      .reply(403, {
        error: { message: { value: 'Forbidden - WrongDivision' } },
      })
    process.stdout.isTTY = true

    const err = await Cmd.run(['456']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
    expect(err.message).toMatch(
      /Division 456 is not accessible with this account/,
    )
    expect(getProfileConfig('default', 'division')).toBeUndefined()
  })

  it('passes any other API error through', async () => {
    mockApi().get(PATH).query(QUERY).reply(500, 'boom')
    process.stdout.isTTY = true

    const err = await Cmd.run(['456', '--no-retry']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(69)
  })

  it('passes a network failure through untouched', async () => {
    mockApi().get(PATH).query(QUERY).replyWithError('socket hang up')
    process.stdout.isTTY = true

    const err = await Cmd.run(['456', '--no-retry']).catch((e) => e)

    // fetch wraps the socket error in TypeError('fetch failed'), and the
    // client reports it as a reachability problem.
    expect(err.message).not.toMatch(/not accessible/)
    expect(err.message).toMatch(/Cannot reach https:\/\/start\.exactonline\.be/)
    expect(err.exitCode ?? err.oclif?.exit).toBe(69)
  })

  it('rejects a code that is not a positive integer with 64', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['abc']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/positive integer/)
  })
})
