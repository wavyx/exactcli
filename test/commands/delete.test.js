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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-delete-'))

const { default: Cmd } = await import('../../src/commands/delete.js')

const GUID = '11111111-1111-1111-1111-111111111111'
const ACCOUNTS = '/api/v1/123/crm/Accounts'

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

describe('delete', () => {
  it('DELETEs the keyed path with --allow-writes and --yes', async () => {
    const scope = mockApi().delete(`${ACCOUNTS}(guid'${GUID}')`).reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, ['crm/Accounts', GUID, '--allow-writes', '--yes']),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ok: true,
      path: `${ACCOUNTS}(guid'${GUID}')`,
      key: GUID,
    })
  })

  it('prints a human line in a terminal', async () => {
    mockApi().delete(`${ACCOUNTS}(guid'${GUID}')`).reply(204)
    process.stdout.isTTY = true

    expect(
      await runCmd(Cmd, ['crm/Accounts', GUID, '--allow-writes', '--yes']),
    ).toBe(`Deleted crm/Accounts ${GUID}`)
  })

  it('needs --yes even with --allow-writes, and refuses without the flag', async () => {
    const noYes = await fail(['crm/Accounts', GUID, '--allow-writes'])
    expect(exit(noYes)).toBe(77)
    expect(noYes.message).toMatch(/DELETE needs --yes/)
    const off = await fail(['crm/Accounts', GUID, '--yes'])
    expect(exit(off)).toBe(77)
  })

  it('--dry-run prints the request and needs no flag', async () => {
    const out = JSON.parse(
      await runCmd(Cmd, ['crm/Accounts', GUID, '--dry-run']),
    )
    expect(out).toEqual({
      method: 'DELETE',
      path: `${ACCOUNTS}(guid'${GUID}')`,
    })
  })

  it('refuses a resource without DELETE and a bad key with 64', async () => {
    const noDelete = await fail([
      'financialtransaction/TransactionLines',
      GUID,
      '--allow-writes',
      '--yes',
    ])
    expect(exit(noDelete)).toBe(64)
    expect(noDelete.message).toMatch(/method DELETE not allowed/)
    const badKey = await fail([
      'crm/Accounts',
      '700',
      '--allow-writes',
      '--yes',
    ])
    expect(exit(badKey)).toBe(64)
  })

  it('deletes on an unknown resource with --force and --beta', async () => {
    const scope = mockApi()
      .delete('/api/v1/beta/123/custom/Things(700)')
      .reply(204)

    await runCmd(Cmd, [
      'custom/Things',
      '700',
      '--force',
      '--beta',
      '--allow-writes',
      '--yes',
    ])

    expect(scope.isDone()).toBe(true)
  })
})
