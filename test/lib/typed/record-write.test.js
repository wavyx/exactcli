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
import {
  defineRecordCreateCommand,
  defineRecordDeleteCommand,
  defineRecordUpdateCommand,
} from '../../../src/lib/typed/record-write.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-record-write-'))
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const MANDATES = '/api/v1/123/cashflow/DirectDebitMandates'
const spec = {
  topic: 'mandate',
  resource: 'cashflow/DirectDebitMandates',
  singular: 'a direct debit mandate',
  plural: 'direct debit mandates',
}
const Delete = defineRecordDeleteCommand(spec)
const Update = defineRecordUpdateCommand(spec)

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
const fail = (Cmd, argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}

describe('defineRecordDeleteCommand', () => {
  it('names the call and takes one GUID per argument', () => {
    expect(Delete.description).toBe(
      'Delete direct debit mandates, by GUID (DELETE cashflow/DirectDebitMandates)',
    )
    expect(Delete.strict).toBe(false)
  })

  it('--dry-run prints one request per GUID, without duplicates', async () => {
    const del = mockApi().delete(/.*/).reply(204)

    const out = JSON.parse(
      await runCmd(Delete, [A, B, A.toUpperCase(), '--dry-run']),
    )

    expect(del.isDone()).toBe(false)
    expect(out).toEqual([
      { method: 'DELETE', path: `${MANDATES}(guid'${A}')` },
      { method: 'DELETE', path: `${MANDATES}(guid'${B}')` },
    ])
  })

  it('deletes one after the other and names what it deleted on a failure', async () => {
    mockApi()
      .delete(`${MANDATES}(guid'${A}')`)
      .reply(204)
      .delete(`${MANDATES}(guid'${B}')`)
      .reply(400, { error: { message: { value: 'Mandate in use' } } })
    const chunks = []
    vi.spyOn(process.stderr, 'write').mockImplementation(
      (chunk) => chunks.push(String(chunk)) > 0,
    )

    const err = await fail(Delete, [A, B, '--allow-writes', '--yes'])

    expect(exit(err)).toBe(65)
    expect(chunks.join('')).toContain(`Deleted before the failure: ${A}\n`)
  })

  it('adds no note when the first delete fails', async () => {
    mockApi()
      .delete(`${MANDATES}(guid'${A}')`)
      .reply(400, { error: { message: { value: 'Mandate in use' } } })
    const chunks = []
    vi.spyOn(process.stderr, 'write').mockImplementation(
      (chunk) => chunks.push(String(chunk)) > 0,
    )

    const err = await fail(Delete, [A, '--allow-writes', '--yes'])

    expect(exit(err)).toBe(65)
    expect(chunks.join('')).not.toContain('Deleted before the failure')
  })

  it('deletes every GUID with --allow-writes --yes', async () => {
    const scope = mockApi()
      .delete(`${MANDATES}(guid'${A}')`)
      .reply(204)
      .delete(`${MANDATES}(guid'${B}')`)
      .reply(204)

    const out = JSON.parse(
      await runCmd(Delete, [A, B, '--allow-writes', '--yes']),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ deleted: [A, B] })
  })

  it('refuses without --yes, and a reference that is not a GUID', async () => {
    expect(exit(await fail(Delete, [A, '--allow-writes']))).toBe(77)
    expect(exit(await fail(Delete, ["1' or 1 eq 1", '--dry-run']))).toBe(64)
  })
})

describe('defineRecordUpdateCommand', () => {
  it('names the call', () => {
    expect(Update.description).toBe(
      'Update a direct debit mandate, by GUID (PUT cashflow/DirectDebitMandates)',
    )
  })

  it('--dry-run prints the validated request', async () => {
    const out = JSON.parse(
      await runCmd(Update, [
        A,
        '--set',
        'CancellationDate=2026-10-14',
        '--dry-run',
      ]),
    )

    expect(out).toEqual({
      method: 'PUT',
      path: `${MANDATES}(guid'${A}')`,
      body: { CancellationDate: '2026-10-14' },
    })
  })

  it('PUTs with --allow-writes', async () => {
    const scope = mockApi()
      .put(`${MANDATES}(guid'${A}')`, { Description: 'Main' })
      .reply(204)

    const out = JSON.parse(
      await runCmd(Update, [A, '--set', 'Description=Main', '--allow-writes']),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ ok: true, key: A })
  })

  it('fails with 64 on an empty body, an unknown field or a bad GUID', async () => {
    expect(exit(await fail(Update, [A, '--body', '{}', '--dry-run']))).toBe(64)
    expect(exit(await fail(Update, [A, '--set', 'Nope=1', '--dry-run']))).toBe(
      64,
    )
    expect(
      exit(await fail(Update, ['42', '--set', 'Description=x', '--dry-run'])),
    ).toBe(64)
  })
})

