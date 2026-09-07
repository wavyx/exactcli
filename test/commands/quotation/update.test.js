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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-quotation-update-'))

const { default: Cmd } =
  await import('../../../src/commands/quotation/update.js')

const GUID = '11111111-1111-1111-1111-111111111111'
const QUOTATIONS = '/api/v1/123/crm/Quotations'
const KEYED = `${QUOTATIONS}(guid'${GUID}')`

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

describe('quotation update', () => {
  it('--dry-run prints only the given fields and sends no PUT', async () => {
    const put = mockApi().put(KEYED).reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [GUID, '--close-date', '2026-09-30', '--dry-run']),
    )

    expect(put.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'PUT',
      path: KEYED,
      body: { CloseDate: '2026-09-30' },
    })
  })

  it('refuses without --allow-writes and sends nothing', async () => {
    const put = mockApi().put(KEYED).reply(204)

    const err = await fail([GUID, '--description', 'Spring offer'])

    expect(exit(err)).toBe(77)
    expect(put.isDone()).toBe(false)
  })

  it('PUTs every header field to the keyed path and reports the fields', async () => {
    const scope = mockApi()
      .put(KEYED, {
        Description: 'Spring offer',
        YourRef: 'PO-42',
        QuotationDate: '2026-09-01',
        CloseDate: '2026-09-30',
      })
      .reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [
        GUID,
        '--description',
        'Spring offer',
        '--date',
        '2026-09-01',
        '--close-date',
        '2026-09-30',
        '--reference',
        'PO-42',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ok: true,
      path: KEYED,
      key: GUID,
      fields: ['Description', 'YourRef', 'QuotationDate', 'CloseDate'],
    })
  })

  it('prints a human line in a terminal', async () => {
    mockApi().put(KEYED, { YourRef: 'PO-42' }).reply(204)
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [
      GUID,
      '--reference',
      'PO-42',
      '--allow-writes',
    ])

    expect(out).toBe(`Updated crm/Quotations ${GUID}: YourRef`)
  })

  it('fails with 64 when no field is given', async () => {
    const err = await fail([GUID, '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Nothing to update/)
  })

  it('fails with 64 on a bad --date, before the gate', async () => {
    const err = await fail([GUID, '--date', '01/09/2026'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--date expects YYYY-MM-DD/)
  })

  it('fails with 64 on an id that is not a GUID', async () => {
    const err = await fail(['700', '--description', 'Spring offer'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/must be a GUID/)
  })

  it('has no --line flag: lines are not part of a header update', async () => {
    const err = await fail([GUID, '--line', 'Default:2:100', '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--line/)
  })
})
