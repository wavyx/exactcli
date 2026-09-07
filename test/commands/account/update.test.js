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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-account-update-'))

const { default: Cmd } = await import('../../../src/commands/account/update.js')

const GUID = '11111111-1111-1111-1111-111111111111'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const KEYED = `${ACCOUNTS}(guid'${GUID}')`
const LOOKUP = { $filter: "Code eq '1001'", $select: 'ID,Code,Name', $top: '2' }

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

/** The lookup of code 1001, then the PUT on the found record. */
const mockLookupAndPut = (body) =>
  mockApi()
    .get(ACCOUNTS)
    .query(LOOKUP)
    .reply(200, { d: { results: [{ ID: GUID }] } })
    .put(KEYED, body)
    .reply(204)

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('account update', () => {
  it('--dry-run resolves a code id with one lookup and sends no PUT', async () => {
    const scope = mockLookupAndPut()

    const out = JSON.parse(
      await runCmd(Cmd, [
        '1001',
        '--name',
        'Acme NV',
        '--customer',
        'yes',
        '--country',
        'be',
        '--dry-run',
      ]),
    )

    expect(out).toEqual({
      method: 'PUT',
      path: KEYED,
      body: { Name: 'Acme NV', IsSales: true, Country: 'BE' },
    })
    expect(scope.pendingMocks()).toHaveLength(1)
  })

  it('refuses without --allow-writes and sends nothing, not even the lookup', async () => {
    const scope = mockLookupAndPut()

    const err = await fail(['1001', '--name', 'Acme NV'])

    expect(exit(err)).toBe(77)
    expect(scope.pendingMocks()).toHaveLength(2)
  })

  it('PUTs only the given fields on a GUID id, without a lookup', async () => {
    const scope = mockApi()
      .put(KEYED, { Name: 'Acme NV', City: 'Ghent' })
      .reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [
        GUID,
        '--name',
        'Acme NV',
        '--city',
        'Ghent',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ok: true,
      path: KEYED,
      key: GUID,
      fields: ['Name', 'City'],
    })
  })

  it('resolves a code id with one lookup and prints a human line in a terminal', async () => {
    const scope = mockLookupAndPut({ Name: 'Acme NV', IsSupplier: false })
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [
      '1001',
      '--name',
      'Acme NV',
      '--supplier',
      'no',
      '--allow-writes',
    ])

    expect(scope.isDone()).toBe(true)
    expect(out).toBe('Updated crm/Accounts 1001: Name, IsSupplier')
  })

  it('fails with 64 when no field is given', async () => {
    const err = await fail([GUID, '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Nothing to update/)
  })

  it('fails with 64 on a bad --supplier value, before the gate', async () => {
    const err = await fail([GUID, '--supplier', 'maybe'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Expected true or false, received maybe/)
  })

  it('fails with 64 on a bad --country, before the gate', async () => {
    const err = await fail([GUID, '--country', 'Belgium'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--country expects 2 letters/)
  })
})
