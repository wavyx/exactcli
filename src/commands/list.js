import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { CliError } from '../lib/errors.js'
import { autoColumns, buildQuery, divisionPath } from '../lib/odata.js'
import {
  defaultColumns,
  familiesOf,
  resolvePath,
  shortName,
  variantOf,
  warnUnknown,
} from '../lib/catalog.js'
import { BULK_PAGE_SIZE, collectListing, listingFlags } from '../lib/listing.js'
import { expandedSelect } from '../lib/typed/factory.js'

export default class ListCommand extends BaseCommand {
  static description = 'List the records of any Exact Online resource'

  static examples = [
    '<%= config.bin %> list crm/Accounts',
    '<%= config.bin %> list crm/Accounts --filter "Status eq \'C\'" --top 20',
    '<%= config.bin %> list financial/GLAccounts --all --output json',
    '<%= config.bin %> list logistics/Items --select Code,Description --limit 200',
    '<%= config.bin %> list crm/Accounts --bulk --all --output csv',
  ]

  static args = {
    resource: Args.string({
      required: true,
      description: 'Resource path, for example crm/Accounts',
    }),
  }

  static flags = {
    ...listingFlags,
    beta: Flags.boolean({ description: 'Use the beta API namespace' }),
    bulk: Flags.boolean({
      description:
        'Read the bulk variant: 1000 rows per page, $select required',
    }),
  }

  async run() {
    const { args } = await this.parse(ListCommand)
    const division = this.resolveDivision()
    const { path, resource } = resolvePath(division, args.resource, {
      beta: this.flags.beta,
    })
    warnUnknown(args.resource, resource)

    // A known resource without an explicit projection gets the catalogue
    // columns as $select: lighter answers and a readable table. --raw keeps
    // the envelope, --fields and --select already say what to fetch.
    const { select, fields, raw, bulk, expand } = this.flags
    const query = buildQuery(this.flags)
    let columns
    const defaults = resource ? defaultColumns(resource) : []
    if (defaults.length > 0 && !select && !fields && !raw) {
      query.$select = expandedSelect(defaults, expand)
      columns = Object.fromEntries(defaults.map((c) => [c, { header: c }]))
    }

    if (bulk) {
      const bulkPath = this.bulkPath(division, args.resource, resource)
      // The bulk endpoints demand a $select. Without one, the catalogue
      // columns stand in; --raw has no columns to offer.
      if (!query.$select) {
        if (raw) throw new CliError('--bulk needs --select', { exitCode: 64 })
        query.$select = expandedSelect(defaults, expand)
      }
      const data = await collectListing(this, bulkPath, query, {
        pageSize: BULK_PAGE_SIZE,
        noTop: true,
      })
      await this.outputResults(data, columns ?? autoColumns(data))
      return
    }

    const data = await collectListing(this, path, query)
    await this.outputResults(data, columns ?? autoColumns(data))
  }

  /**
   * The request path of the bulk variant, or a usage error that names the
   * families the resource has.
   * @param {number} division
   * @param {string} ref
   * @param {object | undefined} resource
   * @returns {string}
   */
  bulkPath(division, ref, resource) {
    if (!resource) {
      throw new CliError(
        `${ref} is not in the catalogue: --bulk needs a known resource`,
        {
          exitCode: 64,
        },
      )
    }
    const variant = variantOf(resource, 'bulk')
    if (!variant) {
      throw new CliError(
        `${ref} has no bulk variant (families: ${familiesOf(resource).join(', ')})`,
        { exitCode: 64 },
      )
    }
    return divisionPath(division, shortName(variant))
  }
}
