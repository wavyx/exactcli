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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-account-create-'))

const { default: Cmd } = await import('../../../src/commands/account/create.js')

const ID = '11111111-1111-1111-1111-111111111111'
const ACCOUNTS = '/api/v1/123/crm/Accounts'

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

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('account create', () => {
  it('--dry-run prints only the given fields and sends no POST', async () => {
    const post = mockApi().post(ACCOUNTS).reply(201, { d: {} })

    const out = JSON.parse(
      await runCmd(Cmd, [
        '--name',
        'Acme',
        '--customer',
        'yes',
        '--country',
        'be',
        '--dry-run',
      ]),
    )

    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: ACCOUNTS,
      body: { Name: 'Acme', IsSales: true, Country: 'BE' },
    })
  })

  it('refuses without --allow-writes and sends nothing', async () => {
    const post = mockApi().post(ACCOUNTS).reply(201, { d: {} })

    const err = await fail(['--name', 'Acme'])

    expect(exit(err)).toBe(77)
    expect(post.isDone()).toBe(false)
  })

  it('POSTs every flag as its field with --allow-writes and prints the record', async () => {
    const scope = mockApi()
      .post(ACCOUNTS, {
        Name: 'Acme',
        Code: '1001',
        IsSales: true,
        IsSupplier: false,
        VATNumber: 'BE0123456789',
        Email: 'info@acme.example',
        Phone: '+32 2 123 45 67',
        Website: 'https://acme.example',
        AddressLine1: 'Main street 1',
        Postcode: '1000',
        City: 'Brussels',
        Country: 'BE',
        Status: 'C',
      })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          ID,
          Code: '              1001',
          Name: 'Acme',
          IsSales: true,
          Remarks: null,
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        '--name',
        'Acme',
        '--code',
        '1001',
        '--customer',
        'true',
        '--supplier',
        'false',
        '--vat-number',
        'BE0123456789',
        '--email',
        'info@acme.example',
        '--phone',
        '+32 2 123 45 67',
        '--website',
        'https://acme.example',
        '--address',
        'Main street 1',
        '--postcode',
        '1000',
        '--city',
        'Brussels',
        '--country',
        'BE',
        '--status',
        'C',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ID,
      Code: '              1001',
      Name: 'Acme',
      IsSales: true,
      Remarks: null,
    })
  })

  it('fails with 64 on a bad --customer value, before the gate', async () => {
    const err = await fail(['--name', 'Acme', '--customer', 'maybe'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Expected true or false, received maybe/)
  })

  it('fails with 64 on a bad --country, before the gate', async () => {
    const err = await fail(['--name', 'Acme', '--country', 'Belgium'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--country expects 2 letters/)
  })

  it('fails with 64 without --name', async () => {
    const err = await fail(['--code', '1001', '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Missing required flag name/)
  })
})
