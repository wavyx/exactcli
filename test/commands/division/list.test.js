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
import { apiBase, mockApi, runCmd } from '../../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-division-test-'))

const { default: List } = await import('../../../src/commands/division/list.js')

const BASE = apiBase()
const DIVISIONS_PATH = '/api/v1/123/hrm/Divisions'

/** Collect what the command writes to stderr, for example the paging note. */
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

function division(overrides = {}) {
  return {
    __metadata: { uri: 'x' },
    Code: '123',
    HID: 123,
    Description: 'Acme BE',
    Country: 'BE',
    CountryDescription: 'Belgium',
    Currency: 'EUR',
    Main: true,
    Status: 20,
    ...overrides,
  }
}

beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
  process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
})

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  delete process.env.EXACTCLI_ACCESS_TOKEN
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  nock.cleanAll()
  delete process.env.EXACTCLI_DIVISION
})

afterEach(() => {
  nock.cleanAll()
  delete process.env.EXACTCLI_DIVISION
})

describe('division list', () => {
  it('pages through hrm/Divisions with --all and normalizes the rows', async () => {
    const scope = mockApi()
      .get(DIVISIONS_PATH)
      .reply(200, {
        d: {
          results: [
            division(),
            division({
              __metadata: { uri: 'y' },
              Code: '124',
              HID: 124,
              Description: 'Acme NL',
              Country: 'NL',
              CountryDescription: 'Netherlands',
              Main: false,
            }),
          ],
          __next: `${BASE}${DIVISIONS_PATH}?$skiptoken=guid'124'`,
        },
      })
      .get(DIVISIONS_PATH)
      .query({ $skiptoken: "guid'124'" })
      .reply(200, {
        d: {
          results: [
            division({
              __metadata: { uri: 'z' },
              Code: '125',
              HID: 125,
              Description: 'Acme DE',
              Country: 'DE',
              CountryDescription: 'Germany',
              Main: false,
            }),
          ],
        },
      })

    const stdout = await runCmd(List, [
      '--division',
      '123',
      '--all',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)

    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.Code)).toEqual(['123', '124', '125'])
    expect(rows.every((r) => !('__metadata' in r))).toBe(true)
    expect(scope.isDone()).toBe(true)
  })

  it('exposes the verified columns as a table', async () => {
    mockApi()
      .get(DIVISIONS_PATH)
      .reply(200, { d: { results: [division()] } })
    const stdout = await runCmd(List, ['--division', '123'])
    for (const header of [
      'Code',
      'HID',
      'Description',
      'Country',
      'Currency',
      'Main',
      'Status',
    ]) {
      expect(stdout).toContain(header)
    }
    expect(stdout).toContain('Acme BE')
  })

  it('--limit caps the rows, stops paging and notes the rest', async () => {
    const scope = mockApi()
      .get(DIVISIONS_PATH)
      .reply(200, {
        d: {
          results: [division(), division({ Code: '124', HID: 124 })],
          __next: `${BASE}${DIVISIONS_PATH}?$skiptoken=guid'124'`,
        },
      })
    // A second page mock is deliberately absent: --limit 1 must stop before
    // pageOData ever follows __next to it.
    const stderr = captureStderr()
    let stdout
    try {
      stdout = await runCmd(List, [
        '--division',
        '123',
        '--limit',
        '1',
        '--output',
        'json',
      ])
    } finally {
      stderr.restore()
    }
    const rows = JSON.parse(stdout)
    expect(rows).toHaveLength(1)
    expect(rows[0].Code).toBe('123')
    expect(stderr.text()).toBe(
      'More results available. Use --all or --limit.\n',
    )
    expect(scope.isDone()).toBe(true)
  })

  it('reads one page without --all or --limit', async () => {
    const scope = mockApi()
      .get(DIVISIONS_PATH)
      .reply(200, {
        d: {
          results: [division()],
          __next: `${BASE}${DIVISIONS_PATH}?$skiptoken=guid'124'`,
        },
      })
    const stderr = captureStderr()
    let stdout
    try {
      stdout = await runCmd(List, ['--division', '123', '--output', 'json'])
    } finally {
      stderr.restore()
    }
    expect(JSON.parse(stdout)).toHaveLength(1)
    expect(stderr.text()).toBe(
      'More results available. Use --all or --limit.\n',
    )
    expect(scope.isDone()).toBe(true)
  })

  it('sends the shared OData flags', async () => {
    const scope = mockApi()
      .get(DIVISIONS_PATH)
      .query({ $filter: 'Main eq true', $select: 'Code,Description' })
      .reply(200, { d: { results: [{ Code: '123', Description: 'Acme BE' }] } })
    const stdout = await runCmd(List, [
      '--division',
      '123',
      '--filter',
      'Main eq true',
      '--select',
      'Code,Description',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout)).toEqual([
      { Code: '123', Description: 'Acme BE' },
    ])
    expect(scope.isDone()).toBe(true)
  })

  it('--raw keeps the envelope fields untouched', async () => {
    mockApi()
      .get(DIVISIONS_PATH)
      .reply(200, { d: { results: [division()] } })
    const stdout = await runCmd(List, [
      '--division',
      '123',
      '--raw',
      '--output',
      'json',
    ])
    const rows = JSON.parse(stdout)
    expect(rows[0].__metadata).toEqual({ uri: 'x' })
  })

  it('fails with exit 78 when no division is configured', async () => {
    const err = await List.run([]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.message).toMatch(/No division configured/)
  })
})
