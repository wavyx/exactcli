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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-so-result-'))

const { default: Cmd } =
  await import('../../../src/commands/sales-order/invoice-result.js')
const { timing } = await import('../../../src/lib/invoice-result.js')

const PROCESS = '33333333-3333-3333-3333-333333333333'
const RESULT = '/api/v1/123/read/salesinvoice/InvoiceSalesOrderResult'

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

const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('timing', () => {
  it('sleeps on a real timer', async () => {
    await expect(timing.sleep(1)).resolves.toBeUndefined()
  })
})

describe('sales-order invoice-result', () => {
  it('names the read call it makes', () => {
    expect(Cmd.description).toContain(
      '(GET read/salesinvoice/InvoiceSalesOrderResult)',
    )
  })

  it('reads the result of a queued run once, with its status text', async () => {
    const scope = mockApi()
      .get(RESULT)
      .query({ ProcessID: `guid'${PROCESS}'` })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              ProcessID: PROCESS,
              Status: '30',
              NumberOfCreatedInvoices: 0,
              NumberOfFailedInvoices: 0,
              Errors: null,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, [PROCESS]))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ProcessID: PROCESS,
      Status: '30',
      StatusDescription: 'Busy',
      NumberOfCreatedInvoices: 0,
      NumberOfFailedInvoices: 0,
      Errors: null,
    })
  })

  it('accepts a single-record answer and keeps an unknown status', async () => {
    mockApi()
      .get(RESULT)
      .query(true)
      .reply(200, { d: { ProcessID: PROCESS, Status: '99' } })

    const out = JSON.parse(await runCmd(Cmd, [PROCESS]))

    expect(out).toEqual({
      ProcessID: PROCESS,
      Status: '99',
      StatusDescription: null,
    })
  })

  it('describes the status Exact answers as text', async () => {
    mockApi()
      .get(RESULT)
      .query(true)
      .reply(200, {
        d: { results: [{ ProcessID: PROCESS, Status: 'Functional error' }] },
      })

    const out = JSON.parse(await runCmd(Cmd, [PROCESS]))

    expect(out.StatusDescription).toBe('Functional error')
  })

  it('fails with 65 when Exact knows no such process', async () => {
    mockApi()
      .get(RESULT)
      .query(true)
      .reply(200, { d: { results: [] } })

    process.stdout.isTTY = true
    const err = await Cmd.run([PROCESS]).catch((e) => e)

    expect(exit(err)).toBe(65)
    expect(err.message).toMatch(/No result for process/)
  })

  it('fails with 64 when the argument is not a GUID', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(["x' or 1 eq 1"]).catch((e) => e)

    expect(exit(err)).toBe(64)
  })
})

describe('statusCode and resultError', async () => {
  const { resultError, statusCode } =
    await import('../../../src/lib/invoice-result.js')

  it('reads a code, a known text, or nothing', () => {
    expect(statusCode('52')).toBe(52)
    expect(statusCode('Technical error')).toBe(40)
    expect(statusCode('Paused')).toBe(null)
  })

  it('accepts a finished run without a failed count', () => {
    expect(resultError({ Status: 'Finished' })).toBe(null)
    expect(
      resultError({ Status: 'Technical error', Errors: 'x' }).message,
    ).toBe('Invoicing ended with status Technical error (0 failed invoices): x')
  })
})
