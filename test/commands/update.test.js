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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-update-'))

const { default: Cmd } = await import('../../src/commands/update.js')

const GUID = '11111111-1111-1111-1111-111111111111'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const LOOKUP = { $filter: "Code eq 'ACME'", $select: 'ID,Code,Name', $top: '2' }

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

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('update', () => {
  it('PUTs the body to the keyed path and reports ok', async () => {
    const scope = mockApi()
      .put(`${ACCOUNTS}(guid'${GUID}')`, { Name: 'Acme NV' })
      .reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [
        'crm/Accounts',
        GUID,
        '--set',
        'Name=Acme NV',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ok: true,
      path: `${ACCOUNTS}(guid'${GUID}')`,
      key: GUID,
    })
  })

  it('prints a human line in a terminal', async () => {
    mockApi().put(`${ACCOUNTS}(guid'${GUID}')`, { Name: 'X' }).reply(204)
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [
      'crm/Accounts',
      GUID,
      '--set',
      'Name=X',
      '--allow-writes',
    ])

    expect(out).toBe(`Updated crm/Accounts ${GUID}`)
  })

  it('uses a plain key for an unknown resource with --force', async () => {
    const scope = mockApi()
      .put('/api/v1/123/custom/Things(700)', { A: 1 })
      .reply(204)

    await runCmd(Cmd, [
      'custom/Things',
      '700',
      '--set',
      'A=1',
      '--force',
      '--allow-writes',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('--dry-run prints the request and resolves references without the gate', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query(LOOKUP)
      .reply(200, { d: { results: [{ ID: GUID }] } })
      .put(`${ACCOUNTS}(guid'${GUID}')`)
      .reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [
        'crm/Accounts',
        GUID,
        '--set',
        'Accountant=@ref:crm/Accounts:ACME',
        '--dry-run',
      ]),
    )

    expect(out).toEqual({
      method: 'PUT',
      path: `${ACCOUNTS}(guid'${GUID}')`,
      body: { Accountant: GUID },
    })
    expect(scope.pendingMocks()).toHaveLength(1)
  })

  it('refuses a read-only field with 64 and a non-GUID key with 64', async () => {
    const readOnly = await fail([
      'crm/Accounts',
      GUID,
      '--set',
      `ID=@guid:${GUID}`,
    ])
    expect(exit(readOnly)).toBe(64)
    expect(readOnly.message).toMatch(/read-only fields on PUT: ID/)
    const badKey = await fail(['crm/Accounts', '700', '--set', 'Name=X'])
    expect(exit(badKey)).toBe(64)
    expect(badKey.message).toMatch(/must be a GUID/)
  })

  it('refuses without --allow-writes', async () => {
    const err = await fail(['crm/Accounts', GUID, '--set', 'Name=X'])
    expect(exit(err)).toBe(77)
  })
})
