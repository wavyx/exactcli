import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import {
  autoColumns,
  buildQuery,
  divisionPath,
  normalize,
  odataFlags,
} from '../lib/odata.js'
import { collectPages } from '../lib/pagination.js'

/** Exact Online caps a CRUD page at 60 records. */
const DEFAULT_PAGE_SIZE = 60

/**
 * How many pages to walk. --all follows every page up to --max-pages. A
 * --limit needs as many pages as the page size requires. Without either, one
 * page is the whole answer.
 * @param {object} options
 * @param {boolean} options.all
 * @param {number} [options.limit]
 * @param {number} [options.top]
 * @param {number} options.maxPages
 * @returns {number}
 */
function pageBudget({ all, limit, top, maxPages }) {
  if (all) return maxPages
  if (limit === undefined) return 1
  return Math.min(maxPages, Math.ceil(limit / (top ?? DEFAULT_PAGE_SIZE)))
}

export default class ListCommand extends BaseCommand {
  static description = 'List the records of any Exact Online resource'

  static examples = [
    '<%= config.bin %> list crm/Accounts',
    '<%= config.bin %> list crm/Accounts --filter "Status eq \'C\'" --top 20',
    '<%= config.bin %> list financial/GLAccounts --all --output json',
    '<%= config.bin %> list logistics/Items --select Code,Description --limit 200',
  ]

  static args = {
    resource: Args.string({
      required: true,
      description: 'Resource path, for example crm/Accounts',
    }),
  }

  static flags = {
    ...odataFlags,
    all: Flags.boolean({
      description: 'Follow every page, up to --max-pages',
    }),
    'max-pages': Flags.integer({
      description: 'Maximum number of pages to read',
      default: 100,
      min: 1,
    }),
    beta: Flags.boolean({ description: 'Use the beta API namespace' }),
    raw: Flags.boolean({ description: 'Print the raw API envelope' }),
  }

  async run() {
    const { args } = await this.parse(ListCommand)
    const { all, beta, limit, raw, top } = this.flags

    const path = divisionPath(this.resolveDivision(), args.resource, { beta })
    const maxPages = pageBudget({
      all,
      limit,
      top,
      maxPages: this.flags['max-pages'],
    })

    const rows = await collectPages(
      this.apiClient.pageOData(path, buildQuery(this.flags), { maxPages }),
      all ? Infinity : (limit ?? Infinity),
    )

    // A `__next` that survives the walk means the server has more to give.
    // It goes to stderr, so a piped stdout stays parseable.
    if (this.apiClient.lastNext) {
      process.stderr.write('More results available. Use --all or --limit.\n')
    }

    const data = raw ? rows : rows.map(normalize)
    await this.outputResults(data, autoColumns(data))
  }
}
