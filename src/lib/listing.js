import { Flags } from '@oclif/core'
import { ApiError, CliError, RefNotFoundError } from './errors.js'
import { buildQuery, divisionPath, normalize, odataFlags } from './odata.js'
import { collectPages } from './pagination.js'

/** Exact Online caps a CRUD page at 60 records. */
export const DEFAULT_PAGE_SIZE = 60
/** The bulk and sync endpoints page at 1000 and ignore $top. */
export const BULK_PAGE_SIZE = 1000

/** Flags shared by every paged list command. */
export const listingFlags = {
  ...odataFlags,
  all: Flags.boolean({
    description: 'Follow every page, up to --max-pages',
  }),
  'max-pages': Flags.integer({
    description: 'Maximum number of pages to read',
    default: 100,
    min: 1,
  }),
  raw: Flags.boolean({ description: 'Print the raw API envelope' }),
}

/** The flag of a list command that counts its records instead of reading them. */
export const countFlags = {
  count: Flags.boolean({
    description:
      'Print the number of matching records ($count), not the records',
  }),
}

/** The flag of a list command that reads every accessible division. */
export const divisionsFlags = {
  'all-divisions': Flags.boolean({
    description:
      'Read every division the user can access, one after the other; every ' +
      'row carries its Division (replaces --division). --limit and --all ' +
      'apply per division',
    default: false,
  }),
}

/**
 * Run a read for the active division, or with --all-divisions once per
 * division the user can access (hrm/Divisions of the active one), one after
 * the other. The run sets the division flag, so every lookup inside it, for
 * example a code resolved to a GUID, happens in the division it reads.
 * `--limit` and `--all` apply per division.
 * @param {{ flags: object, apiClient: object, resolveDivision: () => number }} cmd
 * @param {() => Promise<object | object[]>} run
 * @returns {Promise<object | object[]>} the result of one run, or the rows
 *   of every run, each tagged with its Division
 */
export async function eachDivision(cmd, run) {
  if (!cmd.flags['all-divisions']) return run()
  const divisions = await collectPages(
    cmd.apiClient.pageOData(
      divisionPath(cmd.resolveDivision(), 'hrm/Divisions'),
      { $select: 'Code', $orderby: 'Code' },
    ),
  )
  const rows = []
  for (const { Code: code } of divisions) {
    cmd.flags.division = String(code)
    let result
    try {
      result = await run()
    } catch (err) {
      // A division without the code, or without the module (403), holds no
      // matching record: skip it and say so. Any other failure stops the run.
      const missing =
        err instanceof RefNotFoundError ||
        (err instanceof ApiError && err.statusCode === 403)
      if (!missing) throw err
      process.stderr.write(`Division ${code} skipped: ${err.message}\n`)
      continue
    }
    for (const row of [result].flat()) rows.push({ Division: code, ...row })
  }
  return rows
}

/**
 * Count the records of a listing in one request: OData `$count` with the same
 * $filter. Projection, order and paging do not change a count.
 * @param {{ apiClient: object }} cmd
 * @param {string} path division-qualified API path
 * @param {object} query the OData query of the listing
 * @returns {Promise<{ count: number }>}
 */
export async function countListing(cmd, path, query) {
  const answer = await cmd.apiClient.get(`${path}/$count`, {
    query: { $filter: query.$filter },
  })
  const text = String(answer ?? '').trim()
  if (!/^\d+$/.test(text)) {
    throw new CliError(`Unexpected $count answer from ${path}`, {
      exitCode: 65,
    })
  }
  return { count: Number(text) }
}

/**
 * How many pages to walk. --all follows every page up to --max-pages. A
 * --limit needs as many pages as the page size requires. Without either, one
 * page is the whole answer.
 * @param {object} options
 * @param {boolean} [options.all]
 * @param {number} [options.limit]
 * @param {number} [options.top]
 * @param {number} options.maxPages
 * @param {number} [options.pageSize]
 * @returns {number}
 */
export function pageBudget({
  all,
  limit,
  top,
  maxPages,
  pageSize = DEFAULT_PAGE_SIZE,
}) {
  if (all) return maxPages
  if (limit === undefined) return 1
  return Math.min(maxPages, Math.ceil(limit / (top ?? pageSize)))
}

/**
 * Walk a paged OData resource for a command: page budget, item budget, the
 * stderr note when more pages remain, and row normalisation.
 * @param {{ apiClient: object, flags: object }} cmd
 * @param {string} path division-qualified API path
 * @param {object} [query] OData query; defaults to buildQuery(cmd.flags)
 * @param {{pageSize?: number, noTop?: boolean}} [options] noTop drops $top:
 *   the bulk and sync endpoints ignore it and page at pageSize
 * @returns {Promise<object[]>}
 */
export async function collectListing(
  cmd,
  path,
  query = buildQuery(cmd.flags),
  { pageSize = DEFAULT_PAGE_SIZE, noTop = false } = {},
) {
  const { all, limit, raw } = cmd.flags
  const top = noTop ? undefined : cmd.flags.top
  const sent = { ...query }
  if (noTop) delete sent.$top
  const maxPages = pageBudget({
    all,
    limit,
    top,
    maxPages: cmd.flags['max-pages'] ?? 100,
    pageSize,
  })

  const rows = await collectPages(
    cmd.apiClient.pageOData(path, sent, { maxPages }),
    all ? Infinity : (limit ?? Infinity),
  )

  // A `__next` that survives the walk means the server has more to give.
  // It goes to stderr, so a piped stdout stays parseable. With --all the page
  // budget is what stopped the walk, so name that flag and not --all again.
  if (cmd.apiClient.lastNext) {
    process.stderr.write(
      all
        ? 'More results available. Raise --max-pages.\n'
        : 'More results available. Use --all or --limit.\n',
    )
  }

  return raw ? rows : rows.map(normalize)
}

/**
 * The columns a table or a CSV must show. With --select the server answers
 * only the requested properties, so a fixed column set would print a row of
 * empty cells. Keep the columns the rows actually carry.
 * @param {Record<string, object>} columns the full column set of the command
 * @param {object[]} rows the returned rows
 * @param {string} [select] the --select flag, when the user gave one
 * @returns {Record<string, object>}
 */
export function visibleColumns(columns, rows, select) {
  if (!select) return columns
  const present = new Set(Object.keys(rows[0] ?? {}))
  return Object.fromEntries(
    Object.entries(columns).filter(([key]) => present.has(key)),
  )
}
