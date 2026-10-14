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
import { validateDescriptor } from '../../../src/lib/catalog.js'
import descriptor from '../../../src/lib/typed/descriptors/mandate.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-mandate-'))

const { default: List } = await import('../../../src/commands/mandate/list.js')
const { default: Create } =
  await import('../../../src/commands/mandate/create.js')
const { default: Update } =
  await import('../../../src/commands/mandate/update.js')
const { default: Delete } =
  await import('../../../src/commands/mandate/delete.js')

const MANDATES = '/api/v1/123/cashflow/DirectDebitMandates'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const BANKS = '/api/v1/123/crm/BankAccounts'
const ACCOUNT = '11111111-1111-1111-1111-111111111111'
const BANK = '22222222-2222-2222-2222-222222222222'
const MANDATE = '33333333-3333-3333-3333-333333333333'
const IBAN = 'BE68539007547034'

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
const fail = (Cmd, argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}

/** The account code lookup of resolveRef. */
const mockAccount = (scope = mockApi()) =>
  scope
    .get(ACCOUNTS)
    .query((q) => q.$filter === "Code eq '1001'")
    .reply(200, { d: { results: [{ ID: ACCOUNT, Name: 'Acme' }] } })

/** The IBAN lookup on the bank accounts of the account. */
const mockIban = (rows, scope = mockApi()) =>
  scope
    .get(BANKS)
    .query(
      (q) =>
        q.$filter === `Account eq guid'${ACCOUNT}' and IBAN eq '${IBAN}'` &&
        q.$select === 'ID,IBAN',
    )
    .reply(200, { d: { results: rows } })

describe('mandate list', () => {
  it('is the typed list of the mandate descriptor', () => {
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(List.descriptor).toBe(descriptor)
  })
})

describe('mandate update and delete', () => {
  it('name the mandate resource', () => {
    expect(Update.description).toContain('PUT cashflow/DirectDebitMandates')
    expect(Delete.description).toContain('DELETE cashflow/DirectDebitMandates')
  })
})

describe('mandate create', () => {
  it('names the call', () => {
    expect(Create.description).toContain('(POST cashflow/DirectDebitMandates)')
  })

  it('--dry-run resolves the account code and the IBAN, and sends nothing', async () => {
    const scope = mockIban([{ ID: BANK, IBAN }], mockAccount())
    const post = mockApi().post(MANDATES).reply(201, { d: {} })

    const out = JSON.parse(
      await runCmd(Create, [
        '--account',
        '1001',
        '--iban',
        'be68 5390 0754 7034',
        '--reference',
        'ACME-001',
        '--type',
        'b2b',
        '--signature-date',
        '2026-10-01',
        '--description',
        'Acme B2B',
        '--main',
        '--dry-run',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: MANDATES,
      body: {
        Account: ACCOUNT,
        BankAccount: BANK,
        Reference: 'ACME-001',
        Type: 1,
        PaymentType: 1,
        SignatureDate: '2026-10-01',
        Description: 'Acme B2B',
        Main: 1,
      },
    })
  })

  it('POSTs with a bank account GUID and the defaults: Core, recurrent', async () => {
    const scope = mockApi()
      .post(MANDATES, {
        Account: ACCOUNT,
        BankAccount: BANK,
        Reference: 'ACME-002',
        Type: 0,
        PaymentType: 1,
      })
      .reply(201, {
        d: { __metadata: { uri: 'x' }, ID: MANDATE, Reference: 'ACME-002' },
      })

    const out = JSON.parse(
      await runCmd(Create, [
        '--account',
        ACCOUNT,
        '--bank-account',
        BANK,
        '--reference',
        'ACME-002',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ ID: MANDATE, Reference: 'ACME-002' })
  })

  it('takes a one-off payment type', async () => {
    const out = JSON.parse(
      await runCmd(Create, [
        '--account',
        ACCOUNT,
        '--bank-account',
        BANK,
        '--reference',
        'X',
        '--payment-type',
        'one-off',
        '--dry-run',
      ]),
    )

    expect(out.body.PaymentType).toBe(0)
  })

  it('refuses a write before any lookup', async () => {
    const lookup = mockAccount()

    const err = await fail(Create, [
      '--account',
      '1001',
      '--iban',
      IBAN,
      '--reference',
      'X',
    ])

    expect(exit(err)).toBe(77)
    expect(lookup.isDone()).toBe(false)
  })

  it('fails with 65 when the account has no such IBAN, or several', async () => {
    mockIban([], mockAccount())
    let err = await fail(Create, [
      '--account',
      '1001',
      '--iban',
      IBAN,
      '--reference',
      'X',
      '--dry-run',
    ])
    expect(exit(err)).toBe(65)
    expect(err.message).toBe(
      `Account 1001 has no bank account with IBAN ${IBAN}: create it first (bank-account list shows the others)`,
    )

    mockIban(
      [
        { ID: BANK, IBAN },
        { ID: MANDATE, IBAN },
      ],
      mockAccount(),
    )
    err = await fail(Create, [
      '--account',
      '1001',
      '--iban',
      IBAN,
      '--reference',
      'X',
      '--dry-run',
    ])
    expect(exit(err)).toBe(65)
    expect(err.message).toMatch(/2 bank accounts.*--bank-account/)
  })

  it('fails with 64 on a bad IBAN, date, bank account or a missing bank', async () => {
    const base = ['--account', ACCOUNT, '--reference', 'X', '--dry-run']
    expect(exit(await fail(Create, [...base, '--iban', "BE' or 1"]))).toBe(64)
    expect(
      exit(
        await fail(Create, [
          ...base,
          '--bank-account',
          BANK,
          '--signature-date',
          '01/10/2026',
        ]),
      ),
    ).toBe(64)
    expect(exit(await fail(Create, [...base, '--bank-account', '42']))).toBe(64)
    expect(exit(await fail(Create, base))).toBe(64)
    expect(
      exit(
        await fail(Create, [...base, '--bank-account', BANK, '--iban', IBAN]),
      ),
    ).toBe(64)
  })
})
