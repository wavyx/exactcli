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
import { resetCatalog, validateDescriptor } from '../../../src/lib/catalog.js'
import descriptor from '../../../src/lib/typed/descriptors/quotation.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-quotation-'))

const { default: Cmd } = await import('../../../src/commands/quotation/list.js')

const PATH = '/api/v1/123/crm/Quotations'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const GUID = '11111111-1111-1111-1111-111111111111'
const SELECT = descriptor.columns.join(',')
const ORDER = descriptor.orderBy

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

describe('quotation list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('quotation')
    expect(descriptor.resource).toBe('crm/Quotations')
    expect(descriptor.orderBy).toBe('QuotationDate desc')
    expect(descriptor.columns.at(-1)).toBe('QuotationID')
  })

  it('selects the descriptor columns, orders by default, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              QuotationNumber: 26900001,
              QuotationDate: '/Date(1723990800000)/',
              OrderAccountName: 'Acme',
              AmountDC: 121,
              CloseDate: null,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        QuotationNumber: 26900001,
        QuotationDate: '2024-08-18T14:20:00',
        OrderAccountName: 'Acme',
        AmountDC: 121,
        CloseDate: null,
      },
    ])
  })

  it('renders its typed filters, resolves the account code', async () => {
    const lookup = mockApi()
      .get(ACCOUNTS)
      .query({ $filter: "Code eq '1001'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          `OrderAccount eq guid'${GUID}' and QuotationDate ge datetime'2026-01-01'` +
          " and QuotationDate le datetime'2026-01-31' and Status eq 25" +
          " and substringof('acme', Description)",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--account',
      '1001',
      '--from',
      '2026-01-01',
      '--to',
      '2026-01-31',
      '--status',
      '25',
      '--search',
      'acme',
    ])

    expect(lookup.isDone()).toBe(true)
    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad date before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--from', 'yesterday']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received yesterday/)
  })

  it('fails with 64 on a bad status before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--status', 'draft']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received draft/)
  })
})
