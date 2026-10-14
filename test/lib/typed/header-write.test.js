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
import { lineDescriptors } from '../../../src/lib/typed/line-descriptors.js'
import {
  defineDeleteCommand,
  defineUpdateCommand,
} from '../../../src/lib/typed/header-write.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-header-write-'))
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const ENTRIES = '/api/v1/123/salesentry/SalesEntries'
const d = lineDescriptors.salesEntry
const Delete = defineDeleteCommand(d)
const Update = defineUpdateCommand(d)

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
/** The header lookup of entry numbers. */
const mockNumbers = (rows) =>
  mockApi()
    .get(ENTRIES)
    .query((q) => q.$select === 'EntryID,EntryNumber')
    .reply(200, { d: { results: rows } })

describe('defineDeleteCommand', () => {
  it('names the call and takes a variadic reference', () => {
    expect(Delete.description).toBe(
      'Delete sales entries, by entry GUID or number (DELETE salesentry/SalesEntries)',
    )
    expect(Delete.strict).toBe(false)
    expect(Delete.descriptor).toBe(d)
  })

  it('--dry-run resolves the numbers and prints the requests, deleting nothing', async () => {
    const lookup = mockNumbers([{ EntryID: B, EntryNumber: 26700002 }])
    const del = mockApi().delete(/.*/).reply(204)

    const out = JSON.parse(await runCmd(Delete, [A, '26700002', '--dry-run']))

    expect(lookup.isDone()).toBe(true)
    expect(del.isDone()).toBe(false)
    expect(out).toEqual([
      { method: 'DELETE', path: `${ENTRIES}(guid'${A}')` },
      { method: 'DELETE', path: `${ENTRIES}(guid'${B}')` },
    ])
  })

  it('refuses without --allow-writes or --yes before any lookup', async () => {
    const lookup = mockNumbers([{ EntryID: B, EntryNumber: 26700002 }])

    expect(exit(await fail(Delete, ['26700002']))).toBe(77)
    expect(exit(await fail(Delete, ['26700002', '--allow-writes']))).toBe(77)
    expect(lookup.isDone()).toBe(false)
  })

  it('deletes every reference, one after the other', async () => {
    const scope = mockApi()
      .delete(`${ENTRIES}(guid'${A}')`)
      .reply(204)
      .delete(`${ENTRIES}(guid'${B}')`)
      .reply(204)

    const out = JSON.parse(
      await runCmd(Delete, [A, B, '--allow-writes', '--yes']),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ deleted: [A, B] })
  })

  it('deletes a header named by its number and its GUID once', async () => {
    mockNumbers([{ EntryID: A, EntryNumber: 26700002 }])
    const scope = mockApi().delete(`${ENTRIES}(guid'${A}')`).reply(204)

    const out = JSON.parse(
      await runCmd(Delete, [
        '26700002',
        A.toUpperCase(),
        '--allow-writes',
        '--yes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ deleted: [A] })
  })

  it('names what it deleted when a later delete fails', async () => {
    mockApi()
      .delete(`${ENTRIES}(guid'${A}')`)
      .reply(204)
      .delete(`${ENTRIES}(guid'${B}')`)
      .reply(400, { error: { message: { value: 'Entry is processed' } } })
    const chunks = []
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => chunks.push(String(chunk)) > 0)

    let err
    try {
      err = await fail(Delete, [A, B, '--allow-writes', '--yes'])
    } finally {
      spy.mockRestore()
    }

    expect(exit(err)).toBe(65)
    expect(err.message).toMatch(/Entry is processed/)
    expect(chunks.join('')).toBe(`Deleted before the failure: ${A}\n`)
  })

  it('adds no note when the first delete fails', async () => {
    mockApi()
      .delete(`${ENTRIES}(guid'${A}')`)
      .reply(400, { error: { message: { value: 'Entry is processed' } } })
    const chunks = []
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => chunks.push(String(chunk)) > 0)

    let err
    try {
      err = await fail(Delete, [A, B, '--allow-writes', '--yes'])
    } finally {
      spy.mockRestore()
    }

    expect(exit(err)).toBe(65)
    expect(chunks.join('')).not.toContain('Deleted before the failure')
  })

  it('fails with 65 on a number that names several headers, before any delete', async () => {
    // A quotation keeps its number across versions: delete one by its GUID.
    mockNumbers([
      { EntryID: A, EntryNumber: 7 },
      { EntryID: B, EntryNumber: 7 },
    ])

    const err = await fail(Delete, ['7', '--allow-writes', '--yes'])

    expect(exit(err)).toBe(65)
    expect(err.message).toBe(
      'EntryNumber 7 names 2 sales entries: use the GUID of one',
    )
  })

  it('fails with 64 on a reference that is neither a GUID nor a number', async () => {
    expect(exit(await fail(Delete, ["1' or 1 eq 1", '--dry-run']))).toBe(64)
  })
})

describe('defineUpdateCommand', () => {
  it('names the call and takes one reference', () => {
    expect(Update.description).toBe(
      'Update a sales entry, by entry GUID or number (PUT salesentry/SalesEntries)',
    )
    expect(Update.args.ref.required).toBe(true)
    expect(Update.flags).toHaveProperty('set')
    expect(Update.flags).toHaveProperty('body')
  })

  it('--dry-run resolves the number and prints the validated request', async () => {
    const lookup = mockNumbers([{ EntryID: B, EntryNumber: 26700002 }])

    const out = JSON.parse(
      await runCmd(Update, [
        '26700002',
        '--set',
        'Description=Corrected',
        '--dry-run',
      ]),
    )

    expect(lookup.isDone()).toBe(true)
    expect(out).toEqual({
      method: 'PUT',
      path: `${ENTRIES}(guid'${B}')`,
      body: { Description: 'Corrected' },
    })
  })

  it('PUTs the body with --allow-writes', async () => {
    const scope = mockApi()
      .put(`${ENTRIES}(guid'${A}')`, { Description: 'Corrected' })
      .reply(204)

    const out = JSON.parse(
      await runCmd(Update, [
        A,
        '--set',
        'Description=Corrected',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ ok: true, key: A })
  })

  it('refuses an empty body with 64 before any call', async () => {
    const err = await fail(Update, [A, '--body', '{}', '--allow-writes'])
    expect(exit(err)).toBe(64)
    expect(err.message).toBe('Nothing to update: give --set or --body')
  })

  it('refuses an unknown field with 64, and a write without --allow-writes with 77', async () => {
    expect(exit(await fail(Update, [A, '--set', 'Nope=1', '--dry-run']))).toBe(
      64,
    )
    expect(exit(await fail(Update, [A, '--set', 'Description=x']))).toBe(77)
  })
})
