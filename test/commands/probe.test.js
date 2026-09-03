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
import { mockApi, runCmd } from '../helpers.js'
import { findResource } from '../../src/lib/catalog.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-probe-'))

const { default: Cmd } = await import('../../src/commands/probe.js')

const ACCOUNTS_PATH = '/api/v1/123/crm/Accounts'
const THINGS_PATH = '/api/v1/123/custom/Things'
const BETA_THINGS_PATH = '/api/v1/beta/123/custom/Things'
const PROPERTIES = findResource('crm/Accounts').properties
const NAMES = PROPERTIES.map((p) => p.name)
const UNKNOWN_RE =
  /^Unknown resource custom\/Things \(not in the catalogue of \d{4}-\d{2}-\d{2}\)\. Sending anyway\.\n/

/** Capture what the command writes to stderr. */
function captureStderr() {
  const chunks = []
  const spy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk) => chunks.push(String(chunk)) > 0)
  return {
    text: () => chunks.join(''),
    restore: () => spy.mockRestore(),
  }
}

/** Run the command with stderr captured; return the parsed JSON and stderr. */
async function probe(argv) {
  const stderr = captureStderr()
  try {
    const out = JSON.parse(await runCmd(Cmd, argv))
    return { out, stderr: stderr.text() }
  } finally {
    stderr.restore()
  }
}

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

describe('probe', () => {
  it('compares the returned fields with the catalogue, undocumented first', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $top: '3' })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              ID: '11111111-1111-1111-1111-111111111111',
              Code: '1001',
              Name: null,
              Foo: 'bar',
              Created: '/Date(1723990800000)/',
            },
            {
              __metadata: { uri: 'y' },
              ID: '22222222-2222-2222-2222-222222222222',
              Code: '1002',
              Name: 'Acme',
              Foo: 'baz',
            },
          ],
        },
      })

    const { out, stderr } = await probe(['crm/Accounts'])

    expect(scope.isDone()).toBe(true)
    const returned = ['ID', 'Code', 'Name', 'Created']
    const documented = NAMES.filter((n) => returned.includes(n))
    const missing = NAMES.filter((n) => !returned.includes(n))
    expect(documented).toHaveLength(4)
    expect(out.map((r) => r.field)).toEqual(['Foo', ...documented, ...missing])
    expect(out[0]).toEqual({
      field: 'Foo',
      type: 'string',
      sample: 'bar',
      catalogue: 'undocumented',
    })
    expect(out.find((r) => r.field === 'Created')).toEqual({
      field: 'Created',
      type: 'date',
      sample: '2024-08-18T14:20:00',
      catalogue: 'documented',
    })
    expect(out.find((r) => r.field === 'Name')).toEqual({
      field: 'Name',
      type: 'string',
      sample: 'Acme',
      catalogue: 'documented',
    })
    const accountant = PROPERTIES.find((p) => p.name === 'Accountant')
    expect(out.find((r) => r.field === 'Accountant')).toEqual({
      field: 'Accountant',
      type: accountant.type,
      sample: '',
      catalogue: 'not returned',
    })
    expect(stderr).toBe(
      `2 rows, 5 fields returned, 1 undocumented, ${missing.length} not returned\n`,
    )
  })

  it('marks every field "-" for an unknown resource and renders each kind', async () => {
    const scope = mockApi()
      .get(THINGS_PATH)
      .query({ $top: '3' })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              Num: 1,
              Flag: true,
              Obj: { a: 1 },
              Arr: [1, 2],
              Nil: null,
              Long: 'x'.repeat(50),
            },
          ],
        },
      })

    const { out, stderr } = await probe(['custom/Things'])

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      { field: 'Num', type: 'number', sample: '1', catalogue: '-' },
      { field: 'Flag', type: 'boolean', sample: 'true', catalogue: '-' },
      { field: 'Obj', type: 'object', sample: '{...}', catalogue: '-' },
      { field: 'Arr', type: 'array', sample: '[2]', catalogue: '-' },
      { field: 'Nil', type: 'null', sample: '', catalogue: '-' },
      {
        field: 'Long',
        type: 'string',
        sample: `${'x'.repeat(37)}...`,
        catalogue: '-',
      },
    ])
    expect(stderr).toMatch(UNKNOWN_RE)
    expect(stderr).toMatch(
      /\n1 rows, 6 fields returned, 0 undocumented, 0 not returned\n$/,
    )
  })

  it('treats a single record as one row and honours --beta', async () => {
    const scope = mockApi()
      .get(BETA_THINGS_PATH)
      .query({ $top: '3' })
      .reply(200, { d: { ID: 7 } })

    const { out, stderr } = await probe(['custom/Things', '--beta'])

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      { field: 'ID', type: 'number', sample: '7', catalogue: '-' },
    ])
    expect(stderr).toMatch(
      /\n1 rows, 1 fields returned, 0 undocumented, 0 not returned\n$/,
    )
  })

  it('clamps --top to 1..60 and sends --filter', async () => {
    const high = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $top: '60', $filter: "Status eq 'C'" })
      .reply(200, { d: { results: [{ ID: 'a' }] } })
    const low = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $top: '1' })
      .reply(200, { d: { results: [{ ID: 'a' }] } })

    await probe(['crm/Accounts', '--top', '999', '--filter', "Status eq 'C'"])
    await probe(['crm/Accounts', '--top', '0'])

    expect(high.isDone()).toBe(true)
    expect(low.isDone()).toBe(true)
  })

  it('exits 65 when the answer carries no record', async () => {
    const scope = mockApi()
      .get(ACCOUNTS_PATH)
      .query({ $top: '3' })
      .reply(200, { d: { results: [] } })

    // Interactive mode: the error reaches the caller with its message.
    process.stdout.isTTY = true
    const err = await Cmd.run(['crm/Accounts']).catch((e) => e)

    expect(scope.isDone()).toBe(true)
    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
    expect(err.message).toBe('No record returned by crm/Accounts')
  })

  it('falls back to $top=1 when the server demands it', async () => {
    const scope = mockApi()
      .get('/api/v1/123/custom/Things')
      .query({ $top: '3' })
      .reply(400, {
        error: {
          message: {
            lang: 'en',
            value:
              'Please add a $select or a $top=1 statement to the query string.',
          },
        },
      })
      .get('/api/v1/123/custom/Things')
      .query({ $top: '1' })
      .reply(200, { d: [{ A: 1 }] })

    const { out, stderr } = await probe(['custom/Things'])

    expect(scope.isDone()).toBe(true)
    expect(out.map((r) => r.field)).toEqual(['A'])
    expect(stderr).toMatch(/Exact demands \$top=1 without \$select: one row/)
  })

  it('passes any other 400 through', async () => {
    mockApi()
      .get('/api/v1/123/custom/Things')
      .query({ $top: '1' })
      .reply(400, {
        error: {
          message: {
            lang: 'en',
            value: 'Please add a $select or a $top=1 statement',
          },
        },
      })
    process.stdout.isTTY = true
    const err = await Cmd.run(['custom/Things', '--top', '1']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
  })
})