describe('code references and create', () => {
  const GL = '/api/v1/123/financial/GLAccounts'
  const glSpec = {
    topic: 'gl-account',
    resource: 'financial/GLAccounts',
    singular: 'a ledger account',
    plural: 'ledger accounts',
    byCode: true,
    codeFlags: true,
  }
  const GlCreate = defineRecordCreateCommand(glSpec)
  const GlUpdate = defineRecordUpdateCommand(glSpec)
  const GlDelete = defineRecordDeleteCommand(glSpec)
  /** The Code lookup of resolveRef on ledger accounts. */
  const mockCode = (code, id) =>
    mockApi()
      .get(GL)
      .query((q) => q.$filter === `Code eq '${code}'`)
      .reply(200, { d: { results: [{ ID: id, Code: code }] } })

  it('names the reference kinds in the descriptions', () => {
    expect(GlDelete.description).toBe(
      'Delete ledger accounts, by GUID or code (DELETE financial/GLAccounts)',
    )
    expect(GlCreate.description).toBe(
      'Create a ledger account (POST financial/GLAccounts)',
    )
    expect(Delete.description).toContain('by GUID (')
  })

  it('creates from --code and --description, merged over --set', async () => {
    const scope = mockApi()
      .post(GL, { Type: 110, Code: '799000', Description: 'Test income' })
      .reply(201, { d: { __metadata: { uri: 'x' }, ID: A, Code: '799000' } })

    const out = JSON.parse(
      await runCmd(GlCreate, [
        '--code',
        '799000',
        '--description',
        'Test income',
        '--set',
        'Type=110',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ ID: A, Code: '799000' })
  })

  it('create --dry-run validates and sends nothing; a missing field fails 64', async () => {
    const post = mockApi().post(GL).reply(201, { d: {} })
    const out = JSON.parse(
      await runCmd(GlCreate, [
        '--code',
        '799000',
        '--description',
        'Test',
        '--dry-run',
      ]),
    )
    expect(post.isDone()).toBe(false)
    expect(out.body).toEqual({ Code: '799000', Description: 'Test' })

    const err = await fail(GlCreate, ['--code', '799000', '--dry-run'])
    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/missing mandatory fields: Description/)
  })

  it('create merges --body under --code, and a bare --set reads no stdin', async () => {
    let out = JSON.parse(
      await runCmd(GlCreate, [
        '--body',
        '{"Type":110,"Description":"From body"}',
        '--code',
        '799000',
        '--dry-run',
      ]),
    )
    expect(out.body).toEqual({
      Type: 110,
      Description: 'From body',
      Code: '799000',
    })

    const MandateCreate = defineRecordCreateCommand(spec)
    out = JSON.parse(
      await runCmd(MandateCreate, [
        '--set',
        `Account=@guid:${A}`,
        '--set',
        `BankAccount=@guid:${B}`,
        '--dry-run',
      ]),
    )
    expect(out.body).toEqual({ Account: A, BankAccount: B })

    const err = await fail(GlCreate, ['--description', 'No code', '--dry-run'])
    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/missing mandatory fields: Code/)
  })

  it('a create without code flags takes --set only', async () => {
    const MandateCreate = defineRecordCreateCommand(spec)
    expect(MandateCreate.flags).not.toHaveProperty('code')
    expect(MandateCreate.examples[0]).toContain('--set')
  })

  it('updates and deletes by code after the gate', async () => {
    const scope = mockCode('799000', A)
      .put(`${GL}(guid'${A}')`, { Description: 'Renamed' })
      .reply(204)
    const out = JSON.parse(
      await runCmd(GlUpdate, [
        '799000',
        '--set',
        'Description=Renamed',
        '--allow-writes',
      ]),
    )
    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ ok: true, key: A })

    const lookup = mockCode('799000', A)
    expect(exit(await fail(GlDelete, ['799000', '--allow-writes']))).toBe(77)
    expect(lookup.isDone()).toBe(false)
    nock.cleanAll()

    const del = mockCode('799000', A).delete(`${GL}(guid'${A}')`).reply(204)
    process.stdout.isTTY = false
    const deleted = JSON.parse(
      await runCmd(GlDelete, ['799000', A, '--allow-writes', '--yes']),
    )
    expect(del.isDone()).toBe(true)
    // The code and the GUID name one record: one DELETE.
    expect(deleted).toEqual({ deleted: [A] })
  })

  it('refuses an empty code with 64', async () => {
    expect(exit(await fail(GlDelete, [' ', '--dry-run']))).toBe(64)
  })
})
