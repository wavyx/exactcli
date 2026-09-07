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
import { resetCatalog, validateDescriptor } from '../../../src/lib/catalog.js'
import descriptor from '../../../src/lib/typed/descriptors/mail-message.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-mail-message-'))

const { default: Cmd } =
  await import('../../../src/commands/mail-message/list.js')

const PATH = '/api/v1/123/mailbox/MailMessagesSent'
const SELECT = descriptor.columns.join(',')
const ORDER = descriptor.orderBy

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

describe('mail-message list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('mail-message')
    expect(descriptor.resource).toBe('mailbox/MailMessagesSent')
    expect(descriptor.orderBy).toBe('SenderDateSent desc')
    expect(descriptor.columns.at(-1)).toBe('ID')
  })

  it('selects the descriptor columns, orders by default, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              Subject: 'invoice.pdf',
              Operation: 2,
              RecipientStatusDescription: 'Processed',
              SenderDateSent: '/Date(1723990800000)/',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        Subject: 'invoice.pdf',
        Operation: 2,
        RecipientStatusDescription: 'Processed',
        SenderDateSent: '2024-08-18T14:20:00',
      },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          'Operation eq 2 and RecipientStatus eq 50' +
          " and SenderDateSent ge datetime'2026-01-01'" +
          " and SenderDateSent le datetime'2026-01-31T23:59:59'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--operation',
      '2',
      '--status',
      '50',
      '--from',
      '2026-01-01',
      '--to',
      '2026-01-31',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad date before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--from', 'yesterday']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received yesterday/)
  })

  it('fails with 64 on a bad status before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--status', 'open']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received open/)
  })
})
