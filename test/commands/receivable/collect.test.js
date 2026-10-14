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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-collect-'))
const { default: Cmd } =
  await import('../../../src/commands/receivable/collect.js')
const { default: Update } =
  await import('../../../src/commands/receivable/update.js')

const PATH = '/api/v1/123/cashflow/Receivables'
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const M = '33333333-3333-3333-3333-333333333333'

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

const exit = (err) => err.exitCode ?? err.oclif?.exit
const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
/** The open receivable lookup of an invoice number. */
const mockInvoice = (number, rows) =>
  mockApi()
    .get(PATH)
    .query(
      (q) =>
        q.$filter === `InvoiceNumber eq ${number} and IsFullyPaid eq false`,
    )
    .reply(200, { d: { results: rows } })

describe('receivable update', () => {
  it('PUTs a receivable by GUID', () => {
    expect(Update.description).toBe(
      'Update a receivable, by GUID (PUT cashflow/Receivables)',
    )
  })
})

describe('receivable collect', () => {
  it('--dry-run resolves an invoice number and prints the requests', async () => {
    const lookup = mockInvoice(26700002, [{ ID: A }])

    const out = JSON.parse(
      await runCmd(Cmd, ['26700002', B, '--mandate', M, '--dry-run']),
    )

    expect(lookup.isDone()).toBe(true)
    const body = { PaymentMethod: 'I', DirectDebitMandate: M }
    expect(out).toEqual([
      { method: 'PUT', path: `${PATH}(guid'${A}')`, body },
      { method: 'PUT', path: `${PATH}(guid'${B}')`, body },
    ])
  })

  it('PUTs each receivable with --allow-writes', async () => {
    const scope = mockApi()
      .put(`${PATH}(guid'${A}')`, {
        PaymentMethod: 'I',
        PaymentReference: 'REF-1',
        Description: 'Collect 10/2026',
      })
      .reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [
        A.toUpperCase(),
        '--reference',
        'REF-1',
        '--description',
        'Collect 10/2026',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ collected: [A] })
  })

  it('takes --reference for one receivable named twice', async () => {
    const out = JSON.parse(
      await runCmd(Cmd, [A, A.toUpperCase(), '--reference', 'R', '--dry-run']),
    )
    expect(out).toHaveLength(1)
    expect(out[0].body.PaymentReference).toBe('R')
  })

  it('sends one PUT for a receivable named twice', async () => {
    const scope = mockApi()
      .put(`${PATH}(guid'${A}')`, { PaymentMethod: 'I' })
      .reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [A.toUpperCase(), A, '--allow-writes']),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ collected: [A] })
  })

  it('names what it prepared when a later PUT fails', async () => {
    mockApi()
      .put(`${PATH}(guid'${A}')`)
      .reply(204)
      .put(`${PATH}(guid'${B}')`)
      .reply(400, { error: { message: { value: 'Matched' } } })
    const chunks = []
    vi.spyOn(process.stderr, 'write').mockImplementation(
      (c) => chunks.push(String(c)) > 0,
    )

    const err = await fail([A, B, '--allow-writes'])

    expect(exit(err)).toBe(65)
    expect(chunks.join('')).toContain(`Prepared before the failure: ${A}\n`)
  })

  it('adds no note when the first PUT fails', async () => {
    mockApi()
      .put(`${PATH}(guid'${A}')`)
      .reply(400, { error: { message: { value: 'Matched' } } })
    const chunks = []
    vi.spyOn(process.stderr, 'write').mockImplementation(
      (c) => chunks.push(String(c)) > 0,
    )

    const err = await fail([A, '--allow-writes'])

    expect(exit(err)).toBe(65)
    expect(chunks.join('')).not.toContain('Prepared before the failure')
  })

  it('fails with 65 on an invoice with no or several open receivables', async () => {
    mockInvoice(1, [])
    let err = await fail(['1', '--dry-run'])
    expect(exit(err)).toBe(65)
    expect(err.message).toBe('No open receivable for invoice 1')

    mockInvoice(2, [{ ID: A }, { ID: B }])
    err = await fail(['2', '--dry-run'])
    expect(exit(err)).toBe(65)
    expect(err.message).toMatch(/has 2 open receivables/)
  })

  it('refuses bad input with 64 and a write without the gate with 77, before any call', async () => {
    const lookup = mockInvoice(26700002, [{ ID: A }])
    expect(exit(await fail(["1' or 1 eq 1", '--dry-run']))).toBe(64)
    expect(exit(await fail([A, '--mandate', 'x', '--dry-run']))).toBe(64)
    expect(exit(await fail([A, B, '--reference', 'R', '--dry-run']))).toBe(64)
    expect(exit(await fail(['26700002']))).toBe(77)
    expect(lookup.isDone()).toBe(false)
  })
})
