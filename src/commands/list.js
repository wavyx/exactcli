import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { autoColumns, divisionPath } from '../lib/odata.js'
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
    const path = divisionPath(this.resolveDivision(), args.resource, {
      beta: this.flags.beta,
    })
    const data = await collectListing(this, path)
    await this.outputResults(data, autoColumns(data))
  }
}
