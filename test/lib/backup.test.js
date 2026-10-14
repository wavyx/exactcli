import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findResource } from '../../src/lib/catalog.js'
import {
  applyDeletions,
  backupFeeds,
  deletedLogExpired,
  feedStore,
  identityOf,
  mergeRows,
  pickFeeds,
  readManifest,
  writeManifest,
} from '../../src/lib/backup.js'

const DIR = mkdtempSync(join(tmpdir(), 'exactcli-backup-lib-'))
afterAll(() => rmSync(DIR, { recursive: true, force: true }))

const exit = (fn) => {
  try {
    fn()
  } catch (err) {
    return err.exitCode
  }
  return undefined
}

describe('backupFeeds and pickFeeds', () => {
  const feeds = backupFeeds()

  it('lists every sync feed but the deleted log, without the sync/ prefix', () => {
    const names = feeds.map((f) => f.name)
    expect(names).toContain('Financial/TransactionLines')
    expect(names).toContain('CRM/Accounts')
    expect(names).not.toContain('Deleted')
    expect(names.every((n) => !n.startsWith('sync/'))).toBe(true)
  })

  it('picks feeds by name, with or without sync/, in any case', () => {
    expect(pickFeeds(undefined, feeds)).toBe(feeds)
    expect(
      pickFeeds(['sync/crm/accounts', 'Financial/GLAccounts'], feeds).map(
        (f) => f.name,
      ),
    ).toEqual(['CRM/Accounts', 'Financial/GLAccounts'])
    expect(exit(() => pickFeeds(['crm/Accounts2'], feeds))).toBe(64)
  })
})

describe('identityOf and mergeRows', () => {
  it('takes ID, else EntryID, else nothing', () => {
    expect(identityOf(findResource('sync/CRM/Accounts'))).toBe('ID')
    expect(identityOf(findResource('sync/Subscription/Subscriptions'))).toBe(
      'EntryID',
    )
    expect(identityOf(findResource('sync/Manufacturing/MaterialIssues'))).toBe(
      null,
    )
  })

  it('replaces a changed row, adds a new one, appends without identity', () => {
    const stored = [
      { ID: 'a', v: 1 },
      { ID: 'b', v: 1 },
    ]
    expect(
      mergeRows(
        stored,
        [
          { ID: 'b', v: 2 },
          { ID: 'c', v: 1 },
        ],
        'ID',
      ),
    ).toEqual([
      { ID: 'a', v: 1 },
      { ID: 'b', v: 2 },
      { ID: 'c', v: 1 },
    ])
    expect(mergeRows([{ v: 1 }], [{ v: 2 }], null)).toEqual([
      { v: 1 },
      { v: 2 },
    ])
  })
})

describe('manifest', () => {
  it('starts empty, round-trips, and refuses a directory of another division', () => {
    const dir = join(DIR, 'manifest')
    const fresh = readManifest(dir, 123)
    expect(fresh).toEqual({ version: 1, division: 123, feeds: {}, deleted: {} })
    writeManifest(dir, { ...fresh, lastRun: 'x' })
    expect(readManifest(dir, 123).lastRun).toBe('x')
    expect(exit(() => readManifest(dir, 456))).toBe(64)
  })

  it('fails with 65 on a broken file', () => {
    const dir = join(DIR, 'broken')
    feedStore(dir, 'CRM/Accounts').write([])
    writeFileSync(join(dir, 'manifest.json'), '{')
    expect(exit(() => readManifest(dir, 123))).toBe(65)
  })

  it('says when the deleted log has expired since the last read', () => {
    const now = Date.parse('2026-10-14T00:00:00Z')
    expect(deletedLogExpired({ deleted: {} }, now)).toBe(false)
    expect(
      deletedLogExpired({ deleted: { updated: '2026-09-01T00:00:00Z' } }, now),
    ).toBe(false)
    expect(
      deletedLogExpired({ deleted: { updated: '2026-08-01T00:00:00Z' } }, now),
    ).toBe(true)
  })
})

describe('applyDeletions', () => {
  it('drops the lines of a deleted entry as the live log names them', () => {
    // Shape of the live log: the header key (EntityType 62, the EntryID) and
    // one key per line (EntityType 63, the line ID).
    const dir = join(DIR, 'entry-delete')
    const feeds = backupFeeds().filter(
      (f) => f.name === 'Financial/SalesEntries',
    )
    feedStore(dir, 'Financial/SalesEntries').write([
      { ID: 'line-1', EntryID: 'entry-a' },
      { ID: 'line-2', EntryID: 'entry-a' },
      { ID: 'line-3', EntryID: 'entry-b' },
    ])

    const removed = applyDeletions(
      dir,
      feeds,
      new Set(['entry-a', 'line-1', 'line-2']),
    )

    expect(removed).toBe(2)
    expect(feedStore(dir, 'Financial/SalesEntries').read()).toEqual([
      { ID: 'line-3', EntryID: 'entry-b' },
    ])
  })

  it('removes the deleted keys from the stored feeds that have an identity', () => {
    const dir = join(DIR, 'deletions')
    const feeds = backupFeeds().filter((f) =>
      [
        'CRM/Accounts',
        'Subscription/Subscriptions',
        'Financial/GLAccounts',
      ].includes(f.name),
    )
    feedStore(dir, 'CRM/Accounts').write([{ ID: 'a' }, { ID: 'b' }])
    feedStore(dir, 'Subscription/Subscriptions').write([{ EntryID: 'c' }])

    feedStore(dir, 'Financial/GLAccounts').write([{ ID: 'g' }])
    expect(applyDeletions(dir, feeds, new Set())).toBe(0)
    expect(applyDeletions(dir, feeds, new Set(['b', 'c', 'z']))).toBe(2)
    expect(feedStore(dir, 'CRM/Accounts').read()).toEqual([{ ID: 'a' }])
    expect(feedStore(dir, 'Subscription/Subscriptions').read()).toEqual([])
    expect(feedStore(dir, 'Financial/GLAccounts').read()).toEqual([{ ID: 'g' }])
    // A feed without identity is left alone.
    const issues = backupFeeds().filter(
      (f) => f.name === 'Manufacturing/MaterialIssues',
    )
    feedStore(dir, 'Manufacturing/MaterialIssues').write([{ v: 1 }])
    expect(applyDeletions(dir, issues, new Set(['a']))).toBe(0)
  })
})
