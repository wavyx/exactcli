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
import {
  BULK_PAGE_SIZE,
  collectListing,
  countFlags,
  countListing,
  divisionsFlags,
  eachDivision,
  listingFlags,
} from '../lib/listing.js'
import { expandedSelect } from '../lib/typed/factory.js'

export default class ListCommand extends BaseCommand {
  static description = 'List the records of any Exact Online resource'

  static examples = [
    '<%= config.bin %> list crm/Accounts',
    '<%= config.bin %> list crm/Accounts --filter "Status eq \'C\'" --top 20',
    '<%= config.bin %> list financial/GLAccounts --all --output json',
    '<%= config.bin %> list logistics/Items --select Code,Description --limit 200',
    '<%= config.bin %> list crm/Accounts --bulk --all --output csv',
    '<%= config.bin %> list crm/Accounts --filter "Status eq \'C\'" --count',
  ]

  static args = {
    resource: Args.string({
      required: true,
      description: 'Resource path, for example crm/Accounts',
    }),
  }

  static flags = {
    ...listingFlags,
    ...countFlags,
    ...divisionsFlags,
    beta: Flags.boolean({ description: 'Use the beta API namespace' }),
    bulk: Flags.boolean({
      description:
        'Read the bulk variant: 1000 rows per page, $select required',
    }),
  }

  async run() {
    const { args } = await this.parse(ListCommand)
    const all = this.flags['all-divisions']
    // Check the request once, before the first call of any division.
    const { resource } = this.#target(args)
    warnUnknown(args.resource, resource)
    if (this.flags.bulk && !this.flags.count) {
      this.bulkPath(this.resolveDivision(), args.resource, resource)
      // The bulk endpoints demand a $select; --raw has no columns to offer.
      if (this.flags.raw && !this.flags.select) {
        throw new CliError('--bulk needs --select', { exitCode: 64 })
      }
    }
    if (this.flags.count) {
      // The bulk variant holds the same records, so a count never needs it.
      const result = await eachDivision(this, () => {
        const { path } = this.#target(args)
        return countListing(this, path, buildQuery(this.flags))
      })
      if (all) await this.outputResults(result, autoColumns(result))
      else await this.outputAction(result, String(result.count))
      return
    }

    let columns
    const data = await eachDivision(this, async () => {
      const read = await this.#collect(args)
      columns = read.columns
      return read.data
    })
    await this.outputResults(
      data,
      columns && all
        ? { Division: { header: 'Division' }, ...columns }
        : (columns ?? autoColumns(data)),
    )
  }

  /**
   * The path and the catalogue record of the resource in the active division.
   * @param {{ resource: string }} args
   */
  #target(args) {
    const { path, resource } = resolvePath(
      this.resolveDivision(),
      args.resource,
      { beta: this.flags.beta },
    )
    return { path, resource }
  }

  /**
   * Read one division: the regular or the bulk variant.
   * @param {{ resource: string }} args
   * @returns {Promise<{ data: object[], columns?: Record<string, object> }>}
   */
  async #collect(args) {
    const division = this.resolveDivision()
    const { path, resource } = this.#target(args)

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
      // columns stand in; run() already refused --raw without --select.
      if (!query.$select) query.$select = expandedSelect(defaults, expand)
      const data = await collectListing(this, bulkPath, query, {
        pageSize: BULK_PAGE_SIZE,
        noTop: true,
      })
      return { data, columns }
    }

    return { data: await collectListing(this, path, query), columns }
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
