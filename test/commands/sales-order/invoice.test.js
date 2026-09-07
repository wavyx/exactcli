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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-so-invoice-'))

const { default: Cmd } =
  await import('../../../src/commands/sales-order/invoice.js')

const ORDER_A = '11111111-1111-1111-1111-111111111111'
const ORDER_B = '22222222-2222-2222-2222-222222222222'
const PROCESS = '33333333-3333-3333-3333-333333333333'
const INVOICE = '/api/v1/123/salesinvoice/InvoiceSalesOrders'

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

describe('sales-order invoice', () => {
  it('--dry-run prints the request with the default modes and sends nothing', async () => {
    const post = mockApi().post(INVOICE).reply(201, { d: {} })

    const out = JSON.parse(
      await runCmd(Cmd, [ORDER_A, ORDER_B, '--journal', '700', '--dry-run']),
    )

    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: INVOICE,
      body: {
        CreateMode: 1,
        InvoiceMode: 0,
        JournalCode: '700',
        SalesOrderIDs: [{ ID: ORDER_A }, { ID: ORDER_B }],
      },
    })
  })

  it('refuses without --allow-writes and sends nothing', async () => {
    const post = mockApi().post(INVOICE).reply(201, { d: {} })

    const err = await fail([ORDER_A, '--journal', '700'])

    expect(exit(err)).toBe(77)
    expect(post.isDone()).toBe(false)
  })

  it('POSTs with --allow-writes and prints the answer', async () => {
    const scope = mockApi()
      .post(INVOICE, {
        CreateMode: 0,
        InvoiceMode: 1,
        JournalCode: '700',
        UserInvoiceDate: '2026-09-03',
        SalesOrderIDs: [{ ID: ORDER_A }],
      })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          ID: PROCESS,
          NumberOfCreatedInvoices: 1,
          NumberOfFailedInvoices: 0,
          Errors: null,
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        ORDER_A,
        '--journal',
        '700',
        '--create-mode',
        '0',
        '--invoice-mode',
        '1',
        '--invoice-date',
        '2026-09-03',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ID: PROCESS,
      NumberOfCreatedInvoices: 1,
      NumberOfFailedInvoices: 0,
      Errors: null,
    })
  })

  it('--async sets Mode 1 and prints the ProcessID of the queued run', async () => {
    const scope = mockApi()
      .post(INVOICE, {
        CreateMode: 1,
        InvoiceMode: 0,
        JournalCode: '700',
        Mode: 1,
        SalesOrderIDs: [{ ID: ORDER_A }],
      })
      .reply(201, { d: { __metadata: { uri: 'x' }, ProcessID: PROCESS } })

    const out = JSON.parse(
      await runCmd(Cmd, [
        ORDER_A,
        '--journal',
        '700',
        '--async',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ ProcessID: PROCESS })
  })

  it('fails with 64 when an argument is not a GUID', async () => {
    for (const argv of [['42'], [ORDER_A, 'not-a-guid']]) {
      const err = await fail([...argv, '--journal', '700', '--allow-writes'])
      expect(exit(err)).toBe(64)
      expect(err.message).toMatch(/GUID/)
    }
  })

  it('fails with 64 without a sales order', async () => {
    const err = await fail(['--journal', '700'])
    expect(exit(err)).toBe(64)
  })

  it('fails with 64 on a bad --invoice-date', async () => {
    const err = await fail([
      ORDER_A,
      '--journal',
      '700',
      '--invoice-date',
      '03/09/2026',
    ])
    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--invoice-date expects YYYY-MM-DD/)
  })

  it('fails with 64 on a mode outside 0..1', async () => {
    for (const flag of ['--create-mode', '--invoice-mode']) {
      const err = await fail([ORDER_A, '--journal', '700', flag, '2'])
      expect(exit(err)).toBe(64)
      expect(err.message).toMatch(/less than or equal to 1/)
    }
  })
})
