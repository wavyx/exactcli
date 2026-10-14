import { Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
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
} from '../lib/backup.js'
import { findResource, propertyNames } from '../lib/catalog.js'
import { CliError } from '../lib/errors.js'
import { listingFlags } from '../lib/listing.js'
import { divisionPath } from '../lib/odata.js'
import { syncSince } from '../lib/sync-state.js'

const COLUMNS = {
  feed: { header: 'Feed' },
  status: { header: 'Status' },
  fetched: { header: 'Fetched' },
  total: { header: 'Total' },
  removed: { header: 'Removed' },
}

/**
 * An error that ends the whole run: the next feeds would fail the same way.
 * A 403 is not one: it names a feed of a module the division lacks.
 * @param {Error & { statusCode?: number, exitCode?: number }} err
 */
const stopsRun = (err) =>
  err.statusCode === 401 ||
  err.exitCode === 75 ||
  (err.exitCode === 77 && err.statusCode !== 403)

export default class BackupCommand extends BaseCommand {
  static description =
    'Copy a division to a directory of JSON files, one per sync feed, then ' +
    'refresh it with the changes and deletions since the last run ' +
    '(GET sync/..., GET sync/Deleted)'

  static examples = [
    '<%= config.bin %> backup --dir ./backup-acme',
    '<%= config.bin %> backup --dir ./backup-acme --feed Financial/TransactionLines --feed CRM/Accounts',
    '<%= config.bin %> backup --list',
  ]

  static flags = {
    dir: Flags.string({
      description: 'Backup directory (created when missing), one per division',
      exclusive: ['list'],
    }),
    feed: Flags.string({
      multiple: true,
      description:
        'Sync feed to copy, for example Financial/TransactionLines ' +
        '(repeatable; default: every feed)',
    }),
    full: Flags.boolean({
      default: false,
      description:
        'Read every record again, not only the changes since the last run',
    }),
    'max-pages': listingFlags['max-pages'],
    list: Flags.boolean({
      default: false,
      description: 'Print the names of the sync feeds and stop',
    }),
  }

  async run() {
    const all = backupFeeds()
    if (this.flags.list) {
      await this.outputResults(
        all.map((f) => ({ feed: f.name })),
        { feed: COLUMNS.feed },
      )
      return
    }
    const { dir } = this.flags
    if (!dir) {
      throw new CliError('Give --dir, or --list', { exitCode: 64 })
    }
    const feeds = pickFeeds(this.flags.feed, all)
    const division = this.resolveDivision()
    const manifest = readManifest(dir, division)
    // Deletions older than the log are lost for good: the flag stays in the
    // manifest until a --full run over every feed reads everything again.
    if (deletedLogExpired(manifest, Date.now())) manifest.deletionsLost = true
    if (manifest.deletionsLost) {
      process.stderr.write(
        'Warning: a pause longer than the 2 months Exact keeps deletions for ' +
          'left deleted records in this backup. Run backup --full (every ' +
          'feed) to drop them.\n',
      )
    }

    const report = []
    try {
      for (const feed of feeds) {
        report.push(await this.#copyFeed(dir, division, manifest, feed))
        writeManifest(dir, manifest)
      }
      // The deleted log covers every feed, also those not read this run.
      const deleted = await this.#applyDeleted(dir, division, manifest, all)
      report.push({
        feed: 'Deleted',
        status: deleted.complete ? 'ok' : 'partial',
        fetched: deleted.fetched,
        removed: deleted.removed,
      })
      // Only a --full run over every feed that read each one to the end
      // drops the records the lost deletions left behind.
      const clean = report.every((r) => ['ok', 'forbidden'].includes(r.status))
      if (this.flags.full && !this.flags.feed?.length && clean) {
        delete manifest.deletionsLost
      }
    } finally {
      manifest.lastRun = new Date().toISOString()
      writeManifest(dir, manifest)
    }

    await this.outputResults(report, COLUMNS)
    if (report.some((r) => r.status === 'partial')) {
      process.stderr.write(
        'Some feeds have more pages: run backup again to go on, or raise ' +
          '--max-pages.\n',
      )
    }
    const failed = report.filter((r) => r.status === 'failed')
    if (failed.length) {
      throw new CliError(
        `${failed.length} feeds failed (${failed.map((r) => r.feed).join(', ')}); ` +
          'run backup again to retry them',
        { exitCode: 65 },
      )
    }
  }

  /**
   * Read the changes of one feed and merge them into its file. A feed pages
   * in rising timestamp order [live 2026-10-14], so the highest timestamp
   * read is where the next run goes on, also after a cut by the page budget.
   */
  async #copyFeed(dir, division, manifest, { name, resource }) {
    const state = manifest.feeds[name] ?? {}
    const since = this.flags.full ? 0 : Number(state.timestamp ?? 0)
    let result
    try {
      result = await syncSince(this, {
        path: divisionPath(division, `sync/${name}`),
        since,
        select: propertyNames(resource).join(','),
      })
    } catch (err) {
      if (stopsRun(err)) throw err
      const status = err.statusCode === 403 ? 'forbidden' : 'failed'
      manifest.feeds[name] = { ...state, status, error: err.message }
      return { feed: name, status, fetched: 0 }
    }
    const store = feedStore(dir, name)
    const stored = this.flags.full ? [] : store.read()
    const rows = mergeRows(stored, result.rows, identityOf(resource))
    store.write(rows)
    const status = result.complete ? 'ok' : 'partial'
    manifest.feeds[name] = {
      status,
      timestamp: result.max,
      count: rows.length,
      updated: new Date().toISOString(),
    }
    return {
      feed: name,
      status,
      fetched: result.rows.length,
      total: rows.length,
    }
  }

  /** Read the deleted log since the last run and drop those records. */
  async #applyDeleted(dir, division, manifest, feeds) {
    const since = this.flags.full ? 0 : Number(manifest.deleted.timestamp ?? 0)
    const result = await syncSince(this, {
      path: divisionPath(division, 'sync/Deleted'),
      since,
      select: propertyNames(findResource('sync/Deleted')).join(','),
    })
    const keys = new Set(result.rows.map((row) => row.EntityKey))
    const removed = applyDeletions(dir, feeds, keys)
    manifest.deleted = {
      timestamp: result.max,
      updated: new Date().toISOString(),
    }
    return {
      fetched: result.rows.length,
      removed,
      complete: result.complete,
    }
  }
}
