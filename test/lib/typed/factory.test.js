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
import { descriptors } from '../../../src/lib/typed/descriptors.js'
import {
  buildTypedFilter,
  defineListCommand,
  renderClause,
  renderValue,
} from '../../../src/lib/typed/factory.js'
import { listingFlags } from '../../../src/lib/listing.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-factory-'))
const GUID = '11111111-1111-1111-1111-111111111111'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const SELECT = descriptors.account.columns.join(',')
const Account = defineListCommand(descriptors.account)

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

describe('renderValue', () => {
  it('renders every type', () => {
    expect(renderValue('int', '2026')).toBe('2026')
    expect(renderValue('int', '-1')).toBe('-1')
    expect(renderValue('bool', 'yes')).toBe('true')
    expect(renderValue('bool', 'FALSE')).toBe('false')
    expect(renderValue('date', '2026-01-31')).toBe("datetime'2026-01-31'")
    expect(renderValue('guid', GUID)).toBe(`guid'${GUID}'`)
    expect(renderValue('string', "O'Neil")).toBe("'O''Neil'")
  })

  it('rejects a bad int, bool or date with 64', () => {
    for (const [type, value] of [
      ['int', 'x'],
      ['bool', 'maybe'],
      ['date', '31/01/2026'],
    ]) {
      const err = (() => {
        try {
          renderValue(type, value)
        } catch (e) {
          return e
        }
      })()
      expect(err.exitCode).toBe(64)
      expect(err.message).toMatch(new RegExp(`received ${value}`))
    }
  })
})

describe('renderClause', () => {
  it('renders a field clause with the default and an explicit operator', () => {
    expect(renderClause({ field: 'FinancialYear', type: 'int' }, '2026')).toBe(
      'FinancialYear eq 2026',
    )
    expect(
      renderClause({ field: 'Date', type: 'date', op: 'ge' }, '2026-01-01'),
    ).toBe("Date ge datetime'2026-01-01'")
  })

  it('renders a search as substringof, or an exact Code for digits', () => {
    expect(renderClause({ field: 'Name', type: 'search' }, 'acme')).toBe(
      "substringof('acme', Name)",
    )
    expect(renderClause({ field: 'Name', type: 'search' }, '1001')).toBe(
      "Code eq '1001'",
    )
  })
})

describe('buildTypedFilter', () => {
  it('joins the given filters with and, skips the absent ones', async () => {
    const cmd = { flags: { year: '2026', period: '9' } }
    expect(await buildTypedFilter(cmd, descriptors.transactionLine)).toBe(
      'FinancialYear eq 2026 and FinancialPeriod eq 9',
    )
    expect(
      await buildTypedFilter({ flags: {} }, descriptors.transactionLine),
    ).toBeUndefined()
  })

  it('resolves a code through the referenced resource', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query({ $filter: "Code eq 'ACME'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })
    const { createClient } = await import('../../../src/lib/client.js')
    const cmd = {
      flags: { account: 'ACME' },
      apiClient: createClient({ token: 'test-token', retry: false }),
      resolveDivision: () => 123,
    }

    expect(await buildTypedFilter(cmd, descriptors.transactionLine)).toBe(
      `Account eq guid'${GUID}'`,
    )
    expect(scope.isDone()).toBe(true)
  })
})

describe('defineListCommand', () => {
  it('builds a command class with the listing flags plus one flag per filter', () => {
    expect(Account.descriptor).toBe(descriptors.account)
    expect(Account.description).toBe(descriptors.account.description)
    for (const name of [
      ...Object.keys(listingFlags),
      'search',
      'status',
      'customer',
      'supplier',
    ]) {
      expect(Account.flags).toHaveProperty(name)
    }
    expect(Account.examples[0]).toMatch(/^<%= config.bin %> account list/)
  })

  it('describes a filter flag from its field when the descriptor gives no text', () => {
    const Bare = defineListCommand({
      ...descriptors.account,
      filters: { zip: { field: 'Postcode', type: 'string' } },
    })
    expect(Bare.flags.zip.description).toBe('Filter: Postcode eq <string>')
  })

  it('falls back to two default examples', () => {
    const Bare = defineListCommand({
      ...descriptors.account,
      examples: undefined,
    })
    expect(Bare.examples).toEqual([
      '<%= config.bin %> account list',
      '<%= config.bin %> account list --limit 200 --output json',
    ])
  })

  it('sends the default $select and $orderby', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query({ $select: SELECT, $orderby: 'Name asc' })
      .reply(200, {
        d: { results: [{ __metadata: { uri: 'x' }, Code: '1', Name: 'Acme' }] },
      })

    const out = JSON.parse(await runCmd(Account, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([{ Code: '1', Name: 'Acme' }])
  })

  it('renders a typed filter and combines it with a free --filter', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query({
        $select: SELECT,
        $orderby: 'Name asc',
        $filter:
          "(Status eq 'C') and substringof('acme', Name) and IsSales eq true",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Account, [
      '--search',
      'acme',
      '--customer',
      'yes',
      '--filter',
      "Status eq 'C'",
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('sends a typed filter alone', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query({
        $select: SELECT,
        $orderby: 'Name asc',
        $filter: "Code eq '1001'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Account, ['--search', '1001'])

    expect(scope.isDone()).toBe(true)
  })

  it('lets --select narrow the columns and --orderby override the sort', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query({ $select: 'Code', $orderby: 'Code desc' })
      .reply(200, { d: { results: [{ Code: '1' }] } })
    process.stdout.isTTY = true

    const out = await runCmd(Account, [
      '--select',
      'Code',
      '--orderby',
      'Code desc',
    ])

    expect(scope.isDone()).toBe(true)
    expect(out).toMatch(/Code/)
    expect(out).not.toMatch(/Name/)
  })

  it('fails with 64 on a bad typed value before any request', async () => {
    const Doc = defineListCommand(descriptors.document)
    process.stdout.isTTY = true
    const err = await Doc.run(['--from', 'yesterday']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received yesterday/)
  })
})
