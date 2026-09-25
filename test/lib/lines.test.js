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

/** An entry line with named options between the fields and the description. */
const WITH_OPTIONS = {
  ...ENTRY,
  options: {
    vat: { field: 'VATCode', type: 'text' },
    from: { field: 'From', type: 'date' },
    to: { field: 'To', type: 'date' },
    'vat-amount': { field: 'VATAmountFC', type: 'amount' },
    quantity: { field: 'Quantity', type: 'number' },
    share: { field: 'Share', type: 'fraction' },
  },
}

describe('parseLine options', () => {
  it('reads named options between the fields and the description', () => {
    expect(
      parseLine(
        '610000:1200:vat=5:from=2026-01-01:to=2026-12-31:Rent: HQ',
        WITH_OPTIONS,
      ),
    ).toEqual({
      GLAccount: '610000',
      AmountFC: 1200,
      VATCode: '5',
      From: '2026-01-01',
      To: '2026-12-31',
      Description: 'Rent: HQ',
    })
    expect(
      parseLine('610000:10:vat-amount=-2.1:quantity=3:share=0.5', WITH_OPTIONS),
    ).toEqual({
      GLAccount: '610000',
      AmountFC: 10,
      VATAmountFC: -2.1,
      Quantity: 3,
      Share: 0.5,
    })
  })

  it('keeps a line without options, and an unknown key after the description, as text', () => {
    expect(parseLine('610000:10:Fees', WITH_OPTIONS)).toEqual({
      GLAccount: '610000',
      AmountFC: 10,
      Description: 'Fees',
    })
    expect(parseLine('610000:10:Fees:note=x', WITH_OPTIONS)).toEqual({
      GLAccount: '610000',
      AmountFC: 10,
      Description: 'Fees:note=x',
    })
  })

  it('throws 64 on a known option after the description or in upper case', () => {
    // Exact would book the default VAT code while the user meant another one.
    for (const text of ['610000:10:Fees:vat=5', '610000:10:VAT=21']) {
      const err = fail(() => parseLine(text, WITH_OPTIONS))
      expect(err.exitCode).toBe(64)
      expect(err.message).toBe(
        `--line option vat must come before the description, in lower case, received: ${text}`,
      )
    }
  })

  it('bounds a number option with a maximum', () => {
    const spec = {
      ...ENTRY,
      options: { rate: { field: 'Rate', type: 'number', max: 1 } },
    }
    expect(parseLine('610000:10:rate=-0.5', spec).Rate).toBe(-0.5)
    const err = fail(() => parseLine('610000:10:rate=2', spec))
    expect(err.message).toBe(
      '--line option rate expects a number up to 1, received: 610000:10:rate=2',
    )
  })

  it('reads an option-like part as text when the spec has no options', () => {
    expect(parseLine('Default:2:100:note=x', ORDER)).toEqual({
      Item: 'Default',
      Quantity: 2,
      UnitPrice: 100,
      Description: 'note=x',
    })
  })

  it('throws 64 on an unknown option and names the allowed ones', () => {
    // A mistyped option on a financial write must fail, not land in the
    // description.
    const err = fail(() => parseLine('610000:10:vta=5', WITH_OPTIONS))
    expect(err.exitCode).toBe(64)
    expect(err.message).toBe(
      '--line has an unknown option vta (allowed: vat, from, to, vat-amount, quantity, share), received: 610000:10:vta=5',
    )
  })

  it('throws 64 on an option with a bad value or given twice', () => {
    const cases = [
      ['610000:10:from=2026-1-1', 'option from expects YYYY-MM-DD'],
      ['610000:10:quantity=abc', 'option quantity expects a number'],
      ['610000:10:vat-amount=1e3', 'option vat-amount expects an amount'],
      ['610000:10:vat=', 'option vat expects a value'],
      ['610000:10:share=50', 'option share expects a fraction from 0 to 1'],
      ['610000:10:share=-0.1', 'option share expects a fraction from 0 to 1'],
      ['610000:10:share=half', 'option share expects a fraction from 0 to 1'],
      ['610000:10:vat=5:vat=F', 'option vat is given twice'],
    ]
    for (const [text, reason] of cases) {
      const err = fail(() => parseLine(text, WITH_OPTIONS))
      expect(err.exitCode).toBe(64)
      expect(err.message).toBe(`--line ${reason}, received: ${text}`)
    }
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

  it('keeps a line that does not carry the field, without a lookup', async () => {
    // An optional field, such as the ledger account of an invoice line.
    expect(
      await resolveLines(
        cmd,
        [{ Item: GUID_A, Quantity: 1 }],
        'GLAccount',
        'financial/GLAccounts',
      ),
    ).toEqual([{ Item: GUID_A, Quantity: 1 }])
  })

  it('returns an empty list for no lines', async () => {
    expect(await resolveLines(cmd, [], 'Item', 'logistics/Items')).toEqual([])
  })
})
