import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import {
  defaultColumns,
  familiesOf,
  findResource,
  shortName,
  variantOf,
} from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { listingFlags } from '../../lib/listing.js'
import { autoColumns, divisionPath } from '../../lib/odata.js'
import {
  finishSync,
  readState,
  resolveSince,
  syncSince,
} from '../../lib/sync-state.js'

/** Flags shared by sync and deleted. */
export const syncFlags = {
  since: Flags.string({
    description:
      'Timestamp to start after (from the last run). Default: the state file, else 0',
  }),
  state: Flags.string({
    description:
      'JSON file that remembers the last timestamp per resource; read when --since is absent, written after a complete run',
  }),
  'max-pages': listingFlags['max-pages'],
  raw: listingFlags.raw,
}

export default class SyncCommand extends BaseCommand {
  static description =
    'Read the records changed since a timestamp (the sync API, 1000 per page)'

  static examples = [
    '<%= config.bin %> sync crm/Accounts --since 0',
    '<%= config.bin %> sync crm/Accounts --state ./sync.json',
    '<%= config.bin %> sync financialtransaction/TransactionLines --state ./sync.json --output csv',
  ]

  static args = {
    resource: Args.string({
      required: true,
      description: 'Resource path, for example crm/Accounts',
    }),
  }

  static flags = { ...syncFlags, select: listingFlags.select }

  async run() {
    const { args } = await this.parse(SyncCommand)
    const resource = findResource(args.resource)
    if (!resource) {
      throw new CliError(
        `${args.resource} is not in the catalogue: sync needs a known resource`,
        { exitCode: 64 },
      )
    }
    const variant = variantOf(resource, 'sync')
    if (!variant) {
      throw new CliError(
        `${args.resource} has no sync variant (families: ${familiesOf(resource).join(', ')})`,
        { exitCode: 64 },
      )
    }
    const key = shortName(variant)
    const path = divisionPath(this.resolveDivision(), key)
    const stateFile = this.flags.state
    const state = stateFile ? readState(stateFile) : {}
    const since = resolveSince(this.flags, state, key)

    const result = await syncSince(this, {
      path,
      since,
      select: this.flags.select,
    })
    const defaults = defaultColumns(variant)
    const columns = this.flags.select
      ? autoColumns(result.rows)
      : Object.fromEntries(defaults.map((c) => [c, { header: c }]))
    await this.outputResults(result.rows, columns)
    finishSync(result, { since, key, stateFile, state })
  }
}
