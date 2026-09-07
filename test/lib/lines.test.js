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
import { mockApi } from '../helpers.js'
import { createClient } from '../../src/lib/client.js'
import {
  AMOUNT_RE,
  DATE_RE,
  NUMBER_RE,
  assertDate,
  parseLine,
  parseNumber,
  resolveLines,
} from '../../src/lib/lines.js'

const GUID_A = '11111111-1111-1111-1111-111111111111'
const GUID_B = '22222222-2222-2222-2222-222222222222'

/** The spec of an order line: an item, a quantity and a price. */
const ORDER = {
  shape: 'item:quantity:unit price[:description]',
  fields: { Item: 'text', Quantity: 'number', UnitPrice: 'number' },
}

/** The spec of an entry line: a ledger account and a signed amount. */
const ENTRY = {
  shape: '<gl account>:<amount>[:description]',
  fields: { GLAccount: 'text', AmountFC: 'amount' },
}

const fail = (fn) => {
  try {
    fn()
  } catch (err) {
    return err
  }
  throw new Error('expected a throw')
}

describe('the patterns', () => {
  it('NUMBER_RE accepts a plain or negative decimal', () => {
    for (const ok of ['2', '100', '-2.5', '0']) {
      expect(NUMBER_RE.test(ok)).toBe(true)
    }
    for (const bad of ['+2', '1e3', 'abc', '', '2.', '.5']) {
      expect(NUMBER_RE.test(bad)).toBe(false)
    }
  })

  it('AMOUNT_RE accepts an explicit sign as well', () => {
    for (const ok of ['50', '+50', '-12.5']) {
      expect(AMOUNT_RE.test(ok)).toBe(true)
    }
    for (const bad of ['1e3', 'abc', '', '++5']) {
      expect(AMOUNT_RE.test(bad)).toBe(false)
    }
  })

  it('DATE_RE accepts YYYY-MM-DD only', () => {
    expect(DATE_RE.test('2026-09-03')).toBe(true)
    for (const bad of ['03/09/2026', '2026-9-3', '2026-09-03T00:00', '']) {
      expect(DATE_RE.test(bad)).toBe(false)
    }
  })
})

describe('assertDate', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(assertDate('2026-09-03', 'date')).toBeUndefined()
  })

  it('throws 64 and names the flag on anything else', () => {
    const err = fail(() => assertDate('03/09/2026', 'close-date'))
    expect(err.exitCode).toBe(64)
    expect(err.message).toBe(
      '--close-date expects YYYY-MM-DD, received: 03/09/2026',
    )
    expect(fail(() => assertDate('', 'date')).exitCode).toBe(64)
  })
})

describe('parseNumber', () => {
  it('returns the number', () => {
    expect(parseNumber('99.5', 'sales-price')).toBe(99.5)
    expect(parseNumber('-1', 'cost-price')).toBe(-1)
  })

  it('throws 64 and names the flag on anything else', () => {
    const err = fail(() => parseNumber('abc', 'sales-price'))
    expect(err.exitCode).toBe(64)
    expect(err.message).toBe('--sales-price expects a number, received: abc')
    expect(fail(() => parseNumber('+5', 'cost-price')).exitCode).toBe(64)
  })
})

describe('parseLine', () => {
  it('splits the fields and keeps the rest as the description', () => {
    expect(parseLine('Default:2:100:Consulting', ORDER)).toEqual({
      Item: 'Default',
      Quantity: 2,
      UnitPrice: 100,
      Description: 'Consulting',
    })
    expect(parseLine('Default:2:100:Note: a:b', ORDER)).toEqual({
      Item: 'Default',
      Quantity: 2,
      UnitPrice: 100,
      Description: 'Note: a:b',
    })
  })

  it('omits the description when there is none', () => {
    const line = { Item: 'Default', Quantity: 2, UnitPrice: 100 }
    expect(parseLine('Default:2:100', ORDER)).toEqual(line)
    expect(parseLine('Default:2:100:', ORDER)).toEqual(line)
  })

  it('names the description field per the spec', () => {
    expect(
      parseLine('Default:2:100:Consulting', { ...ORDER, description: 'Note' }),
    ).toEqual({
      Item: 'Default',
      Quantity: 2,
      UnitPrice: 100,
      Note: 'Consulting',
    })
  })

  it('accepts an explicit sign on an amount', () => {
    expect(parseLine('700000:+50', ENTRY)).toEqual({
      GLAccount: '700000',
      AmountFC: 50,
    })
    expect(parseLine('700000:-12.5:Fees', ENTRY)).toEqual({
      GLAccount: '700000',
      AmountFC: -12.5,
      Description: 'Fees',
    })
  })

  it('throws 64 with the shape on a bad line', () => {
    const bad = [
      'Default',
      'Default:2',
      ':2:100',
      'Default:abc:100',
      'Default:+2:100',
      '',
    ]
    for (const text of bad) {
      const err = fail(() => parseLine(text, ORDER))
      expect(err.exitCode).toBe(64)
      expect(err.message).toBe(
        `--line expects item:quantity:unit price[:description], received: ${text}`,
      )
    }
    const err = fail(() => parseLine('400000:1e3', ENTRY))
    expect(err.message).toBe(
      '--line expects <gl account>:<amount>[:description], received: 400000:1e3',
    )
  })

  it('names the flag per the spec', () => {
    const err = fail(() => parseLine('x', { ...ORDER, flag: 'row' }))
    expect(err.message).toMatch(/^--row expects /)
  })
})

describe('resolveLines', () => {
  const PATH = '/api/v1/123/financial/GLAccounts'
  let cmd
  beforeAll(() => {
    process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
  })
  afterAll(() => {
    delete process.env.EXACTCLI_ACCESS_TOKEN
  })
  beforeEach(() => {
    nock.disableNetConnect()
    cmd = {
      apiClient: createClient({ token: 'test-token', retry: false }),
      resolveDivision: () => 123,
    }
  })
  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  it('turns the field of every line into a GUID and keeps the rest', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $filter: "Code eq '700000'",
        $select: 'ID,Code,Description',
        $top: '2',
      })
      .reply(200, { d: { results: [{ ID: GUID_B, Code: '700000' }] } })
    const lines = [
      { GLAccount: GUID_A, AmountFC: 50, Description: 'Rent' },
      { GLAccount: '700000', AmountFC: -50 },
    ]

    const out = await resolveLines(
      cmd,
      lines,
      'GLAccount',
      'financial/GLAccounts',
    )

    expect(out).toEqual([
      { GLAccount: GUID_A, AmountFC: 50, Description: 'Rent' },
      { GLAccount: GUID_B, AmountFC: -50 },
    ])
    expect(lines[1].GLAccount).toBe('700000')
    expect(scope.isDone()).toBe(true)
  })

  it('returns an empty list for no lines', async () => {
    expect(await resolveLines(cmd, [], 'Item', 'logistics/Items')).toEqual([])
  })
})
