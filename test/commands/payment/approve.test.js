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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-payment-approve-'))

const { default: Cmd } =
  await import('../../../src/commands/payment/approve.js')

const ID = '11111111-1111-1111-1111-111111111111'
const PAYMENTS = '/api/v1/123/cashflow/Payments'
const KEYED = `${PAYMENTS}(guid'${ID}')`

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

describe('payment approve', () => {
  it('--dry-run prints the keyed PUT with method B and sends nothing', async () => {
    const put = mockApi().put(KEYED).reply(204)

    const out = JSON.parse(await runCmd(Cmd, [ID, '--dry-run']))

    expect(put.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'PUT',
      path: KEYED,
      body: { PaymentMethod: 'B' },
    })
  })

  it('refuses without --allow-writes and sends nothing', async () => {
    const put = mockApi().put(KEYED).reply(204)

    const err = await fail([ID])

    expect(exit(err)).toBe(77)
    expect(put.isDone()).toBe(false)
  })

  it('PUTs PaymentMethod B with --allow-writes', async () => {
    const scope = mockApi().put(KEYED, { PaymentMethod: 'B' }).reply(204)

    const out = JSON.parse(await runCmd(Cmd, [ID, '--allow-writes']))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ ok: true, path: KEYED, key: ID, method: 'B' })
  })

  it('--method K PUTs K and prints a human line in a terminal', async () => {
    const scope = mockApi().put(KEYED, { PaymentMethod: 'K' }).reply(204)
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [ID, '--method', 'K', '--allow-writes'])

    expect(scope.isDone()).toBe(true)
    expect(out).toBe(`Payment ${ID}: method K`)
  })

  it('fails with 64 on an id that is not a GUID, before the gate', async () => {
    const err = await fail(['1001', '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/must be a GUID/)
  })

  it('fails with 64 on a method outside B, I, K, V', async () => {
    const err = await fail([ID, '--method', 'X', '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/B, I, K, V/)
  })

  it('fails with 64 without an id', async () => {
    const err = await fail(['--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Missing 1 required arg/)
  })
})
