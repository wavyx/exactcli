import { Flags } from '@oclif/core'
import { buildQuery, normalize, odataFlags } from './odata.js'
import { collectPages } from './pagination.js'

/** Exact Online caps a CRUD page at 60 records. */
export const DEFAULT_PAGE_SIZE = 60

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

/**
 * How many pages to walk. --all follows every page up to --max-pages. A
 * --limit needs as many pages as the page size requires. Without either, one
 * page is the whole answer.
 * @param {object} options
 * @param {boolean} [options.all]
 * @param {number} [options.limit]
 * @param {number} [options.top]
 * @param {number} options.maxPages
 * @returns {number}
 */
export function pageBudget({ all, limit, top, maxPages }) {
  if (all) return maxPages
  if (limit === undefined) return 1
  return Math.min(maxPages, Math.ceil(limit / (top ?? DEFAULT_PAGE_SIZE)))
}

/**
 * Walk a paged OData resource for a command: page budget, item budget, the
 * stderr note when more pages remain, and row normalisation.
 * @param {{ apiClient: object, flags: object }} cmd
 * @param {string} path division-qualified API path
 * @param {object} [query] OData query; defaults to buildQuery(cmd.flags)
 * @returns {Promise<object[]>}
 */
export async function collectListing(cmd, path, query = buildQuery(cmd.flags)) {
  const { all, limit, raw, top } = cmd.flags
  const maxPages = pageBudget({
    all,
    limit,
    top,
    maxPages: cmd.flags['max-pages'] ?? 100,
  })

  const rows = await collectPages(
    cmd.apiClient.pageOData(path, query, { maxPages }),
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
