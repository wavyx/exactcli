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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-opening-'))

const { default: Cmd } =
  await import('../../../src/commands/opening-balance/list.js')

const SELECT =
  'ReportingYear,GLAccountCode,GLAccountDescription,BalanceSide,Amount,GLAccount'

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

const row = {
  __metadata: { uri: 'x' },
  ReportingYear: 2026,
  GLAccountCode: '550000',
  GLAccountDescription: 'Bank',
  BalanceSide: 'D',
  Amount: 1250.5,
  GLAccount: '11111111-1111-1111-1111-111111111111',
}

describe('opening-balance list', () => {
  it('names the four calls it can make', () => {
    for (const call of [
      'GET openingbalance/CurrentYear/AfterEntry',
      'GET openingbalance/CurrentYear/Processed',
      'GET openingbalance/PreviousYear/AfterEntry',
      'GET openingbalance/PreviousYear/Processed',
    ]) {
      expect(Cmd.description).toContain(call)
    }
  })

  it('reads the current year after entry by default', async () => {
    const scope = mockApi()
      .get('/api/v1/123/openingbalance/CurrentYear/AfterEntry')
      .query({ $select: SELECT })
      .reply(200, { d: { results: [row] } })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        ReportingYear: 2026,
        GLAccountCode: '550000',
        GLAccountDescription: 'Bank',
        BalanceSide: 'D',
        Amount: 1250.5,
        GLAccount: '11111111-1111-1111-1111-111111111111',
      },
    ])
  })

  it('--year previous --processed reads the processed entries of last year, with a filter', async () => {
    const scope = mockApi()
      .get('/api/v1/123/openingbalance/PreviousYear/Processed')
      .query({ $select: SELECT, $filter: "GLAccountCode eq '550000'" })
      .reply(200, { d: { results: [row] } })

    await runCmd(Cmd, [
      '--year',
      'previous',
      '--processed',
      '--filter',
      "GLAccountCode eq '550000'",
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('keeps a --select of the user', async () => {
    const scope = mockApi()
      .get('/api/v1/123/openingbalance/CurrentYear/Processed')
      .query({ $select: 'GLAccountCode,Amount' })
      .reply(200, { d: { results: [{ GLAccountCode: '550000', Amount: 1 }] } })

    process.stdout.isTTY = true
    const out = await runCmd(Cmd, [
      '--processed',
      '--select',
      'GLAccountCode,Amount',
    ])

    expect(scope.isDone()).toBe(true)
    expect(out).toMatch(/550000/)
    expect(out).not.toMatch(/BalanceSide/)
  })
})
