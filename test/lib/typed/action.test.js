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
import {
  buildActionBody,
  coerceField,
  defineActionCommand,
  targetValue,
  validateAction,
} from '../../../src/lib/typed/action.js'
import { actions } from '../../../src/lib/typed/actions.js'
import { loadCatalog } from '../../../src/lib/catalog.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-action-'))
const ID = '11111111-1111-1111-1111-111111111111'
const ACCOUNT = '22222222-2222-2222-2222-222222222222'
const PATH = '/api/v1/123/crm/ReviewQuotation'

const Cmd = defineActionCommand(actions['quotation:review'])
const Finish = defineActionCommand(actions['assembly-order:finish'])

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

const fail = (Command, argv) => {
  process.stdout.isTTY = true
  return Command.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('coerceField', () => {
  it.each([
    ['int', '12', 12],
    ['int', '-3', -3],
    ['number', '2.5', 2.5],
    ['date', '2026-01-31', '2026-01-31'],
    ['guid', ID, ID],
    ['string', 'x y', 'x y'],
  ])('coerces %s %s', (type, value, expected) => {
    expect(coerceField(type, value, 'f')).toBe(expected)
  })

  it.each([
    ['int', '1.5', '--f expects an integer, received: 1.5'],
    ['number', 'x', '--f expects a number, received: x'],
    ['date', '31/01/2026', '--f expects YYYY-MM-DD, received: 31/01/2026'],
    ['guid', 'nope', '--f expects a GUID, received: nope'],
  ])('refuses a bad %s with exit 64', (type, value, message) => {
    expect(() => coerceField(type, value, 'f')).toThrow(message)
    try {
      coerceField(type, value, 'f')
    } catch (err) {
      expect(err.exitCode).toBe(64)
    }
  })
})

describe('targetValue', () => {
  it('needs a GUID unless the target is a string', () => {
    expect(targetValue({ field: 'X' }, ID)).toBe(ID)
    expect(targetValue({ field: 'X', type: 'string' }, 'Segment')).toBe(
      'Segment',
    )
    expect(() => targetValue({ field: 'X' }, '2026001')).toThrow(
      'Expected a GUID, received: 2026001',
    )
  })
})

describe('validateAction', () => {
  it('accepts every shipped action', () => {
    for (const action of Object.values(actions)) {
      expect(() => validateAction(action)).not.toThrow()
    }
  })

  it('names every problem', () => {
    const base = actions['quotation:reopen']
    expect(() => validateAction({ ...base, resource: 'crm/Nope' })).toThrow(
      'unknown resource crm/Nope',
    )
    const accounts = loadCatalog().resources.find(
      (r) => r.uri === '/api/v1/{division}/crm/Accounts',
    )
    const refusing = accounts.properties.find((p) => p.post === false).name
    expect(() =>
      validateAction({
        ...base,
        resource: 'crm/Accounts',
        target: { field: 'Nope' },
        fields: { d: { field: refusing, type: 'string' } },
      }),
    ).toThrow(
      `crm/Accounts: unknown field Nope; ${refusing} refuses POST; ` +
        'mandatory not covered: Name',
    )
    const noPost = loadCatalog().resources.find(
      (r) => !r.methods.includes('POST'),
    )
    expect(() =>
      validateAction({ ...base, resource: noPost.uri, target: { field: 'X' } }),
    ).toThrow('no POST')
  })
})

describe('buildActionBody', () => {
  it('carries the target, coerces flags and resolves a code', async () => {
    const lookup = mockApi()
      .get('/api/v1/123/crm/Accounts')
      .query((q) => q.$filter.includes('1001'))
      .reply(200, { d: { results: [{ ID: ACCOUNT, Code: '1001' }] } })
    const cmd = { apiClient: null, resolveDivision: () => 123 }
    const { createClient } = await import('../../../src/lib/client.js')
    cmd.apiClient = createClient({ token: 't' })
    const body = await buildActionBody(
      cmd,
      actions['quotation:review'],
      { account: '1001', 'copy-prices': true, date: '2026-02-01' },
      ID,
    )
    expect(lookup.isDone()).toBe(true)
    expect(body).toEqual({
      QuotationID: ID,
      OrderAccount: ACCOUNT,
      CopyItemPrices: true,
      QuotationDate: '2026-02-01',
    })
  })
})

describe('an action command', () => {
  it('describes itself from the descriptor', () => {
    expect(Cmd.action).toBe(actions['quotation:review'])
    expect(Cmd.description).toBe(
      'Review a quotation: a new version replaces it (POST crm/ReviewQuotation)',
    )
    expect(Cmd.examples[0]).toBe(
      '<%= config.bin %> quotation review <id> --dry-run',
    )
    expect(Object.keys(Cmd.flags)).toEqual(
      expect.arrayContaining(['allow-writes', 'yes', 'dry-run', 'account']),
    )
  })

  it('--dry-run prints the POST and sends nothing', async () => {
    const post = mockApi().post(PATH).reply(201)
    const out = JSON.parse(
      await runCmd(Cmd, [ID, '--description', 'v2', '--dry-run']),
    )
    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: PATH,
      body: { QuotationID: ID, Description: 'v2' },
    })
  })

  it('refuses without --allow-writes before any lookup', async () => {
    const err = await fail(Cmd, [ID, '--account', '1001'])
    expect(exit(err)).toBe(77)
    expect(err.message).toMatch(/Writes are off/)
    expect(nock.pendingMocks()).toEqual([])
  })

  it('refuses a target that is not a GUID', async () => {
    const err = await fail(Cmd, ['2026001', '--dry-run'])
    expect(exit(err)).toBe(64)
    expect(err.message).toBe('Expected a GUID, received: 2026001')
  })

  it('posts the body and prints the answer', async () => {
    const post = mockApi()
      .post(PATH, { QuotationID: ID, CopyItemPrices: true })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          QuotationID: ID,
          NewQuotationID: ACCOUNT,
          SuccessMessage: 'Reviewed',
        },
      })
    const out = JSON.parse(
      await runCmd(Cmd, [ID, '--copy-prices', '--allow-writes']),
    )
    expect(post.isDone()).toBe(true)
    expect(out).toEqual({
      QuotationID: ID,
      NewQuotationID: ACCOUNT,
      SuccessMessage: 'Reviewed',
    })
  })

  it('reads an answer that comes as a list', async () => {
    mockApi()
      .post(PATH)
      .reply(201, {
        d: { results: [{ QuotationID: ID, SuccessMessage: 'ok' }] },
      })
    const out = JSON.parse(await runCmd(Cmd, [ID, '--allow-writes']))
    expect(out).toEqual({ QuotationID: ID, SuccessMessage: 'ok' })
  })

  it('needs a required flag', async () => {
    const err = await fail(Finish, [ID, '--dry-run'])
    expect(err.message).toMatch(/Missing required flag/)
    expect(err.message).toMatch(/quantity/)
  })

  it('coerces a number flag into the body', async () => {
    const out = JSON.parse(
      await runCmd(Finish, [ID, '--quantity', '2.5', '--dry-run']),
    )
    expect(out.body).toEqual({ AssemblyOrder: ID, FinishOrderQuantity: 2.5 })
  })
})
