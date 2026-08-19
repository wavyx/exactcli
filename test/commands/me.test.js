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
import { mockApi, runCmd } from '../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-me-test-'))

const { default: Me } = await import('../../src/commands/me.js')

const ME_PATH = '/api/v1/current/Me'

/** @param {object} [overrides] */
function meEnvelope(overrides = {}) {
  return {
    d: {
      results: [
        {
          __metadata: { uri: 'x' },
          CurrentDivision: 123,
          FullName: 'Acme User',
          Email: 'user@acme.example',
          UserName: 'acme.user',
          Legislation: 'BE',
          ServerTime: '/Date(1723990800000)/',
          ServerUtcOffset: 120,
          ...overrides,
        },
      ],
    },
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
})

afterEach(() => {
  nock.cleanAll()
})

describe('me', () => {
  it('does not require a division', async () => {
    mockApi().get(ME_PATH).reply(200, meEnvelope())
    // Deliberately absent: --division, EXACTCLI_DIVISION, profile division.
    const stdout = await runCmd(Me, ['--output', 'json'])
    expect(JSON.parse(stdout).CurrentDivision).toBe(123)
  })

  it('renders a table with the normalized record', async () => {
    mockApi().get(ME_PATH).reply(200, meEnvelope())
    const stdout = await runCmd(Me)
    expect(stdout).toContain('Acme User')
    expect(stdout).toContain('user@acme.example')
    expect(stdout).not.toContain('__metadata')
  })

  it('normalizes the record for json output', async () => {
    mockApi().get(ME_PATH).reply(200, meEnvelope())
    const stdout = await runCmd(Me, ['--output', 'json'])
    const record = JSON.parse(stdout)
    expect(record).toEqual({
      CurrentDivision: 123,
      FullName: 'Acme User',
      Email: 'user@acme.example',
      UserName: 'acme.user',
      Legislation: 'BE',
      ServerTime: '2024-08-18T14:20:00',
      ServerUtcOffset: 120,
    })
  })

  it('--raw prints the untouched envelope', async () => {
    mockApi().get(ME_PATH).reply(200, meEnvelope())
    const stdout = await runCmd(Me, ['--raw', '--output', 'json'])
    const body = JSON.parse(stdout)
    expect(body.d.results[0].__metadata).toEqual({ uri: 'x' })
    expect(body.d.results[0].ServerTime).toBe('/Date(1723990800000)/')
  })

  it('sends no $select query parameter', async () => {
    const scope = mockApi()
      .get(ME_PATH)
      .query((q) => Object.keys(q).length === 0)
      .reply(200, meEnvelope())
    await runCmd(Me, ['--output', 'json'])
    expect(scope.isDone()).toBe(true)
  })

  it('--fields limits the table columns', async () => {
    mockApi().get(ME_PATH).reply(200, meEnvelope())
    const stdout = await runCmd(Me, ['--fields', 'FullName,Email'])
    expect(stdout).toContain('Acme User')
    expect(stdout).not.toContain('CurrentDivision')
  })

  it('handles a single-record envelope (no results array)', async () => {
    mockApi().get(ME_PATH).reply(200, { d: meEnvelope().d.results[0] })
    const stdout = await runCmd(Me, ['--output', 'json'])
    expect(JSON.parse(stdout).FullName).toBe('Acme User')
  })
})
