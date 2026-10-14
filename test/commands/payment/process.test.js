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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-payment-process-'))

const { default: Cmd } =
  await import('../../../src/commands/payment/process.js')

const PAYMENT_A = '11111111-1111-1111-1111-111111111111'
const PAYMENT_B = '22222222-2222-2222-2222-222222222222'
const PROCESS = '/api/v1/123/cashflow/ProcessPayments'

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

describe('payment process', () => {
  it('--dry-run prints the request with every payment and sends nothing', async () => {
    const post = mockApi().post(PROCESS).reply(201, { d: {} })

    const out = JSON.parse(
      await runCmd(Cmd, [PAYMENT_A, PAYMENT_B, '--dry-run']),
    )

    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: PROCESS,
      body: { PaymentIDs: [{ ID: PAYMENT_A }, { ID: PAYMENT_B }] },
    })
  })

  it('refuses without --allow-writes and sends nothing', async () => {
    const post = mockApi().post(PROCESS).reply(201, { d: {} })

    const err = await fail([PAYMENT_A])

    expect(exit(err)).toBe(77)
    expect(post.isDone()).toBe(false)
  })

  it('POSTs the PaymentIDs collection with --allow-writes and prints the answer', async () => {
    const scope = mockApi()
      .post(PROCESS, { PaymentIDs: [{ ID: PAYMENT_A }] })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          ID: '33333333-3333-3333-3333-333333333333',
          SuccessMessage: '1 payment processed',
          ErrorMessage: null,
          BankExportDocumentsUrl: 'https://start.exactonline.be/docs/export',
        },
      })

    const out = JSON.parse(await runCmd(Cmd, [PAYMENT_A, '--allow-writes']))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ID: '33333333-3333-3333-3333-333333333333',
      SuccessMessage: '1 payment processed',
      ErrorMessage: null,
      BankExportDocumentsUrl: 'https://start.exactonline.be/docs/export',
    })
  })

  it('prints the answer, then fails with 65 when Exact returns an ErrorMessage', async () => {
    // Exact answers 201 even when it processes nothing (verified live): the
    // error lives in the body, and a script must not read it as a success.
    mockApi()
      .post(PROCESS)
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          SuccessMessage: null,
          ErrorMessage: 'General setup error: Invalid: My bank account;',
          BankExportDocumentsUrl: null,
        },
      })

    process.stdout.isTTY = true
    // runCmd keeps what the command printed before it failed.
    const err = await runCmd(Cmd, [PAYMENT_A, '--allow-writes']).catch((e) => e)

    expect(exit(err)).toBe(65)
    expect(err.message).toBe(
      'Exact did not process every payment: General setup error: Invalid: My bank account;',
    )
    expect(err.stdout).toContain('General setup error')
  })

  it('fails with 64 when an argument is not a GUID', async () => {
    for (const argv of [['42'], [PAYMENT_A, 'not-a-guid']]) {
      const err = await fail([...argv, '--allow-writes'])
      expect(exit(err)).toBe(64)
      expect(err.message).toMatch(/GUID/)
    }
  })

  it('fails with 64 without a payment', async () => {
    const err = await fail(['--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Missing 1 required arg/)
  })
})
