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
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockApi, runCmd } from '../../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-so-invoice-'))

const { default: Cmd } =
  await import('../../../src/commands/sales-order/invoice.js')
const { timing } = await import('../../../src/lib/invoice-result.js')

const ORDER_A = '11111111-1111-1111-1111-111111111111'
const ORDER_B = '22222222-2222-2222-2222-222222222222'
const PROCESS = '33333333-3333-3333-3333-333333333333'
const INVOICE = '/api/v1/123/salesinvoice/InvoiceSalesOrders'
const RESULT = '/api/v1/123/read/salesinvoice/InvoiceSalesOrderResult'
const byProcess = { ProcessID: `guid'${PROCESS}'` }

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
  vi.restoreAllMocks()
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
        Mode: 1,
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

  it('queues the run (Mode 1) and prints the ProcessID', async () => {
    const scope = mockApi()
      .post(INVOICE, {
        CreateMode: 0,
        InvoiceMode: 1,
        JournalCode: '700',
        UserInvoiceDate: '2026-09-03',
        Mode: 1,
        SalesOrderIDs: [{ ID: ORDER_A }],
      })
      .reply(201, { d: { __metadata: { uri: 'x' }, ProcessID: PROCESS } })

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
    expect(out).toEqual({ ProcessID: PROCESS })
  })

  it('--wait polls the result until the run ends and prints it', async () => {
    const sleep = vi.spyOn(timing, 'sleep').mockResolvedValue()
    const scope = mockApi()
      .post(INVOICE)
      .reply(201, { d: { ProcessID: PROCESS } })
      .get(RESULT)
      .query(byProcess)
      .reply(200, { d: { results: [{ ProcessID: PROCESS, Status: '30' }] } })
      .get(RESULT)
      .query(byProcess)
      .reply(200, {
        d: {
          results: [
            {
              ProcessID: PROCESS,
              Status: 'Finished',
              NumberOfCreatedInvoices: 1,
              NumberOfFailedInvoices: 0,
              Errors: null,
            },
          ],
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        ORDER_A,
        '--journal',
        '700',
        '--wait',
        '--interval',
        '3',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(3000)
    expect(out).toMatchObject({
      Status: 'Finished',
      StatusDescription: 'Finished',
      NumberOfCreatedInvoices: 1,
    })
  })

  it('--wait prints the result and fails with 65 on an error status', async () => {
    vi.spyOn(timing, 'sleep').mockResolvedValue()
    mockApi()
      .post(INVOICE)
      .reply(201, { d: { ProcessID: PROCESS } })
      .get(RESULT)
      .query(byProcess)
      .reply(200, {
        d: {
          results: [
            { ProcessID: PROCESS, Status: '52', Errors: 'No lines to invoice' },
          ],
        },
      })
    const lines = []
    vi.spyOn(console, 'log').mockImplementation((t) => lines.push(t))
    const errors = []
    vi.spyOn(process.stderr, 'write').mockImplementation(
      (t) => errors.push(String(t)) > 0,
    )

    const err = await Cmd.run([
      ORDER_A,
      '--journal',
      '700',
      '--wait',
      '--allow-writes',
    ]).catch((e) => e)

    expect(exit(err)).toBe(65)
    expect(errors.join('')).toMatch(/status 52.*No lines to invoice/)
    expect(JSON.parse(lines.join('\n'))).toMatchObject({ Status: '52' })
  })

  it('--wait fails with 65 when the run finished but left invoices out', async () => {
    vi.spyOn(timing, 'sleep').mockResolvedValue()
    mockApi()
      .post(INVOICE)
      .reply(201, { d: { ProcessID: PROCESS } })
      .get(RESULT)
      .query(byProcess)
      .reply(200, {
        d: {
          results: [
            {
              ProcessID: PROCESS,
              Status: 'Finished',
              NumberOfCreatedInvoices: 1,
              NumberOfFailedInvoices: 1,
              Errors: '',
            },
          ],
        },
      })
    const errors = []
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process.stderr, 'write').mockImplementation(
      (t) => errors.push(String(t)) > 0,
    )

    const err = await Cmd.run([
      ORDER_A,
      '--journal',
      '700',
      '--wait',
      '--allow-writes',
    ]).catch((e) => e)

    expect(exit(err)).toBe(65)
    expect(errors.join('')).toMatch(/1 failed invoices\): no detail/)
  })

  it('--wait fails with 75 and names the ProcessID when the run outlasts --wait-timeout', async () => {
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    vi.spyOn(timing, 'sleep').mockImplementation(async (ms) => {
      now += ms
    })
    const errors = []
    vi.spyOn(process.stderr, 'write').mockImplementation(
      (t) => errors.push(String(t)) > 0,
    )
    mockApi()
      .post(INVOICE)
      .reply(201, { d: { ProcessID: PROCESS } })
      .get(RESULT)
      .query(byProcess)
      .reply(200, { d: { results: [{ ProcessID: PROCESS, Status: '20' }] } })
      .get(RESULT)
      .query(byProcess)
      .times(2)
      .reply(200, {
        d: { results: [{ ProcessID: PROCESS, Status: 'Paused' }] },
      })

    const err = await fail([
      ORDER_A,
      '--journal',
      '700',
      '--wait',
      '--interval',
      '5',
      '--wait-timeout',
      '15',
      '--allow-writes',
    ])

    expect(exit(err)).toBe(75)
    expect(err.message).toMatch(/is still Paused/)
    expect(errors.join('')).toContain(`ProcessID: ${PROCESS}\n`)
    // Two reads of the same unknown status give one note.
    expect(
      errors.filter((t) => t.startsWith('Unknown status Paused')),
    ).toHaveLength(1)
    expect(err.message).toContain(
      `exactcli sales-order invoice-result ${PROCESS}`,
    )
  })

  it('--wait fails with 65 when the answer carries no ProcessID', async () => {
    mockApi().post(INVOICE).reply(201, { d: {} })

    const err = await fail([
      ORDER_A,
      '--journal',
      '700',
      '--wait',
      '--allow-writes',
    ])

    expect(exit(err)).toBe(65)
    expect(err.message).toMatch(/no ProcessID/)
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
