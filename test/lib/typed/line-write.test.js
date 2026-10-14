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
import { lineDescriptors } from '../../../src/lib/typed/line-descriptors.js'
import {
  defineLineAddCommand,
  lineSpec,
} from '../../../src/lib/typed/line-write.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-line-write-'))
const ENTRY = '11111111-1111-1111-1111-111111111111'
const LINE = '22222222-2222-2222-2222-222222222222'
const GL = '44444444-4444-4444-4444-444444444444'
const SET_GL = ['--set', `GLAccount=@guid:${GL}`]
const ENTRIES = '/api/v1/123/salesentry/SalesEntries'
const LINES = '/api/v1/123/salesentry/SalesEntryLines'
const d = lineDescriptors.salesEntry
const Add = defineLineAddCommand(d)

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
const fail = (argv) => {
  process.stdout.isTTY = true
  return Add.run(argv).catch((e) => e)
}

describe('lineSpec', () => {
  it('names the lines of a header descriptor', () => {
    expect(lineSpec(d)).toEqual({
      topic: 'sales-entry',
      resource: 'salesentry/SalesEntryLines',
      singular: 'a line of a sales entry',
      plural: 'lines of sales entries',
    })
  })
})

describe('defineLineAddCommand', () => {
  it('names the call', () => {
    expect(Add.description).toBe(
      'Add a line to a sales entry, by entry GUID or number (POST salesentry/SalesEntryLines)',
    )
    expect(Add.descriptor).toBe(d)
  })

  it('--dry-run resolves the entry number and links the line to it', async () => {
    const lookup = mockApi()
      .get(ENTRIES)
      .query((q) => q.$filter === 'EntryNumber eq 26700002')
      .reply(200, {
        d: { results: [{ EntryID: ENTRY, EntryNumber: 26700002 }] },
      })

    const out = JSON.parse(
      await runCmd(Add, [
        '26700002',
        ...SET_GL,
        '--set',
        'AmountFC=100',
        '--set',
        'Description=Fee',
        '--dry-run',
      ]),
    )

    expect(lookup.isDone()).toBe(true)
    expect(out).toEqual({
      method: 'POST',
      path: LINES,
      body: {
        GLAccount: GL,
        AmountFC: 100,
        Description: 'Fee',
        EntryID: ENTRY,
      },
    })
  })

  it('POSTs with --allow-writes and prints the new line', async () => {
    const scope = mockApi()
      .post(LINES, { GLAccount: GL, AmountFC: 100, EntryID: ENTRY })
      .reply(201, { d: { __metadata: { uri: 'x' }, ID: LINE, AmountFC: 100 } })

    const out = JSON.parse(
      await runCmd(Add, [
        ENTRY,
        ...SET_GL,
        '--set',
        'AmountFC=100',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ ID: LINE, AmountFC: 100 })
  })

  it('refuses a body that names another header, and a write before any lookup', async () => {
    const other = '33333333-3333-3333-3333-333333333333'
    let err = await fail([
      ENTRY,
      '--set',
      `EntryID=@guid:${other}`,
      '--dry-run',
    ])
    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/EntryID comes from the argument/)

    const lookup = mockApi().get(ENTRIES).query(true).reply(200, {})
    err = await fail(['26700002', ...SET_GL, '--set', 'AmountFC=1'])
    expect(exit(err)).toBe(77)
    expect(lookup.isDone()).toBe(false)
  })

  it('fails with 64 on an unknown field', async () => {
    expect(exit(await fail([ENTRY, '--set', 'Nope=1', '--dry-run']))).toBe(64)
  })
})
