import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { loadCatalog, propertyNames, shortName } from './catalog.js'
import { CliError } from './errors.js'

export const MANIFEST = 'manifest.json'
/** Exact keeps the log of deleted records for two months. */
export const DELETED_LOG_DAYS = 60
const DAY_MS = 86_400_000

/**
 * The sync feeds a backup reads: every sync resource of the catalogue but
 * the deleted log, named without the `sync/` prefix.
 * @param {object} [catalog]
 * @returns {{ name: string, resource: object }[]}
 */
export function backupFeeds(catalog = loadCatalog()) {
  return catalog.resources
    .filter((r) => r.family === 'sync' && shortName(r) !== 'sync/Deleted')
    .map((r) => ({ name: shortName(r).replace(/^sync\//, ''), resource: r }))
}

/**
 * The feeds the user asked for, by name with or without `sync/`, in any
 * case; every feed without a choice.
 * @param {string[] | undefined} wanted
 * @param {{ name: string }[]} feeds
 * @returns {{ name: string, resource: object }[]}
 */
export function pickFeeds(wanted, feeds) {
  if (!wanted?.length) return feeds
  return wanted.map((ref) => {
    const name = ref.replace(/^sync\//i, '').toLowerCase()
    const feed = feeds.find((f) => f.name.toLowerCase() === name)
    if (!feed) {
      throw new CliError(
        `${ref} is not a sync feed (backup --list names them)`,
        { exitCode: 64 },
      )
    }
    return feed
  })
}

/**
 * The field that names a record of a feed for good: ID, else EntryID. A feed
 * with neither (one manufacturing feed) appends what it reads.
 * @param {object} resource
 * @returns {string | null}
 */
export function identityOf(resource) {
  const names = new Set(propertyNames(resource))
  if (names.has('ID')) return 'ID'
  return names.has('EntryID') ? 'EntryID' : null
}

/** Write JSON through a temporary file: a crash leaves the old file. */
function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(tmp, file)
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (cause) {
    throw new CliError(`${file} is not valid JSON`, { exitCode: 65, cause })
  }
}

/**
 * The manifest of a backup directory. A directory of another division is
 * refused: its timestamps mean nothing here.
 * @param {string} dir
 * @param {number} division
 * @returns {object}
 */
export function readManifest(dir, division) {
  const manifest = readJson(join(dir, MANIFEST), null) ?? {
    version: 1,
    division,
    feeds: {},
    deleted: {},
  }
  if (manifest.division !== division) {
    throw new CliError(
      `${dir} holds a backup of division ${manifest.division}, not ${division}`,
      { exitCode: 64 },
    )
  }
  return manifest
}

/** @param {string} dir @param {object} manifest */
export const writeManifest = (dir, manifest) =>
  writeJson(join(dir, MANIFEST), manifest)

/** @param {string} dir @param {string} name */
export const feedFile = (dir, name) => join(dir, `${name}.json`)

/**
 * Merge the changed rows into the stored ones: a row replaces the stored row
 * with the same identity, a new one is added.
 * @param {object[]} stored
 * @param {object[]} rows
 * @param {string | null} identity
 * @returns {object[]}
 */
export function mergeRows(stored, rows, identity) {
  if (!identity) return [...stored, ...rows]
  const byKey = new Map(stored.map((row) => [row[identity], row]))
  for (const row of rows) byKey.set(row[identity], row)
  return [...byKey.values()]
}

/**
 * Read and write one feed file.
 * @param {string} dir
 * @param {string} name
 */
export const feedStore = (dir, name) => ({
  read: () => readJson(feedFile(dir, name), []),
  write: (rows) => writeJson(feedFile(dir, name), rows),
})

/**
 * Remove the deleted records from every stored feed.
 * @param {string} dir
 * @param {{ name: string, resource: object }[]} feeds every feed of the catalogue
 * @param {Set<string>} keys EntityKey values of sync/Deleted
 * @returns {number} the number of rows removed
 */
export function applyDeletions(dir, feeds, keys) {
  if (keys.size === 0) return 0
  let removed = 0
  for (const { name, resource } of feeds) {
    const identity = identityOf(resource)
    if (!identity || !existsSync(feedFile(dir, name))) continue
    const store = feedStore(dir, name)
    const rows = store.read()
    const kept = rows.filter((row) => !keys.has(row[identity]))
    if (kept.length !== rows.length) {
      removed += rows.length - kept.length
      store.write(kept)
    }
  }
  return removed
}

/**
 * True when the last deleted-log read is older than the log itself: the
 * deletions in between are lost, so only a full run is exact again.
 * @param {object} manifest
 * @param {number} now
 * @returns {boolean}
 */
export function deletedLogExpired(manifest, now) {
  const last = manifest.deleted?.updated
  return Boolean(last) && now - Date.parse(last) > DELETED_LOG_DAYS * DAY_MS
}
