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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-item-create-'))

const { default: Cmd } = await import('../../../src/commands/item/create.js')

const GL_REVENUE = '11111111-1111-1111-1111-111111111111'
const GL_COSTS = '22222222-2222-2222-2222-222222222222'
const GROUP = '33333333-3333-3333-3333-333333333333'
const ITEM = '44444444-4444-4444-4444-444444444444'
const ITEMS = '/api/v1/123/logistics/Items'
const GL_ACCOUNTS = '/api/v1/123/financial/GLAccounts'
const ITEM_GROUPS = '/api/v1/123/logistics/ItemGroups'
const BASE = ['--code', 'WIDGET', '--description', 'Widget']
const REFS = [
  '--gl-revenue',
  '700000',
  '--gl-costs',
  '600000',
  '--group',
  'GRP1',
]

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

/** The two ledger lookups by code, then the item group lookup by code. */
const mockLookups = () =>
  mockApi()
    .get(GL_ACCOUNTS)
    .query({
      $filter: "Code eq '700000'",
      $select: 'ID,Code,Description',
      $top: '2',
    })
    .reply(200, { d: { results: [{ ID: GL_REVENUE }] } })
    .get(GL_ACCOUNTS)
    .query({
      $filter: "Code eq '600000'",
      $select: 'ID,Code,Description',
      $top: '2',
    })
    .reply(200, { d: { results: [{ ID: GL_COSTS }] } })
    .get(ITEM_GROUPS)
    .query({
      $filter: "Code eq 'GRP1'",
      $select: 'ID,Code,Description',
      $top: '2',
    })
    .reply(200, { d: { results: [{ ID: GROUP }] } })

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('item create', () => {
  it('--dry-run resolves the ledger accounts and the group and sends no POST', async () => {
    const lookups = mockLookups()
    const post = mockApi().post(ITEMS).reply(201, { d: {} })

    const out = JSON.parse(await runCmd(Cmd, [...BASE, ...REFS, '--dry-run']))

    expect(lookups.isDone()).toBe(true)
    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: ITEMS,
      body: {
        Code: 'WIDGET',
        Description: 'Widget',
        GLRevenue: GL_REVENUE,
        GLCosts: GL_COSTS,
        ItemGroup: GROUP,
      },
    })
  })

  it('--dry-run prints only the given fields', async () => {
    const out = JSON.parse(await runCmd(Cmd, [...BASE, '--dry-run']))

    expect(out.body).toEqual({ Code: 'WIDGET', Description: 'Widget' })
  })

  it('refuses without --allow-writes before any lookup', async () => {
    const lookups = mockLookups()

    const err = await fail([...BASE, ...REFS])

    expect(exit(err)).toBe(77)
    expect(lookups.isDone()).toBe(false)
  })

  it('POSTs every flag as its field with --allow-writes and prints the record', async () => {
    const scope = mockLookups()
      .post(ITEMS, {
        Code: 'WIDGET',
        Description: 'Widget',
        StandardSalesPrice: 99.5,
        CostPriceStandard: 40,
        Unit: 'pc',
        IsSalesItem: true,
        IsPurchaseItem: false,
        IsStockItem: true,
        GLRevenue: GL_REVENUE,
        GLCosts: GL_COSTS,
        ItemGroup: GROUP,
      })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          ID: ITEM,
          Code: 'WIDGET',
          Description: 'Widget',
          StandardSalesPrice: 99.5,
          Notes: null,
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        ...BASE,
        '--sales-price',
        '99.5',
        '--cost-price',
        '40',
        '--unit',
        'pc',
        '--sales',
        'true',
        '--purchase',
        'no',
        '--stock',
        '1',
        ...REFS,
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ID: ITEM,
      Code: 'WIDGET',
      Description: 'Widget',
      StandardSalesPrice: 99.5,
      Notes: null,
    })
  })

  it('passes GUID references through without a lookup', async () => {
    const out = JSON.parse(
      await runCmd(Cmd, [
        ...BASE,
        '--gl-revenue',
        GL_REVENUE,
        '--gl-costs',
        GL_COSTS,
        '--group',
        GROUP,
        '--dry-run',
      ]),
    )

    expect(out.body).toEqual({
      Code: 'WIDGET',
      Description: 'Widget',
      GLRevenue: GL_REVENUE,
      GLCosts: GL_COSTS,
      ItemGroup: GROUP,
    })
  })

  it('fails with 64 on a bad --sales value, before the gate', async () => {
    const err = await fail([...BASE, '--sales', 'maybe'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Expected true or false, received maybe/)
  })

  it('fails with 64 on a bad --sales-price, before the gate', async () => {
    const err = await fail([...BASE, '--sales-price', 'cheap'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--sales-price expects a number/)
  })

  it('fails with 64 without --code', async () => {
    const err = await fail(['--description', 'Widget', '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Missing required flag code/)
  })
})
