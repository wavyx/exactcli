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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockApi, runCmd } from '../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-backup-cfg-'))
const ROOT = mkdtempSync(join(tmpdir(), 'exactcli-backup-'))
const { default: Cmd } = await import('../../src/commands/backup.js')
const { feedStore } = await import('../../src/lib/backup.js')

const SYNC = '/api/v1/123/sync'
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
let dir
let n = 0

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
  rmSync(ROOT, { recursive: true, force: true })
})
beforeEach(() => {
  nock.disableNetConnect()
  process.stdout.isTTY = false
  dir = join(ROOT, `run-${n++}`)
})
afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
  vi.restoreAllMocks()
})

const exit = (err) => err.exitCode ?? err.oclif?.exit
const json = (file) => JSON.parse(readFileSync(join(dir, file), 'utf8'))
const since = (ts) => (q) => q.$filter === `Timestamp gt ${ts}L`
/** A sync answer; a next link makes it one page of several. */
const page = (rows, next) => ({
  d: { results: rows, ...(next ? { __next: next } : {}) },
})
const quietStderr = () => {
  const chunks = []
  vi.spyOn(process.stderr, 'write').mockImplementation(
    (c) => chunks.push(String(c)) > 0,
  )
  return chunks
}

describe('backup', () => {
  it('--list prints the feed names and calls nothing', async () => {
    const out = JSON.parse(await runCmd(Cmd, ['--list']))
    expect(out).toContainEqual({ feed: 'Financial/TransactionLines' })
  })

  it('copies the feeds, then refreshes them with changes and deletions', async () => {
    mockApi()
      .get(`${SYNC}/CRM/Accounts`)
      .query(since(0))
      .reply(
        200,
        page([
          { ID: A, Name: 'Acme', Timestamp: 5 },
          { ID: B, Name: 'Beta', Timestamp: 7 },
        ]),
      )
      .get(`${SYNC}/Deleted`)
      .query(since(0))
      .reply(200, page([]))

    const first = JSON.parse(
      await runCmd(Cmd, ['--dir', dir, '--feed', 'CRM/Accounts']),
    )

    expect(first).toEqual([
      { feed: 'CRM/Accounts', status: 'ok', fetched: 2, total: 2 },
      { feed: 'Deleted', status: 'ok', fetched: 0, removed: 0 },
    ])
    expect(json('CRM/Accounts.json')).toHaveLength(2)
    expect(json('manifest.json')).toMatchObject({
      division: 123,
      feeds: { 'CRM/Accounts': { status: 'ok', timestamp: 7, count: 2 } },
      deleted: { timestamp: 0 },
    })

    // The second run asks for what changed after the stored timestamps.
    mockApi()
      .get(`${SYNC}/CRM/Accounts`)
      .query(since(7))
      .reply(200, page([{ ID: A, Name: 'Acme NV', Timestamp: 9 }]))
      .get(`${SYNC}/Deleted`)
      .query(since(0))
      .reply(200, page([{ EntityKey: B, Timestamp: 3 }]))

    const second = JSON.parse(
      await runCmd(Cmd, ['--dir', dir, '--feed', 'CRM/Accounts']),
    )

    expect(second).toEqual([
      { feed: 'CRM/Accounts', status: 'ok', fetched: 1, total: 2 },
      { feed: 'Deleted', status: 'ok', fetched: 1, removed: 1 },
    ])
    expect(json('CRM/Accounts.json')).toEqual([
      { ID: A, Name: 'Acme NV', Timestamp: 9 },
    ])
    expect(json('manifest.json').deleted.timestamp).toBe(3)
  })

  it('--full reads from zero and replaces the stored rows', async () => {
    mockApi()
      .get(`${SYNC}/CRM/Accounts`)
      .query(since(0))
      .reply(200, page([{ ID: A, Timestamp: 5 }]))
      .get(`${SYNC}/Deleted`)
      .query(since(0))
      .reply(200, page([]))
    await runCmd(Cmd, ['--dir', dir, '--feed', 'CRM/Accounts'])

    mockApi()
      .get(`${SYNC}/CRM/Accounts`)
      .query(since(0))
      .reply(200, page([{ ID: B, Timestamp: 8 }]))
      .get(`${SYNC}/Deleted`)
      .query(since(0))
      .reply(200, page([]))
    await runCmd(Cmd, ['--dir', dir, '--feed', 'CRM/Accounts', '--full'])

    expect(json('CRM/Accounts.json')).toEqual([{ ID: B, Timestamp: 8 }])
  })

  it('marks a feed cut by the page budget as partial and goes on from its last timestamp', async () => {
    mockApi()
      .get(`${SYNC}/CRM/Accounts`)
      .query(since(0))
      .reply(
        200,
        page(
          [{ ID: A, Timestamp: 5 }],
          `https://start.exactonline.be${SYNC}/CRM/Accounts?$skiptoken=x`,
        ),
      )
      .get(`${SYNC}/Deleted`)
      .query(since(0))
      .reply(
        200,
        page(
          [{ EntityKey: B, Timestamp: 2 }],
          `https://start.exactonline.be${SYNC}/Deleted?$skiptoken=y`,
        ),
      )
    const chunks = quietStderr()

    const out = JSON.parse(
      await runCmd(Cmd, [
        '--dir',
        dir,
        '--feed',
        'CRM/Accounts',
        '--max-pages',
        '1',
      ]),
    )

    expect(out[0]).toEqual({
      feed: 'CRM/Accounts',
      status: 'partial',
      fetched: 1,
      total: 1,
    })
    expect(out[1]).toEqual({
      feed: 'Deleted',
      status: 'partial',
      fetched: 1,
      removed: 0,
    })
    expect(json('manifest.json').feeds['CRM/Accounts'].timestamp).toBe(5)
    expect(json('manifest.json').deleted.timestamp).toBe(2)
    expect(chunks.join('')).toMatch(/run backup again to go on/)
  })

  it('skips a forbidden feed, records a failed one, goes on, and exits 65', async () => {
    mockApi()
      .get(`${SYNC}/Manufacturing/ShopOrders`)
      .query(true)
      .reply(403, { error: { message: { value: 'Forbidden' } } })
      .get(`${SYNC}/CRM/Accounts`)
      .query(true)
      .reply(400, { error: { message: { value: 'Bad select' } } })
      .get(`${SYNC}/Financial/GLAccounts`)
      .query(true)
      .reply(200, page([{ ID: A, Timestamp: 4 }]))
      .get(`${SYNC}/Deleted`)
      .query(true)
      .reply(200, page([]))
    quietStderr()

    process.stdout.isTTY = true
    const err = await Cmd.run([
      '--dir',
      dir,
      '--feed',
      'Manufacturing/ShopOrders',
      '--feed',
      'CRM/Accounts',
      '--feed',
      'Financial/GLAccounts',
      '--no-retry',
    ]).catch((e) => e)

    expect(exit(err)).toBe(65)
    expect(err.message).toMatch(/1 feeds failed \(CRM\/Accounts\)/)
    const manifest = json('manifest.json')
    expect(manifest.feeds['Manufacturing/ShopOrders'].status).toBe('forbidden')
    expect(manifest.feeds['CRM/Accounts']).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Bad select'),
    })
    expect(manifest.feeds['Financial/GLAccounts'].status).toBe('ok')
  })

  it('stops the run on an auth failure and keeps what it saved', async () => {
    mockApi()
      .get(`${SYNC}/Financial/GLAccounts`)
      .query(true)
      .reply(200, page([{ ID: A, Timestamp: 4 }]))
      .get(`${SYNC}/CRM/Accounts`)
      .query(true)
      .reply(401, { error: { message: { value: 'Unauthorized' } } })
    quietStderr()

    process.stdout.isTTY = true
    const err = await Cmd.run([
      '--dir',
      dir,
      '--feed',
      'Financial/GLAccounts',
      '--feed',
      'CRM/Accounts',
      '--no-retry',
    ]).catch((e) => e)

    expect(exit(err)).toBe(77)
    const manifest = json('manifest.json')
    expect(manifest.feeds['Financial/GLAccounts'].status).toBe('ok')
    expect(manifest.lastRun).toBeDefined()
  })

  it('warns when the deleted log expired since the last run', async () => {
    mockApi()
      .get(`${SYNC}/CRM/Accounts`)
      .query(true)
      .reply(200, page([]))
      .get(`${SYNC}/Deleted`)
      .query(true)
      .reply(200, page([]))
    await runCmd(Cmd, ['--dir', dir, '--feed', 'CRM/Accounts'])
    const manifest = json('manifest.json')
    manifest.deleted.updated = '2020-01-01T00:00:00Z'
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest))

    mockApi()
      .get(`${SYNC}/CRM/Accounts`)
      .query(true)
      .reply(200, page([]))
      .get(`${SYNC}/Deleted`)
      .query(true)
      .reply(200, page([]))
    const chunks = quietStderr()
    await runCmd(Cmd, ['--dir', dir, '--feed', 'CRM/Accounts'])
    expect(chunks.join('')).toMatch(/longer than the 2 months/)

    // The next run warns again, although the log is fresh now.
    const replies = () =>
      mockApi()
        .get(`${SYNC}/CRM/Accounts`)
        .query(true)
        .reply(200, page([]))
        .get(`${SYNC}/Deleted`)
        .query(true)
        .reply(200, page([]))
    replies()
    chunks.length = 0
    await runCmd(Cmd, ['--dir', dir, '--feed', 'CRM/Accounts'])
    expect(chunks.join('')).toMatch(/longer than the 2 months/)
    expect(json('manifest.json').deletionsLost).toBe(true)

    // A --full run limited to some feeds keeps the flag.
    replies()
    await runCmd(Cmd, ['--dir', dir, '--feed', 'CRM/Accounts', '--full'])
    expect(json('manifest.json').deletionsLost).toBe(true)
  })

  it('a --full run with a failed feed keeps the lost-deletions flag', async () => {
    mockApi()
      .get(`${SYNC}/CRM/Accounts`)
      .query(true)
      .reply(500, { error: { message: { value: 'Server error' } } })
    mockApi()
      .get(/\/api\/v1\/123\/sync\/.*/)
      .query(true)
      .times(60)
      .reply(200, page([]))
    feedStore(dir, 'CRM/Accounts').write([])
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        division: 123,
        feeds: {},
        deleted: {},
        deletionsLost: true,
      }),
    )
    quietStderr()

    process.stdout.isTTY = true
    const err = await Cmd.run(['--dir', dir, '--full', '--no-retry']).catch(
      (e) => e,
    )

    expect(exit(err)).toBe(65)
    expect(json('manifest.json').deletionsLost).toBe(true)
  })

  it('a --full run over every feed clears the lost-deletions flag', async () => {
    mockApi()
      .get(/\/api\/v1\/123\/sync\/.*/)
      .query(true)
      .times(61)
      .reply(200, page([]))
    feedStore(dir, 'CRM/Accounts').write([])
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        division: 123,
        feeds: {},
        deleted: {},
        deletionsLost: true,
      }),
    )
    quietStderr()

    await runCmd(Cmd, ['--dir', dir, '--full'])

    expect(json('manifest.json').deletionsLost).toBeUndefined()
  })

  it('fails with 64 without --dir', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run([]).catch((e) => e)
    expect(exit(err)).toBe(64)
  })
})
