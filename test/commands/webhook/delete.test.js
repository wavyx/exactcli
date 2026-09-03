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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-webhook-delete-'))

const { default: Cmd } = await import('../../../src/commands/webhook/delete.js')

const ID = '11111111-1111-1111-1111-111111111111'
const WEBHOOKS = '/api/v1/123/webhooks/WebhookSubscriptions'
const KEYED = `${WEBHOOKS}(guid'${ID}')`

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

describe('webhook delete', () => {
  it('--dry-run prints the keyed request and sends nothing', async () => {
    const del = mockApi().delete(KEYED).reply(204)

    const out = JSON.parse(await runCmd(Cmd, [ID, '--dry-run']))

    expect(del.isDone()).toBe(false)
    expect(out).toEqual({ method: 'DELETE', path: KEYED })
  })

  it('needs --allow-writes and --yes, and sends nothing before both', async () => {
    const del = mockApi().delete(KEYED).reply(204)

    const off = await fail([ID, '--yes'])
    expect(exit(off)).toBe(77)
    const noYes = await fail([ID, '--allow-writes'])
    expect(exit(noYes)).toBe(77)
    expect(noYes.message).toMatch(/DELETE needs --yes/)

    expect(del.isDone()).toBe(false)
  })

  it('DELETEs the keyed path with --allow-writes and --yes', async () => {
    const scope = mockApi().delete(KEYED).reply(204)

    const out = JSON.parse(await runCmd(Cmd, [ID, '--allow-writes', '--yes']))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ ok: true, path: KEYED, key: ID })
  })

  it('prints a human line in a terminal', async () => {
    mockApi().delete(KEYED).reply(204)
    process.stdout.isTTY = true

    expect(await runCmd(Cmd, [ID, '--allow-writes', '--yes'])).toBe(
      `Deleted webhook ${ID}`,
    )
  })

  it('fails with 64 on a key that is not a GUID, before the gate', async () => {
    const err = await fail(['1001', '--allow-writes', '--yes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/must be a GUID/)
  })

  it('fails with 64 without an id', async () => {
    const err = await fail(['--allow-writes', '--yes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Missing 1 required arg/)
  })
})
