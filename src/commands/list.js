import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { autoColumns, buildQuery } from '../lib/odata.js'
import { defaultColumns, resolvePath, warnUnknown } from '../lib/catalog.js'
import { collectListing, listingFlags } from '../lib/listing.js'

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
    ...listingFlags,
    beta: Flags.boolean({ description: 'Use the beta API namespace' }),
  }

  async run() {
    const { args } = await this.parse(ListCommand)
    const { path, resource } = resolvePath(
      this.resolveDivision(),
      args.resource,
      { beta: this.flags.beta },
    )
    warnUnknown(args.resource, resource)

    // A known resource without an explicit projection gets the catalogue
    // columns as $select: lighter answers and a readable table. --raw keeps
    // the envelope, --fields and --select already say what to fetch.
    const { select, fields, raw } = this.flags
    const query = buildQuery(this.flags)
    let columns
    const defaults = resource ? defaultColumns(resource) : []
    if (defaults.length > 0 && !select && !fields && !raw) {
      query.$select = defaults.join(',')
      columns = Object.fromEntries(defaults.map((c) => [c, { header: c }]))
    }

    const data = await collectListing(this, path, query)
    await this.outputResults(data, columns ?? autoColumns(data))
  }
}
