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
import { findResource, propertyNames } from '../../../src/lib/catalog.js'
import { lineDescriptors } from '../../../src/lib/typed/line-descriptors.js'
import { defineLinesCommand } from '../../../src/lib/typed/line-list.js'
import { listingFlags } from '../../../src/lib/listing.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-line-list-'))
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const LINES = '/api/v1/123/salesinvoice/SalesInvoiceLines'
const PARENT = '/api/v1/123/salesinvoice/SalesInvoices'
const d = lineDescriptors.salesInvoice
const SELECT = d.columns.join(',')
const ORDER = 'InvoiceID,LineNumber'
const Lines = defineLinesCommand(d)

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

describe('line descriptors', () => {
  it('name fields that the catalogue knows, the link among the columns', () => {
    for (const x of Object.values(lineDescriptors)) {
      const lines = propertyNames(findResource(x.resource))
      for (const c of x.columns)
        expect(lines, `${x.resource} ${c}`).toContain(c)
      expect(x.columns).toContain(x.link)
      const parent = propertyNames(findResource(x.parent))
      expect(parent, x.parent).toContain(x.parentKey)
      expect(parent, x.parent).toContain(x.number)
    }
  })

  it('name the call they make in the description', () => {
    for (const x of Object.values(lineDescriptors)) {
      expect(x.description).toMatch(new RegExp(`\\(GET ${x.resource}\\)$`))
    }
  })
})

describe('defineLinesCommand', () => {
  it('builds a command with a variadic reference and the listing flags', () => {
    expect(Lines.strict).toBe(false)
    expect(Lines.args.ref.required).toBe(true)
    for (const name of Object.keys(listingFlags)) {
      expect(Lines.flags).toHaveProperty(name)
    }
    expect(Lines.description).toBe(d.description)
  })

  it('reads the lines of several GUIDs in one request', async () => {
    const scope = mockApi()
      .get(LINES)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `InvoiceID eq guid'${A}' or InvoiceID eq guid'${B}'`,
      })
      .reply(200, {
        d: {
          results: [
            { __metadata: { uri: 'x' }, InvoiceID: A, LineNumber: 1 },
            { __metadata: { uri: 'x' }, InvoiceID: B, LineNumber: 1 },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Lines, [A, B, A]))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      { InvoiceID: A, LineNumber: 1 },
      { InvoiceID: B, LineNumber: 1 },
    ])
  })

  it('resolves numbers through the parent resource first', async () => {
    const scope = mockApi()
      .get(PARENT)
      .query({
        $select: 'InvoiceID,InvoiceNumber',
        $filter: 'InvoiceNumber eq 26700001 or InvoiceNumber eq 26700002',
      })
      .reply(200, {
        d: {
          results: [
            { InvoiceID: A, InvoiceNumber: 26700001 },
            { InvoiceID: B, InvoiceNumber: 26700002 },
          ],
        },
      })
      .get(LINES)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `InvoiceID eq guid'${A}' or InvoiceID eq guid'${B}'`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Lines, ['26700001', '26700002'])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 65 and names the numbers that match nothing', async () => {
    mockApi()
      .get(PARENT)
      .query(true)
      .reply(200, { d: { results: [{ InvoiceID: A, InvoiceNumber: 1 }] } })

    process.stdout.isTTY = true
    const err = await Lines.run(['1', '2', '3']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
    expect(err.message).toMatch(
      /No salesinvoice\/SalesInvoices with InvoiceNumber 2, 3/,
    )
  })

  it('fails with 64 on a reference that is neither a GUID nor a number, before any request', async () => {
    process.stdout.isTTY = true
    const err = await Lines.run([A, "1' or 1 eq 1"]).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected a GUID or a number, received 1' or 1/)
    // A number is an Int32: 11 digits or more cannot be one.
    const long = await Lines.run(['12345678901']).catch((e) => e)
    expect(long.exitCode ?? long.oclif?.exit).toBe(64)
  })

  it('combines a free --filter with the header filter', async () => {
    const scope = mockApi()
      .get(LINES)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `(AmountFC gt 0) and (InvoiceID eq guid'${A}')`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Lines, [A, '--filter', 'AmountFC gt 0'])

    expect(scope.isDone()).toBe(true)
  })

  it('lets --select narrow the columns', async () => {
    const scope = mockApi()
      .get(LINES)
      .query({
        $select: 'LineNumber,AmountFC',
        $orderby: ORDER,
        $filter: `InvoiceID eq guid'${A}'`,
      })
      .reply(200, { d: { results: [{ LineNumber: 1, AmountFC: 10 }] } })

    const out = JSON.parse(
      await runCmd(Lines, [A, '--select', 'LineNumber,AmountFC']),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([{ LineNumber: 1, AmountFC: 10 }])
  })
})
